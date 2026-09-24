import { StrictVoiceCuePayload } from '../types/audio';
import { sanitizeSpeechText } from '../core/audio/voiceCueSanitizer';
import { isAcceptableFemaleVoice } from '../core/audio/voiceGender';
import {
  getTtsProxyUrl,
  getUserGoogleTtsApiKey,
  isTtsProxyEnabled,
} from '../core/audio/ttsBackend';
import {
  base64ToBytes,
  extractAudioContent,
} from '../core/audio/ttsAudioCodec';

export type VoiceGender = 'female';

export interface TTSOptions {
  gender?: VoiceGender;
  language?: 'es' | 'en';
  speed?: number;
  pitch?: number;
  urgent?: boolean;
  /**
   * Nombre explícito de la voz Google Cloud (ej. `es-US-Neural2-A`).
   * Tiene prioridad sobre el mapeo por idioma, para que la selección manual
   * del usuario no se pierda al sintetizar.
   */
  voiceName?: string;
  /**
   * Omite el filtro de Voz Guía. Reservado exclusivamente a la prueba manual
   * de voz solicitada por el usuario desde Ajustes.
   */
  force?: boolean;
  /**
   * Permite el fallback a `window.speechSynthesis` cuando el TTS natural falla.
   *
   * Por defecto `false`: en producción la Voz Guía NO cambia de identidad. Si el
   * TTS natural no está disponible, la locución queda en SILENCIO. Solo la prueba
   * manual de voz (`testVoice`) lo activa.
   */
  allowBrowserFallback?: boolean;
}

export interface GoogleVoiceDefinition {
  name: string;
  lang: string;
  gender: VoiceGender;
}

/**
 * Voz oficial por idioma — SIEMPRE femenina y latina.
 *
 * Decisión de producto: se eliminó la voz masculina porque sonaba como una
 * variación artificial de la femenina. Para español se usa una voz LATINA
 * premium (Neural2, región es-US); las voces es-ES se descartan por acento.
 */
const GOOGLE_VOICES_CONFIG: Record<string, string> = {
  es: 'es-US-Neural2-A',
  en: 'en-US-Neural2-F'
};

/**
 * Versión de la caché de voz. Al corrigirse la identidad vocal (se eliminó la
 * voz es-US-C masculina que se colaba), se invalida cualquier audio cacheado
 * previamente que pudiera pertenecer a otra voz. Cambiar este valor descarta
 * las entradas antiguas (memoria + IndexedDB) de forma limpia.
 */
const TTS_CACHE_VERSION = 'vg2-latin-female-a';

/** Respaldo Wavenet latino si Neural2 no está habilitada en el proyecto.
 *  ⚠️ Debe ser FEMENINA: `es-US-Wavenet-C` es MASCULINA (verificado en la
 *  lista oficial de Google); el respaldo correcto es `es-US-Wavenet-A`. */
const GOOGLE_VOICES_WAVENET_FALLBACK: Record<string, string> = {
  es: 'es-US-Wavenet-A',
  en: 'en-US-Wavenet-F'
};

/** Prioridad de regiones latinas para las voces del navegador. */
const LATIN_BROWSER_REGIONS = ['es-419', 'es-us', 'es-mx', 'es-ar', 'es-co', 'es-cl', 'es-pe', 'es-ve', 'es-uy', 'es-do', 'es-ec', 'es-gt', 'es-pr'];

export class TTSService {
  private static instance: TTSService;

  // Clave API de Google Cloud Text-to-Speech inyectada en tiempo de compilación o ejecución
  private apiKey: string = '';

  // Estado del usuario
  private voiceGender: VoiceGender = 'female';
  private language: 'es' | 'en' = 'es';

  // Integración Web Audio API (Canal del Coach)
  private audioContext: AudioContext | null = null;
  private coachOutputNode: AudioNode | null = null;
  private activeSourceNode: AudioBufferSourceNode | null = null;

  // Caché en memoria para latencia 0ms en frases y conteos coreográficos repetitivos
  private audioBufferCache: Map<string, AudioBuffer> = new Map();
  private pendingFetchMap: Map<string, Promise<AudioBuffer | null>> = new Map();

  // IndexedDB para persistencia offline permanente y ahorro de cuota de Google Cloud
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private constructor() {
    this.resolveApiKey();

    if (typeof localStorage !== 'undefined') {
      // Voz única: la Voz Guía es SIEMPRE femenina latina. Cualquier preferencia
      // de género guardada por versiones anteriores se ignora deliberadamente.
      this.voiceGender = 'female';

      const savedLang = (localStorage.getItem('skatecoreo_voice_lang') || localStorage.getItem('skateart_voice_lang')) as 'es' | 'en';
      if (savedLang === 'es' || savedLang === 'en') {
        this.language = savedLang;
      }
    }
  }

  /**
   * Abre o devuelve la base de datos IndexedDB para caché permanente de audio TTS
   */
  private getDB(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    if (typeof window === 'undefined' || !window.indexedDB) {
      return Promise.resolve(null);
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open('skatecoreo_tts_cache_db', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('tts_cache')) {
            db.createObjectStore('tts_cache', { keyPath: 'key' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('[TTSService] No se pudo abrir IndexedDB para caché TTS:', req.error);
          resolve(null);
        };
      } catch (err) {
        console.warn('[TTSService] Excepción al inicializar IndexedDB:', err);
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  /**
   * Obtiene bytes crudos almacenados en IndexedDB
   */
  public async getFromIDB(key: string): Promise<ArrayBuffer | null> {
    const db = await this.getDB();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('tts_cache', 'readonly');
        const store = tx.objectStore('tts_cache');
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && req.result.bytes) {
            resolve(req.result.bytes);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Guarda audio binario en IndexedDB para disponibilidad offline permanente
   */
  public async saveToIDB(
    key: string,
    bytes: ArrayBuffer,
    meta?: { text?: string; voiceName?: string; speed?: number }
  ): Promise<void> {
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('tts_cache', 'readwrite');
        const store = tx.objectStore('tts_cache');
        store.put({
          key,
          bytes,
          text: meta?.text || '',
          voiceName: meta?.voiceName || '',
          speed: meta?.speed || 1.05,
          timestamp: Date.now()
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  /**
   * Guarda bytes de audio importados (ej. desde un paquete .coreo)
   */
  public async saveAudioBytes(key: string, bytes: ArrayBuffer): Promise<void> {
    await this.saveToIDB(key, bytes);
  }

  /**
   * Retorna todas las entradas cacheadas (usado para empaquetar en proyectos .coreo)
   */
  public async getAllCachedEntries(): Promise<Array<{ key: string; text?: string; voiceName?: string; bytes: ArrayBuffer }>> {
    const db = await this.getDB();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('tts_cache', 'readonly');
        const store = tx.objectStore('tts_cache');
        const req = store.getAll();
        req.onsuccess = () => {
          resolve(req.result || []);
        };
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  /**
   * Resuelve la clave LOCAL del usuario (solo auto-hospedaje).
   *
   * La credencial de la app NO se resuelve aquí: vive en el servidor y se
   * consume a través de `POST /api/tts`. Así nunca entra en el bundle.
   */
  private resolveApiKey() {
    this.apiKey = getUserGoogleTtsApiKey();
  }

  /** ¿Se está usando el endpoint propio con la credencial del servidor? */
  public isUsingTtsProxy(): boolean {
    return isTtsProxyEnabled();
  }

  /** ¿El usuario aportó su propia clave (auto-hospedaje)? */
  public isUsingUserApiKey(): boolean {
    return this.hasGoogleApiKey();
  }

  /**
   * ¿Hay voz natural disponible en este dispositivo?
   * Con el endpoint propio siempre lo está; sin él, solo con clave del usuario.
   */
  public hasNaturalVoice(): boolean {
    return isTtsProxyEnabled() || this.hasGoogleApiKey();
  }

  /**
   * Decisión única de enrutado de la locución.
   *
   * Se expone como método (y se usa en `speak()` y `preWarm()`) porque el bug
   * original fue precisamente una guarda equivocada: se comprobaba la clave
   * LOCAL del usuario en lugar de la disponibilidad real del back-end natural,
   * de modo que en producción nunca se intentaba la voz natural.
   */
  public shouldUseNaturalVoice(): boolean {
    return this.hasNaturalVoice();
  }

  public static getInstance(): TTSService {
    if (!TTSService.instance) {
      TTSService.instance = new TTSService();
    }
    return TTSService.instance;
  }

  /**
   * Conecta el servicio TTS al AudioContext del motor principal y al bus de audio del Coach
   */
  public attachAudioContext(ctx: AudioContext, outputNode: AudioNode) {
    this.audioContext = ctx;
    this.coachOutputNode = outputNode;
  }

  /**
   * Indica si la clave de Google Cloud TTS está disponible en el proyecto
   */
  public hasGoogleApiKey(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 5);
  }

  /**
   * Permite inyectar o actualizar la clave programáticamente (útil en testing y mocks)
   */
  public setApiKey(key: string) {
    this.apiKey = key ? key.trim() : '';
  }

  public getVoiceGender(): VoiceGender {
    return 'female';
  }

  /**
   * @deprecated La Voz Guía es SIEMPRE femenina latina.
   *
   * Se conserva por compatibilidad de API: ignora el valor recibido y fuerza el
   * género femenino, de modo que ninguna ruta del código pueda reintroducir la
   * voz masculina que se eliminó de la interfaz y de la lógica.
   */
  public setVoiceGender(_gender?: VoiceGender) {
    this.voiceGender = 'female';
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('skatecoreo_voice_gender', 'female');
      } catch (e) {}
    }
  }

  public getLanguage(): 'es' | 'en' {
    return this.language;
  }

  public setLanguage(lang: 'es' | 'en') {
    this.language = lang;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('skatecoreo_voice_lang', lang);
    }
  }

  /**
   * FIRMA UNIVERSAL DE SÍNTESIS DE VOZ AISLADA:
   * Diseñada exclusivamente para instrucciones deportivas, conteos y avisos de figuras.
   * Rechaza cualquier intento de vocalizar nombres de archivo, metadatos o buffers de música.
   */
  public async speak(text: StrictVoiceCuePayload | string, options?: TTSOptions): Promise<void> {
    // Filtro de Voz Guía estricto (whitelist del catálogo oficial):
    // solo pasan comandos explícitos y nombres de figuras reales. Cualquier
    // etiqueta de nodo, nota al margen o metadato se descarta en silencio.
    const cleanText = options?.force ? String(text).trim() : sanitizeSpeechText(text);
    if (!cleanText) {
      console.warn('[TTSService] Texto no vocalizable descartado por el filtro de Voz Guía:', text);
      return;
    }

    const gender = options?.gender || this.voiceGender;
    const lang = options?.language || this.language;

    // Detener locución previa si está activa
    this.stop();

    // 1. Voz natural (Neural2/Wavenet/Journey) — ÚNICA ruta de producción.
    //
    // BUG corregido: aquí se comprobaba `hasGoogleApiKey()`, que solo mira la
    // clave LOCAL del usuario. En producción esa clave no existe (la custodia el
    // servidor), así que esta rama nunca se ejecutaba y TODO caía al sintetizador
    // del navegador: la guía femenina sonaba robótica y la masculina era la misma
    // voz con el tono bajado. Ahora se comprueba `hasNaturalVoice()`, que incluye
    // el endpoint propio `/api/tts`.
    if (this.shouldUseNaturalVoice()) {
      try {
        const audioBuffer = await this.synthesizeWithGoogleTTS(
          cleanText,
          gender,
          lang,
          options?.speed,
          options?.voiceName
        );
        if (audioBuffer) {
          this.playAudioBuffer(audioBuffer);
          return;
        }
      } catch (err) {
        console.warn('[TTSService] Falló Google Cloud TTS:', err);
      }

      // REGLA DE VOZ ÚNICA: la Voz Guía automática NUNCA cambia de identidad.
      // Si el TTS natural no está disponible, la locución queda en silencio.
      // El fallback al navegador solo se permite de forma explícita (test manual).
      if (options?.allowBrowserFallback !== true) {
        console.warn('[TTSService] Voz natural no disponible: locución omitida (sin cambio de voz).');
        return;
      }
    }

    // 2. Fallback del navegador — SOLO con autorización explícita o cuando no
    //    existe backend natural (modo offline/dev). Voz femenina latina validada.
    this.speakBrowserFallback(cleanText, gender, lang, options?.speed);
  }

  /**
   * Detiene la reproducción de voz actual
   */
  public stop() {
    if (this.activeSourceNode) {
      try {
        this.activeSourceNode.stop();
        this.activeSourceNode.disconnect();
      } catch (e) {}
      this.activeSourceNode = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
  }

  /**
   * Pre-sintetiza y cachea un conjunto de frases comunes para latencia 0ms
   */
  public async preWarm(phrases: string[], options?: TTSOptions) {
    // Mismo bug que en `speak()`: la voz natural también está disponible a través
    // del endpoint propio, no solo con una clave local.
    if (!this.shouldUseNaturalVoice()) return;
    if (typeof window === 'undefined') return; // el proxy es same-origin
    const gender = options?.gender || this.voiceGender;
    const lang = options?.language || this.language;

    for (const phrase of phrases) {
      // Solo se cachean frases vocalizables (ahorra cuota de Google Cloud)
      const clean = options?.force ? phrase.trim() : sanitizeSpeechText(phrase);
      if (!clean) continue;
      this.synthesizeWithGoogleTTS(clean, gender, lang, options?.speed).catch(() => {});
    }
  }

  /**
   * Pre-sintetiza automáticamente todas las figuras técnicas detectadas en una lista de nodos
   */
  public async preWarmPoints(
    points: Array<{ label?: string | null; type?: string | null }>,
    options?: TTSOptions
  ): Promise<void> {
    const speakableLabels = points
      .map((p) => (p.label ? sanitizeSpeechText(p.label) : null))
      .filter((label): label is string => Boolean(label));

    if (speakableLabels.length > 0) {
      await this.preWarm(Array.from(new Set(speakableLabels)), options);
    }
  }

  /**
   * Obtiene o sintetiza el AudioBuffer para un texto específico utilizando la configuración actual
   */
  public async getAudioBufferForText(
    text: string,
    options?: TTSOptions
  ): Promise<AudioBuffer | null> {
    // Defensa en profundidad: nunca se envía texto no vocalizable a la API
    const cleanText = options?.force ? text.trim() : sanitizeSpeechText(text);
    if (!cleanText) return null;

    const gender = options?.gender || this.voiceGender;
    const lang = options?.language || this.language;
    const speed = options?.speed || 1.05;

    return this.synthesizeWithGoogleTTS(cleanText, gender, lang, speed, options?.voiceName);
  }

  /**
   * Obtiene los bytes crudos (MP3) del audio cacheado para un texto, si existen en IndexedDB
   */
  public async getCachedAudioArrayBuffer(
    text: string,
    voiceName?: string,
    speed: number = 1.05
  ): Promise<ArrayBuffer | null> {
    const lang = this.language;
    const vName = voiceName || GOOGLE_VOICES_CONFIG[lang] || GOOGLE_VOICES_CONFIG['es'];
    const cacheKey = `${TTS_CACHE_VERSION}_${vName}_${speed.toFixed(2)}_${text.toLowerCase().trim()}`;
    return this.getFromIDB(cacheKey);
  }

  /**
   * Contexto de decodificación (se crea bajo demanda si aún no existe).
   */
  private ensureAudioContext(): AudioContext | null {
    let ctx = this.audioContext;
    if (!ctx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        ctx = new AudioContextClass();
        this.audioContext = ctx;
      }
    }
    return ctx;
  }

  /**
   * Obtiene los bytes MP3 del proxy propio (`POST /api/tts`).
   *
   * La credencial de Google Cloud vive en el servidor, así que el cliente nunca
   * la manipula. El proxy aplica lista blanca de texto/voz y control de origen.
   */
  private async requestTtsBytesFromProxy(params: {
    text: string;
    voiceName: string;
    speed: number;
  }): Promise<ArrayBuffer | null> {
    try {
      const response = await fetch(getTtsProxyUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: params.text,
          voiceName: params.voiceName,
          speed: params.speed,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        console.warn('[TTSService] Proxy de voz respondió', response.status, detail);
        return null;
      }

      const bytes = await response.arrayBuffer();
      return bytes.byteLength > 0 ? bytes : null;
    } catch (err) {
      // Sin red o endpoint no desplegado: se intentará el respaldo local.
      console.warn('[TTSService] Proxy de voz no disponible:', err);
      return null;
    }
  }

  /**
   * Respaldo: llamada directa a Google Cloud con la clave del PROPIO usuario.
   * Solo se usa en auto-hospedaje (cuando el proxy está desactivado o falla y el
   * usuario aportó su credencial). En el despliegue oficial nunca se ejecuta.
   */
  private async requestTtsBytesFromGoogleDirect(params: {
    text: string;
    voiceName: string;
    languageCode: string;
    speed: number;
    fallbackVoiceName?: string;
  }): Promise<ArrayBuffer | null> {
    if (!this.apiKey) return null;

    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(this.apiKey)}`;
    const attempts = params.fallbackVoiceName
      ? [params.voiceName, params.fallbackVoiceName]
      : [params.voiceName];

    for (const attemptVoice of attempts) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text: params.text },
            voice: {
              languageCode: params.languageCode,
              name: attemptVoice,
              // VOZ ÚNICA: género declarado explícitamente en el payload, para
              // que Google jamás resuelva la petición a una voz masculina.
              ssmlGender: 'FEMALE',
            },
            audioConfig: {
              audioEncoding: 'MP3',
              speakingRate: Math.max(0.5, Math.min(2.0, params.speed)),
            },
          }),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          console.warn(
            '[TTSService] Google TTS HTTP Error con voz',
            attemptVoice,
            response.status,
            detail
          );
          continue;
        }

        const data = await response.json();
        const audioContent = extractAudioContent(data);
        if (!audioContent) continue;

        const bytes = base64ToBytes(audioContent);
        if (bytes.length === 0) continue;

        return bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer;
      } catch (err) {
        console.warn('[TTSService] Error de red con Google TTS directo:', err);
      }
    }

    return null;
  }

  /**
   * Obtiene los bytes MP3 priorizando el proxy propio y, si no está disponible,
   * la clave local del usuario (auto-hospedaje).
   */
  private async requestTtsBytes(params: {
    text: string;
    voiceName: string;
    languageCode: string;
    speed: number;
    fallbackVoiceName?: string;
  }): Promise<ArrayBuffer | null> {
    // El endpoint propio es same-origin: solo tiene sentido en un navegador.
    // En entornos sin `window` (SSR, pruebas) se omite y se usa el respaldo.
    if (isTtsProxyEnabled() && typeof window !== 'undefined') {
      const viaProxy = await this.requestTtsBytesFromProxy({
        text: params.text,
        voiceName: params.voiceName,
        speed: params.speed,
      });
      if (viaProxy) return viaProxy;
    }

    if (this.apiKey) {
      return this.requestTtsBytesFromGoogleDirect(params);
    }

    return null;
  }

  /**
   * Síntesis con voz natural y caching multinivel (Memoria + IndexedDB).
   *
   * Fuente del audio: endpoint propio `/api/tts` (la credencial vive en el
   * servidor). No hay ninguna clave de la app en el bundle del cliente.
   */
  public async synthesizeWithGoogleTTS(
    text: string,
    _gender: VoiceGender,
    lang: 'es' | 'en',
    speed: number = 1.05,
    voiceNameOverride?: string
  ): Promise<AudioBuffer | null> {
    // La voz es femenina por definición; `_gender` se conserva por compatibilidad
    // de firma con los llamadores existentes.
    const voiceName =
      voiceNameOverride ||
      GOOGLE_VOICES_CONFIG[lang] ||
      GOOGLE_VOICES_CONFIG['es'];
    // Región latina (es-US) para el español; es-ES queda descartado por acento
    const languageCode = lang === 'es' ? 'es-US' : 'en-US';
    const wavenetFallback = GOOGLE_VOICES_WAVENET_FALLBACK[lang];
    const cleanKey = text.toLowerCase().trim();
    const cacheKey = `${TTS_CACHE_VERSION}_${voiceName}_${speed.toFixed(2)}_${cleanKey}`;

    // 1. Revisar caché en memoria (0ms latencia)
    if (this.audioBufferCache.has(cacheKey)) {
      return this.audioBufferCache.get(cacheKey)!;
    }

    // 2. Evitar llamadas duplicadas simultáneas
    if (this.pendingFetchMap.has(cacheKey)) {
      return this.pendingFetchMap.get(cacheKey)!;
    }

    const fetchPromise = (async () => {
      try {
        const ctx = this.ensureAudioContext();

        // 3. Caché persistente (IndexedDB): evita consumir cuota y funciona offline
        const cachedBytes = await this.getFromIDB(cacheKey);
        if (cachedBytes && ctx) {
          try {
            const decoded = await ctx.decodeAudioData(cachedBytes.slice(0));
            this.audioBufferCache.set(cacheKey, decoded);
            return decoded;
          } catch (decodeErr) {
            console.warn('[TTSService] Falló decodificación de audio cacheado en IndexedDB:', decodeErr);
          }
        }

        // 4. Bytes desde el back-end propio (o clave local del usuario como respaldo)
        const rawArrayBuffer = await this.requestTtsBytes({
          text,
          voiceName,
          languageCode,
          speed,
          fallbackVoiceName: wavenetFallback,
        });
        if (!rawArrayBuffer) return null;

        // 5. Persistir para disponibilidad offline permanente y coste cero futuro
        void this.saveToIDB(cacheKey, rawArrayBuffer, { text, voiceName, speed });

        if (ctx) {
          const decoded = await ctx.decodeAudioData(rawArrayBuffer.slice(0));
          this.audioBufferCache.set(cacheKey, decoded);
          return decoded;
        }

        return null;
      } catch (err) {
        console.warn('[TTSService] Error en síntesis de voz natural:', err);
        return null;
      } finally {
        this.pendingFetchMap.delete(cacheKey);
      }
    })();

    this.pendingFetchMap.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Reproduce el AudioBuffer mediante el bus de salida del Coach (Multitrack R)
   */
  private playAudioBuffer(buffer: AudioBuffer) {
    let ctx = this.audioContext;
    if (!ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
        this.audioContext = ctx;
      }
    }

    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;

      if (this.coachOutputNode) {
        source.connect(this.coachOutputNode);
      } else {
        source.connect(ctx.destination);
      }

      source.onended = () => {
        if (this.activeSourceNode === source) {
          this.activeSourceNode = null;
        }
      };

      source.start();
      this.activeSourceNode = source;
    } catch (e) {
      console.warn('[TTSService] Error al reproducir AudioBuffer:', e);
    }
  }

  /**
   * Fallback nativo usando Web Speech API (speechSynthesis)
   */
  private speakBrowserFallback(
    text: string,
    _gender: VoiceGender,
    lang: 'es' | 'en',
    speed: number = 1.05
  ) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'es' ? 'es-US' : 'en-US';
      utterance.rate = speed;

      const voices = window.speechSynthesis.getVoices();

      // REGLA DE VOZ ÚNICA: el fallback del navegador SOLO puede hablar con una
      // voz femenina latina validada. Nunca una voz masculina, de género
      // desconocido o `es-ES`. Si no existe, se prefiere el SILENCIO.
      const candidates = (voices || [])
        .filter((v) => isAcceptableFemaleVoice(v, lang))
        .map((v) => ({
          v,
          rank: lang === 'es' ? LATIN_BROWSER_REGIONS.indexOf(v.lang.toLowerCase()) : 0,
        }))
        .sort((a, b) => (a.rank < 0 ? 999 : a.rank) - (b.rank < 0 ? 999 : b.rank));

      const chosen = candidates.length > 0 ? candidates[0].v : null;
      if (!chosen) {
        console.warn('[TTSService] Sin voz femenina latina válida: locución omitida (nunca masculina).');
        return;
      }

      utterance.voice = chosen;
      utterance.lang = chosen.lang;
      utterance.rate = speed;

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('[TTSService] Fallback browser speech error:', e);
    }
  }
}

export const ttsService = TTSService.getInstance();
