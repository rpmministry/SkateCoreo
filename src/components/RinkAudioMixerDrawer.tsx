import React, { useEffect } from 'react';
import { 
  X, 
  Volume2, 
  VolumeX, 
  Bell, 
  Mic, 
  Music, 
  Sliders, 
  ExternalLink 
} from 'lucide-react';
import { useAudioStudioStore } from '../store/useAudioStudioStore';
import { usePressAction } from '../hooks/usePressAction';

interface RinkAudioMixerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenStudio?: () => void;
}

/**
 * RinkAudioMixerDrawer — Menú de Mezcla Responsivo para la Pista 2D
 * 
 * - Mobile / Tablet (< lg, incluido portrait): Bottom Sheet ergonómico deslizable
 *   desde la parte inferior con safe-area insets.
 * - Desktop (lg+): Sidebar Drawer lateral deslizable desde el borde derecho.
 * - Estricto cumplimiento de accesibilidad: Hitboxes de 44x44px en todos los controles interactivos.
 * - Canales independientes: Música Master, Voces Guía (Cues) y Metrónomo.
 */
export const RinkAudioMixerDrawer: React.FC<RinkAudioMixerDrawerProps> = ({
  isOpen,
  onClose,
  onOpenStudio,
}) => {
  const tracks = useAudioStudioStore((s) => s.tracks);
  const setTrackVolume = useAudioStudioStore((s) => s.setTrackVolume);
  const toggleTrackMute = useAudioStudioStore((s) => s.toggleTrackMute);

  const globalControls = useAudioStudioStore((s) => s.globalControls);
  const setMetronomeVolume = useAudioStudioStore((s) => s.setMetronomeVolume);
  const toggleMetronomeMute = useAudioStudioStore((s) => s.toggleMetronomeMute);
  const setVoiceGuideVolume = useAudioStudioStore((s) => s.setVoiceGuideVolume);
  const toggleVoiceGuideMute = useAudioStudioStore((s) => s.toggleVoiceGuideMute);

  const masterTrack = tracks.music;
  const musicVolume = masterTrack?.volume ?? 1.0;
  const musicMuted = masterTrack?.muted ?? false;

  const metronomeVolume = globalControls.metronome.volume;
  const metronomeMuted = globalControls.metronome.muted;

  const voiceVolume = globalControls.voiceGuide.volume;
  const voiceMuted = globalControls.voiceGuide.muted;

  // Activación táctil inmediata y fiable sin doble disparo (móvil/tablet).
  // Los botones de mute usaban solo `onClick`, que en pantallas táctiles llega
  // con retraso o se pierde si hay superposición de elementos.
  const press = usePressAction();

  // Sincronización con AudioEngine: el store ya enruta volumen y mute a los
  // GainNode de cada sub-bus, así que aquí no se duplica esa lógica.
  const handleMusicVolumeChange = (vol: number) => setTrackVolume('music', vol);
  const handleMusicMuteToggle = () => toggleTrackMute('music');

  // Cierre accesible con tecla Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col justify-end lg:flex-row lg:justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mixer-title"
    >
      {/* 
        Contenedor Dual:
        - Mobile Portrait: Bottom Sheet (bottom-0, rounded-t-3xl)
        - Landscape / Desktop: Sidebar Drawer (sm:h-full sm:w-96 sm:rounded-l-3xl sm:rounded-tr-none)
      */}
      <div
        className="w-full lg:w-96 max-h-[85vh] lg:max-h-full lg:h-full bg-zinc-950/95 border-t lg:border-t-0 lg:border-l border-white/15 rounded-t-3xl lg:rounded-t-none lg:rounded-l-3xl shadow-2xl flex flex-col p-5 pb-8 lg:p-6 backdrop-blur-xl animate-in slide-in-from-bottom lg:slide-in-from-right duration-250 select-none overflow-y-auto"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 2rem))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tirador visual de arrastre exclusivo del bottom sheet móvil/tablet */}
        <div className="w-12 h-1.5 bg-white/25 rounded-full mx-auto mb-4 lg:hidden shrink-0" />

        {/* Cabecera del Mezclador */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-cyan/15 border border-cyan/30 flex items-center justify-center text-cyan">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 id="mixer-title" className="text-base font-black text-white tracking-wide">
                Mezcla de Audio
              </h2>
              <span className="text-[11px] font-mono text-cyan">Pista 2D · SkateCoreo</span>
            </div>
          </div>

          {/* Botón de Cierre accesible (48x48px mínimo) */}
          <button
            type="button"
            onClick={onClose}
            className="w-12 h-12 min-w-touch min-h-touch rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors active:scale-95"
            aria-label="Cerrar panel de mezcla"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── LISTADO DE CANALES DE VOLUMEN (Áreas táctiles >= 48px) ── */}
        <div className="flex flex-col gap-4 my-auto py-4">
          {/* Canal 1: Música Master */}
          <div className="flex flex-col gap-2 p-3.5 rounded-2xl bg-zinc-900/80 border border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Music className="w-4 h-4 text-cyan" />
                <span className="text-xs font-black text-white uppercase tracking-wider">
                  Música Master
                </span>
              </div>
              <span className={`font-mono text-xs font-bold ${musicMuted ? 'text-rose-400' : 'text-cyan'}`}>
                {musicMuted ? 'SILENCIADO' : `${Math.round(musicVolume * 100)}%`}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Botón Mute Accesible (48x48px) */}
              <button
                type="button"
                {...press(handleMusicMuteToggle)}
                className={`w-12 h-12 min-w-touch min-h-touch rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-sm ${
                  musicMuted 
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' 
                    : 'bg-cyan/15 text-cyan border border-cyan/30 hover:bg-cyan/25'
                }`}
                title={musicMuted ? 'Activar sonido de Música' : 'Silenciar Música'}
                aria-label={musicMuted ? 'Activar sonido de Música' : 'Silenciar Música'}
              >
                {musicMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>

              {/* Slider Ergonómico (48px hit height) */}
              <div className="flex-1 h-12 flex items-center">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={musicMuted ? 0 : musicVolume}
                  onChange={(e) => handleMusicVolumeChange(parseFloat(e.target.value))}
                  className="w-full h-2.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan"
                  aria-label="Volumen de Música Master"
                />
              </div>
            </div>
          </div>

          {/* Canal 2: Voces Guía (Cues Coreográficos) */}
          <div className="flex flex-col gap-2 p-3.5 rounded-2xl bg-zinc-900/80 border border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Mic className="w-4 h-4 text-fuchsia-400" />
                <span className="text-xs font-black text-white uppercase tracking-wider">
                  Voces Guía (Cues)
                </span>
              </div>
              <span className={`font-mono text-xs font-bold ${voiceMuted ? 'text-rose-400' : 'text-fuchsia-400'}`}>
                {voiceMuted ? 'SILENCIADO' : `${Math.round(voiceVolume * 100)}%`}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Botón Mute Accesible (48x48px) */}
              <button
                type="button"
                {...press(toggleVoiceGuideMute)}
                className={`w-12 h-12 min-w-touch min-h-touch rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-sm ${
                  voiceMuted 
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' 
                    : 'bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30 hover:bg-fuchsia-500/25'
                }`}
                title={voiceMuted ? 'Activar Voces Guía' : 'Silenciar Voces Guía'}
                aria-label={voiceMuted ? 'Activar Voces Guía' : 'Silenciar Voces Guía'}
              >
                {voiceMuted ? <VolumeX className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* Slider Ergonómico (48px hit height) */}
              <div className="flex-1 h-12 flex items-center">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={voiceMuted ? 0 : voiceVolume}
                  onChange={(e) => setVoiceGuideVolume(parseFloat(e.target.value))}
                  className="w-full h-2.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-400"
                  aria-label="Volumen de Voces Guía"
                />
              </div>
            </div>
          </div>

          {/* Canal 3: Metrónomo */}
          <div className="flex flex-col gap-2 p-3.5 rounded-2xl bg-zinc-900/80 border border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Bell className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-black text-white uppercase tracking-wider">
                  Metrónomo Sintético
                </span>
              </div>
              <span className={`font-mono text-xs font-bold ${metronomeMuted ? 'text-rose-400' : 'text-amber-400'}`}>
                {metronomeMuted ? 'SILENCIADO' : `${Math.round(metronomeVolume * 100)}%`}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Botón Mute Accesible (48x48px) */}
              <button
                type="button"
                {...press(toggleMetronomeMute)}
                className={`w-12 h-12 min-w-touch min-h-touch rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-sm ${
                  metronomeMuted 
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' 
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25'
                }`}
                title={metronomeMuted ? 'Activar Metrónomo' : 'Silenciar Metrónomo'}
                aria-label={metronomeMuted ? 'Activar Metrónomo' : 'Silenciar Metrónomo'}
              >
                {metronomeMuted ? <VolumeX className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
              </button>

              {/* Slider Ergonómico (48px hit height) */}
              <div className="flex-1 h-12 flex items-center">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={metronomeMuted ? 0 : metronomeVolume}
                  onChange={(e) => setMetronomeVolume(parseFloat(e.target.value))}
                  className="w-full h-2.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                  aria-label="Volumen del Metrónomo"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── BOTONES DE ACCIÓN INFERIOR ── */}
        <div className="flex flex-col gap-2.5 pt-3 border-t border-white/10 shrink-0">
          {onOpenStudio && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenStudio();
              }}
              className="w-full h-12 min-h-touch rounded-2xl bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/40 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-98 shadow-md"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Editar mezcla en Estudio</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full h-12 min-h-touch rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition-colors active:scale-98"
          >
            Aceptar y Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

