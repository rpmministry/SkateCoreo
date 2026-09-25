import React from 'react';
import { Play, Pause, Square, SkipBack, Music, Mic, Bell } from 'lucide-react';
import { audioEngine } from '../services/audioEngine';
import { useAudioStudioStore } from '../store/useAudioStudioStore';
import { usePressAction } from '../hooks/usePressAction';

interface RinkAudioPlayerProps {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  hasAudioLoaded: boolean;
  fileName?: string | null;
  /** Origen del audio (identidad de dominio): mezcla final del Studio o archivo. */
  sourceKind?: 'file' | 'studio-mix';
  /**
   * `header`  → cápsula completa para la barra superior en desktop (lg+).
   * `compact` → fila ergonómica para móvil/tablet (< lg) en cualquier orientación.
   */
  variant?: 'header' | 'compact';
}

const fmtTime = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * RinkAudioPlayer — Transporte maestro de la Pista 2D.
 *
 * Se apoya en el mezclador único `RinkAudioMixerDrawer` (inciado desde la
 * tira de onda) para evitar duplicar controles de volumen en la interfaz.
 */
export const RinkAudioPlayer: React.FC<RinkAudioPlayerProps> = ({
  currentTimeMs,
  durationMs,
  isPlaying,
  hasAudioLoaded,
  fileName,
  sourceKind = 'file',
  variant = 'header',
}) => {
  const tracks = useAudioStudioStore((s) => s.tracks);
  const globalControls = useAudioStudioStore((s) => s.globalControls);

  const masterTrack = tracks.music;
  // Música: el store es la ÚNICA fuente que sincroniza el GainNode real del motor
  // (`setTrackVolume('music')` → `audioEngine.setMusicVolume`), así que este % es fiel.
  const musicVolume = masterTrack?.volume ?? 1.0;
  const musicMuted = masterTrack?.muted ?? false;
  // Metrónomo y Voces Guía distinguen DOS estados: `enabled` (existe) y `muted`
  // (silenciado). No son lo mismo: apagado ≠ silenciado.
  const metronomeEnabled = globalControls.metronome.enabled;
  const metronomeMuted = globalControls.metronome.muted;
  const voiceEnabled = globalControls.voiceGuide.enabled;
  const voiceMuted = globalControls.voiceGuide.muted;

  // Activación táctil única (evita el doble disparo pointerdown + click que
  // provocaba la "reproducción fantasma" en la Pista 2D).
  const press = usePressAction();

  /**
   * Lee el estado REAL del motor en lugar de la prop `isPlaying`, que puede
   * llegar con un render de retraso y hacer que un toque invierta el sentido
   * equivocado (play cuando ya está sonando o viceversa).
   */
  const handlePlayPause = () => {
    audioEngine.initAudioContext();
    const engineState = audioEngine.getState();
    if (engineState.isPlaying || engineState.isPreRollActive) {
      audioEngine.pause();
    } else {
      // La Pista 2D reproduce en su propio dominio: metrónomo + voces guía activos.
      audioEngine.setPlaybackDomain('rink');
      audioEngine.play();
    }
  };

  const handleStop = () => audioEngine.stop();

  /** Retroceder al inicio (⏮), transporte estándar de la Pista 2D. */
  const handleRewind = () => {
    audioEngine.seek(0);
  };

  const effectiveDuration = durationMs > 0 ? durationMs : 120000;
  const progressRatio = Math.max(0, Math.min(1, currentTimeMs / effectiveDuration));
  // Sin audio no se muestra "00:00 / 00:00" (ambigua): la duración se marca como
  // desconocida hasta que exista audio real cargado/publicado.
  const durationLabel = hasAudioLoaded && durationMs > 0 ? fmtTime(durationMs) : '--:--';

  const playButton = (size: 'md' | 'lg') => (
    <button
      type="button"
      {...press(handlePlayPause, { enabled: hasAudioLoaded })}
      disabled={!hasAudioLoaded}
      aria-pressed={isPlaying}
      className={[
        size === 'lg' ? 'h-[52px] w-[52px]' : 'h-12 w-12',
        'min-w-touch min-h-touch shrink-0 rounded-xl flex items-center justify-center press shadow-md disabled:opacity-30 disabled:pointer-events-none',
        isPlaying
          ? 'bg-amber-400 text-black shadow-amber-400/25'
          : 'bg-cyan text-black shadow-cyan/25 hover:bg-cyan-300',
      ].join(' ')}
      aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
      title={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
    >
      {isPlaying ? (
        <Pause className="h-5 w-5 fill-current stroke-none" />
      ) : (
        <Play className="ml-0.5 h-5 w-5 fill-current stroke-none" />
      )}
    </button>
  );

  const stopButton = (size: 'md' | 'lg') => (
    <button
      type="button"
      {...press(handleStop, { enabled: hasAudioLoaded })}
      disabled={!hasAudioLoaded}
      className={[
        size === 'lg' ? 'h-[52px] w-[52px]' : 'h-12 w-12',
        'min-w-touch min-h-touch shrink-0 rounded-xl flex items-center justify-center press text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-25 disabled:pointer-events-none',
      ].join(' ')}
      aria-label="Detener y volver a 0:00"
      title="Detener y volver a 0:00"
    >
      <Square className="h-4 w-4 fill-current stroke-none" />
    </button>
  );

  /** Retroceder al inicio (transporte estándar ⏮ ▶/⏸ ■). */
  const rewindButton = (size: 'md' | 'lg') => (
    <button
      type="button"
      {...press(handleRewind, { enabled: hasAudioLoaded })}
      disabled={!hasAudioLoaded}
      className={[
        size === 'lg' ? 'h-[52px] w-[52px]' : 'h-12 w-12',
        'min-w-touch min-h-touch shrink-0 rounded-xl flex items-center justify-center press text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-25 disabled:pointer-events-none',
      ].join(' ')}
      aria-label="Retroceder al inicio"
      title="Retroceder al inicio"
    >
      <SkipBack className="h-4 w-4 fill-current stroke-none" />
    </button>
  );

  /* ── VARIANTE COMPACTA: móvil / tablet en cualquier orientación ── */
  if (variant === 'compact') {
    return (
      <div className="flex w-full min-w-0 items-center gap-2">
        {rewindButton('md')}
        {playButton('md')}
        {stopButton('md')}

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="flex items-center justify-between gap-2 font-mono text-[11px] font-black leading-none">
            <span className="truncate text-cyan">
              <span className="text-slate-500">Audio activo · </span>
              {fileName ? fileName.replace(/\.[^/.]+$/, '') : 'Sin pista cargada'}
              {sourceKind === 'studio-mix' && (
                <span
                  className="ml-1.5 rounded px-1 py-0.5 align-middle text-[9px] font-black uppercase tracking-wide text-neon-canvas bg-cyan"
                  title="Mezcla final enviada desde el Audio Studio"
                >
                  Mezcla Studio
                </span>
              )}
            </span>
            <span className="shrink-0 text-slate-400">
              {fmtTime(currentTimeMs)}
              <span className="text-slate-600"> / </span>
              {durationLabel}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan to-teal-400 transition-[width] duration-100"
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  /* ── VARIANTE HEADER: cápsula de escritorio (lg+) ── */
  return (
    <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-zinc-950/80 p-1.5 shadow-soft-elevation backdrop-blur-md">
      {rewindButton('md')}
      {playButton('md')}
      {stopButton('md')}

      {sourceKind === 'studio-mix' && (
        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-neon-canvas bg-cyan"
          title="Mezcla final enviada desde el Audio Studio"
        >
          Mezcla Studio
        </span>
      )}

      <div className="flex min-w-[82px] flex-col justify-center px-1">
        <div className="flex items-center gap-1 font-mono text-xs font-black leading-none">
          <span className="text-cyan">{fmtTime(currentTimeMs)}</span>
          <span className="text-slate-600">/</span>
          <span className="font-medium text-slate-400">{durationLabel}</span>
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan to-teal-400 transition-[width] duration-100"
            style={{ width: `${progressRatio * 100}%` }}
          />
        </div>
      </div>

      {/* ── Grupo AUDIO: indicadores del estado REAL de la sesión del Rink.
          · Música  → % del gain real (se sincroniza con el motor).
          · Voz     → Voces Guía (cues).
          · Campana → Metrónomo.
          Distingue ENABLED (existe) de MUTED (silenciado): OFF ≠ MUTE ≠ ON.
          Visible desde `lg` (tablet grande / laptop), no solo en `xl`. */}
      <div className="hidden items-center gap-2 border-l border-white/10 pl-2.5 font-mono text-[11px] text-slate-400 lg:flex">
        <span
          className={`flex items-center gap-1 ${musicMuted ? 'text-rose-400' : 'font-semibold text-cyan'}`}
          title={`Volumen de la música (Pista 2D): ${musicMuted ? 'silenciada' : `${Math.round(musicVolume * 100)}%`} · ajústalo en «Mezcla»`}
          aria-label={`Volumen de la música: ${musicMuted ? 'silenciada' : `${Math.round(musicVolume * 100)} por ciento`}`}
        >
          <Music className="h-3.5 w-3.5" />
          {musicMuted ? 'MUTE' : `${Math.round(musicVolume * 100)}%`}
        </span>
        <span className="text-white/10">·</span>
        <span
          className={`flex items-center gap-1 ${!voiceEnabled ? 'text-slate-500' : voiceMuted ? 'text-rose-400' : 'font-semibold text-fuchsia-400'}`}
          title={`Voces guía: ${!voiceEnabled ? 'desactivadas' : voiceMuted ? 'silenciadas' : 'activas'}`}
          aria-label={`Voces guía: ${!voiceEnabled ? 'desactivadas' : voiceMuted ? 'silenciadas' : 'activas'}`}
        >
          <Mic className="h-3.5 w-3.5" />
          {!voiceEnabled ? 'OFF' : voiceMuted ? 'MUTE' : 'ON'}
        </span>
        <span className="text-white/10">·</span>
        <span
          className={`flex items-center gap-1 ${!metronomeEnabled ? 'text-slate-500' : metronomeMuted ? 'text-rose-400' : 'font-semibold text-amber-400'}`}
          title={`Metrónomo: ${!metronomeEnabled ? 'desactivado' : metronomeMuted ? 'silenciado' : 'activo'}`}
          aria-label={`Metrónomo: ${!metronomeEnabled ? 'desactivado' : metronomeMuted ? 'silenciado' : 'activo'}`}
        >
          <Bell className="h-3.5 w-3.5" />
          {!metronomeEnabled ? 'OFF' : metronomeMuted ? 'MUTE' : 'ON'}
        </span>
      </div>
    </div>
  );
};
