import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  ArrowLeft, 
  Bell, 
  BellOff, 
  Mic, 
  MicOff, 
  Plus, 
  Sparkles, 
  Activity 
} from 'lucide-react';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { audioEngine } from '../../services/audioEngine';

interface TopTransportBarProps {
  onBackToRink?: () => void;
  onExportToRink?: () => void;
  isExporting?: boolean;
}

const fmtTimeWithMs = (sec: number): string => {
  const s = Math.max(0, sec);
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

export const TopTransportBar: React.FC<TopTransportBarProps> = ({
  onBackToRink,
  onExportToRink,
  isExporting = false,
}) => {
  const isPlaying = useAudioStudioStore((s) => s.isPlaying);
  const setIsPlaying = useAudioStudioStore((s) => s.setIsPlaying);
  const currentTimeSec = useAudioStudioStore((s) => s.currentTimeSec);
  const setCurrentTimeSec = useAudioStudioStore((s) => s.setCurrentTimeSec);
  const totalDurationSec = useAudioStudioStore((s) => s.totalDurationSec);

  const globalControls = useAudioStudioStore((s) => s.globalControls);
  const setGlobalBpm = useAudioStudioStore((s) => s.setGlobalBpm);
  const toggleMetronomeMute = useAudioStudioStore((s) => s.toggleMetronomeMute);
  const setMetronomeVolume = useAudioStudioStore((s) => s.setMetronomeVolume);

  const toggleVoiceGuideMute = useAudioStudioStore((s) => s.toggleVoiceGuideMute);
  const setVoiceGuideVolume = useAudioStudioStore((s) => s.setVoiceGuideVolume);

  const additionalTracks = useAudioStudioStore((s) => s.additionalTracks);
  const addAudioTrack = useAudioStudioStore((s) => s.addAudioTrack);
  const analyzeBpm = useAudioStudioStore((s) => s.analyzeBpm);
  const isAnalyzingBpm = useAudioStudioStore((s) => s.isAnalyzingBpm);

  // Popovers interactivos flotantes
  const [showBpmMenu, setShowBpmMenu] = useState(false);
  const [showMetroMenu, setShowMetroMenu] = useState(false);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);

  // Tap tempo state
  const tapTimesRef = useRef<number[]>([]);
  const handleTapTempo = () => {
    const now = performance.now();
    const times = tapTimesRef.current.filter((t) => now - t < 2500);
    times.push(now);
    tapTimesRef.current = times;

    if (times.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < times.length; i++) {
        intervals.push(times[i] - times[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avgInterval);
      if (bpm >= 40 && bpm <= 240) {
        setGlobalBpm(bpm);
      }
    }
  };

  const handlePlayToggle = async () => {
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      await audioEngine.play();
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    audioEngine.stop();
    setIsPlaying(false);
    setCurrentTimeSec(0);
  };

  // Cerrar popovers al hacer clic fuera
  const barRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setShowBpmMenu(false);
        setShowMetroMenu(false);
        setShowVoiceMenu(false);
      }
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, []);

  const canAddMoreTracks = additionalTracks.length < 4;

  return (
    <header 
      ref={barRef}
      className="relative z-40 h-9 shrink-0 flex items-center justify-between px-2 sm:px-3 bg-zinc-950/95 border-b border-white/10 text-white select-none backdrop-blur-md"
      style={{ minHeight: '36px' }}
    >
      {/* ── IZQUIERDA: Volver + Transporte ── */}
      <div className="flex items-center gap-1 sm:gap-2">
        {onBackToRink && (
          <button
            type="button"
            onClick={onBackToRink}
            className="h-7 px-2 rounded flex items-center gap-1 text-[11px] font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
            title="Volver a la Pista 2D"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pista</span>
          </button>
        )}

        {/* Play/Pause */}
        <button
          type="button"
          onClick={handlePlayToggle}
          className={`h-7 px-2.5 rounded flex items-center justify-center font-bold text-xs transition-all shadow-sm ${
            isPlaying 
              ? 'bg-amber-400 text-black shadow-amber-400/20' 
              : 'bg-cyan text-black shadow-cyan/20 hover:bg-cyan-300'
          }`}
          title={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
        </button>

        {/* Stop */}
        <button
          type="button"
          onClick={handleStop}
          className="h-7 w-7 rounded flex items-center justify-center text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
          title="Detener y volver a 00:00"
        >
          <Square className="w-3 h-3 fill-current" />
        </button>

        {/* Display de Tiempo Digital Monospace */}
        <div className="flex items-center px-1.5 h-7 rounded bg-black/60 border border-white/10 font-mono text-xs text-cyan tracking-wider">
          <span>{fmtTimeWithMs(currentTimeSec)}</span>
          <span className="text-slate-500 mx-1">/</span>
          <span className="text-slate-400 text-[11px]">{fmtTimeWithMs(totalDurationSec)}</span>
        </div>
      </div>

      {/* ── CENTRO / DERECHA: Controles Globales (BPM, Metrónomo, Voces, + Pista) ── */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Selector Global de BPM */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowBpmMenu((v) => !v);
              setShowMetroMenu(false);
              setShowVoiceMenu(false);
            }}
            className={`h-7 px-1.5 sm:px-2 rounded flex items-center gap-1 text-[11px] font-mono font-bold border transition-colors ${
              showBpmMenu 
                ? 'bg-cyan/20 border-cyan text-cyan' 
                : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
            }`}
            title="Ajustar tempo global BPM"
          >
            <Activity className="w-3 h-3 text-cyan" />
            <span>{globalControls.bpm}</span>
            <span className="text-[9px] text-slate-400 font-sans hidden sm:inline">BPM</span>
          </button>

          {/* Menú Popover de BPM */}
          {showBpmMenu && (
            <div className="absolute top-9 left-1/2 -translate-x-1/2 w-48 p-2 rounded-lg bg-zinc-900/98 border border-white/20 shadow-2xl z-50 backdrop-blur-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                <span>Tempo Global</span>
                <span className="font-mono text-cyan font-black">{globalControls.bpm} BPM</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setGlobalBpm(globalControls.bpm - 5)}
                  className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-bold"
                >
                  -5
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalBpm(globalControls.bpm - 1)}
                  className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-bold"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalBpm(globalControls.bpm + 1)}
                  className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-bold"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalBpm(globalControls.bpm + 5)}
                  className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-bold"
                >
                  +5
                </button>
              </div>
              <div className="flex items-center gap-1.5 pt-1 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleTapTempo}
                  className="flex-1 py-1 px-2 rounded bg-cyan/20 hover:bg-cyan/30 text-cyan text-[10px] font-black uppercase tracking-wider"
                >
                  Tap Tempo
                </button>
                <button
                  type="button"
                  onClick={() => analyzeBpm()}
                  disabled={isAnalyzingBpm}
                  className="flex-1 py-1 px-2 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold text-slate-300 disabled:opacity-50"
                  title="Detectar automáticamente BPM del audio cargado"
                >
                  {isAnalyzingBpm ? '...' : 'Auto-BPM'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Toggle & Control Global de Metrónomo */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowMetroMenu((v) => !v);
              setShowBpmMenu(false);
              setShowVoiceMenu(false);
            }}
            className={`h-7 px-1.5 sm:px-2 rounded flex items-center gap-1 text-[11px] font-bold border transition-colors ${
              globalControls.metronome.muted || !globalControls.metronome.enabled
                ? 'bg-white/5 border-white/10 text-slate-500'
                : 'bg-amber-500/15 border-amber-500/50 text-amber-400'
            }`}
            title="Metrónomo Global (Mute / Volumen)"
          >
            {globalControls.metronome.muted || !globalControls.metronome.enabled ? (
              <BellOff className="w-3 h-3 text-slate-500" />
            ) : (
              <Bell className="w-3 h-3 text-amber-400" />
            )}
            <span className="hidden sm:inline">Metro</span>
            <span className="font-mono text-[10px] opacity-75">
              {globalControls.metronome.muted ? 'Off' : `${Math.round(globalControls.metronome.volume * 100)}%`}
            </span>
          </button>

          {/* Menú Popover de Metrónomo */}
          {showMetroMenu && (
            <div className="absolute top-9 right-0 w-44 p-2.5 rounded-lg bg-zinc-900/98 border border-white/20 shadow-2xl z-50 backdrop-blur-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-bold text-amber-400">
                <span>Metrónomo</span>
                <button
                  type="button"
                  onClick={toggleMetronomeMute}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                    globalControls.metronome.muted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                  }`}
                >
                  {globalControls.metronome.muted ? 'Silenciado' : 'Activo'}
                </button>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Volumen</span>
                  <span className="font-mono text-white">{Math.round(globalControls.metronome.volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={globalControls.metronome.volume}
                  onChange={(e) => setMetronomeVolume(parseFloat(e.target.value))}
                  className="w-full accent-amber-400 h-1.5 bg-white/10 rounded cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Toggle & Control Global de Guías de Voz */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowVoiceMenu((v) => !v);
              setShowBpmMenu(false);
              setShowMetroMenu(false);
            }}
            className={`h-7 px-1.5 sm:px-2 rounded flex items-center gap-1 text-[11px] font-bold border transition-colors ${
              globalControls.voiceGuide.muted || !globalControls.voiceGuide.enabled
                ? 'bg-white/5 border-white/10 text-slate-500'
                : 'bg-fuchsia-500/15 border-fuchsia-500/50 text-fuchsia-400'
            }`}
            title="Voces Guía (Cues Técnicos)"
          >
            {globalControls.voiceGuide.muted || !globalControls.voiceGuide.enabled ? (
              <MicOff className="w-3 h-3 text-slate-500" />
            ) : (
              <Mic className="w-3 h-3 text-fuchsia-400" />
            )}
            <span className="hidden sm:inline">Voz</span>
            <span className="font-mono text-[10px] opacity-75">
              {globalControls.voiceGuide.muted ? 'Off' : `${Math.round(globalControls.voiceGuide.volume * 100)}%`}
            </span>
          </button>

          {/* Menú Popover de Voces Guía */}
          {showVoiceMenu && (
            <div className="absolute top-9 right-0 w-44 p-2.5 rounded-lg bg-zinc-900/98 border border-white/20 shadow-2xl z-50 backdrop-blur-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-bold text-fuchsia-400">
                <span>Guías Vocales</span>
                <button
                  type="button"
                  onClick={toggleVoiceGuideMute}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                    globalControls.voiceGuide.muted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                  }`}
                >
                  {globalControls.voiceGuide.muted ? 'Silenciado' : 'Activo'}
                </button>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Volumen</span>
                  <span className="font-mono text-white">{Math.round(globalControls.voiceGuide.volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={globalControls.voiceGuide.volume}
                  onChange={(e) => setVoiceGuideVolume(parseFloat(e.target.value))}
                  className="w-full accent-fuchsia-400 h-1.5 bg-white/10 rounded cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Botón Añadir Pista (Máximo 4 adicionales = 5 en total) */}
        <button
          type="button"
          onClick={() => addAudioTrack()}
          disabled={!canAddMoreTracks}
          className={`h-7 px-2 rounded flex items-center gap-1 text-[11px] font-bold transition-all ${
            canAddMoreTracks
              ? 'bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white border border-white/10'
              : 'bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed'
          }`}
          title={canAddMoreTracks ? `Añadir pista de audio (${additionalTracks.length + 1}/5)` : 'Límite alcanzado: 5 pistas máximo'}
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Pista</span>
          <span className="font-mono text-[10px] text-slate-400">{1 + additionalTracks.length}/5</span>
        </button>

        {/* Botón Exportar Mixdown / Sincronizar con Coreo */}
        {onExportToRink && (
          <button
            type="button"
            onClick={onExportToRink}
            disabled={isExporting}
            className="h-7 px-2.5 rounded flex items-center gap-1 bg-cyan/20 hover:bg-cyan/30 text-cyan border border-cyan/40 text-[11px] font-bold shadow-sm transition-colors disabled:opacity-50"
            title="Guardar y exportar mezcla a la Pista 2D"
          >
            <Sparkles className="w-3 h-3" />
            <span className="hidden sm:inline">{isExporting ? 'Procesando...' : 'Aplicar Mezcla'}</span>
          </button>
        )}
      </div>
    </header>
  );
};
