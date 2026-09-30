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
  const toggleMetronomeMute = useAudioStudioStore((s) => s.toggleMetronomeMute);

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
        size === 'lg' ? 'h-10 w-10' : 'h-8.5 w-8.5',
        'min-w-[34px] min-h-[34px] shrink-0 rounded-lg flex items-center justify-center press transition-colors disabled:opacity-30 disabled:pointer-events-none',
        isPlaying
          ? 'bg-amber-500 text-slate-950 shadow-sm'
          : 'bg-ice-primary text-white shadow-sm hover:bg-ice-hover',
      ].join(' ')}
      aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
      title={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
    >
      {isPlaying ? (
        <Pause className="h-4 w-4 fill-current stroke-none" />
      ) : (
        <Play className="ml-0.5 h-4 w-4 fill-current stroke-none" />
      )}
    </button>
  );

  const stopButton = (size: 'md' | 'lg') => (
    <button
      type="button"
      {...press(handleStop, { enabled: hasAudioLoaded })}
      disabled={!hasAudioLoaded}
      className={[
        size === 'lg' ? 'h-10 w-10' : 'h-8.5 w-8.5',
        'min-w-[34px] min-h-[34px] shrink-0 rounded-lg flex items-center justify-center press text-neutral-400 hover:bg-white/[0.08] hover:text-white transition-colors disabled:opacity-25 disabled:pointer-events-none',
      ].join(' ')}
      aria-label="Detener y volver a 0:00"
      title="Detener y volver a 0:00"
    >
      <Square className="h-3.5 w-3.5 fill-current stroke-none" />
    </button>
  );

  /** Retroceder al inicio (transporte estándar ⏮ ▶/⏸ ■). */
  const rewindButton = (size: 'md' | 'lg') => (
    <button
      type="button"
      {...press(handleRewind, { enabled: hasAudioLoaded })}
      disabled={!hasAudioLoaded}
      className={[
        size === 'lg' ? 'h-10 w-10' : 'h-8.5 w-8.5',
        'min-w-[34px] min-h-[34px] shrink-0 rounded-lg flex items-center justify-center press text-neutral-400 hover:bg-white/[0.08] hover:text-white transition-colors disabled:opacity-25 disabled:pointer-events-none',
      ].join(' ')}
      aria-label="Retroceder al inicio"
      title="Retroceder al inicio"
    >
      <SkipBack className="h-3.5 w-3.5 fill-current stroke-none" />
    </button>
  );

  /* ── VARIANTE COMPACTA: móvil / tablet en cualquier orientación ── */
  if (variant === 'compact') {
    const isMetroActive = metronomeEnabled && !metronomeMuted;
    return (
      <div className="flex w-full min-w-0 items-center gap-2">
        {rewindButton('md')}
        {playButton('md')}
        {stopButton('md')}

        {/* Metrónomo toggle directo en dock móvil/tablet */}
        <button
          type="button"
          {...press(toggleMetronomeMute)}
          aria-pressed={isMetroActive}
          className={`h-9 w-9 min-w-[34px] min-h-[34px] shrink-0 rounded-lg flex items-center justify-center press transition-colors ${
            !metronomeEnabled
              ? 'text-neutral-500 bg-surface-2 hover:text-neutral-300'
              : metronomeMuted
              ? 'text-red-400 bg-danger/10 hover:bg-danger/20 border border-danger/30'
              : 'text-amber-300 bg-amber-500/15 border border-amber-500/30'
          }`}
          title={`Metrónomo: ${!metronomeEnabled ? 'desactivado (clic para activar)' : metronomeMuted ? 'silenciado (clic para activar)' : 'activo (clic para silenciar)'}`}
          aria-label={`Metrónomo: ${!metronomeEnabled ? 'desactivado' : metronomeMuted ? 'silenciado' : 'activo'}`}
        >
          <Bell className="h-4 w-4" />
        </button>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="flex items-center justify-between gap-2 font-mono text-[11px] font-medium leading-none">
            <span className="truncate text-white">
              <span className="text-neutral-400">Audio · </span>
              {fileName ? fileName.replace(/\.[^/.]+$/, '') : 'Sin pista cargada'}
              {sourceKind === 'studio-mix' && (
                <span
                  className="ml-1.5 rounded-full px-2 py-0.5 align-middle text-[9px] font-medium tracking-wide text-ice-light bg-ice-primary/15 border border-ice-primary/30"
                  title="Mezcla final enviada desde el Audio Studio"
                >
                  Mezcla Studio
                </span>
              )}
            </span>
            <span className="shrink-0 text-neutral-400">
              <span className="text-white font-medium">{fmtTime(currentTimeMs)}</span>
              <span className="text-neutral-600"> / </span>
              {durationLabel}
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-ice-primary transition-[width] duration-100"
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  /* ── VARIANTE HEADER: cápsula de escritorio (lg+) ── */
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-surface-1/90 p-1 shadow-elevation-1 backdrop-blur-md">
      {rewindButton('md')}
      {playButton('md')}
      {stopButton('md')}

      {sourceKind === 'studio-mix' && (
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-medium tracking-wide text-ice-light bg-ice-primary/15 border border-ice-primary/30"
          title="Mezcla final enviada desde el Audio Studio"
        >
          Mezcla Studio
        </span>
      )}

      <div className="flex min-w-[82px] flex-col justify-center px-1.5">
        <div className="flex items-center gap-1 font-mono text-xs font-medium leading-none">
          <span className="text-white font-medium">{fmtTime(currentTimeMs)}</span>
          <span className="text-neutral-600">/</span>
          <span className="font-normal text-neutral-400">{durationLabel}</span>
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-ice-primary transition-[width] duration-100"
            style={{ width: `${progressRatio * 100}%` }}
          />
        </div>
      </div>

      {/* ── Grupo AUDIO: indicadores del estado REAL de la sesión del Rink.
          · Música  → % del gain real (se sincroniza con el motor).
          · Voz     → Voces Guía (cues).
          · Campana → Metrónomo.
          Distingue ENABLED (existe) de MUTED (silenciado): OFF ≠ MUTE ≠ ON.
          Visible desde `xl` (pantallas amplias) para evitar solapamientos en tabletas y laptops medianas. */}
      <div className="fm-header-audio-meters hidden items-center gap-2 border-l border-white/[0.08] pl-2.5 font-mono text-[11px] text-neutral-400 xl:flex">
        <span
          className={`flex items-center gap-1 ${musicMuted ? 'text-red-400' : 'font-medium text-ice-light'}`}
          title={`Volumen de la música (Pista 2D): ${musicMuted ? 'silenciada' : `${Math.round(musicVolume * 100)}%`} · ajústalo en «Mezcla»`}
          aria-label={`Volumen de la música: ${musicMuted ? 'silenciada' : `${Math.round(musicVolume * 100)} por ciento`}`}
        >
          <Music className="h-3.5 w-3.5" />
          {musicMuted ? 'MUTE' : `${Math.round(musicVolume * 100)}%`}
        </span>
        <span className="text-white/10">·</span>
        <span
          className={`flex items-center gap-1 ${!voiceEnabled ? 'text-neutral-500' : voiceMuted ? 'text-red-400' : 'font-medium text-studio-light'}`}
          title={`Voces guía: ${!voiceEnabled ? 'desactivadas' : voiceMuted ? 'silenciadas' : 'activas'}`}
          aria-label={`Voces guía: ${!voiceEnabled ? 'desactivadas' : voiceMuted ? 'silenciadas' : 'activas'}`}
        >
          <Mic className="h-3.5 w-3.5" />
          {!voiceEnabled ? 'OFF' : voiceMuted ? 'MUTE' : 'ON'}
        </span>
        <span className="text-white/10">·</span>
        <button
          type="button"
          {...press(toggleMetronomeMute)}
          aria-pressed={metronomeEnabled && !metronomeMuted}
          className={`press flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors cursor-pointer ${
            !metronomeEnabled
              ? 'text-neutral-500 hover:text-neutral-300'
              : metronomeMuted
              ? 'text-red-400 hover:text-red-300 bg-danger/10'
              : 'font-medium text-amber-300 bg-amber-500/15 border border-amber-500/30'
          }`}
          title={`Metrónomo: ${!metronomeEnabled ? 'desactivado (clic para activar)' : metronomeMuted ? 'silenciado (clic para activar)' : 'activo (clic para silenciar)'}`}
          aria-label={`Metrónomo: ${!metronomeEnabled ? 'desactivado' : metronomeMuted ? 'silenciado' : 'activo'}`}
        >
          <Bell className="h-3.5 w-3.5" />
          {!metronomeEnabled ? 'OFF' : metronomeMuted ? 'MUTE' : 'ON'}
        </button>
      </div>
    </div>
  );
};
