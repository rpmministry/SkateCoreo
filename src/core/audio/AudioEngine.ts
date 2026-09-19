import {
  AudioEngineState,
  ChannelRoutingMode,
  StateChangeCallback,
  TimeUpdateCallback
} from '../../types/audio';
import { ElementLog, ChoreographyPathPoint } from '../../types/choreography';
import { Metronome } from './Metronome';
import { VoiceCueEngine } from './VoiceCueEngine';
import { MediaSessionManager } from './MediaSession';
import { BpmDetector, BpmDetectionResult } from './BpmDetector';
import { renderChoreographyMixdown } from './audioMixdown';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;

  // Sub-busses & Volume Nodes
  private musicGainNode: GainNode | null = null;
  private metronomeGainNode: GainNode | null = null;
  private voiceCueGainNode: GainNode | null = null;
  private coachBusGainNode: GainNode | null = null;

  // Strict L/R Routing Matrix Nodes
  private musicToLeftGain: GainNode | null = null;
  private musicToRightGain: GainNode | null = null;
  private coachToLeftGain: GainNode | null = null;
  private coachToRightGain: GainNode | null = null;
  private mergerNode: ChannelMergerNode | null = null;
  private masterGainNode: GainNode | null = null;

  // Sub-modules
  public metronome: Metronome;
  public voiceCueEngine: VoiceCueEngine;
  public mediaSession: MediaSessionManager;

  // Playback state
  private isPlaying = false;
  private startTime = 0;
  private pausedAtTime = 0;
  private playbackRate = 1.0;
  private pan = 0.0;
  private channelMode: ChannelRoutingMode = 'stereo'; // Default to stereo so both ears receive music and voice cleanly
  private musicVolume = 1.0;
  private coachVolume = 1.0;
  private durationMs = 0;
  private fileName: string | null = null;
  private rawBlob: Blob | null = null;
  private animationFrameId: number | null = null;


  // Pre-roll state
  private isPreRollActive = false;
  private preRollCountdown = 0;

  // Listeners
  private timeUpdateCallbacks: Set<TimeUpdateCallback> = new Set();
  private stateChangeCallbacks: Set<StateChangeCallback> = new Set();

  // Bluetooth heuristic
  private isBluetoothDetected = false;
  private bluetoothWarning: string | null = null;

  constructor() {
    this.metronome = new Metronome();
    this.voiceCueEngine = new VoiceCueEngine();
    this.mediaSession = new MediaSessionManager();

    this.initVisibilityListener();
    this.setupMediaSession();
  }

  public initAudioContext() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass({ latencyHint: 'interactive' });

      // iOS WebKit silent switch bypass
      if ('audioSession' in navigator && (navigator as any).audioSession) {
        try {
          (navigator as any).audioSession.type = 'playback';
        } catch (e) {
          console.warn('[AudioEngine] audioSession.type no disponible:', e);
        }
      }

      // Master Gain
      this.masterGainNode = this.ctx.createGain();

      // Sub-busses
      this.musicGainNode = this.ctx.createGain();
      this.metronomeGainNode = this.ctx.createGain();
      this.voiceCueGainNode = this.ctx.createGain();
      this.coachBusGainNode = this.ctx.createGain();

      // Connect metronome and voice cue into coach sub-bus
      this.metronomeGainNode.connect(this.coachBusGainNode);
      this.voiceCueGainNode.connect(this.coachBusGainNode);

      // Create Strict Matrix Gain Nodes
      this.musicToLeftGain = this.ctx.createGain();
      this.musicToRightGain = this.ctx.createGain();
      this.coachToLeftGain = this.ctx.createGain();
      this.coachToRightGain = this.ctx.createGain();

      // Connect music to matrix
      this.musicGainNode.connect(this.musicToLeftGain);
      this.musicGainNode.connect(this.musicToRightGain);

      // Connect coach to matrix
      this.coachBusGainNode.connect(this.coachToLeftGain);
      this.coachBusGainNode.connect(this.coachToRightGain);

      // Create 2-channel merger (0 = Left, 1 = Right)
      this.mergerNode = this.ctx.createChannelMerger(2);

      this.musicToLeftGain.connect(this.mergerNode, 0, 0);
      this.coachToLeftGain.connect(this.mergerNode, 0, 0);

      this.musicToRightGain.connect(this.mergerNode, 0, 1);
      this.coachToRightGain.connect(this.mergerNode, 0, 1);

      this.mergerNode.connect(this.masterGainNode);
      this.masterGainNode.connect(this.ctx.destination);

      // Initialize sub-modules with AudioContext & nodes
      this.metronome.init(this.ctx, this.metronomeGainNode);
      this.voiceCueEngine.init(this.ctx, this.voiceCueGainNode);

      this.updateMatrixGains();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private setupMediaSession() {
    this.mediaSession.init({
      onPlay: () => this.play(),
      onPause: () => this.pause(),
      onStop: () => this.stop(),
      onSeekBackward: (sec) => {
        const target = Math.max(0, this.getCurrentTimeMs() - sec * 1000);
        this.seek(target);
      },
      onSeekForward: (sec) => {
        const target = Math.min(this.durationMs, this.getCurrentTimeMs() + sec * 1000);
        this.seek(target);
      },
      onSeekTo: (posSec) => {
        this.seek(posSec * 1000);
      }
    });
  }

  private initVisibilityListener() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.visibilityState === 'hidden') {
          if (!this.isPlaying) {
            this.ctx.suspend().catch(() => {});
          }
        } else {
          if (this.ctx.state === 'suspended' && this.isPlaying) {
            this.ctx.resume().catch(() => {});
          }
        }
      });
    }
  }

  /**
   * Actualiza las ganancias de la matriz L/R para garantizar aislamiento estricto
   */
  public updateMatrixGains() {
    if (
      !this.ctx ||
      !this.musicToLeftGain ||
      !this.musicToRightGain ||
      !this.coachToLeftGain ||
      !this.coachToRightGain
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    const mVol = Math.max(0, Math.min(1, this.musicVolume));
    const cVol = Math.max(0, Math.min(1, this.coachVolume));

    let musicL = 0;
    let musicR = 0;
    let coachL = 0;
    let coachR = 0;

    switch (this.channelMode) {
      case 'split-coach':
        // Modo Pista + Coach:
        // Left = 100% Música (Pista/PA). Cero guías.
        // Right = 100% Coach (Metrónomo + Voz). Cero música.
        musicL = mVol;
        musicR = 0.0;
        coachL = 0.0;
        coachR = cVol;
        break;

      case 'stereo':
        // Ambos canales reciben música y guías completas
        musicL = mVol;
        musicR = mVol;
        coachL = cVol;
        coachR = cVol;
        break;

      case 'solo-music':
        // Solo música en ambos canales (modo presentación/competición)
        musicL = mVol;
        musicR = mVol;
        coachL = 0.0;
        coachR = 0.0;
        break;

      case 'solo-coach':
        // Solo metrónomo y guías vocales (entrenamiento de tiempo puro)
        musicL = 0.0;
        musicR = 0.0;
        coachL = cVol;
        coachR = cVol;
        break;

      case 'solo-left':
        // 100% canal izquierdo, 0% canal derecho absoluto
        musicL = mVol;
        musicR = 0.0;
        coachL = cVol;
        coachR = 0.0;
        break;

      case 'solo-right':
        // 100% canal derecho, 0% canal izquierdo absoluto
        musicL = 0.0;
        musicR = mVol;
        coachL = 0.0;
        coachR = cVol;
        break;
    }

    this.musicToLeftGain.gain.setValueAtTime(musicL, now);
    this.musicToRightGain.gain.setValueAtTime(musicR, now);
    this.coachToLeftGain.gain.setValueAtTime(coachL, now);
    this.coachToRightGain.gain.setValueAtTime(coachR, now);
  }

  public setChannelMode(mode: ChannelRoutingMode) {
    this.channelMode = mode;
    this.updateMatrixGains();
    this.emitStateChange();
  }

  public setMusicVolume(vol: number) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    this.updateMatrixGains();
    this.emitStateChange();
  }

  public setCoachVolume(vol: number) {
    this.coachVolume = Math.max(0, Math.min(1, vol));
    this.updateMatrixGains();
    this.emitStateChange();
  }

  public setPan(pan: number) {
    this.pan = Math.max(-1.0, Math.min(1.0, pan));
    this.updateMatrixGains();
    this.emitStateChange();
  }

  /**
   * Sincroniza los puntos y figuras de la pista 2D con el secuenciador de alertas vocales (3, 2, 1, ¡Ya!)
   */
  public setNodes(nodes: ChoreographyPathPoint[]) {
    this.voiceCueEngine.loadNodes(nodes);
  }

  public getAudioBuffer(): AudioBuffer | null {
    return this.audioBuffer;
  }

  public getRawAudioBlob(): Blob | null {
    return this.rawBlob;
  }


  public setAudioBuffer(buffer: AudioBuffer, fileName?: string | null) {
    this.stop();
    this.audioBuffer = buffer;
    this.durationMs = Math.round(buffer.duration * 1000);
    if (fileName !== undefined) {
      this.fileName = fileName;
    }
    this.pausedAtTime = 0;
    this.mediaSession.updateMetadata(this.fileName || 'Pista de Audio');
    this.emitStateChange();
  }

  public async loadAudioFile(file: File | Blob, name?: string): Promise<AudioBuffer> {
    this.initAudioContext();
    if (!this.ctx) throw new Error('No se pudo inicializar AudioContext');

    this.stop();
    this.fileName = name || (file instanceof File ? file.name : 'pista_audio.wav');
    this.rawBlob = file instanceof Blob ? file : new Blob([file]);

    const arrayBuffer = await file.arrayBuffer();


    try {
      this.audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.durationMs = Math.round(this.audioBuffer.duration * 1000);
      this.pausedAtTime = 0;

      // Detectar y ajustar BPM automáticamente si la pista tiene transitorios rítmicos claros
      this.detectAndApplyBpm(this.audioBuffer);

      this.mediaSession.updateMetadata(this.fileName);
      await this.checkBluetoothAndLatency();
      this.emitStateChange();
      return this.audioBuffer;
    } catch (err) {
      throw new Error('Fallo al decodificar audio. Verifique que sea un archivo .m4a, .wav o .mp3 válido.');
    }
  }

  /**
   * Estimador de BPM y fase rítmica por DSP (Filtro Pasa-Bajos + Flujo de Energía + Autocorrelación)
   */
  public detectAndApplyBpm(buffer: AudioBuffer): number {
    try {
      const result = BpmDetector.detect(buffer);
      if (result.confidence >= 0.25 && result.bpm >= 60 && result.bpm <= 220) {
        this.metronome.setBpm(result.bpm);
        if (result.phaseOffsetSec > 0) {
          this.metronome.setPhaseOffset(result.phaseOffsetSec);
        }
        return result.bpm;
      }
    } catch (e) {
      console.warn('[AudioEngine] No se pudo estimar el BPM automáticamente con BpmDetector:', e);
    }
    return this.metronome.getConfig().bpm;
  }

  /**
   * Ejecuta el análisis DSP detallado del buffer cargado
   */
  public detectBpm(): BpmDetectionResult {
    if (!this.audioBuffer) {
      return { bpm: this.metronome.getConfig().bpm, confidence: 0, phaseOffsetSec: 0 };
    }
    return BpmDetector.detect(this.audioBuffer);
  }

  /**
   * Sincroniza la pista de música para que encaje exactamente con el tempo objetivo del metrónomo
   * mediante ajuste dinámico de playbackRate (Time-Stretching)
   */
  public syncTrackToBpm(targetBpm: number): number {
    if (!this.audioBuffer) return 1.0;
    const detected = this.detectBpm();
    if (detected.bpm > 0) {
      const rate = Math.max(0.5, Math.min(2.0, targetBpm / detected.bpm));
      this.setPlaybackRate(Math.round(rate * 1000) / 1000);
      return rate;
    }
    return 1.0;
  }

  public async generateDemoTrack(): Promise<AudioBuffer> {
    this.initAudioContext();
    if (!this.ctx) throw new Error('AudioContext no disponible');

    // 1. Intentar cargar la pista oficial de prueba provista en /demo_track.wav
    try {
      if (typeof window !== 'undefined' && typeof fetch === 'function') {
        const res = await fetch('/demo_track.wav');
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          this.audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
          this.durationMs = Math.round(this.audioBuffer.duration * 1000);
          this.fileName = 'Musica de Coreo prueba.wav';
          this.pausedAtTime = 0;

          // Configuración exacta para la pista de prueba (140 BPM, compás 4/4)
          this.metronome.setBpm(140);
          this.metronome.setBeatsPerMeasure(4);

          this.mediaSession.updateMetadata(this.fileName);
          await this.checkBluetoothAndLatency();
          this.emitStateChange();
          return this.audioBuffer;
        }
      }
    } catch (err) {
      console.warn('[AudioEngine] No se pudo cargar /demo_track.wav, usando sintetizador fallback:', err);
    }

    // 2. Fallback sintético si no está disponible el archivo en disco
    const sampleRate = this.ctx.sampleRate;
    const durationSec = 120; // 2 minutos
    const numSamples = sampleRate * durationSec;
    const buffer = this.ctx.createBuffer(2, numSamples, sampleRate);

    const leftChannel = buffer.getChannelData(0);
    const rightChannel = buffer.getChannelData(1);

    const bpm = 120;
    const beatInterval = 60 / bpm;

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const beatProgress = (t % beatInterval) / beatInterval;
      const beatNum = Math.floor(t / beatInterval) % 3;
      let sample = 0;

      if (beatNum === 0) {
        const env = Math.exp(-beatProgress * 15);
        sample += Math.sin(2 * Math.PI * 70 * (1 - beatProgress * 0.5) * t) * env * 0.6;
      } else {
        const env = Math.exp(-beatProgress * 8);
        const freq = beatNum === 1 ? 440 : 523.25;
        sample += Math.sin(2 * Math.PI * freq * t) * env * 0.25;
      }

      const melodyFreq = 220 + Math.sin(t * 0.5) * 80;
      sample += Math.sin(2 * Math.PI * melodyFreq * t) * 0.08;

      leftChannel[i] = sample;
      rightChannel[i] = sample;
    }

    this.audioBuffer = buffer;
    this.durationMs = durationSec * 1000;
    this.fileName = 'Pista_RollArt_CarlosTango_Demo.wav';
    this.pausedAtTime = 0;

    this.mediaSession.updateMetadata(this.fileName);
    await this.checkBluetoothAndLatency();
    this.emitStateChange();
    return buffer;
  }

  public ensureAudioBuffer(): AudioBuffer {
    if (this.audioBuffer) return this.audioBuffer;
    this.initAudioContext();
    if (!this.ctx) throw new Error('AudioContext no disponible');

    const sampleRate = this.ctx.sampleRate;
    const durationSec = 120; // 2 minutos
    const numSamples = sampleRate * durationSec;
    const buffer = this.ctx.createBuffer(2, numSamples, sampleRate);

    const leftChannel = buffer.getChannelData(0);
    const rightChannel = buffer.getChannelData(1);

    const bpm = this.metronome.getConfig().bpm || 120;
    const beatInterval = 60 / bpm;

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const beatProgress = (t % beatInterval) / beatInterval;
      const beatNum = Math.floor(t / beatInterval) % 3;
      let sample = 0;

      if (beatNum === 0) {
        const env = Math.exp(-beatProgress * 15);
        sample += Math.sin(2 * Math.PI * 70 * (1 - beatProgress * 0.5) * t) * env * 0.6;
      } else {
        const env = Math.exp(-beatProgress * 8);
        const freq = beatNum === 1 ? 440 : 523.25;
        sample += Math.sin(2 * Math.PI * freq * t) * env * 0.25;
      }

      const melodyFreq = 220 + Math.sin(t * 0.5) * 80;
      sample += Math.sin(2 * Math.PI * melodyFreq * t) * 0.08;

      leftChannel[i] = sample;
      rightChannel[i] = sample;
    }

    this.audioBuffer = buffer;
    this.durationMs = durationSec * 1000;
    this.fileName = 'Pista_RollArt_CarlosTango_Demo.wav';
    this.pausedAtTime = 0;
    this.mediaSession.updateMetadata(this.fileName);
    this.emitStateChange();
    return buffer;
  }

  public trimAudio(startMs: number, endMs: number): AudioBuffer {
    this.initAudioContext();
    if (!this.audioBuffer || !this.ctx) throw new Error('No hay audio cargado para recortar');

    const sampleRate = this.audioBuffer.sampleRate;
    const numChannels = this.audioBuffer.numberOfChannels;

    const startSec = Math.max(0, startMs / 1000);
    const endSec = Math.min(this.audioBuffer.duration, endMs / 1000);
    if (endSec <= startSec) throw new Error('El tiempo final debe ser mayor que el tiempo inicial');

    const startSample = Math.floor(startSec * sampleRate);
    const endSample = Math.floor(endSec * sampleRate);
    const frameCount = Math.max(1, endSample - startSample);

    const newBuffer = this.ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let ch = 0; ch < numChannels; ch++) {
      const srcData = this.audioBuffer.getChannelData(ch);
      const destData = newBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        destData[i] = srcData[startSample + i] || 0;
      }
    }

    const trimmedName = (this.fileName ? this.fileName.replace(/\.[^/.]+$/, '') : 'pista') + '_recortada.wav';
    this.setAudioBuffer(newBuffer, trimmedName);
    return newBuffer;
  }

  public applyFades(fadeInSec: number, fadeOutSec: number): AudioBuffer {
    this.initAudioContext();
    if (!this.audioBuffer || !this.ctx) throw new Error('No hay audio cargado');

    const sampleRate = this.audioBuffer.sampleRate;
    const numChannels = this.audioBuffer.numberOfChannels;
    const totalFrames = this.audioBuffer.length;

    const fadeInFrames = Math.min(totalFrames, Math.floor(Math.max(0, fadeInSec) * sampleRate));
    const fadeOutFrames = Math.min(totalFrames, Math.floor(Math.max(0, fadeOutSec) * sampleRate));

    const newBuffer = this.ctx.createBuffer(numChannels, totalFrames, sampleRate);

    for (let ch = 0; ch < numChannels; ch++) {
      const src = this.audioBuffer.getChannelData(ch);
      const dst = newBuffer.getChannelData(ch);

      for (let i = 0; i < totalFrames; i++) {
        let gain = 1.0;
        if (fadeInFrames > 0 && i < fadeInFrames) {
          gain = Math.sin((i / fadeInFrames) * (Math.PI / 2));
        }
        if (fadeOutFrames > 0 && i >= totalFrames - fadeOutFrames) {
          const offset = i - (totalFrames - fadeOutFrames);
          gain *= Math.cos((offset / fadeOutFrames) * (Math.PI / 2));
        }
        dst[i] = src[i] * gain;
      }
    }

    this.setAudioBuffer(newBuffer, this.fileName);
    return newBuffer;
  }

  public concatenateAudioTracks(buffers: AudioBuffer[], crossfadeSec: number = 0.5): AudioBuffer {
    this.initAudioContext();
    if (!this.ctx) throw new Error('AudioContext no inicializado');
    if (buffers.length === 0) throw new Error('No se han provisto pistas');
    if (buffers.length === 1) {
      this.setAudioBuffer(buffers[0], this.fileName);
      return buffers[0];
    }

    const sampleRate = this.ctx.sampleRate;
    const numChannels = 2;

    let totalDurationSec = 0;
    for (let i = 0; i < buffers.length; i++) {
      totalDurationSec += buffers[i].duration;
      if (i > 0 && crossfadeSec > 0) {
        totalDurationSec -= crossfadeSec;
      }
    }

    const totalFrames = Math.max(1, Math.floor(totalDurationSec * sampleRate));
    const outBuffer = this.ctx.createBuffer(numChannels, totalFrames, sampleRate);
    const outL = outBuffer.getChannelData(0);
    const outR = outBuffer.getChannelData(1);

    let currentOffset = 0;

    for (let bIdx = 0; bIdx < buffers.length; bIdx++) {
      const b = buffers[bIdx];
      const bFrames = b.length;
      const bLeft = b.getChannelData(0);
      const bRight = b.numberOfChannels > 1 ? b.getChannelData(1) : bLeft;

      const crossFrames = bIdx > 0 ? Math.floor(crossfadeSec * sampleRate) : 0;
      const insertStart = Math.max(0, currentOffset - crossFrames);

      for (let i = 0; i < bFrames; i++) {
        const targetIdx = insertStart + i;
        if (targetIdx >= totalFrames) break;

        let gain = 1.0;
        if (crossFrames > 0 && i < crossFrames) {
          gain = i / crossFrames;
        }

        outL[targetIdx] = (outL[targetIdx] || 0) + bLeft[i] * gain;
        outR[targetIdx] = (outR[targetIdx] || 0) + bRight[i] * gain;
      }

      currentOffset = insertStart + bFrames;
    }

    this.setAudioBuffer(outBuffer, 'Pista_Maestra_Unida.wav');
    return outBuffer;
  }

  public exportBufferToWav(buffer?: AudioBuffer): Blob {
    const buf = buffer || this.audioBuffer;
    if (!buf) throw new Error('No hay audio cargado para exportar');

    const numChannels = buf.numberOfChannels;
    const sampleRate = buf.sampleRate;
    const length = buf.length * numChannels * 2;
    const bufferArray = new ArrayBuffer(44 + length);
    const view = new DataView(bufferArray);

    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + length, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"

    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);

    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, length, true);

    let offset = 44;
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      channels.push(buf.getChannelData(ch));
    }

    for (let i = 0; i < buf.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  /**
   * Exporta la mezcla estéreo completa con aislamiento L/R por hardware (OfflineAudioContext):
   * Canal Derecho (R): Pista de música limpia (0% metrónomo, 0% voz de coach).
   * Canal Izquierdo (L): Pista del entrenador (100% metrónomo + 100% guías vocales TTS, 0% música).
   */
  public async exportStereoMixdown(points?: ChoreographyPathPoint[]): Promise<Blob> {
    if (!this.audioBuffer) {
      throw new Error('No hay pista de audio cargada para exportar la mezcla');
    }

    return renderChoreographyMixdown({
      musicBuffer: this.audioBuffer,
      bpm: this.metronome.getConfig().bpm,
      beatsPerMeasure: this.metronome.getConfig().beatsPerMeasure,
      metronomeEnabled: this.metronome.getConfig().enabled,
      voiceCuesEnabled: this.voiceCueEngine.getConfig().enabled,
      warningLeadTimeSec: this.voiceCueEngine.getConfig().warningLeadTimeSec,
      musicVolume: this.musicVolume,
      coachVolume: this.coachVolume,
      points: points || [],
      playbackRate: this.playbackRate
    });
  }

  public async checkBluetoothAndLatency(): Promise<boolean> {
    this.isBluetoothDetected = false;
    this.bluetoothWarning = null;

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const btKeywords = ['bluetooth', 'airpod', 'wireless', 'hands-free', 'auricular'];
        const hasBt = devices.some((d) => btKeywords.some((kw) => (d.label || '').toLowerCase().includes(kw)));
        if (hasBt) {
          this.isBluetoothDetected = true;
        }
      }

      if (this.ctx && (this.ctx as any).outputLatency && (this.ctx as any).outputLatency > 0.08) {
        this.isBluetoothDetected = true;
      }

      if (this.isBluetoothDetected) {
        this.bluetoothWarning =
          'Latencia inalámbrica detectada. Para calibrar compases de alta precisión, se recomienda usar altavoz o auriculares con cable.';
      }
    } catch (e) {}

    this.emitStateChange();
    return this.isBluetoothDetected;
  }

  /**
   * Carga los elementos técnicos del programa para que la guía de voz los avise con anticipación
   */
  public setProgramElementsForCues(elements: ElementLog[]) {
    this.voiceCueEngine.loadProgramElements(elements);
  }

  /**
   * Inicia reproducción (con soporte de intro delay pre-roll configurable)
   */
  public play(offsetMs?: number) {
    this.initAudioContext();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    // Si estamos en pausa en 0ms y el pre-roll está configurado, lanzar pre-roll
    const currentOffset = offsetMs !== undefined ? offsetMs : this.pausedAtTime;
    const isAtStart = currentOffset < 100;

    if (isAtStart && this.voiceCueEngine.getConfig().introDelaySec > 0 && !this.isPlaying && !this.isPreRollActive) {
      this.isPreRollActive = true;
      this.emitStateChange();

      // Detener metrónomo previo para evitar colisiones rítmicas durante el conteo
      this.metronome.stop();

      this.voiceCueEngine.startPreRoll(
        (remaining) => {
          this.preRollCountdown = remaining;
          // Emitir un click acentuado en cada segundo del conteo regresivo
          if (this.ctx && remaining > 0) {
            this.metronome.scheduleAccentClick(this.ctx.currentTime, true);
          }
          this.emitStateChange();
        },
        () => {
          this.isPreRollActive = false;
          this.preRollCountdown = 0;
          this.executePlay(0);
        },
        1.0
      );
      return;
    }

    this.executePlay(currentOffset);
  }

  private executePlay(offsetMs: number) {
    this.initAudioContext();
    if (!this.ctx || !this.musicGainNode) return;

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    if (!this.audioBuffer) {
      this.ensureAudioBuffer();
    }

    if (!this.audioBuffer) return;

    if (this.isPlaying) {
      this.stopSource();
    }

    const startOffsetSec = offsetMs / 1000;
    const clampedOffsetSec = Math.max(0, Math.min(startOffsetSec, this.audioBuffer.duration));

    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.playbackRate.value = this.playbackRate;

    // Conectar música a bus de música
    this.sourceNode.connect(this.musicGainNode);
    this.updateMatrixGains();

    this.sourceNode.onended = () => {
      if (this.isPlaying && this.getCurrentTimeMs() >= this.durationMs - 150) {
        this.stop();
      }
    };

    this.startTime = this.ctx.currentTime - clampedOffsetSec / this.playbackRate;
    this.sourceNode.start(0, clampedOffsetSec);
    this.isPlaying = true;

    // Arrancar metrónomo y secuenciador vocal sincronizados al reloj absoluto de la música
    this.metronome.start(clampedOffsetSec, this.playbackRate);
    this.voiceCueEngine.resetTriggeredCues(offsetMs);
    this.voiceCueEngine.startSync(this.startTime, this.playbackRate);

    this.mediaSession.updatePlaybackState(true);
    this.mediaSession.updatePositionState(this.durationMs / 1000, clampedOffsetSec, this.playbackRate);

    this.startTracking();
    this.emitStateChange();
  }

  public pause() {
    if (this.isPreRollActive) {
      this.voiceCueEngine.cancelPreRoll();
      this.isPreRollActive = false;
      this.preRollCountdown = 0;
    }

    this.metronome.stop();
    this.voiceCueEngine.stop();

    if (!this.isPlaying) {
      this.stopTracking();
      this.emitStateChange();
      return;
    }

    this.pausedAtTime = this.getCurrentTimeMs();
    this.stopSource();
    this.isPlaying = false;
    this.stopTracking();

    this.mediaSession.updatePlaybackState(false);
    this.mediaSession.updatePositionState(this.durationMs / 1000, this.pausedAtTime / 1000, this.playbackRate);

    this.emitStateChange();
  }

  public stop() {
    if (this.isPreRollActive) {
      this.voiceCueEngine.cancelPreRoll();
      this.isPreRollActive = false;
      this.preRollCountdown = 0;
    }

    this.stopSource();
    this.metronome.stop();
    this.voiceCueEngine.stop();
    this.pausedAtTime = 0;
    this.isPlaying = false;
    this.stopTracking();

    this.mediaSession.updatePlaybackState(false);
    this.mediaSession.updatePositionState(this.durationMs / 1000, 0, this.playbackRate);

    this.emitTimeUpdate(0);
    this.emitStateChange();
  }

  public seek(timeMs: number) {
    const clamped = Math.max(0, Math.min(timeMs, this.durationMs));
    this.pausedAtTime = clamped;
    this.voiceCueEngine.resetTriggeredCues(clamped);

    if (this.isPlaying) {
      this.executePlay(clamped);
    } else {
      this.emitTimeUpdate(clamped);
      this.mediaSession.updatePositionState(this.durationMs / 1000, clamped / 1000, this.playbackRate);
      this.emitStateChange();
    }
  }

  public setPlaybackRate(rate: number) {
    this.playbackRate = Math.max(0.5, Math.min(2.0, rate));
    if (this.sourceNode && this.ctx) {
      this.sourceNode.playbackRate.setValueAtTime(this.playbackRate, this.ctx.currentTime);
      const currentPosSec = this.getCurrentTimeMs() / 1000;
      this.startTime = this.ctx.currentTime - currentPosSec / this.playbackRate;
      this.metronome.sync(currentPosSec, this.playbackRate);
      if (this.isPlaying) {
        this.voiceCueEngine.startSync(this.startTime, this.playbackRate);
      }
    }
    this.emitStateChange();
  }

  private stopSource() {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (e) {}
      this.sourceNode = null;
    }
  }

  public getCurrentTimeMs(): number {
    if (!this.isPlaying || !this.ctx) {
      return this.pausedAtTime;
    }
    const elapsedSec = (this.ctx.currentTime - this.startTime) * this.playbackRate;
    const currentMs = Math.round(elapsedSec * 1000);
    return Math.max(0, Math.min(currentMs, this.durationMs));
  }

  private startTracking() {
    const loop = () => {
      if (this.isPlaying) {
        const time = this.getCurrentTimeMs();
        this.emitTimeUpdate(time);
        this.voiceCueEngine.checkPlaybackTime(time);
        this.animationFrameId = requestAnimationFrame(loop);
      }
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private stopTracking() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public getState(): AudioEngineState {
    return {
      isPlaying: this.isPlaying,
      currentTimeMs: this.getCurrentTimeMs(),
      durationMs: this.durationMs,
      playbackRate: this.playbackRate,
      pan: this.pan,
      channelMode: this.channelMode,
      musicVolume: this.musicVolume,
      coachVolume: this.coachVolume,
      isBluetoothDetected: this.isBluetoothDetected,
      bluetoothLatencyWarning: this.bluetoothWarning,
      hasAudioLoaded: this.audioBuffer !== null,
      fileName: this.fileName,
      isPreRollActive: this.isPreRollActive,
      preRollCountdown: this.preRollCountdown
    };
  }

  public getWaveformData(numBuckets: number = 300): number[] {
    if (!this.audioBuffer) return [];

    const channelData = this.audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / numBuckets);
    const peaks: number[] = [];

    for (let i = 0; i < numBuckets; i++) {
      const start = i * blockSize;
      let max = 0;
      for (let j = 0; j < blockSize; j += 10) {
        const val = Math.abs(channelData[start + j] || 0);
        if (val > max) max = val;
      }
      peaks.push(max);
    }

    const globalMax = Math.max(...peaks, 0.001);
    return peaks.map((p) => Math.min(1.0, p / globalMax));
  }

  // Observers
  public onTimeUpdate(cb: TimeUpdateCallback): () => void {
    this.timeUpdateCallbacks.add(cb);
    return () => this.timeUpdateCallbacks.delete(cb);
  }

  public onStateChange(cb: StateChangeCallback): () => void {
    this.stateChangeCallbacks.add(cb);
    return () => this.stateChangeCallbacks.delete(cb);
  }

  private emitTimeUpdate(timeMs: number) {
    for (const cb of this.timeUpdateCallbacks) {
      cb(timeMs);
    }
  }

  private emitStateChange() {
    const state = this.getState();
    for (const cb of this.stateChangeCallbacks) {
      cb(state);
    }
  }
}

export const audioEngine = new AudioEngine();
