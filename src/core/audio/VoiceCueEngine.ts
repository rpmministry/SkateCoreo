import { VoiceCueConfig, VoiceCueEvent, TTSEngineType } from '../../types/audio';
import { ElementLog, ChoreographyPathPoint } from '../../types/choreography';
import { ttsService } from '../../services/ttsService';
import {
  cleanFigureNameForSpeech,
  sanitizeSpeechText,
  splitFigureList,
} from './voiceCueSanitizer';
import {
  voiceMatchesGender,
  type VoiceGender,
} from './voiceGender';
import {
  DEFAULT_LATIN_FEMALE_VOICE,
  resolveLatinFemaleVoice,
} from '../../constants/ttsVoices';
import {
  getUserGoogleTtsApiKey,
  hasNaturalVoiceBackend,
} from './ttsBackend';

// Re-export para mantener compatibilidad con los consumidores existentes
export { cleanFigureNameForSpeech, sanitizeSpeechText };

export type PreRollTickCallback = (remainingSec: number) => void;
export type PreRollCompleteCallback = () => void;

/**
 * Re-export del catálogo canónico (`constants/ttsVoices`) para mantener la API
 * pública histórica de este módulo. El catálogo vive en `constants/` porque lo
 * comparte el servidor (`/api/tts`) sin arrastrar el stack de audio del cliente.
 */
export type { GoogleTTSVoiceOption, TtsVoiceGender } from '../../constants/ttsVoices';
export {
  GOOGLE_TTS_VOICES,
  PREMIUM_LATIN_FEMALE_VOICES,
  DEFAULT_LATIN_FEMALE_VOICE,
  DEFAULT_LATIN_LANGUAGE_CODE,
  findTtsVoice,
  resolveLatinFemaleVoice,
  pickWavenetFallbackVoice,
  getVoiceTier,
} from '../../constants/ttsVoices';

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
 *
 * `options.allowManual` admite además FIGURAS MANUALES del usuario (no presentes
 * en el catálogo): se siguen aplicando los rechazos de estructura/metadatos.
 */
export function isSpeakableFigure(
  label?: string | null,
  type?: string | null,
  element_id?: string | null,
  options?: { allowManual?: boolean }
): boolean {
  if (element_id && element_id.trim() !== '') return true;

  if (!label) return false;
  const trimmed = label.trim();
  if (!trimmed) return false;

  // Descartar marcadores estructurales por tipo antes de consultar el catálogo
  if (type === 'Marker' || type === 'Curve') {
    if (/^(marcador|marker|beat|punto|point|nodo|node|curve|curva)\b/i.test(trimmed)) return false;
  }

  return sanitizeSpeechText(trimmed, options) !== null;
}

/**
 * collectNodeFigures — Payload de texto COMPLETO de un nodo para la Voz Guía.
 *
 * Concatena, en orden y sin duplicados, TODAS las figuras del nodo:
 *   1. La figura principal/obligatoria (`label`, admite varias separadas por
 *      coma, barra o " y ").
 *   2. Las figuras manuales (`manual_figures` / `figures_manuales`).
 *   3. Respaldo: el código de elemento RollArt (`element_id`) si no hay etiquetas.
 *
 * Se usa el modo manual del sanitizador para que las figuras escritas a mano por
 * el usuario se lean (antes se descartaban por no estar en el catálogo), sin
 * perder los filtros que bloquean "Nodo 3", "Papel", notas o archivos.
 */
export function collectNodeFigures(node: {
  label?: string | null;
  element_id?: string | null;
  manual_figures?: string[] | null;
  figures_manuales?: string[] | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw?: string | null) => {
    const cleaned = sanitizeSpeechText(raw, { allowManual: true });
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(cleaned);
  };

  for (const part of splitFigureList(node.label)) push(part);
  for (const raw of node.manual_figures || []) {
    for (const part of splitFigureList(raw)) push(part);
  }
  for (const raw of node.figures_manuales || []) {
    for (const part of splitFigureList(raw)) push(part);
  }

  // Respaldo heredado: si el nodo solo trae el código de elemento, se lee ese.
  if (out.length === 0) push(node.element_id);

  return out;
}

export class VoiceCueEngine {
  private ctx: AudioContext | null = null;
  private outputNode: AudioNode | null = null;
  
  private config: VoiceCueConfig = {
    enabled: true,
    volume: 0.9,
    introDelaySec: 5,
    warningLeadTimeSec: 3,
    anticipationSec: 1.5,
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

  /**
   * Últimos nodos cargados. Permite recalcular la secuencia de avisos al
   * instante cuando el usuario cambia la antelación o el idioma, sin esperar a
   * un nuevo ciclo de reproducción.
   */
  private lastNodes: ChoreographyPathPoint[] = [];
  
  // Lookahead Web Audio Hardware Timeline Scheduler (Zero-Drift)
  private schedulerTimerId: any = null;
  private audioZeroCtxTime: number = 0;
  private playbackRate: number = 1.0;
  private scheduledCueIds: Set<string> = new Set();

  /**
   * PRERENDERIZADO (Pre-fetching): AudioBuffers ya decodificados por id de cue.
   *
   * Clave de la latencia cero: cuando `startSync` arranca, todas las frases se
   * piden a Google Cloud TTS en segundo plano y se decodifican a `AudioBuffer`.
   * En el momento exacto de disparo NO hay red ni promesas: el buffer ya está
   * en memoria y se encola directamente en el reloj de hardware.
   */
  private prefetchedBuffers: Map<string, AudioBuffer> = new Map();
  private prefetchPromise: Promise<void> | null = null;

  /**
   * Fuentes de voz activas. Cada cue usa su PROPIO `AudioBufferSourceNode`, de
   * modo que dos figuras muy cercanas se mezclan nativamente en lugar de
   * cortarse entre sí (que era el motivo de que se "omitieran" figuras).
   */
  private activeSources: Set<AudioBufferSourceNode> = new Set();

  // Parámetros del scheduler de hardware
  private readonly lookaheadMs = 20;
  private readonly lookaheadSec = 0.25;
  /** Margen para descartar cues cuyo instante ya pasó irreversiblemente. */
  private readonly lateToleranceSec = 0.35;

  // Pre-roll countdown timer
  private preRollTimer: any = null;
  private isPreRollActive = false;
  private onPreRollTick: PreRollTickCallback | null = null;
  private onPreRollComplete: PreRollCompleteCallback | null = null;

  constructor(config?: Partial<VoiceCueConfig>) {
    // ── Voz natural: endpoint propio o clave local del usuario ────
    // Clave local del usuario (solo auto-hospedaje). La credencial de la app
    // vive en el servidor (`POST /api/tts`) y nunca llega al cliente.
    const userApiKey = getUserGoogleTtsApiKey();
    if (userApiKey) {
      this.config.googleApiKey = userApiKey;
    }

    let hasSavedEnginePreference = false;

    if (typeof localStorage !== 'undefined') {
      const savedEngine = localStorage.getItem('skatecoreo_tts_engine') || localStorage.getItem('skateart_tts_engine');
      if (savedEngine === 'browser' || savedEngine === 'google-cloud') {
        this.config.ttsEngine = savedEngine;
        hasSavedEnginePreference = true;
      }

      // Migración única: las primeras versiones usaban 'browser' por defecto
      // (cuando la voz natural requería una clave manual). Si esa preferencia
      // quedó guardada, la Voz Guía seguía sonando robótica aunque la app ya
      // ofreciera el endpoint natural. Se reevalúa UNA sola vez.
      const ENGINE_MIGRATION_FLAG = 'skatecoreo_tts_engine_migrated_v2';
      if (
        savedEngine === 'browser' &&
        hasNaturalVoiceBackend() &&
        !localStorage.getItem(ENGINE_MIGRATION_FLAG)
      ) {
        this.config.ttsEngine = 'google-cloud';
        try {
          localStorage.setItem('skatecoreo_tts_engine', 'google-cloud');
          localStorage.setItem(ENGINE_MIGRATION_FLAG, '1');
        } catch (e) {}
      }

      const savedGoogleVoice = localStorage.getItem('skatecoreo_google_voice') || localStorage.getItem('skateart_google_voice');
      if (savedGoogleVoice) {
        this.config.googleVoiceName = savedGoogleVoice;
      }

      const savedAnticipation = localStorage.getItem('skatecoreo_voice_anticipation');
      if (savedAnticipation) {
        const parsed = parseFloat(savedAnticipation);
        if (Number.isFinite(parsed)) {
          this.config.anticipationSec = Math.max(0, Math.min(5, parsed));
        }
      }

      // VOZ ÚNICA: la Voz Guía es SIEMPRE femenina latina y premium. Cualquier
      // preferencia heredada (voz castellana es-ES o masculina) se normaliza
      // aquí, de modo que ninguna instalación antigua pueda síntetizar con una
      // voz fuera del catálogo actual.
      this.config.googleVoiceName = resolveLatinFemaleVoice(this.config.googleVoiceName);
      try {
        localStorage.setItem('skatecoreo_google_voice', this.config.googleVoiceName);
      } catch (e) {}
      this.config.voiceGender = 'female';
    }

    // Si hay voz natural disponible (endpoint propio o clave del usuario) y el
    // usuario nunca eligió motor, se usa el natural de fábrica.
    // Fuera del bloque de localStorage para que la decisión sea determinista en
    // cualquier entorno (navegador, SSR y pruebas).
    if (hasNaturalVoiceBackend() && !hasSavedEnginePreference) {
      this.config.ttsEngine = 'google-cloud';
    }

    if (config) {
      this.config = { ...this.config, ...config };
    }
    // Blindaje final: ni siquiera una configuración inyectada puede introducir
    // una voz no femenina/latina.
    this.config.voiceGender = 'female';
    this.config.googleVoiceName = resolveLatinFemaleVoice(this.config.googleVoiceName);
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

  /** Género activo de la Voz Guía. Siempre femenino. */
  public getVoiceGender(): 'female' {
    return 'female';
  }

  /**
   * @deprecated La Voz Guía es SIEMPRE femenina latina.
   *
   * El selector de género se eliminó de la UI y de la lógica: la voz masculina
   * sonaba como una variación artificial de la femenina. Este método se
   * conserva solo por compatibilidad de API y fuerza el catálogo femenino.
   */
  public setVoiceGender(_gender?: VoiceGender) {
    this.config.voiceGender = 'female';
    this.browserVoiceCache.clear();
    this.config.googleVoiceName = resolveLatinFemaleVoice(this.config.googleVoiceName);
    ttsService.setVoiceGender('female');
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

  /**
   * ¿Hay voz natural disponible? Con el endpoint propio (producción) siempre sí,
   * sin que el usuario configure nada.
   */
  public hasNaturalVoice(): boolean {
    return hasNaturalVoiceBackend();
  }

  /**
   * Guarda la credencial LOCAL del usuario (solo auto-hospedaje).
   * En el despliegue oficial no se usa: el servidor custodia la suya.
   */
  public setGoogleApiKey(key: string | null) {
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

  /**
   * Fija la voz de Google Cloud normalizándola SIEMPRE al catálogo femenino
   * latino. Cualquier nombre fuera del catálogo (voz masculina, castellana o
   * inexistente) cae a la voz premium por defecto.
   */
  public setGoogleVoiceName(voiceName: string) {
    this.config.googleVoiceName = resolveLatinFemaleVoice(voiceName);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('skatecoreo_google_voice', this.config.googleVoiceName);
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

  /**
   * Sincronización anticipada (Anticipatory Cues).
   *
   * Segundos ADICIONALES de antelación para anunciar el nombre de la figura
   * antes de que el Playhead alcance el nodo. A diferencia de
   * `warningLeadTimeSec` (que marca el inicio del conteo 3-2-1), este offset
   * adelanta la INSTRUCCIÓN para que el patinador sepa qué viene antes de
   * llegar al punto de ejecución.
   */
  public setAnticipation(sec: number) {
    this.config.anticipationSec = Math.max(0, Math.min(5, sec));
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('skatecoreo_voice_anticipation', String(this.config.anticipationSec));
      } catch (e) {}
    }
    // Recalcula la secuencia de avisos con la nueva antelación: el cambio se
    // aplica de inmediato, sin esperar al siguiente ciclo de reproducción.
    if (this.lastNodes.length > 0) {
      this.loadNodes(this.lastNodes);
    }
    // Los buffers pre-renderizados siguen siendo válidos: la clave es el id del
    // cue y el texto no cambia al mover la antelación.
  }

  /** Antelación total (conteo + instrucción) en milisegundos. */
  public getAnticipationLeadMs(): number {
    return (this.config.warningLeadTimeSec + this.config.anticipationSec) * 1000;
  }

  public setVolume(volume: number) {
    this.config.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Precalienta frases frecuentes para que suenen instantáneamente sin latencia de red
   */
  public async preloadGoogleTTS(phrases: string[]) {
    if (this.config.ttsEngine !== 'google-cloud') return;
    if (!ttsService.hasNaturalVoice()) return;

    // `ttsService` cachea en memoria + IndexedDB, así que el precalentamiento
    // beneficia directamente a las locuciones posteriores.
    await ttsService.preWarm(phrases, {
      speed: this.config.voiceSpeed,
      gender: this.config.voiceGender,
      language: this.config.language,
      voiceName: this.config.googleVoiceName,
    });
  }

  /**
   * Genera eventos de alerta vocal a partir de los elementos del programa RollArt
   */
  public loadProgramElements(elements: ElementLog[]) {
    this.triggeredCueIds.clear();
    const leadMs = this.getAnticipationLeadMs();
    const leadSecSpoken = Math.ceil(leadMs / 1000);
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
          ? `${spokenName} en ${leadSecSpoken}`
          : `${spokenName} in ${leadSecSpoken}`;

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
    this.lastNodes = nodes;
    const isEs = this.config.language === 'es';
    const newCues: VoiceCueEvent[] = [];

    // Nodos hablables: figura obligatoria Y/O figuras manuales del usuario.
    // `collectNodeFigures` concatena todas las figuras del nodo (obligatorias +
    // manuales) y descarta los nodos puramente estructurales (Inicio Trazo,
    // Vértice, Nodo 1, Beat…), que se omiten por completo.
    const speakableNodes = nodes
      .filter((n) => n.time_ms > 0)
      .map((node) => ({ node, figures: collectNodeFigures(node) }))
      .filter((entry) => entry.figures.length > 0);

    // Antelación total de la INSTRUCCIÓN: conteo (3s) + anticipación del usuario.
    // Con los valores por defecto (3 + 1.5) la figura se anuncia 4.5s antes del
    // nodo, siempre antes de que arranque el conteo "tres, dos, uno".
    const nameLeadMs = this.getAnticipationLeadMs();

    for (const { node, figures } of speakableNodes) {
      // Se leen TODAS las figuras del nodo en orden, separadas por coma.
      const figureName = figures.join(', ');
      if (!figureName) continue;
      const targetTimeMs = node.time_ms;

      // 1. Lectura anticipada del nombre de la figura deportiva:
      // Formato: "[Nombre de la figura], en tres, dos, uno, ya"
      // El evento se programa matemáticamente ANTES del nodo (offset negativo).
      if (targetTimeMs >= nameLeadMs) {
        newCues.push({
          id: `cue-${node.id}-name`,
          timeMs: targetTimeMs - nameLeadMs,
          text: isEs ? `${figureName}, en` : `${figureName}, in`,
          type: 'figure-name',
          elementId: node.id
        });
      } else if (targetTimeMs >= 1500) {
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
        ...speakableNodes.map(({ figures }) => {
          const name = figures.join(', ');
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
   * PRERENDERIZADO DE LA VOZ GUÍA (Pre-fetching).
   *
   * Solicita a Google Cloud TTS todas las frases de los cues y las decodifica a
   * `AudioBuffer` ANTES de que hagan falta. Cuando llega el instante del nodo no
   * hay red, ni promesas, ni decodificación: solo un `start(when)` en el reloj
   * de hardware. Es lo que elimina la latencia y evita figuras omitidas.
   */
  public async prefetchCues(): Promise<void> {
    // Sin AudioContext no hay dónde decodificar; sin voz natural no hay qué pedir.
    if (!this.ctx) return;
    if (!ttsService.hasNaturalVoice()) return;
    if (this.cues.length === 0) return;

    const opts = {
      speed: this.config.voiceSpeed,
      language: this.config.language,
      voiceName: this.config.googleVoiceName,
    };

    const pending = this.cues.filter((cue) => !this.prefetchedBuffers.has(cue.id));
    if (pending.length === 0) return;

    const run = async () => {
      // Lotes pequeños: paralelismo suficiente sin saturar la cuota de la API.
      const BATCH_SIZE = 6;
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (cue) => {
            const safeText = sanitizeSpeechText(cue.text);
            if (!safeText) return;
            try {
              // `ttsService` cachea por texto en memoria e IndexedDB, así que los
              // textos repetidos ("tres", "dos", "uno"…) se piden una sola vez.
              const buffer = await ttsService.getAudioBufferForText(safeText, opts);
              if (buffer) this.prefetchedBuffers.set(cue.id, buffer);
            } catch (err) {
              /* Se reintentará en el siguiente arranque de reproducción. */
            }
          })
        );
      }
    };

    this.prefetchPromise = run().finally(() => {
      this.prefetchPromise = null;
    });
    await this.prefetchPromise;
  }

  /**
   * Inicia el planificador Web Audio de hardware (Lookahead Scheduler).
   *
   * Arquitectura (idéntica en espíritu al Metrónomo):
   *  - CERO medida de tiempo musical con temporizadores: todo se calcula con
   *    `AudioContext.currentTime`, el reloj de la tarjeta de sonido.
   *  - `setTimeout` solo DESPIERTA el planificador cada 20 ms; no mide música.
   *  - Los buffers se encolan con 250 ms de antelación (`lookaheadSec`).
   *  - Cada cue usa su PROPIO `AudioBufferSourceNode`, de modo que dos figuras
   *    muy cercanas se solapan o mezclan nativamente en vez de cortarse (que era
   *    la causa de que se "omitieran" figuras).
   */
  public startSync(audioZeroCtxTime: number, playbackRate: number = 1.0) {
    this.stopSync();
    this.audioZeroCtxTime = audioZeroCtxTime;
    this.playbackRate = Math.max(0.1, playbackRate);
    this.scheduledCueIds.clear();

    if (!this.ctx || !this.config.enabled) return;

    // Pre-renderizado en segundo plano: no bloquea el arranque de la música.
    void this.prefetchCues();

    this.scheduler();
  }

  public stopSync() {
    if (this.schedulerTimerId !== null) {
      globalThis.clearTimeout(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
  }

  private scheduler = () => {
    if (!this.ctx || !this.config.enabled || this.isPreRollActive) {
      this.schedulerTimerId = globalThis.setTimeout(this.scheduler, this.lookaheadMs);
      return;
    }

    const now = this.ctx.currentTime;
    const horizon = now + this.lookaheadSec;

    for (const cue of this.cues) {
      if (this.scheduledCueIds.has(cue.id)) continue;

      const cueCtxTime = this.audioZeroCtxTime + (cue.timeMs / 1000) / this.playbackRate;

      // Demasiado en el futuro: aún no corresponde planificarlo.
      if (cueCtxTime > horizon) continue;

      // Ya pasó irreversiblemente: se descarta para no acumular deuda.
      if (cueCtxTime < now - this.lateToleranceSec) {
        this.scheduledCueIds.add(cue.id);
        continue;
      }

      const when = Math.max(now + 0.005, cueCtxTime);
      if (this.scheduleHardwareCue(cue, when)) {
        this.scheduledCueIds.add(cue.id);
        this.triggeredCueIds.add(cue.id);
      }
      // Si devolvió `false` (buffer aún no listo) se reintenta en el próximo tick.
    }

    this.schedulerTimerId = globalThis.setTimeout(this.scheduler, this.lookaheadMs);
  };

  /**
   * Encola un aviso en la línea de tiempo exacta del reloj de hardware.
   *
   * @returns `true` si el audio quedó programado (o se comprometió el respaldo);
   *          `false` si el buffer aún no está listo y conviene reintentar.
   */
  private scheduleHardwareCue(cue: VoiceCueEvent, targetCtxTime: number): boolean {
    if (!this.ctx || !this.outputNode) return false;

    // Filtro de Voz Guía: nada llega al TTS sin pasar la whitelist.
    const safeText = sanitizeSpeechText(cue.text);
    if (!safeText) return true; // No vocalizable: se da por resuelto.

    const tickFreq = cue.type === 'figure-arrival' ? 1000 : 650;

    // ── Voz pre-renderizada: latencia cero y solapamiento nativo ──
    const buffer = this.prefetchedBuffers.get(cue.id);
    if (buffer) {
      this.playTickTone(tickFreq, targetCtxTime);
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const gainNode = this.ctx.createGain();
        gainNode.gain.value = Math.max(0, Math.min(1, this.config.volume));

        source.connect(gainNode);
        gainNode.connect(this.outputNode);

        this.activeSources.add(source);
        source.onended = () => {
          this.activeSources.delete(source);
          try {
            source.disconnect();
            gainNode.disconnect();
          } catch (e) {}
        };

        source.start(targetCtxTime);
        return true;
      } catch (err) {
        return false;
      }
    }

    // ── Red de seguridad ──
    // Si el buffer no llegó a tiempo y el instante es inminente, se usa el
    // sintetizador del navegador para NO perder la figura. Si todavía hay
    // margen, se devuelve `false` y se reintenta en el siguiente tick.
    const delaySec = targetCtxTime - this.ctx.currentTime;
    if (delaySec <= 0.3) {
      this.playTickTone(tickFreq, targetCtxTime);
      const delayMs = Math.max(0, Math.round(delaySec * 1000));
      globalThis.setTimeout(() => this.speakRaw(safeText), delayMs);
      return true;
    }

    return false;
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
    // Silencia TODAS las voces en vuelo: cada cue tiene su propia fuente, así
    // que no basta con detener "la última".
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {}
    }
    this.activeSources.clear();
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

  /**
   * Reproducción sin filtro. Reservado a la prueba manual de voz.
   *
   * Toda la síntesis pasa por `ttsService`, que decide el back-end:
   * `POST /api/tts` (credencial en el servidor) o clave local del usuario.
   * Este motor ya NO guarda credenciales ni llama a Google por su cuenta.
   */
  public speakRaw(text: string) {
    if (!this.config.enabled || this.config.volume <= 0) return;
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    if (this.config.ttsEngine === 'google-cloud') {
      ttsService.speak(trimmed, {
        speed: this.config.voiceSpeed,
        force: true,
        gender: this.config.voiceGender,
        language: this.config.language,
        voiceName: this.config.googleVoiceName,
      });
      return;
    }

    this.speakBrowser(trimmed);
  }

  /**
   * Reproduce un AudioBuffer conectándolo al bus de salida del coach.
   *
   * Crea una fuente INDEPENDIENTE y no interrumpe las voces ya en vuelo: es la
   * base del solapamiento nativo cuando dos figuras caen muy cerca.
   */
  public playAudioBuffer(buffer: AudioBuffer) {
    if (!this.ctx || this.config.volume <= 0) return;

    try {
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

      this.activeSources.add(source);
      source.onended = () => {
        this.activeSources.delete(source);
        try {
          source.disconnect();
          gainNode.disconnect();
        } catch (e) {}
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

        // Voz única femenina: si la voz del navegador elegida no declara su
        // género, se refuerza el timbre femenino con el tono.
        const genderConfirmed = chosen
          ? voiceMatchesGender(chosen.name, gender) === true
          : false;
        const pitchOffset = genderConfirmed ? 1 : 1.12;

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
