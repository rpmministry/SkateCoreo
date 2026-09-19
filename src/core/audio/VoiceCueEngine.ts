import { VoiceCueConfig, VoiceCueEvent, TTSEngineType } from '../../types/audio';
import { ElementLog, ChoreographyPathPoint } from '../../types/choreography';
import { ttsService } from '../../services/ttsService';

export type PreRollTickCallback = (remainingSec: number) => void;
export type PreRollCompleteCallback = () => void;

export interface GoogleTTSVoiceOption {
  name: string;
  lang: string;
  label: string;
  gender: 'female' | 'male';
}

export const GOOGLE_TTS_VOICES: GoogleTTSVoiceOption[] = [
  { name: 'es-ES-Neural2-A', lang: 'es-ES', label: 'Español (ES) - Neural2 A (Femenina)', gender: 'female' },
  { name: 'es-ES-Neural2-B', lang: 'es-ES', label: 'Español (ES) - Neural2 B (Masculina)', gender: 'male' },
  { name: 'es-ES-Neural2-C', lang: 'es-ES', label: 'Español (ES) - Neural2 C (Femenina)', gender: 'female' },
  { name: 'es-ES-Neural2-F', lang: 'es-ES', label: 'Español (ES) - Neural2 F (Masculina)', gender: 'male' },
  { name: 'es-ES-Journey-D', lang: 'es-ES', label: 'Español (ES) - Journey D (Natural Dinámica)', gender: 'female' },
  { name: 'es-ES-Journey-F', lang: 'es-ES', label: 'Español (ES) - Journey F (Conversacional)', gender: 'male' },
  { name: 'es-US-Neural2-A', lang: 'es-US', label: 'Español (LatAm/US) - Neural2 A (Femenina)', gender: 'female' },
  { name: 'es-US-Neural2-B', lang: 'es-US', label: 'Español (LatAm/US) - Neural2 B (Masculina)', gender: 'male' },
  { name: 'es-US-Journey-F', lang: 'es-US', label: 'Español (LatAm/US) - Journey F (Ultra-natural)', gender: 'female' },
  { name: 'es-US-Journey-O', lang: 'es-US', label: 'Español (LatAm/US) - Journey O (Ultra-natural)', gender: 'male' },
  { name: 'en-US-Neural2-F', lang: 'en-US', label: 'English (US) - Neural2 F (Female)', gender: 'female' },
  { name: 'en-US-Neural2-D', lang: 'en-US', label: 'English (US) - Neural2 D (Male)', gender: 'male' },
  { name: 'en-US-Journey-F', lang: 'en-US', label: 'English (US) - Journey F (Expressive)', gender: 'female' },
  { name: 'en-US-Journey-O', lang: 'en-US', label: 'English (US) - Journey O (Expressive)', gender: 'male' }
];

/**
 * Determina si una etiqueta corresponde a una figura técnica o instrucción deportiva real,
 * evitando que la voz lea marcadores genéricos (ej. "Beat 4s", "Punto #1", "Nodo 3", nombres de archivo, etc.)
 */
export function isSpeakableFigure(label?: string | null, type?: string | null): boolean {
  if (!label) return false;
  const trimmed = label.trim();
  if (!trimmed) return false;

  // Si el tipo es 'Marker', no es una figura deportiva a menos que tenga una instrucción real
  if (type === 'Marker') {
    if (/^(beat|marcador|marker|nodo|punto|point)\b/i.test(trimmed)) return false;
  }

  // Filtrar marcadores automáticos de beats y posiciones genéricas
  if (/^(beat\s*\d+(\.\d+)?s?|punto\s*#?\d+|point\s*#?\d+|marcador\s*#?\d+|nodo\s*#?\d+|node\s*#?\d+)$/i.test(trimmed)) {
    return false;
  }

  // Filtrar nombres de archivos de música o metadatos de audio
  if (/\.(wav|mp3|m4a|ogg|aac|flac)$/i.test(trimmed) || trimmed.toLowerCase().includes('pista') || trimmed.startsWith('/')) {
    return false;
  }

  return true;
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
    googleVoiceName: 'es-ES-Neural2-A'
  };

  private availableVoices: SpeechSynthesisVoice[] = [];
  private cues: VoiceCueEvent[] = [];
  private triggeredCueIds: Set<string> = new Set();
  
  // Google Cloud TTS Audio Cache and active node
  private googleAudioCache: Map<string, AudioBuffer> = new Map();
  private activeBufferSource: AudioBufferSourceNode | null = null;

  // Pre-roll countdown timer
  private preRollTimer: any = null;
  private isPreRollActive = false;
  private onPreRollTick: PreRollTickCallback | null = null;
  private onPreRollComplete: PreRollCompleteCallback | null = null;

  constructor(config?: Partial<VoiceCueConfig>) {
    if (typeof localStorage !== 'undefined') {
      const savedEngine = localStorage.getItem('skateart_tts_engine');
      if (savedEngine === 'browser' || savedEngine === 'google-cloud') {
        this.config.ttsEngine = savedEngine;
      }
      const savedApiKey = localStorage.getItem('skateart_google_tts_key');
      if (savedApiKey) {
        this.config.googleApiKey = savedApiKey;
      }
      const savedGoogleVoice = localStorage.getItem('skateart_google_voice');
      if (savedGoogleVoice) {
        this.config.googleVoiceName = savedGoogleVoice;
      }
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
              const saved = localStorage.getItem('skateart_voice_uri');
              if (saved && list.some(v => v.voiceURI === saved)) {
                this.config.selectedVoiceURI = saved;
              }
            }

            // If no voice selected, pick best default for current language
            if (!this.config.selectedVoiceURI) {
              const langCode = this.config.language === 'es' ? 'es' : 'en';
              const match = list.find(v => v.lang.toLowerCase().startsWith(langCode));
              if (match) {
                this.config.selectedVoiceURI = match.voiceURI;
              }
            }
          }
        } catch (e) {}
      };

      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
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
      localStorage.setItem('skateart_voice_uri', voiceURI);
    }
  }

  public setTtsEngine(engine: TTSEngineType) {
    this.config.ttsEngine = engine;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('skateart_tts_engine', engine);
    }
  }

  public setGoogleApiKey(key: string | null) {
    this.config.googleApiKey = key ? key.trim() : null;
    if (key) {
      ttsService.setApiKey(key.trim());
    }
    if (typeof localStorage !== 'undefined') {
      if (this.config.googleApiKey) {
        localStorage.setItem('skateart_google_tts_key', this.config.googleApiKey);
      } else {
        localStorage.removeItem('skateart_google_tts_key');
      }
    }
  }

  public setGoogleVoiceName(voiceName: string) {
    this.config.googleVoiceName = voiceName;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('skateart_google_voice', voiceName);
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
      if (!current || !current.lang.toLowerCase().startsWith(prefix)) {
        const match = this.availableVoices.find(v => v.lang.toLowerCase().startsWith(prefix));
        if (match) {
          this.setSelectedVoice(match.voiceURI);
        }
      }
    }

    if (lang === 'es' && !this.config.googleVoiceName.startsWith('es-')) {
      this.setGoogleVoiceName('es-ES-Neural2-A');
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

    this.cues = elements.map(el => {
      const triggerTimeMs = Math.max(0, el.execution_timestamp - leadMs);
      const isEs = this.config.language === 'es';
      
      const elementName = el.name || el.base_code;
      const text = isEs 
        ? `${elementName} en ${this.config.warningLeadTimeSec}` 
        : `${elementName} in ${this.config.warningLeadTimeSec}`;

      return {
        id: `cue-${el.id}`,
        timeMs: triggerTimeMs,
        text,
        type: 'element-alert',
        elementId: el.id
      };
    });

    if (this.config.ttsEngine === 'google-cloud' && this.config.googleApiKey) {
      void this.preloadGoogleTTS(this.cues.map(c => c.text));
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

    // Filtrar estrictamente solo nodos que correspondan a figuras deportivas o instrucciones reales
    // Se descartan marcadores de audio automáticos como "Beat 4s", "Punto #1", "Marker", etc.
    const speakableNodes = nodes.filter(n => n.time_ms > 0 && isSpeakableFigure(n.label, n.type));

    for (const node of speakableNodes) {
      const figureName = node.label!.trim();
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
        ...speakableNodes.map(n => isEs ? `${n.label}, en` : `${n.label}, in`)
      ];
      void this.preloadGoogleTTS(phrasesToPreload);
    }
  }

  public getCues(): VoiceCueEvent[] {
    return [...this.cues];
  }

  /**
   * Comprueba en cada frame si corresponde disparar un aviso o conteo
   */
  public checkPlaybackTime(currentTimeMs: number) {
    if (!this.config.enabled || this.isPreRollActive) return;

    for (const cue of this.cues) {
      if (!this.triggeredCueIds.has(cue.id)) {
        if (currentTimeMs >= cue.timeMs && currentTimeMs <= cue.timeMs + 400) {
          this.triggeredCueIds.add(cue.id);
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
    } else {
      for (const cue of this.cues) {
        if (cue.timeMs >= fromTimeMs) {
          this.triggeredCueIds.delete(cue.id);
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
    this.speak(text);
    if (this.config.ttsEngine === 'browser') {
      this.playAlertTone();
    }
  }

  /**
   * Sintetiza y reproduce texto usando Google Cloud Text-to-Speech o Web Speech API
   */
  public speak(text: string) {
    if (!this.config.enabled || this.config.volume <= 0) return;

    if (ttsService.hasGoogleApiKey() || (this.config.ttsEngine === 'google-cloud' && this.config.googleApiKey)) {
      ttsService.speak(text, { speed: this.config.voiceSpeed });
      return;
    }

    if (this.config.ttsEngine === 'google-cloud') {
      this.speakGoogleCloud(text);
      return;
    }

    this.speakBrowser(text);
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
      const langCode = voiceOption?.lang || (this.config.language === 'es' ? 'es-ES' : 'en-US');

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
        
        const voices = this.getAvailableVoices();
        if (this.config.selectedVoiceURI && voices.length > 0) {
          const matchedVoice = voices.find(v => v.voiceURI === this.config.selectedVoiceURI);
          if (matchedVoice) {
            utterance.voice = matchedVoice;
            utterance.lang = matchedVoice.lang;
          }
        } else {
          utterance.lang = this.config.language === 'es' ? 'es-ES' : 'en-US';
        }

        utterance.rate = this.config.voiceSpeed;
        utterance.pitch = this.config.voicePitch;
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
