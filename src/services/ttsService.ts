import { StrictVoiceCuePayload } from '../types/audio';
import { sanitizeSpeechText } from '../core/audio/voiceCueSanitizer';
import { voiceMatchesGender } from '../core/audio/voiceGender';
import {
  hasBuiltInGoogleTtsApiKey,
  resolveGoogleTtsApiKey,
} from '../core/audio/googleTtsKey';

export type VoiceGender = 'female' | 'male';

export interface TTSOptions {
  gender?: VoiceGender;
  language?: 'es' | 'en';
  speed?: number;
  pitch?: number;
  urgent?: boolean;
  /**
   * Nombre explícito de la voz Google Cloud (ej. `es-US-Neural2-B`).
   * Tiene prioridad sobre el mapeo por género, para que la selección manual
   * del usuario no se pierda al sintetizar.
   */
  voiceName?: string;
  /**
   * Omite el filtro de Voz Guía. Reservado exclusivamente a la prueba manual
   * de voz solicitada por el usuario desde Ajustes.
   */
  force?: boolean;
}

export interface GoogleVoiceDefinition {
  name: string;
  lang: string;
  gender: VoiceGender;
}

/**
 * Voces oficiales por idioma y género.
 *
 * Para español se usan voces LATINAS (región es-US) en variantes Neural2, con
 * respaldo Wavenet. Las voces es-ES se evitan deliberadamente porque el acento
 * castellano no corresponde al público objetivo.
 */
const GOOGLE_VOICES_CONFIG: Record<string, Record<VoiceGender, string>> = {
  es: {
    female: 'es-US-Neural2-C',
    male: 'es-US-Neural2-B'
  },
  en: {
    female: 'en-US-Neural2-F',
    male: 'en-US-Neural2-D'
  }
};

/** Respaldo Wavenet latino si Neural2 no está habilitada en el proyecto. */
const GOOGLE_VOICES_WAVENET_FALLBACK: Record<string, Record<VoiceGender, string>> = {
  es: {
    female: 'es-US-Wavenet-C',
    male: 'es-US-Wavenet-D'
  },
  en: {
    female: 'en-US-Wavenet-F',
    male: 'en-US-Wavenet-D'
  }
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
      const savedGender = (localStorage.getItem('skatecoreo_voice_gender') || localStorage.getItem('skateart_voice_gender')) as VoiceGender;
      if (savedGender === 'female' || savedGender === 'male') {
        this.voiceGender = savedGender;
      }
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
   * Resuelve la credencial desde la fuente única (`googleTtsKey`):
   * primero la clave propia de la app (inyectada en el build / Vercel) y, solo
   * si no existe, una clave local del usuario. El usuario final no configura nada.
   */
  private resolveApiKey() {
    this.apiKey = resolveGoogleTtsApiKey();
  }

  /** ¿La credencial viene incluida en la app (sin intervención del usuario)? */
  public isUsingBuiltInApiKey(): boolean {
    return hasBuiltInGoogleTtsApiKey();
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
    return this.voiceGender;
  }

  public setVoiceGender(gender: VoiceGender) {
    this.voiceGender = gender;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('skatecoreo_voice_gender', gender);
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

    // 1. Intentar síntesis con Google Cloud TTS (Neural2/Wavenet/Journey)
    if (this.hasGoogleApiKey()) {
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
        console.warn('[TTSService] Falló Google Cloud TTS, recurriendo a voz del navegador:', err);
      }
    }

    // 2. Fallback transparente al sintetizador del navegador (Web Speech API)
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
    if (!this.hasGoogleApiKey()) return;
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
    const vName = voiceName || GOOGLE_VOICES_CONFIG[lang]?.[this.voiceGender] || GOOGLE_VOICES_CONFIG['es']['female'];
    const cacheKey = `${vName}_${speed.toFixed(2)}_${text.toLowerCase().trim()}`;
    return this.getFromIDB(cacheKey);
  }

  /**
   * Síntesis con Google Cloud Text-to-Speech API con caching multinivel (Memoria + IndexedDB)
   */
  public async synthesizeWithGoogleTTS(
    text: string,
    gender: VoiceGender,
    lang: 'es' | 'en',
    speed: number = 1.05,
    voiceNameOverride?: string
  ): Promise<AudioBuffer | null> {
    const voiceName =
      voiceNameOverride ||
      GOOGLE_VOICES_CONFIG[lang]?.[gender] ||
      GOOGLE_VOICES_CONFIG['es']['female'];
    // Región latina (es-US) para el español; es-ES queda descartado por acento
    const languageCode = lang === 'es' ? 'es-US' : 'en-US';
    const wavenetFallback = GOOGLE_VOICES_WAVENET_FALLBACK[lang]?.[gender];
    const cleanKey = text.toLowerCase().trim();
    const cacheKey = `${voiceName}_${speed.toFixed(2)}_${cleanKey}`;

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
        let ctx = this.audioContext;
        if (!ctx && typeof window !== 'undefined') {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            ctx = new AudioContextClass();
          }
        }

        // 3. Revisar caché persistente IndexedDB antes de consumir cuota de Google Cloud
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

        // Si no hay API Key y no estaba en IndexedDB, no podemos llamar a la API
        if (!this.hasGoogleApiKey()) {
          return null;
        }

        const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(this.apiKey)}`;

        // Intento 1: voz Neural2 latina. Intento 2: respaldo Wavenet latino
        // (por si el proyecto de Google Cloud no tiene Neural2 habilitada).
        const voiceAttempts = wavenetFallback && wavenetFallback !== voiceName
          ? [voiceName, wavenetFallback]
          : [voiceName];

        let data: any = null;
        for (const attemptVoice of voiceAttempts) {
          const payload = {
            input: { text },
            voice: {
              languageCode,
              name: attemptVoice
            },
            audioConfig: {
              audioEncoding: 'MP3',
              speakingRate: Math.max(0.5, Math.min(2.0, speed))
            }
          };

          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (response.ok) {
            data = await response.json();
            if (attemptVoice !== voiceName) {
              console.warn('[TTSService] Voz latina primaria no disponible; usando respaldo Wavenet:', attemptVoice);
            }
            break;
          }

          const errorDetail = await response.text();
          console.warn('[TTSService] Google TTS HTTP Error con voz', attemptVoice, response.status, errorDetail);
        }

        if (!data) return null;
        if (!data.audioContent) {
          return null;
        }

        // Decodificar Base64 a ArrayBuffer binario
        const binaryString = typeof Buffer !== 'undefined'
          ? Buffer.from(data.audioContent, 'base64').toString('binary')
          : window.atob(data.audioContent);

        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const rawArrayBuffer = bytes.buffer.slice(0);

        // Guardar en IndexedDB para disponibilidad offline permanente y zero-cost en el futuro
        void this.saveToIDB(cacheKey, rawArrayBuffer, { text, voiceName, speed });

        if (ctx) {
          const decoded = await ctx.decodeAudioData(rawArrayBuffer.slice(0));
          this.audioBufferCache.set(cacheKey, decoded);
          return decoded;
        }

        return null;
      } catch (err) {
        console.warn('[TTSService] Error en síntesis de Google TTS:', err);
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
    gender: VoiceGender,
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
      if (voices && voices.length > 0) {
        const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));

        // 1. Preferir región latina (es-419 / es-US / es-MX ...) sobre es-ES
        const latinVoices = lang === 'es'
          ? langVoices
              .map((v) => ({ voice: v, rank: LATIN_BROWSER_REGIONS.indexOf(v.lang.toLowerCase()) }))
              .filter((entry) => entry.rank >= 0)
              .sort((a, b) => a.rank - b.rank)
              .map((entry) => entry.voice)
          : langVoices.filter((v) => v.lang.toLowerCase().startsWith('en-us'));

        const pool = latinVoices.length > 0 ? latinVoices : langVoices;

        // 2. Dentro del pool, priorizar la voz cuyo nombre declare el género pedido
        const matched =
          pool.find((v) => voiceMatchesGender(v.name, gender) === true) ||
          pool.find((v) => voiceMatchesGender(v.name, gender) === null) ||
          pool[0];

        utterance.voice = matched;

        // 3. Si la voz no declara su género, diferenciamos acústicamente el tono
        //    para que la guía femenina y la masculina nunca suenen igual.
        if (voiceMatchesGender(matched.name, gender) !== true) {
          utterance.pitch = gender === 'male' ? 0.78 : 1.12;
        }
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('[TTSService] Fallback browser speech error:', e);
    }
  }
}

export const ttsService = TTSService.getInstance();
