import { useState, useEffect, useCallback, useMemo } from 'react';
import { audioEngine } from '../core/audio/AudioEngine';
import { AudioEngineState, ChannelRoutingMode, MetronomeConfig } from '../types/audio';
import { ChoreographyPathPoint } from '../types/choreography';
import { ttsService, VoiceGender } from '../services/ttsService';

export interface UseAudioEngineReturn {
  // Estado reactivo Headless (Mínimo, bajo el capó)
  isPlaying: boolean;
  isPreRollActive: boolean;
  preRollCountdown: number;
  isAudioActive: boolean;
  currentTimeMs: number;
  durationMs: number;
  fileName: string | null;
  hasAudioLoaded: boolean;
  channelMode: ChannelRoutingMode;
  isSplitChannel: boolean;
  musicVolume: number;
  coachVolume: number;
  
  // Métodos de control limpios
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (timeMs: number) => void;
  setNodes: (nodes: ChoreographyPathPoint[]) => void;
  setChannelMode: (mode: ChannelRoutingMode) => void;
  setSplitMode: (enabled: boolean) => void;
  setMusicVolume: (volume: number) => void;
  setCoachVolume: (volume: number) => void;
  loadAudioFile: (file: File | Blob, name?: string) => Promise<AudioBuffer>;
  
  // Submódulo Metrónomo Headless
  metronome: {
    enabled: boolean;
    bpm: number;
    beatsPerMeasure: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    volume: number;
    toggle: () => void;
    setBpm: (bpm: number) => void;
    setBeats: (beats: 1 | 2 | 3 | 4 | 5 | 6 | 7) => void;
    setVolume: (volume: number) => void;
  };

  // Submódulo Voz TTS Global
  voiceGender: 'female' | 'male';
  setVoiceGender: (gender: 'female' | 'male') => void;
  speak: (text: string) => Promise<void>;
}

/**
 * Custom Hook Headless para encapsular toda la lógica de Web Audio API,
 * enrutamiento estricto L/R, metrónomo y secuenciador de alertas vocales.
 * No renderiza elementos visuales; provee métodos e inputs de estado limpios a la UI.
 */
export function useAudioEngine(): UseAudioEngineReturn {
  const [audioState, setAudioState] = useState<AudioEngineState>(() => audioEngine.getState());
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [metronomeConfig, setMetronomeConfig] = useState<MetronomeConfig>(() => audioEngine.metronome.getConfig());
  // El motor de cues es la fuente de verdad (reconcilia género ↔ voz guardada)
  const [voiceGender, setVoiceGenderState] = useState<VoiceGender>(() =>
    audioEngine.getVoiceGender()
  );

  // Suscripción al ciclo de eventos del AudioEngine
  useEffect(() => {
    const unsubTime = audioEngine.onTimeUpdate((time) => {
      setCurrentTimeMs(time);
    });

    const unsubState = audioEngine.onStateChange((state) => {
      setAudioState(state);
      setMetronomeConfig(audioEngine.metronome.getConfig());
      // El motor de cues es la fuente de verdad del género: así la UI refleja
      // cualquier cambio hecho desde otro punto (selector de modelo, etc.)
      setVoiceGenderState(audioEngine.getVoiceGender());
    });

    return () => {
      unsubTime();
      unsubState();
    };
  }, []);

  // Métodos de Transporte
  const play = useCallback(async () => {
    await audioEngine.play();
  }, []);

  const pause = useCallback(() => {
    audioEngine.pause();
  }, []);

  const stop = useCallback(() => {
    audioEngine.stop();
  }, []);

  const seek = useCallback((timeMs: number) => {
    audioEngine.seek(timeMs);
  }, []);

  // Sincronización de Nodos y Figuras de la Pista 2D con el Secuenciador de Voz
  const setNodes = useCallback((nodes: ChoreographyPathPoint[]) => {
    audioEngine.setNodes(nodes);
  }, []);

  // Enrutamiento y Volúmenes
  const setChannelMode = useCallback((mode: ChannelRoutingMode) => {
    audioEngine.setChannelMode(mode);
  }, []);

  const setSplitMode = useCallback((enabled: boolean) => {
    audioEngine.setChannelMode(enabled ? 'split-coach' : 'stereo');
  }, []);

  const setMusicVolume = useCallback((vol: number) => {
    audioEngine.setMusicVolume(vol);
  }, []);

  const setCoachVolume = useCallback((vol: number) => {
    audioEngine.setCoachVolume(vol);
    audioEngine.voiceCueEngine.setVolume(vol);
  }, []);

  const loadAudioFile = useCallback(async (file: File | Blob, name?: string) => {
    return await audioEngine.loadAudioFile(file, name);
  }, []);

  // Metrónomo
  const toggleMetronome = useCallback(() => {
    const next = !audioEngine.metronome.getConfig().enabled;
    audioEngine.metronome.setEnabled(next);
    setMetronomeConfig(audioEngine.metronome.getConfig());
  }, []);

  const setMetronomeBpm = useCallback((bpm: number) => {
    audioEngine.metronome.setBpm(bpm);
    setMetronomeConfig(audioEngine.metronome.getConfig());
  }, []);

  const setMetronomeBeats = useCallback((beats: 1 | 2 | 3 | 4 | 5 | 6 | 7) => {
    audioEngine.metronome.setBeatsPerMeasure(beats);
    setMetronomeConfig(audioEngine.metronome.getConfig());
  }, []);

  const setMetronomeVolume = useCallback((vol: number) => {
    audioEngine.metronome.setVolume(vol);
    setMetronomeConfig(audioEngine.metronome.getConfig());
  }, []);

  const metronome = useMemo(() => ({
    enabled: metronomeConfig.enabled,
    bpm: metronomeConfig.bpm,
    beatsPerMeasure: metronomeConfig.beatsPerMeasure,
    volume: metronomeConfig.volume,
    toggle: toggleMetronome,
    setBpm: setMetronomeBpm,
    setBeats: setMetronomeBeats,
    setVolume: setMetronomeVolume
  }), [metronomeConfig, toggleMetronome, setMetronomeBpm, setMetronomeBeats, setMetronomeVolume]);

  // Control de Voz TTS Global
  // Delegado en AudioEngine → VoiceCueEngine: así el género cambia también la
  // voz de Google Cloud seleccionada y la voz del navegador activa, no solo el
  // flag de ttsService (que era la causa de que ambas guías sonaran igual).
  const setVoiceGender = useCallback((gender: VoiceGender) => {
    audioEngine.setVoiceGender(gender);
    ttsService.setVoiceGender(gender);
    setVoiceGenderState(gender);
  }, []);

  const speak = useCallback(async (text: string) => {
    await ttsService.speak(text);
  }, []);

  const isAudioActive = audioState.isPlaying || audioState.isPreRollActive;
  const isSplitChannel = audioState.channelMode === 'split-coach';

  return {
    isPlaying: audioState.isPlaying,
    isPreRollActive: audioState.isPreRollActive,
    preRollCountdown: audioState.preRollCountdown,
    isAudioActive,
    currentTimeMs,
    durationMs: audioState.durationMs,
    fileName: audioState.fileName,
    hasAudioLoaded: audioState.hasAudioLoaded,
    channelMode: audioState.channelMode,
    isSplitChannel,
    musicVolume: audioState.musicVolume,
    coachVolume: audioState.coachVolume,

    play,
    pause,
    stop,
    seek,
    setNodes,
    setChannelMode,
    setSplitMode,
    setMusicVolume,
    setCoachVolume,
    loadAudioFile,

    metronome,
    voiceGender,
    setVoiceGender,
    speak
  };
}
