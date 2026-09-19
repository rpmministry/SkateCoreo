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

  private constructor() {
    this.resolveApiKey();

    if (typeof localStorage !== 'undefined') {
      const savedGender = localStorage.getItem('skateart_voice_gender') as VoiceGender;
      if (savedGender === 'female' || savedGender === 'male') {
        this.voiceGender = savedGender;
      }
      const savedLang = localStorage.getItem('skateart_voice_lang') as 'es' | 'en';
      if (savedLang === 'es' || savedLang === 'en') {
        this.language = savedLang;
      }
    }
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
      const legacyKey = localStorage.getItem('skateart_google_tts_key');
      if (legacyKey) {
        this.apiKey = legacyKey.trim();
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
      localStorage.setItem('skateart_voice_gender', gender);
    }
  }

  public getLanguage(): 'es' | 'en' {
    return this.language;
  }

  public setLanguage(lang: 'es' | 'en') {
    this.language = lang;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('skateart_voice_lang', lang);
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

    // Filtro de seguridad estricto: la voz nunca debe vocalizar metadatos de audio ni marcadores automáticos de beats
    if (
      /\.(wav|mp3|m4a|ogg|aac|flac)$/i.test(cleanText) || 
      cleanText.toLowerCase().includes('pista_rollart') || 
      cleanText.startsWith('/') ||
      /^(beat\s*\d+(\.\d+)?s?|punto\s*#?\d+|point\s*#?\d+|marcador\s*#?\d+|nodo\s*#?\d+|node\s*#?\d+)$/i.test(cleanText) ||
      /^¡?ya!?\s*(beat|punto|point|marcador|nodo)\b/i.test(cleanText) ||
      /^go!?\s*(beat|punto|point|marcador|node)\b/i.test(cleanText)
    ) {
      console.warn('[TTSService] Intento de vocalizar metadato o marcador automático bloqueado:', cleanText);
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
   * Síntesis con Google Cloud Text-to-Speech API decodificando a Web Audio Buffer
   */
  private async synthesizeWithGoogleTTS(
    text: string,
    gender: VoiceGender,
    lang: 'es' | 'en',
    speed: number = 1.05
  ): Promise<AudioBuffer | null> {
    const voiceName = GOOGLE_VOICES_CONFIG[lang]?.[gender] || GOOGLE_VOICES_CONFIG['es']['female'];
    const languageCode = lang === 'es' ? 'es-ES' : 'en-US';
    const cacheKey = `${voiceName}_${speed.toFixed(2)}_${text.toLowerCase()}`;

    // Revisar caché en memoria
    if (this.audioBufferCache.has(cacheKey)) {
      return this.audioBufferCache.get(cacheKey)!;
    }

    // Evitar llamadas duplicadas simultáneas
    if (this.pendingFetchMap.has(cacheKey)) {
      return this.pendingFetchMap.get(cacheKey)!;
    }

    const fetchPromise = (async () => {
      try {
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

        // Decodificar a AudioBuffer usando AudioContext si está disponible
        let ctx = this.audioContext;
        if (!ctx && typeof window !== 'undefined') {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            ctx = new AudioContextClass();
          }
        }

        if (ctx) {
          const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0));
          this.audioBufferCache.set(cacheKey, decoded);
          return decoded;
        }

        return null;
      } catch (err) {
        console.warn('[TTSService] Error en fetch de Google TTS:', err);
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
