import React, { useState } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  Sliders, 
  Music, 
  Bell, 
  Mic, 
  ChevronUp, 
  ChevronDown, 
  Volume2, 
  VolumeX, 
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { audioEngine } from '../services/audioEngine';
import { useAudioStudioStore } from '../store/useAudioStudioStore';

interface RinkAudioPlayerProps {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  hasAudioLoaded: boolean;
  fileName?: string | null;
  onOpenStudio?: () => void;
}

const fmtTime = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const RinkAudioPlayer: React.FC<RinkAudioPlayerProps> = ({
  currentTimeMs,
  durationMs,
  isPlaying,
  hasAudioLoaded,
  fileName,
  onOpenStudio,
}) => {
  // Estado de expansión del mini-mezclador
  const [isMixerOpen, setIsMixerOpen] = useState(false);

  // Store de Audio Studio para sincronización de 3 canales principales
  const tracks = useAudioStudioStore((s) => s.tracks);
  const setTrackVolume = useAudioStudioStore((s) => s.setTrackVolume);
  const toggleTrackMute = useAudioStudioStore((s) => s.toggleTrackMute);

  const globalControls = useAudioStudioStore((s) => s.globalControls);
  const setMetronomeVolume = useAudioStudioStore((s) => s.setMetronomeVolume);
  const toggleMetronomeMute = useAudioStudioStore((s) => s.toggleMetronomeMute);
  const setVoiceGuideVolume = useAudioStudioStore((s) => s.setVoiceGuideVolume);
  const toggleVoiceGuideMute = useAudioStudioStore((s) => s.toggleVoiceGuideMute);

  // Valores reactivos
  const masterTrack = tracks.music;
  const musicVolume = masterTrack?.volume ?? 1.0;
  const musicMuted = masterTrack?.muted ?? false;

  const metronomeVolume = globalControls.metronome.volume;
  const metronomeMuted = globalControls.metronome.muted;

  const voiceVolume = globalControls.voiceGuide.volume;
  const voiceMuted = globalControls.voiceGuide.muted;

  // Handlers de Transporte instantáneos
  const handlePlayPause = () => {
    audioEngine.initAudioContext();
    if (isPlaying) {
      audioEngine.pause();
    } else {
      audioEngine.play();
    }
  };

  const handleStop = () => {
    audioEngine.stop();
  };

  const handleMusicVolumeChange = (vol: number) => {
    setTrackVolume('music', vol);
    audioEngine.setMusicVolume(vol);
  };

  const handleMusicMuteToggle = () => {
    toggleTrackMute('music');
    if (!musicMuted) {
      audioEngine.setMusicVolume(0);
    } else {
      audioEngine.setMusicVolume(musicVolume);
    }
  };

  const effectiveDuration = durationMs > 0 ? durationMs : 120000;
  const progressRatio = Math.max(0, Math.min(1, currentTimeMs / effectiveDuration));

  return (
    <div className="relative z-30 select-none font-sans">
      {/* ── BARRA PRINCIPAL COMPACTA (Floating Pill) ── */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-zinc-950/90 border border-white/10 shadow-2xl backdrop-blur-md">
        
        {/* Botón Principal: Play / Pause */}
        <button
          type="button"
          onPointerDown={(e) => {
            if (!hasAudioLoaded) return;
            e.preventDefault();
            handlePlayPause();
          }}
          onClick={handlePlayPause}
          disabled={!hasAudioLoaded}
          className={`w-12 h-12 min-w-touch min-h-touch rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-md ${
            isPlaying
              ? 'bg-amber-400 text-black shadow-amber-400/25'
              : 'bg-cyan text-black shadow-cyan/25 hover:bg-cyan-300'
          } disabled:opacity-30 disabled:pointer-events-none`}
          title={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 fill-current stroke-none" />
          ) : (
            <Play className="w-5 h-5 fill-current stroke-none ml-0.5" />
          )}
        </button>

        {/* Botón Stop */}
        <button
          type="button"
          onPointerDown={(e) => {
            if (!hasAudioLoaded) return;
            e.preventDefault();
            handleStop();
          }}
          onClick={handleStop}
          disabled={!hasAudioLoaded}
          className="w-12 h-12 min-w-touch min-h-touch rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-25"
          title="Detener y volver a 0:00"
        >
          <Square className="w-4 h-4 fill-current stroke-none" />
        </button>

        {/* Display de Tiempo Digital y Progreso */}
        <div className="flex flex-col justify-center min-w-[75px] sm:min-w-[90px] px-1">
          <div className="font-mono text-xs font-black text-white flex items-center gap-1 leading-none">
            <span className="text-cyan">{fmtTime(currentTimeMs)}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400 font-medium">{fmtTime(durationMs)}</span>
          </div>
          {/* Barra de progreso miniatura */}
          <div className="w-full h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-cyan to-teal-400 rounded-full transition-all duration-100"
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
        </div>

        {/* Badges de Estado Rápido de Volumen (Visible cuando el mezclador está colapsado) */}
        {!isMixerOpen && (
          <div className="hidden md:flex items-center gap-1.5 pl-1 border-l border-white/10 font-mono text-[10px] text-slate-400">
            <span 
              className={`flex items-center gap-0.5 ${musicMuted ? 'text-rose-400 line-through' : 'text-cyan font-semibold'}`}
              title="Volumen Pista Master"
            >
              <Music className="w-2.5 h-2.5" /> {musicMuted ? 'M' : `${Math.round(musicVolume * 100)}%`}
            </span>
            <span className="text-white/10">·</span>
            <span 
              className={`flex items-center gap-0.5 ${voiceMuted ? 'text-rose-400 line-through' : 'text-fuchsia-400 font-semibold'}`}
              title="Volumen Cues Vocales"
            >
              <Mic className="w-2.5 h-2.5" /> {voiceMuted ? 'M' : `${Math.round(voiceVolume * 100)}%`}
            </span>
            <span className="text-white/10">·</span>
            <span 
              className={`flex items-center gap-0.5 ${metronomeMuted ? 'text-rose-400 line-through' : 'text-amber-400 font-semibold'}`}
              title="Volumen Metrónomo"
            >
              <Bell className="w-2.5 h-2.5" /> {metronomeMuted ? 'M' : `${Math.round(metronomeVolume * 100)}%`}
            </span>
          </div>
        )}

        {/* Botón Desplegable: Mini-Mezclador */}
        <button
          type="button"
          onClick={() => setIsMixerOpen((prev) => !prev)}
          className={`h-12 min-h-touch px-3 rounded-xl flex items-center gap-1.5 text-xs font-bold transition-all ${
            isMixerOpen
              ? 'bg-cyan/20 text-cyan border border-cyan/40 shadow-sm'
              : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5'
          }`}
          title={isMixerOpen ? 'Cerrar panel de mezcla' : 'Abrir controles de volumen de Pistas, Cues y Metrónomo'}
        >
          <Sliders className="w-4 h-4" />
          <span className="hidden sm:inline">Mezcla</span>
          {isMixerOpen ? (
            <ChevronUp className="w-3.5 h-3.5 text-cyan" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        {/* Acceso Directo: Abrir Estudio de Audio (DAW) */}
        {onOpenStudio && (
          <button
            type="button"
            onClick={onOpenStudio}
            className="h-12 min-h-touch px-3 rounded-xl flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-medium border border-white/5 transition-colors"
            title="Abrir editor multipista completo (Estudio de Audio)"
          >
            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-cyan" />
            <span className="hidden lg:inline">Estudio DAW</span>
          </button>
        )}
      </div>

      {/* ── PANEL DESPLEGABLE: MINI-MEZCLADOR DE 3 CANALES ── */}
      {isMixerOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 sm:w-80 p-3 rounded-2xl bg-zinc-950/98 backdrop-blur-2xl border border-white/15 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150 flex flex-col gap-3">
          
          {/* Header del Mini-Mezclador */}
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-white">
              <Sliders className="w-3.5 h-3.5 text-cyan" />
              <span>Mini-Mezclador 2D</span>
            </div>
            <div className="font-mono text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              {globalControls.bpm} BPM
            </div>
          </div>

          {/* Canal 1: PISTA MASTER (Música mezclada) */}
          <div className="flex flex-col gap-1 p-2 rounded-xl bg-zinc-900/80 border border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-cyan flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5" /> Pista Master
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-slate-300">
                  {musicMuted ? 'MUTE' : `${Math.round(musicVolume * 100)}%`}
                </span>
                <button
                  type="button"
                  onClick={handleMusicMuteToggle}
                  className={`p-1 rounded text-[10px] font-black uppercase transition-all ${
                    musicMuted ? 'bg-rose-500 text-white' : 'bg-white/10 text-slate-400 hover:text-white'
                  }`}
                  title={musicMuted ? 'Activar música' : 'Silenciar música'}
                >
                  {musicMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </button>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={musicMuted ? 0 : musicVolume}
              onChange={(e) => handleMusicVolumeChange(parseFloat(e.target.value))}
              className="w-full accent-cyan h-1.5 bg-white/10 rounded cursor-pointer"
            />
          </div>

          {/* Canal 2: GUÍA VOCAL (Cues Coreográficos) */}
          <div className="flex flex-col gap-1 p-2 rounded-xl bg-zinc-900/80 border border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-fuchsia-400 flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5" /> Voz Guía (Cues)
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-slate-300">
                  {voiceMuted ? 'MUTE' : `${Math.round(voiceVolume * 100)}%`}
                </span>
                <button
                  type="button"
                  onClick={toggleVoiceGuideMute}
                  className={`p-1 rounded text-[10px] font-black uppercase transition-all ${
                    voiceMuted ? 'bg-rose-500 text-white' : 'bg-white/10 text-slate-400 hover:text-white'
                  }`}
                  title={voiceMuted ? 'Activar voz guía' : 'Silenciar voz guía'}
                >
                  {voiceMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </button>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={voiceMuted ? 0 : voiceVolume}
              onChange={(e) => setVoiceGuideVolume(parseFloat(e.target.value))}
              className="w-full accent-fuchsia-400 h-1.5 bg-white/10 rounded cursor-pointer"
            />
          </div>

          {/* Canal 3: METRÓNOMO DE TIEMPO */}
          <div className="flex flex-col gap-1 p-2 rounded-xl bg-zinc-900/80 border border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-amber-400 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5" /> Metrónomo
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-slate-300">
                  {metronomeMuted ? 'MUTE' : `${Math.round(metronomeVolume * 100)}%`}
                </span>
                <button
                  type="button"
                  onClick={toggleMetronomeMute}
                  className={`p-1 rounded text-[10px] font-black uppercase transition-all ${
                    metronomeMuted ? 'bg-rose-500 text-white' : 'bg-white/10 text-slate-400 hover:text-white'
                  }`}
                  title={metronomeMuted ? 'Activar metrónomo' : 'Silenciar metrónomo'}
                >
                  {metronomeMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </button>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={metronomeMuted ? 0 : metronomeVolume}
              onChange={(e) => setMetronomeVolume(parseFloat(e.target.value))}
              className="w-full accent-amber-400 h-1.5 bg-white/10 rounded cursor-pointer"
            />
          </div>

          {/* Footer Informativo */}
          <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400 border-t border-white/5">
            <span className="truncate max-w-[180px] font-mono">
              {fileName || 'Mezcla Master activa'}
            </span>
            {onOpenStudio && (
              <button
                type="button"
                onClick={onOpenStudio}
                className="text-cyan font-bold hover:underline flex items-center gap-0.5"
              >
                <Sparkles className="w-2.5 h-2.5" /> Editor DAW
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

