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
  loadDemoTrack: () => Promise<AudioBuffer>;
  
  // Submódulo Metrónomo Headless
  metronome: {
    enabled: boolean;
    bpm: number;
    beatsPerMeasure: 1 | 2 | 3 | 4 | 6;
    volume: number;
    toggle: () => void;
    setBpm: (bpm: number) => void;
    setBeats: (beats: 1 | 2 | 3 | 4 | 6) => void;
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
  const [voiceGender, setVoiceGenderState] = useState<VoiceGender>(() => ttsService.getVoiceGender());

  // Suscripción al ciclo de eventos del AudioEngine
  useEffect(() => {
    const unsubTime = audioEngine.onTimeUpdate((time) => {
      setCurrentTimeMs(time);
    });

    const unsubState = audioEngine.onStateChange((state) => {
      setAudioState(state);
      setMetronomeConfig(audioEngine.metronome.getConfig());
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

  const loadDemoTrack = useCallback(async () => {
    return await audioEngine.generateDemoTrack();
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

  const setMetronomeBeats = useCallback((beats: 1 | 2 | 3 | 4 | 6) => {
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
  const setVoiceGender = useCallback((gender: VoiceGender) => {
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
    loadDemoTrack,

    metronome,
    voiceGender,
    setVoiceGender,
    speak
  };
}
