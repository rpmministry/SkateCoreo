import { useState, useEffect, useCallback, useMemo } from 'react';
import { audioEngine } from '../core/audio/AudioEngine';
import { AudioEngineState, ChannelRoutingMode } from '../types/audio';
import { ChoreographyPathPoint } from '../types/choreography';
import { ttsService } from '../services/ttsService';
import { useAudioStudioStore } from '../store/useAudioStudioStore';

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

  // Submódulo Voz TTS Global (siempre femenina latina)
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

  // ── Metrónomo: ÚNICA fuente de verdad compartida con el Estudio ──
  // El estado NO se espeja desde el motor (podía quedar obsoleto y divergir del
  // mezclador), sino que se lee del store, que es quien orquesta el GainNode de
  // silencio y el planificador. Así ambos controles (Pista 2D y Estudio) son el
  // mismo interruptor.
  const metronomeEnabled = useAudioStudioStore((s) => s.globalControls.metronome.enabled);
  const metronomeMuted = useAudioStudioStore((s) => s.globalControls.metronome.muted);
  const metronomeVolume = useAudioStudioStore((s) => s.globalControls.metronome.volume);
  const metronomeBpm = useAudioStudioStore((s) => s.globalControls.bpm);
  const metronomeBeats = useAudioStudioStore((s) => s.metronomeConfig.beatsPerMeasure);
  const storeToggleMetronomeEnabled = useAudioStudioStore((s) => s.toggleMetronomeEnabled);
  const storeSetGlobalBpm = useAudioStudioStore((s) => s.setGlobalBpm);
  const storeSetMetronomeVolume = useAudioStudioStore((s) => s.setMetronomeVolume);
  const storeSetMetronomeConfig = useAudioStudioStore((s) => s.setMetronomeConfig);

  // Suscripción al ciclo de eventos del AudioEngine
  useEffect(() => {
    const unsubTime = audioEngine.onTimeUpdate((time) => {
      setCurrentTimeMs(time);
    });

    const unsubState = audioEngine.onStateChange((state) => {
      setAudioState(state);
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

  // Metrónomo — delega SIEMPRE en el store (una sola fuente de verdad)
  const toggleMetronome = useCallback(() => {
    storeToggleMetronomeEnabled();
  }, [storeToggleMetronomeEnabled]);

  const setMetronomeBpm = useCallback((bpm: number) => {
    storeSetGlobalBpm(bpm);
  }, [storeSetGlobalBpm]);

  const setMetronomeBeats = useCallback((beats: 1 | 2 | 3 | 4 | 5 | 6 | 7) => {
    storeSetMetronomeConfig({ beatsPerMeasure: beats });
  }, [storeSetMetronomeConfig]);

  const setMetronomeVolume = useCallback((vol: number) => {
    storeSetMetronomeVolume(vol);
  }, [storeSetMetronomeVolume]);

  const metronome = useMemo(() => ({
    enabled: metronomeEnabled && !metronomeMuted,
    bpm: metronomeBpm,
    beatsPerMeasure: metronomeBeats,
    volume: metronomeVolume,
    toggle: toggleMetronome,
    setBpm: setMetronomeBpm,
    setBeats: setMetronomeBeats,
    setVolume: setMetronomeVolume
  }), [metronomeEnabled, metronomeMuted, metronomeBpm, metronomeBeats, metronomeVolume, toggleMetronome, setMetronomeBpm, setMetronomeBeats, setMetronomeVolume]);

  // Control de Voz TTS Global
  // La Voz Guía es siempre femenina latina: el selector de género se eliminó de
  // la interfaz y de la lógica, así que ya no se expone aquí.
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
    speak
  };
}
