import { VoiceCueConfig, VoiceCueEvent, TTSEngineType } from '../../types/audio';
import { ElementLog, ChoreographyPathPoint } from '../../types/choreography';
import { ttsService } from '../../services/ttsService';
import {
  cleanFigureNameForSpeech,
  sanitizeSpeechText,
} from './voiceCueSanitizer';
import {
  detectGoogleVoiceGender,
  voiceMatchesGender,
  type VoiceGender,
} from './voiceGender';
import {
  getBuiltInGoogleTtsApiKey,
  hasBuiltInGoogleTtsApiKey,
} from './googleTtsKey';

// Re-export para mantener compatibilidad con los consumidores existentes
export { cleanFigureNameForSpeech, sanitizeSpeechText };

export type PreRollTickCallback = (remainingSec: number) => void;
export type PreRollCompleteCallback = () => void;

export interface GoogleTTSVoiceOption {
  name: string;
  lang: string;
  label: string;
  gender: 'female' | 'male';
}

/**
 * Catálogo de voces Google Cloud.
 *
 * Política de marca: se priorizan VOCES LATINAS (región es-US / es-419) en
 * variantes Neural2 y Wavenet, tanto femenina como masculina, porque el público
 * objetivo es latinoamericano. Las variantes es-ES quedan como alternativa.
 */
export const GOOGLE_TTS_VOICES: GoogleTTSVoiceOption[] = [
  // ── Latinas (prioritarias) ──
  { name: 'es-US-Neural2-C', lang: 'es-US', label: 'Latino (es-US) · Neural2 C — Femenina', gender: 'female' },
  { name: 'es-US-Neural2-B', lang: 'es-US', label: 'Latino (es-US) · Neural2 B — Masculina', gender: 'male' },
  { name: 'es-US-Neural2-A', lang: 'es-US', label: 'Latino (es-US) · Neural2 A — Femenina', gender: 'female' },
  { name: 'es-US-Wavenet-C', lang: 'es-US', label: 'Latino (es-US) · Wavenet C — Femenina', gender: 'female' },
  { name: 'es-US-Wavenet-D', lang: 'es-US', label: 'Latino (es-US) · Wavenet D — Masculina', gender: 'male' },
  { name: 'es-US-Wavenet-A', lang: 'es-US', label: 'Latino (es-US) · Wavenet A — Femenina', gender: 'female' },
  { name: 'es-US-Wavenet-B', lang: 'es-US', label: 'Latino (es-US) · Wavenet B — Masculina', gender: 'male' },
  { name: 'es-US-Journey-F', lang: 'es-US', label: 'Latino (es-US) · Journey F — Ultra natural (F)', gender: 'female' },
  { name: 'es-US-Journey-O', lang: 'es-US', label: 'Latino (es-US) · Journey O — Ultra natural (M)', gender: 'male' },
  // ── Alternativas de España ──
  { name: 'es-ES-Neural2-A', lang: 'es-ES', label: 'Español (ES) · Neural2 A — Femenina', gender: 'female' },
  { name: 'es-ES-Neural2-B', lang: 'es-ES', label: 'Español (ES) · Neural2 B — Masculina', gender: 'male' },
  { name: 'es-ES-Neural2-C', lang: 'es-ES', label: 'Español (ES) · Neural2 C — Femenina', gender: 'female' },
  { name: 'es-ES-Neural2-F', lang: 'es-ES', label: 'Español (ES) · Neural2 F — Masculina', gender: 'male' },
  // ── Inglés ──
  { name: 'en-US-Neural2-F', lang: 'en-US', label: 'English (US) · Neural2 F — Female', gender: 'female' },
  { name: 'en-US-Neural2-D', lang: 'en-US', label: 'English (US) · Neural2 D — Male', gender: 'male' },
  { name: 'en-US-Journey-F', lang: 'en-US', label: 'English (US) · Journey F — Expressive', gender: 'female' },
  { name: 'en-US-Journey-O', lang: 'en-US', label: 'English (US) · Journey O — Expressive', gender: 'male' }
];

/** Voz latina femenina por defecto y su contraparte masculina. */
export const DEFAULT_LATIN_FEMALE_VOICE = 'es-US-Neural2-C';
export const DEFAULT_LATIN_MALE_VOICE = 'es-US-Neural2-B';

/** Códigos de región latinos preferidos al elegir una voz del navegador. */
const LATIN_REGION_PRIORITY = ['es-419', 'es-us', 'es-mx', 'es-ar', 'es-co', 'es-cl', 'es-pe', 'es-ve', 'es-uy', 'es-do', 'es-ec', 'es-gt', 'es-pr'];

function scoreBrowserVoice(voice: SpeechSynthesisVoice, lang: 'es' | 'en'): number {
  const voiceLang = voice.lang.toLowerCase();
  if (!voiceLang.startsWith(lang)) return -1;

  let score = 0;
  if (lang === 'es') {
    const regionIndex = LATIN_REGION_PRIORITY.indexOf(voiceLang);
    score = regionIndex >= 0 ? 100 - regionIndex : voiceLang.startsWith('es-es') ? 40 : 20;
  } else {
    score = voiceLang.startsWith('en-us') ? 100 : 60;
  }

  const name = voice.name.toLowerCase();
  if (/(neural|natural|premium|enhanced|wavenet|journey)/.test(name)) score += 15;
  if (/google/.test(name)) score += 8;
  return score;
}

/**
 * isSpeakableFigure — Delega en el sanitizador estricto (whitelist del catálogo
 * oficial). Un nodo solo es "hablable" si tiene un código de elemento asignado o
 * una etiqueta que corresponde a una figura reglamentaria real.
 */
export function isSpeakableFigure(label?: string | null, type?: string | null, element_id?: string | null): boolean {
  if (element_id && element_id.trim() !== '') return true;

  if (!label) return false;
  const trimmed = label.trim();
  if (!trimmed) return false;

  // Descartar marcadores estructurales por tipo antes de consultar el catálogo
  if (type === 'Marker' || type === 'Curve') {
    if (/^(marcador|marker|beat|punto|point|nodo|node|curve|curva)\b/i.test(trimmed)) return false;
  }

  return sanitizeSpeechText(trimmed) !== null;
}

export class VoiceCueEngine {
  private ctx: AudioContext | null = null;
  private outputNode: AudioNode | null = null;
  
  private config: VoiceCueConfig = {
    enabled: true,
    volume: 0.9,
    introDelaySec: 5,
    warningLeadTimeSec: 3,
    language: 'es',
    voiceSpeed: 1.05,
    voicePitch: 1.0,
    selectedVoiceURI: null,
    ttsEngine: 'browser',
    googleApiKey: null,
    googleVoiceName: DEFAULT_LATIN_FEMALE_VOICE,
    voiceGender: 'female'
  };

  /**
   * Caché de voces del navegador válidas por género (`es:female`).
   * Evita re-escanear la lista en cada locución.
   */
  private browserVoiceCache: Map<string, SpeechSynthesisVoice> = new Map();

  private availableVoices: SpeechSynthesisVoice[] = [];
  private cues: VoiceCueEvent[] = [];
  private triggeredCueIds: Set<string> = new Set();
  
  // Google Cloud TTS Audio Cache and active node
  private googleAudioCache: Map<string, AudioBuffer> = new Map();
  private activeBufferSource: AudioBufferSourceNode | null = null;

  // Lookahead Web Audio Hardware Timeline Scheduler (Zero-Drift)
  private schedulerTimerId: any = null;
  private audioZeroCtxTime: number = 0;
  private playbackRate: number = 1.0;
  private scheduledCueIds: Set<string> = new Set();

  // Pre-roll countdown timer
  private preRollTimer: any = null;
  private isPreRollActive = false;
  private onPreRollTick: PreRollTickCallback | null = null;
  private onPreRollComplete: PreRollCompleteCallback | null = null;

  constructor(config?: Partial<VoiceCueConfig>) {
    // ── Credencial propia de la app (build / Vercel) ──────────────
    // El usuario final nunca introduce una API Key: la app ya viaja con ella.
    const builtInApiKey = getBuiltInGoogleTtsApiKey();
    const hasBuiltInKey = hasBuiltInGoogleTtsApiKey();
    if (hasBuiltInKey) {
      this.config.googleApiKey = builtInApiKey;
      ttsService.setApiKey(builtInApiKey);
    }

    let hasSavedEnginePreference = false;

    if (typeof localStorage !== 'undefined') {
      const savedEngine = localStorage.getItem('skatecoreo_tts_engine') || localStorage.getItem('skateart_tts_engine');
      if (savedEngine === 'browser' || savedEngine === 'google-cloud') {
        this.config.ttsEngine = savedEngine;
        hasSavedEnginePreference = true;
      }

      // Solo se admite clave manual cuando la app NO trae la suya (self-hosting).
      if (!hasBuiltInKey) {
        const savedApiKey = localStorage.getItem('skatecoreo_google_tts_key') || localStorage.getItem('skateart_google_tts_key');
        if (savedApiKey) {
          this.config.googleApiKey = savedApiKey;
        }
      }
      const savedGoogleVoice = localStorage.getItem('skatecoreo_google_voice') || localStorage.getItem('skateart_google_voice');
      if (savedGoogleVoice) {
        this.config.googleVoiceName = savedGoogleVoice;
      }

      // Migración única: cualquier voz castellana (es-ES) guardada por versiones
      // anteriores se sustituye por la voz latina femenina por defecto, para que
      // el acento de la Voz Guía sea siempre latinoamericano.
      if (this.config.language === 'es' && /^es-ES-/i.test(this.config.googleVoiceName)) {
        this.config.googleVoiceName = DEFAULT_LATIN_FEMALE_VOICE;
        try {
          localStorage.setItem('skatecoreo_google_voice', DEFAULT_LATIN_FEMALE_VOICE);
        } catch (e) {}
      }

      // El GÉNERO se deriva del nombre de voz guardado (fuente de verdad), no de
      // un valor independiente que pudiera quedar desincronizado.
      const savedGender = localStorage.getItem('skatecoreo_voice_gender') || localStorage.getItem('skateart_voice_gender');
      const detectedFromVoice = detectGoogleVoiceGender(this.config.googleVoiceName);
      if (detectedFromVoice) {
        this.config.voiceGender = detectedFromVoice;
      } else if (savedGender === 'female' || savedGender === 'male') {
        this.config.voiceGender = savedGender;
      }

      // Limpieza: si la app ya trae credencial, se elimina cualquier clave manual
      // antigua para que no queden dos fuentes de verdad.
      if (hasBuiltInKey) {
        try {
          localStorage.removeItem('skatecoreo_google_tts_key');
          localStorage.removeItem('skateart_google_tts_key');
        } catch (e) {}
      }
    }

    // Con credencial incluida y sin preferencia guardada del usuario, el motor
    // natural de Google Cloud (voces latinas Neural2/Wavenet) es el de fábrica.
    // Fuera del bloque de localStorage para que la decisión sea determinista en
    // cualquier entorno (navegador, SSR y pruebas).
    if (hasBuiltInKey && !hasSavedEnginePreference) {
      this.config.ttsEngine = 'google-cloud';
    }

    if (config) {
      this.config = { ...this.config, ...config };
    }
    this.initVoices();
  }

  private initVoices() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        try {
          const list = window.speechSynthesis.getVoices();
          if (list && list.length > 0) {
            this.availableVoices = list;
            
            // Restore saved voice preference from localStorage if available
            if (!this.config.selectedVoiceURI && typeof localStorage !== 'undefined') {
              const saved = localStorage.getItem('skatecoreo_voice_uri') || localStorage.getItem('skateart_voice_uri');
              if (saved && list.some(v => v.voiceURI === saved)) {
                this.config.selectedVoiceURI = saved;
              }
            }

            // Sin preferencia guardada: elegir la mejor voz (prioriza acento latino)
            if (!this.config.selectedVoiceURI) {
              const best = this.pickBestBrowserVoice(list, this.config.language);
              if (best) {
                this.config.selectedVoiceURI = best.voiceURI;
              }
            }
          }
        } catch (e) {}
      };

      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  /**
   * Elige la mejor voz del navegador para el idioma Y EL GÉNERO pedidos.
   *
   * Prioriza, en este orden:
   *  1. Género coincidente (si el nombre lo declara) — esto es lo que hace que
   *     "Femenina" y "Masculina" suenen realmente distinto.
   *  2. Acento latino (es-419 / es-US / es-MX / …) sobre castellano.
   *  3. Voces "neural / natural / premium / enhanced" sobre las básicas.
   *
   * Si ninguna voz declara su género, se devuelve la mejor del idioma y el
   * llamador aplica un ajuste de `pitch` para diferenciarlas acústicamente.
   */
  public pickBestBrowserVoice(
    voices: SpeechSynthesisVoice[],
    lang: 'es' | 'en',
    gender: VoiceGender = this.config.voiceGender
  ): SpeechSynthesisVoice | null {
    if (!voices || voices.length === 0) return null;

    const cacheKey = `${lang}:${gender}`;
    const cached = this.browserVoiceCache.get(cacheKey);
    if (cached && voices.some((v) => v.voiceURI === cached.voiceURI)) return cached;

    const genderMatched: Array<{ voice: SpeechSynthesisVoice; score: number }> = [];
    const unknownGender: Array<{ voice: SpeechSynthesisVoice; score: number }> = [];
    const mismatched: Array<{ voice: SpeechSynthesisVoice; score: number }> = [];

    for (const voice of voices) {
      const baseScore = scoreBrowserVoice(voice, lang);
      if (baseScore < 0) continue;

      const match = voiceMatchesGender(voice.name, gender);
      const entry = { voice, score: baseScore };
      if (match === true) genderMatched.push(entry);
      else if (match === null) unknownGender.push(entry);
      else mismatched.push(entry);
    }

    const pool =
      genderMatched.length > 0
        ? genderMatched
        : unknownGender.length > 0
          ? unknownGender
          : mismatched;

    if (pool.length === 0) return null;

    pool.sort((a, b) => b.score - a.score);
    this.browserVoiceCache.set(cacheKey, pool[0].voice);
    return pool[0].voice;
  }

  /** Género activo de la Voz Guía. */
  public getVoiceGender(): VoiceGender {
    return this.config.voiceGender;
  }

  /**
   * Cambia el género de la Voz Guía de forma coherente en TODOS los motores.
   *
   * Antes este ajuste no tocaba el nombre de la voz de Google ni la voz del
   * navegador fijada, así que la guía seguía sonando igual. Ahora:
   *  - Selecciona la voz latina (es-US) del mismo motor (Neural2/Wavenet/Journey)
   *    para el género pedido.
   *  - Invalida la voz de navegador fijada para que se re-elija por género.
   *  - Propaga el género a `ttsService` (API de Google Cloud).
   */
  public setVoiceGender(gender: VoiceGender) {
    this.config.voiceGender = gender;
    this.browserVoiceCache.clear();

    // Voz del navegador: descartar la fijada si no coincide con el género
    const pinned = this.config.selectedVoiceURI
      ? this.getAvailableVoices().find((v) => v.voiceURI === this.config.selectedVoiceURI)
      : null;
    if (pinned && voiceMatchesGender(pinned.name, gender) === false) {
      this.setSelectedVoice(null);
    }

    // Voz Google Cloud: misma familia (tier) y región latina, género pedido
    const current = GOOGLE_TTS_VOICES.find((v) => v.name === this.config.googleVoiceName);
    const region = current?.lang ?? 'es-US';
    const tier = /wavenet/i.test(this.config.googleVoiceName)
      ? 'wavenet'
      : /journey/i.test(this.config.googleVoiceName)
        ? 'journey'
        : 'neural2';

    const candidates = GOOGLE_TTS_VOICES.filter(
      (v) => v.lang === region && v.gender === gender
    );
    const sameTier = candidates.find((v) => v.name.toLowerCase().includes(tier));
    const fallback = candidates[0] ?? GOOGLE_TTS_VOICES.find((v) => v.gender === gender);

    if (fallback) {
      this.setGoogleVoiceName((sameTier ?? fallback).name);
    }

    ttsService.setVoiceGender(gender);
  }

  public init(ctx: AudioContext, outputNode: AudioNode) {
    this.ctx = ctx;
    this.outputNode = outputNode;
    ttsService.attachAudioContext(ctx, outputNode);
  }

  public getAvailableVoices(): SpeechSynthesisVoice[] {
    if (this.availableVoices.length === 0 && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.availableVoices = window.speechSynthesis.getVoices();
    }
    return this.availableVoices;
  }

  public setSelectedVoice(voiceURI: string | null) {
    this.config.selectedVoiceURI = voiceURI;
    if (typeof localStorage !== 'undefined' && voiceURI) {
      localStorage.setItem('skatecoreo_voice_uri', voiceURI);
    }
  }

  public setTtsEngine(engine: TTSEngineType) {
    this.config.ttsEngine = engine;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('skatecoreo_tts_engine', engine);
    }
  }

  /** ¿La credencial viene incluida en la app? (el usuario no configura nada) */
  public hasBuiltInApiKey(): boolean {
    return hasBuiltInGoogleTtsApiKey();
  }

  /**
   * Sobrescribe la credencial manualmente.
   * Cuando la app ya incluye la suya, la llamada es inocua: la credencial de la
   * app es autoritativa y no puede quedar sobrescrita por una clave local.
   */
  public setGoogleApiKey(key: string | null) {
    if (this.hasBuiltInApiKey()) {
      this.config.googleApiKey = getBuiltInGoogleTtsApiKey();
      ttsService.setApiKey(this.config.googleApiKey);
      return;
    }

    this.config.googleApiKey = key ? key.trim() : null;
    if (key) {
      ttsService.setApiKey(key.trim());
    }
    if (typeof localStorage !== 'undefined') {
      if (this.config.googleApiKey) {
        localStorage.setItem('skatecoreo_google_tts_key', this.config.googleApiKey);
      } else {
        localStorage.removeItem('skatecoreo_google_tts_key');
        localStorage.removeItem('skateart_google_tts_key');
      }
    }
  }

  public setGoogleVoiceName(voiceName: string) {
    this.config.googleVoiceName = voiceName;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('skatecoreo_google_voice', voiceName);
    }
  }

  public setVoicePitch(pitch: number) {
    this.config.voicePitch = Math.max(0.5, Math.min(2.0, pitch));
  }

  public setVoiceSpeed(speed: number) {
    this.config.voiceSpeed = Math.max(0.5, Math.min(2.0, speed));
  }

  public setConfig(newConfig: Partial<VoiceCueConfig>) {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.selectedVoiceURI !== undefined) {
      this.setSelectedVoice(newConfig.selectedVoiceURI);
    }
    if (newConfig.ttsEngine !== undefined) {
      this.setTtsEngine(newConfig.ttsEngine);
    }
    if (newConfig.googleApiKey !== undefined) {
      this.setGoogleApiKey(newConfig.googleApiKey);
    }
    if (newConfig.googleVoiceName !== undefined) {
      this.setGoogleVoiceName(newConfig.googleVoiceName);
    }
  }

  public getConfig(): VoiceCueConfig {
    return { ...this.config };
  }

  public setLanguage(lang: 'es' | 'en') {
    this.config.language = lang;
    if (this.availableVoices.length > 0) {
      const current = this.availableVoices.find(v => v.voiceURI === this.config.selectedVoiceURI);
      const prefix = lang === 'es' ? 'es' : 'en';
      const needsSwitch = !current || !current.lang.toLowerCase().startsWith(prefix);
      if (needsSwitch) {
        const best = this.pickBestBrowserVoice(this.availableVoices, lang);
        if (best) this.setSelectedVoice(best.voiceURI);
      }
    }

    // Migrar a voz latina: cualquier voz es-ES previa se reemplaza por la latina
    if (lang === 'es' && !this.config.googleVoiceName.startsWith('es-US')) {
      this.setGoogleVoiceName(DEFAULT_LATIN_FEMALE_VOICE);
    } else if (lang === 'en' && !this.config.googleVoiceName.startsWith('en-')) {
      this.setGoogleVoiceName('en-US-Neural2-F');
    }
  }

  public setIntroDelay(sec: number) {
    this.config.introDelaySec = Math.max(0, Math.min(30, sec));
  }

  public setLeadTime(sec: number) {
    this.config.warningLeadTimeSec = Math.max(1, Math.min(10, sec));
  }

  public setVolume(volume: number) {
    this.config.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Precalienta frases frecuentes para que suenen instantáneamente sin latencia de red
   */
  public async preloadGoogleTTS(phrases: string[]) {
    if (this.config.ttsEngine !== 'google-cloud' || !this.config.googleApiKey || !this.ctx) return;
    for (const phrase of phrases) {
      const trimmed = phrase.trim();
      if (!trimmed) continue;
      const cacheKey = `${this.config.googleVoiceName}_${this.config.voiceSpeed}_${trimmed}`;
      if (!this.googleAudioCache.has(cacheKey)) {
        try {
          await this.synthesizeWithGoogleTTS(trimmed);
        } catch (e) {}
      }
    }
  }

  /**
   * Genera eventos de alerta vocal a partir de los elementos del programa RollArt
   */
  public loadProgramElements(elements: ElementLog[]) {
    this.triggeredCueIds.clear();
    const leadMs = this.config.warningLeadTimeSec * 1000;
    const isEs = this.config.language === 'es';

    this.cues = elements
      .map((el): VoiceCueEvent | null => {
        const triggerTimeMs = Math.max(0, el.execution_timestamp - leadMs);

        // Filtro de Voz Guía: solo se anuncia el nombre de la figura asignada
        // (o su código de elemento). Nombres descriptivos o vacíos se descartan.
        const rawName = (el.name || '').trim() || (el.base_code || '').trim();
        const spokenName = sanitizeSpeechText(rawName);
        if (!spokenName) return null;

        const text = isEs
          ? `${spokenName} en ${this.config.warningLeadTimeSec}`
          : `${spokenName} in ${this.config.warningLeadTimeSec}`;

        return {
          id: `cue-${el.id}`,
          timeMs: triggerTimeMs,
          text,
          type: 'element-alert' as const,
          elementId: el.id,
        };
      })
      .filter((cue): cue is VoiceCueEvent => cue !== null);

    if (this.config.ttsEngine === 'google-cloud' && this.config.googleApiKey) {
      void this.preloadGoogleTTS(this.cues.map((c) => c.text));
    }
  }

  /**
   * Genera la secuencia matemática de alertas para los nodos/figuras de la pista 2D:
   * Calcula exactamente la cuenta regresiva temprana antes de cada figura:
   * Si una figura está en el segundo T (ej. 45.0s):
   * - T - 3000ms: "3"
   * - T - 2000ms: "2"
   * - T - 1000ms: "1"
   * - T ms: "¡Ya! [Nombre de la figura]" (o "¡Ya! Salchow")
   */
  public loadNodes(nodes: ChoreographyPathPoint[]) {
    this.triggeredCueIds.clear();
    const isEs = this.config.language === 'es';
    const newCues: VoiceCueEvent[] = [];

    // Filtrar estrictamente solo nodos que tengan una figura deportiva seleccionada real
    // Si un nodo no tiene figura (ej. Inicio Trazo, Fin Trazo, Vértice, Nodo 1, etc.), se omite por completo
    const speakableNodes = nodes.filter(n => n.time_ms > 0 && isSpeakableFigure(n.label, n.type, n.element_id));

    for (const node of speakableNodes) {
      const rawFigureName = (node.label && node.label.trim()) ? cleanFigureNameForSpeech(node.label) : (node.element_id || '').trim();
      if (!rawFigureName) continue;
      const figureName = rawFigureName;
      const targetTimeMs = node.time_ms;

      // 1. Lectura previa del nombre de la figura deportiva:
      // Formato solicitado: "[Nombre de la figura], en tres, dos, uno, ya"
      if (targetTimeMs >= 4000) {
        newCues.push({
          id: `cue-${node.id}-name`,
          timeMs: targetTimeMs - 4200,
          text: isEs ? `${figureName}, en` : `${figureName}, in`,
          type: 'figure-name',
          elementId: node.id
        });
      } else if (targetTimeMs >= 2000) {
        newCues.push({
          id: `cue-${node.id}-name`,
          timeMs: 0,
          text: isEs ? `${figureName}, en` : `${figureName}, in`,
          type: 'figure-name',
          elementId: node.id
        });
      }

      // 2. Cuenta atrás ritmada: tres, dos, uno
      // Exactamente a T - 3000ms: "tres"
      if (targetTimeMs >= 3000) {
        newCues.push({
          id: `cue-${node.id}-3`,
          timeMs: targetTimeMs - 3000,
          text: isEs ? 'tres' : 'three',
          type: 'countdown-3',
          elementId: node.id
        });
      }

      // Exactamente a T - 2000ms: "dos"
      if (targetTimeMs >= 2000) {
        newCues.push({
          id: `cue-${node.id}-2`,
          timeMs: targetTimeMs - 2000,
          text: isEs ? 'dos' : 'two',
          type: 'countdown-2',
          elementId: node.id
        });
      }

      // Exactamente a T - 1000ms: "uno"
      if (targetTimeMs >= 1000) {
        newCues.push({
          id: `cue-${node.id}-1`,
          timeMs: targetTimeMs - 1000,
          text: isEs ? 'uno' : 'one',
          type: 'countdown-1',
          elementId: node.id
        });
      }

      // 3. Momento de ejecución exacta (T ms): "¡ya!"
      newCues.push({
        id: `cue-${node.id}-go`,
        timeMs: targetTimeMs,
        text: isEs ? '¡ya!' : 'go!',
        type: 'figure-arrival',
        elementId: node.id
      });
    }

    this.cues = newCues.sort((a, b) => a.timeMs - b.timeMs);

    // Precalentar voces en segundo plano con las frases de aviso anticipado
    if (this.config.ttsEngine === 'google-cloud' && this.config.googleApiKey) {
      const phrasesToPreload = [
        'tres', 'dos', 'uno', '¡ya!', 'three', 'two', 'one', 'go!',
        ...speakableNodes.map(n => {
          const name = (n.label && n.label.trim()) ? cleanFigureNameForSpeech(n.label) : (n.element_id || '').trim();
          return isEs ? `${name}, en` : `${name}, in`;
        })
      ];
      void this.preloadGoogleTTS(phrasesToPreload);
    }
  }

  public getCues(): VoiceCueEvent[] {
    return [...this.cues];
  }

  /**
   * Inicia el planificador Web Audio de hardware (Lookahead Scheduler) para sincronización zero-drift.
   * Encola la reproducción de voces y beeps directamente en el reloj de hardware de AudioContext.
   */
  public startSync(audioZeroCtxTime: number, playbackRate: number = 1.0) {
    this.stopSync();
    this.audioZeroCtxTime = audioZeroCtxTime;
    this.playbackRate = Math.max(0.1, playbackRate);
    this.scheduledCueIds.clear();

    if (!this.ctx || !this.config.enabled) return;

    // Frecuencia de chequeo del scheduler: 20ms con anticipación de 0.20s
    this.schedulerTimerId = setInterval(() => {
      if (!this.ctx || !this.config.enabled || this.isPreRollActive) return;
      const now = this.ctx.currentTime;
      const scheduleAheadSec = 0.20;

      for (const cue of this.cues) {
        if (!this.scheduledCueIds.has(cue.id) && !this.triggeredCueIds.has(cue.id)) {
          const cueCtxTime = this.audioZeroCtxTime + (cue.timeMs / 1000) / this.playbackRate;
          if (cueCtxTime >= now - 0.05 && cueCtxTime <= now + scheduleAheadSec) {
            this.scheduledCueIds.add(cue.id);
            this.triggeredCueIds.add(cue.id);
            this.scheduleHardwareCue(cue, Math.max(now, cueCtxTime));
          }
        }
      }
    }, 20);
  }

  public stopSync() {
    if (this.schedulerTimerId !== null) {
      clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
  }

  /**
   * Encola un aviso en la línea de tiempo exacta de hardware
   */
  private scheduleHardwareCue(cue: VoiceCueEvent, targetCtxTime: number) {
    if (!this.ctx || !this.outputNode) return;

    // Filtro de Voz Guía: nada llega a la API de TTS sin pasar la whitelist
    const safeText = sanitizeSpeechText(cue.text);
    if (!safeText) return;

    // 1. Emitir tono percusivo exacto en el momento del evento
    try {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      const freq = cue.type === 'figure-arrival' ? 1000 : 650;
      const vol = (this.config.volume || 0.8) * 0.35;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, targetCtxTime);
      oscGain.gain.setValueAtTime(vol, targetCtxTime);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, targetCtxTime + 0.04);

      osc.connect(oscGain);
      oscGain.connect(this.outputNode);
      osc.start(targetCtxTime);
      osc.stop(targetCtxTime + 0.04);
    } catch (e) {}

    // 2. Intentar reproducir buffer de voz TTS precargado si está disponible
    void (async () => {
      try {
        const buffer = await ttsService.getAudioBufferForText(safeText, { speed: this.config.voiceSpeed });
        if (buffer && this.ctx && this.outputNode) {
          const source = this.ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(this.outputNode);
          source.start(targetCtxTime);
          return;
        }
      } catch (err) {}

      // Fallback a síntesis reactiva si no había buffer
      const delayMs = Math.max(0, Math.round((targetCtxTime - (this.ctx?.currentTime || 0)) * 1000));
      setTimeout(() => {
        this.speakRaw(safeText);
      }, delayMs);
    })();
  }

  /**
   * Comprueba en cada frame si corresponde disparar un aviso (usado como respaldo)
   */
  public checkPlaybackTime(currentTimeMs: number) {
    if (!this.config.enabled || this.isPreRollActive) return;

    for (const cue of this.cues) {
      if (!this.triggeredCueIds.has(cue.id) && !this.scheduledCueIds.has(cue.id)) {
        if (currentTimeMs >= cue.timeMs && currentTimeMs <= cue.timeMs + 400) {
          this.triggeredCueIds.add(cue.id);
          this.scheduledCueIds.add(cue.id);
          this.speak(cue.text);
          if (cue.type === 'figure-arrival') {
            this.playTickTone(1000);
          } else {
            this.playTickTone(650);
          }
        }
      }
    }
  }

  public resetTriggeredCues(fromTimeMs: number = 0) {
    if (fromTimeMs === 0) {
      this.triggeredCueIds.clear();
      this.scheduledCueIds.clear();
    } else {
      for (const cue of this.cues) {
        if (cue.timeMs >= fromTimeMs) {
          this.triggeredCueIds.delete(cue.id);
          this.scheduledCueIds.delete(cue.id);
        }
      }
    }
  }

  /**
   * Inicia el pre-roll countdown sincronizado (recibe intervalo de tiempo en segundos o compás)
   */
  public startPreRoll(
    onTick: PreRollTickCallback, 
    onComplete: PreRollCompleteCallback,
    stepIntervalSec: number = 1.0,
    onStepSound?: (remaining: number) => void
  ) {
    this.cancelPreRoll();

    if (this.config.introDelaySec <= 0) {
      onComplete();
      return;
    }

    // Precalentar números del conteo en Google Cloud TTS para que suenen sin retardo
    if (this.config.ttsEngine === 'google-cloud' && this.config.googleApiKey) {
      const isEs = this.config.language === 'es';
      const wordsToWarm = isEs
        ? ['Tres', 'Dos', 'Uno', '¡Ya!', '3', '2', '1']
        : ['Three', 'Two', 'One', 'Go!', '3', '2', '1'];
      void this.preloadGoogleTTS(wordsToWarm);
    }

    this.isPreRollActive = true;
    this.onPreRollTick = onTick;
    this.onPreRollComplete = onComplete;

    let remaining = this.config.introDelaySec;
    this.onPreRollTick(remaining);
    this.announceNumber(remaining);
    if (onStepSound) onStepSound(remaining);

    const stepMs = Math.round(stepIntervalSec * 1000);

    this.preRollTimer = setInterval(() => {
      remaining -= 1;
      if (this.onPreRollTick) {
        this.onPreRollTick(remaining);
      }

      if (remaining > 0) {
        this.announceNumber(remaining);
        this.playTickTone(600);
        if (onStepSound) onStepSound(remaining);
      } else {
        this.announceGo();
        this.playTickTone(1200);
        if (onStepSound) onStepSound(0);
        const completeCb = this.onPreRollComplete;
        this.cancelPreRoll();
        if (completeCb) {
          completeCb();
        }
      }
    }, stepMs);
  }

  public cancelPreRoll() {
    this.isPreRollActive = false;
    if (this.preRollTimer !== null) {
      clearInterval(this.preRollTimer);
      this.preRollTimer = null;
    }
    this.onPreRollTick = null;
    this.onPreRollComplete = null;
  }

  public isPreRolling(): boolean {
    return this.isPreRollActive;
  }

  /**
   * Detiene de inmediato cualquier reproducción vocal activa y cancela el pre-roll
   */
  public stop() {
    this.stopSync();
    this.cancelPreRoll();
    ttsService.stop();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    if (this.activeBufferSource) {
      try {
        this.activeBufferSource.stop();
        this.activeBufferSource.disconnect();
      } catch (e) {}
      this.activeBufferSource = null;
    }
  }

  private static readonly NUMBER_WORDS_ES: Record<number, string> = {
    1: 'Uno',
    2: 'Dos',
    3: 'Tres',
    4: 'Cuatro',
    5: 'Cinco',
    6: 'Seis',
    7: 'Siete',
    8: 'Ocho',
    9: 'Nueve',
    10: 'Diez'
  };

  private static readonly NUMBER_WORDS_EN: Record<number, string> = {
    1: 'One',
    2: 'Two',
    3: 'Three',
    4: 'Four',
    5: 'Five',
    6: 'Six',
    7: 'Seven',
    8: 'Eight',
    9: 'Nine',
    10: 'Ten'
  };

  public announceNumber(num: number) {
    if (!this.config.enabled || this.config.volume <= 0) return;
    const isEs = this.config.language === 'es';
    const dict = isEs ? VoiceCueEngine.NUMBER_WORDS_ES : VoiceCueEngine.NUMBER_WORDS_EN;
    const text = dict[num] || num.toString();
    this.speak(text);
  }

  public announceGo() {
    if (!this.config.enabled || this.config.volume <= 0) return;
    const isEs = this.config.language === 'es';
    this.speak(isEs ? '¡Ya!' : 'Go!');
  }

  /**
   * Probar la voz seleccionada con una frase deportiva
   */
  public testVoice(sampleText?: string) {
    const isEs = this.config.language === 'es';
    const text = sampleText || (isEs ? 'Doble Axel en 3, 2, 1, ¡ya!' : 'Double Axel in 3, 2, 1, go!');
    // Acción explícita del usuario: se salta el filtro para permitir cualquier muestra
    this.speakRaw(text);
    if (this.config.ttsEngine === 'browser') {
      this.playAlertTone();
    }
  }

  /**
   * Sintetiza y reproduce texto usando Google Cloud Text-to-Speech o Web Speech API.
   *
   * Filtro de Voz Guía: TODO texto pasa por `sanitizeSpeechText`, que solo deja
   * pasar comandos explícitos o nombres de figuras del catálogo oficial. Así la
   * digitalización de la plantilla A4 nunca lee "Nodo 3 (Papel)", notas al
   * margen ni metadatos de audio.
   */
  public speak(text: string) {
    const safeText = sanitizeSpeechText(text);
    if (!safeText) return;
    this.speakRaw(safeText);
  }

  /** Reproducción sin filtro. Reservado a la prueba manual de voz. */
  public speakRaw(text: string) {
    if (!this.config.enabled || this.config.volume <= 0) return;
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    if (ttsService.hasGoogleApiKey() || (this.config.ttsEngine === 'google-cloud' && this.config.googleApiKey)) {
      ttsService.speak(trimmed, {
        speed: this.config.voiceSpeed,
        force: true,
        gender: this.config.voiceGender,
        language: this.config.language,
        voiceName: this.config.googleVoiceName,
      });
      return;
    }

    if (this.config.ttsEngine === 'google-cloud') {
      this.speakGoogleCloud(trimmed);
      return;
    }

    this.speakBrowser(trimmed);
  }

  /**
   * Síntesis de voz ultra-natural con Google Cloud Text-to-Speech API
   */
  private speakGoogleCloud(text: string) {
    const cacheKey = `${this.config.googleVoiceName}_${this.config.voiceSpeed}_${text.trim()}`;
    const cachedBuffer = this.googleAudioCache.get(cacheKey);

    if (cachedBuffer) {
      this.playAudioBuffer(cachedBuffer);
      return;
    }

    this.synthesizeWithGoogleTTS(text)
      .then((buffer) => {
        if (buffer) {
          this.playAudioBuffer(buffer);
        } else {
          this.speakBrowser(text);
        }
      })
      .catch((err) => {
        console.warn('[VoiceCueEngine] Google Cloud TTS falló, usando navegador:', err);
        this.speakBrowser(text);
      });
  }

  /**
   * Llama a la API REST de Google Cloud Text-to-Speech y devuelve un AudioBuffer de Web Audio
   */
  public async synthesizeWithGoogleTTS(text: string): Promise<AudioBuffer | null> {
    if (!this.ctx || !this.config.googleApiKey) return null;

    const cacheKey = `${this.config.googleVoiceName}_${this.config.voiceSpeed}_${text.trim()}`;
    if (this.googleAudioCache.has(cacheKey)) {
      return this.googleAudioCache.get(cacheKey)!;
    }

    try {
      const voiceOption = GOOGLE_TTS_VOICES.find(v => v.name === this.config.googleVoiceName);
      // Región latina por defecto (es-US) para todo el motor de voz guía
      const langCode = voiceOption?.lang || (this.config.language === 'es' ? 'es-US' : 'en-US');

      const pitchSemitones = (this.config.voicePitch - 1.0) * 4;
      const clampedPitch = Math.max(-20, Math.min(20, pitchSemitones));

      const payload = {
        input: { text },
        voice: {
          languageCode: langCode,
          name: this.config.googleVoiceName
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: Math.max(0.25, Math.min(4.0, this.config.voiceSpeed)),
          pitch: clampedPitch
        }
      };

      const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(this.config.googleApiKey.trim())}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[VoiceCueEngine] Error de Google Cloud TTS:', response.status, errorText);
        return null;
      }

      const data = await response.json();
      if (!data.audioContent) {
        console.error('[VoiceCueEngine] Respuesta sin audioContent de Google Cloud TTS');
        return null;
      }

      // Convertir Base64 a ArrayBuffer (compatible con browser y Node)
      const binaryString = typeof Buffer !== 'undefined'
        ? Buffer.from(data.audioContent, 'base64').toString('binary')
        : window.atob(data.audioContent);

      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await this.ctx.decodeAudioData(bytes.buffer);
      this.googleAudioCache.set(cacheKey, audioBuffer);
      return audioBuffer;
    } catch (err) {
      console.error('[VoiceCueEngine] Excepción en llamada a Google Cloud TTS:', err);
      return null;
    }
  }

  /**
   * Reproduce un AudioBuffer conectándolo al bus de salida del coach
   */
  public playAudioBuffer(buffer: AudioBuffer) {
    if (!this.ctx || this.config.volume <= 0) return;

    try {
      if (this.activeBufferSource) {
        try {
          this.activeBufferSource.stop();
          this.activeBufferSource.disconnect();
        } catch (e) {}
        this.activeBufferSource = null;
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(this.config.volume, this.ctx.currentTime);

      source.connect(gainNode);
      if (this.outputNode) {
        gainNode.connect(this.outputNode);
      } else {
        gainNode.connect(this.ctx.destination);
      }

      this.activeBufferSource = source;
      source.onended = () => {
        if (this.activeBufferSource === source) {
          this.activeBufferSource = null;
        }
      };

      source.start(0);
    } catch (err) {
      console.warn('[VoiceCueEngine] Error al reproducir AudioBuffer:', err);
    }
  }

  /**
   * Síntesis vocal local con Web Speech API
   */
  public speakBrowser(text: string) {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        const gender = this.config.voiceGender;

        const voices = this.getAvailableVoices();

        // La voz fijada solo se respeta si COINCIDE con el género pedido; de lo
        // contrario la guía femenina y la masculina sonaban idénticas.
        const pinned = this.config.selectedVoiceURI
          ? voices.find((v) => v.voiceURI === this.config.selectedVoiceURI) || null
          : null;
        const pinnedMatchesGender = pinned
          ? voiceMatchesGender(pinned.name, gender) !== false
          : false;

        const chosen = pinnedMatchesGender
          ? pinned
          : this.pickBestBrowserVoice(voices, this.config.language, gender);

        if (chosen) {
          utterance.voice = chosen;
          utterance.lang = chosen.lang;
        } else {
          utterance.lang = this.config.language === 'es' ? 'es-US' : 'en-US';
        }

        // Si la voz elegida no declara su género, diferenciamos acústicamente
        // con el tono para que Femenina y Masculina nunca suenen igual.
        const genderConfirmed = chosen
          ? voiceMatchesGender(chosen.name, gender) === true
          : false;
        const pitchOffset = genderConfirmed ? 1 : gender === 'male' ? 0.78 : 1.12;

        utterance.rate = this.config.voiceSpeed;
        utterance.pitch = Math.max(0.1, Math.min(2, this.config.voicePitch * pitchOffset));
        utterance.volume = this.config.volume;

        setTimeout(() => {
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            if (window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
            window.speechSynthesis.speak(utterance);
          }
        }, 15);
      } catch (err) {
        console.warn('[VoiceCueEngine] Fallback a tono sintético:', err);
        this.playAlertTone();
      }
    } else {
      this.playAlertTone();
    }
  }

  /**
   * Tono sintético de alerta Web Audio (para canal derecho / auricular)
   */
  public playAlertTone(time?: number) {
    if (!this.ctx || !this.outputNode || this.config.volume <= 0) return;

    try {
      const now = time !== undefined ? time : this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // La5
      osc.frequency.setValueAtTime(1174.66, now + 0.08); // Re6

      gain.gain.setValueAtTime(0.45 * this.config.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.outputNode);

      osc.start(now);
      osc.stop(now + 0.23);
    } catch (e) {}
  }

  public playTickTone(freq: number, time?: number) {
    if (!this.ctx || !this.outputNode || this.config.volume <= 0) return;

    try {
      const now = time !== undefined ? time : this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.5 * this.config.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.outputNode);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch (e) {}
  }
}
