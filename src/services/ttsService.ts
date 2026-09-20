import { StrictVoiceCuePayload } from '../types/audio';

export type VoiceGender = 'female' | 'male';

export interface TTSOptions {
  gender?: VoiceGender;
  language?: 'es' | 'en';
  speed?: number;
  pitch?: number;
  urgent?: boolean;
}

export interface GoogleVoiceDefinition {
  name: string;
  lang: string;
  gender: VoiceGender;
}

const GOOGLE_VOICES_CONFIG: Record<string, Record<VoiceGender, string>> = {
  es: {
    female: 'es-ES-Neural2-A',
    male: 'es-ES-Neural2-B'
  },
  en: {
    female: 'en-US-Neural2-F',
    male: 'en-US-Neural2-D'
  }
};

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

  private resolveApiKey() {
    // 1. Intentar Vite import.meta.env
    try {
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GOOGLE_TTS_API_KEY) {
        this.apiKey = import.meta.env.VITE_GOOGLE_TTS_API_KEY.trim();
        return;
      }
    } catch (e) {}

    // 2. Intentar process.env para entornos de pruebas en Node/tsx
    try {
      if (typeof process !== 'undefined' && process.env && process.env.VITE_GOOGLE_TTS_API_KEY) {
        this.apiKey = process.env.VITE_GOOGLE_TTS_API_KEY.trim();
        return;
      }
    } catch (e) {}

    // 3. Fallback a clave guardada si existiera previamente
    if (typeof localStorage !== 'undefined') {
      const savedKey = localStorage.getItem('skatecoreo_google_tts_key') || localStorage.getItem('skateart_google_tts_key');
      if (savedKey) {
        this.apiKey = savedKey.trim();
      }
    }
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
    const cleanText = text.trim();
    if (!cleanText) return;

    // Filtro de seguridad estricto: la voz solo vocaliza figuras técnicas y conteos.
    // Rechaza etiquetas de nodos estructurales, metadatos y marcadores automáticos.
    const lower = cleanText.toLowerCase();
    if (
      /\.(wav|mp3|m4a|ogg|aac|flac)$/i.test(cleanText) || 
      lower.includes('pista_rollart') || 
      cleanText.startsWith('/') ||
      /^(inicio(\s+trazo)?|fin(\s+trazo)?|final|v[eé]rtice|bucle|esquina|trazo|tramo|recta|curva(\s+de\s+transici[oó]n)?|transici[oó]n|salida\s*\/\s*choreo\s*entry|pose(\s+final)?)$/i.test(lower) ||
      /^(nodo|node|punto|point|marcador|marker|paso|step|beat|tempo|comp[aá]s|t|tiempo|time)(\s*#?\d+(\.\d+)?s?)?$/i.test(lower) ||
      /^#?\d+(\.\d+)?s?$/i.test(lower) ||
      /^(sin\s+figura|sin\s+etiqueta|sin\s+selecci[oó]n|ningun[ao]|none|null|undefined|vacio|vacío|custom|otro\s*\/?\s*personalizado\.\.\.)$/i.test(lower) ||
      /^[-—–]\s*(elegir|seleccionar|sin)\b/i.test(lower) ||
      /^¡?ya!?\s*(inicio|fin|v[eé]rtice|nodo|punto|point|marcador|marker|beat|step|trazo)\b/i.test(lower) ||
      /^go!?\s*(start|end|vertex|node|point|marker|beat|step)\b/i.test(lower)
    ) {
      console.warn('[TTSService] Intento de vocalizar etiqueta de nodo o metadato bloqueado:', cleanText);
      return;
    }

    const gender = options?.gender || this.voiceGender;
    const lang = options?.language || this.language;

    // Detener locución previa si está activa
    this.stop();

    // 1. Intentar síntesis con Google Cloud TTS (Neural2/Journey)
    if (this.hasGoogleApiKey()) {
      try {
        const audioBuffer = await this.synthesizeWithGoogleTTS(cleanText, gender, lang, options?.speed);
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
      const clean = phrase.trim();
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
      .filter((p) => p.label && p.label.trim().length > 0)
      .map((p) => p.label!.trim());

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
    const cleanText = text.trim();
    if (!cleanText) return null;

    const gender = options?.gender || this.voiceGender;
    const lang = options?.language || this.language;
    const speed = options?.speed || 1.05;

    return this.synthesizeWithGoogleTTS(cleanText, gender, lang, speed);
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
    speed: number = 1.05
  ): Promise<AudioBuffer | null> {
    const voiceName = GOOGLE_VOICES_CONFIG[lang]?.[gender] || GOOGLE_VOICES_CONFIG['es']['female'];
    const languageCode = lang === 'es' ? 'es-ES' : 'en-US';
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

        const payload = {
          input: { text },
          voice: {
            languageCode,
            name: voiceName
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: Math.max(0.5, Math.min(2.0, speed))
          }
        };

        const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(this.apiKey)}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorDetail = await response.text();
          console.warn('[TTSService] Google TTS HTTP Error:', response.status, errorDetail);
          return null;
        }

        const data = await response.json();
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
      utterance.lang = lang === 'es' ? 'es-ES' : 'en-US';
      utterance.rate = speed;

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const langVoices = voices.filter(v => v.lang.toLowerCase().startsWith(lang));
        // Buscar voz coincidente por género en el nombre si es posible
        const matched = langVoices.find(v => 
          gender === 'female' 
            ? /female|mujer|monica|helena|sabina|lucia|zira/i.test(v.name)
            : /male|hombre|jorge|pablo|david/i.test(v.name)
        );
        if (matched) {
          utterance.voice = matched;
        } else if (langVoices.length > 0) {
          utterance.voice = langVoices[0];
        }
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('[TTSService] Fallback browser speech error:', e);
    }
  }
}

export const ttsService = TTSService.getInstance();
