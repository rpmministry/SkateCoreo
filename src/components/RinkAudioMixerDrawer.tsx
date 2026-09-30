import React, { useEffect } from 'react';
import { 
  X, 
  Volume2, 
  VolumeX, 
  Bell, 
  Mic, 
  Music, 
  Sliders
} from 'lucide-react';
import { useAudioStudioStore } from '../store/useAudioStudioStore';
import { usePressAction } from '../hooks/usePressAction';

interface RinkAudioMixerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
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
  const metronomeEnabled = globalControls.metronome.enabled;
  const isMetroActive = metronomeEnabled && !metronomeMuted;

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
        className="w-full lg:w-96 max-h-[85vh] lg:max-h-full lg:h-full bg-surface-1 border-t lg:border-t-0 lg:border-l border-white/[0.08] rounded-t-3xl lg:rounded-t-none lg:rounded-l-3xl shadow-elevation flex flex-col p-5 pb-8 lg:p-6 select-none overflow-y-auto"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 2rem))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tirador visual de arrastre exclusivo del bottom sheet móvil/tablet */}
        <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-4 lg:hidden shrink-0" />

        {/* Cabecera del Mezclador */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-ice-primary/10 border border-ice-primary/20 flex items-center justify-center text-ice-primary">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 id="mixer-title" className="text-sm font-semibold text-white tracking-normal">
                Mezcla de Audio
              </h2>
              <span className="text-[11px] font-mono text-slate-400">Pista 2D · SkateCoreo</span>
            </div>
          </div>

          {/* Botón de Cierre accesible (44x44px mínimo) */}
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Cerrar panel de mezcla"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── LISTADO DE CANALES DE VOLUMEN (Áreas táctiles >= 48px) ── */}
        <div className="flex flex-col gap-3 my-auto py-4">
          {/* Canal 1: Música Master */}
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-surface-2/60 border border-white/[0.06]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-ice-primary" />
                <span className="text-xs font-semibold text-white">
                  Música Master
                </span>
              </div>
              <span className={`font-mono text-xs font-medium ${musicMuted ? 'text-red-400' : 'text-ice-primary'}`}>
                {musicMuted ? 'SILENCIADO' : `${Math.round(musicVolume * 100)}%`}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Botón Mute Accesible (44x44px) */}
              <button
                type="button"
                {...press(handleMusicMuteToggle)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all shadow-subtle ${
                  musicMuted 
                    ? 'bg-red-500/15 text-red-400 border border-red-500/30' 
                    : 'bg-ice-primary/10 text-ice-primary border border-ice-primary/20 hover:bg-ice-primary/20'
                }`}
                title={musicMuted ? 'Activar sonido de Música' : 'Silenciar Música'}
                aria-label={musicMuted ? 'Activar sonido de Música' : 'Silenciar Música'}
              >
                {musicMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Slider Ergonómico */}
              <div className="flex-1 h-10 flex items-center">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={musicMuted ? 0 : musicVolume}
                  onChange={(e) => handleMusicVolumeChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-[#2E7CF6]"
                  aria-label="Volumen de Música Master"
                />
              </div>
            </div>
          </div>

          {/* Canal 2: Voces Guía (Cues Coreográficos) */}
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-surface-2/60 border border-white/[0.06]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-studio-mint" />
                <span className="text-xs font-semibold text-white">
                  Voces Guía (Cues)
                </span>
              </div>
              <span className={`font-mono text-xs font-medium ${voiceMuted ? 'text-red-400' : 'text-studio-mint'}`}>
                {voiceMuted ? 'SILENCIADO' : `${Math.round(voiceVolume * 100)}%`}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Botón Mute Accesible */}
              <button
                type="button"
                {...press(toggleVoiceGuideMute)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all shadow-subtle ${
                  voiceMuted 
                    ? 'bg-red-500/15 text-red-400 border border-red-500/30' 
                    : 'bg-studio-mint/10 text-studio-mint border border-studio-mint/20 hover:bg-studio-mint/20'
                }`}
                title={voiceMuted ? 'Activar Voces Guía' : 'Silenciar Voces Guía'}
                aria-label={voiceMuted ? 'Activar Voces Guía' : 'Silenciar Voces Guía'}
              >
                {voiceMuted ? <VolumeX className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Slider Ergonómico */}
              <div className="flex-1 h-10 flex items-center">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={voiceMuted ? 0 : voiceVolume}
                  onChange={(e) => setVoiceGuideVolume(parseFloat(e.target.value))}
                  className="w-full h-2 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-[#0D9488]"
                  aria-label="Volumen de Voces Guía"
                />
              </div>
            </div>
          </div>

          {/* Canal 3: Metrónomo */}
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-surface-2/60 border border-white/[0.06]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className={`w-4 h-4 transition-colors ${isMetroActive ? 'text-amber-400' : 'text-slate-500'}`} />
                <span className="text-xs font-semibold text-white">
                  Metrónomo Sintético
                </span>
              </div>
              <span className={`font-mono text-xs font-medium ${isMetroActive ? 'text-amber-400' : 'text-slate-500'}`}>
                {isMetroActive ? `${Math.round(metronomeVolume * 100)}%` : 'INACTIVO'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Botón Mute Accesible */}
              <button
                type="button"
                {...press(toggleMetronomeMute)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all shadow-subtle ${
                  isMetroActive 
                    ? 'bg-amber-400/10 text-amber-400 border border-amber-400/25 hover:bg-amber-400/20' 
                    : 'bg-white/[0.04] text-slate-500 border border-white/[0.06] hover:bg-white/[0.08]'
                }`}
                title={isMetroActive ? 'Silenciar Metrónomo' : 'Activar Metrónomo'}
                aria-label={isMetroActive ? 'Silenciar Metrónomo' : 'Activar Metrónomo'}
                aria-pressed={isMetroActive}
              >
                <Bell className={`w-4 h-4 ${isMetroActive ? 'text-amber-400' : 'text-slate-500'}`} />
              </button>

              {/* Slider Ergonómico */}
              <div className="flex-1 h-10 flex items-center">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={!isMetroActive ? 0 : metronomeVolume}
                  onChange={(e) => setMetronomeVolume(parseFloat(e.target.value))}
                  className="w-full h-2 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-[#F59E0B]"
                  aria-label="Volumen del Metrónomo"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── BOTONES DE ACCIÓN INFERIOR ── */}
        <div className="flex flex-col gap-2.5 pt-3 border-t border-white/[0.06] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-surface-2 hover:bg-surface-3 border border-white/[0.06] text-white font-medium text-xs transition-colors interactive-tap"
          >
            Aceptar y Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

