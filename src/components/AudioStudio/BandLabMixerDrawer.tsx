import React from 'react';
import { 
  X, 
  Bell, 
  Mic, 
  Sliders 
} from 'lucide-react';
import { AudioStudioTrack } from '../../types/audioStudio';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { usePressAction } from '../../hooks/usePressAction';
import { audioEngine } from '../../services/audioEngine';

interface BandLabMixerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: AudioStudioTrack[];
}

export const BandLabMixerDrawer: React.FC<BandLabMixerDrawerProps> = ({
  isOpen,
  onClose,
  tracks,
}) => {
  const setTrackVolume = useAudioStudioStore((s) => s.setTrackVolume);
  const toggleTrackMute = useAudioStudioStore((s) => s.toggleTrackMute);
  const toggleTrackSolo = useAudioStudioStore((s) => s.toggleTrackSolo);

  const globalControls = useAudioStudioStore((s) => s.globalControls);
  const toggleMetronomeMute = useAudioStudioStore((s) => s.toggleMetronomeMute);
  const setMetronomeVolume = useAudioStudioStore((s) => s.setMetronomeVolume);
  const toggleVoiceGuideMute = useAudioStudioStore((s) => s.toggleVoiceGuideMute);
  const press = usePressAction();
  const setVoiceGuideVolume = useAudioStudioStore((s) => s.setVoiceGuideVolume);

  const [channelMode, setChannelMode] = React.useState(() => audioEngine.getChannelMode());

  React.useEffect(() => {
    const unsubscribe = audioEngine.onStateChange((state) => {
      setChannelMode(state.channelMode);
    });
    return unsubscribe;
  }, []);

  const handleSetChannelMode = (mode: 'stereo' | 'split-coach') => {
    audioEngine.setChannelMode(mode);
    setChannelMode(mode);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div 
        className="w-full max-w-4xl bg-surface-1 border-t border-white/[0.08] rounded-t-3xl shadow-elevation p-4 flex flex-col gap-3 text-white max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Mezclador */}
        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-ice-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Mezclador Multitrack
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selector de Modo de Salida (Stereo vs Split L/R) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-3 rounded-xl bg-surface-2/60 border border-white/[0.06] shrink-0">
          <div className="flex flex-col text-left w-full sm:w-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Modo de Salida
            </span>
            <span className="text-[11px] text-slate-400 font-normal">
              {channelMode === 'split-coach'
                ? 'L: 100% Música (pista limpia) · R: 100% Metrónomo + Voz Guía (0% Música)'
                : 'L + R: Mezcla estéreo balanceada completa en ambos canales'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center">
            <button
              type="button"
              aria-pressed={channelMode === 'stereo'}
              onClick={() => handleSetChannelMode('stereo')}
              className={`py-1.5 px-3 rounded-xl text-center text-xs font-medium transition-all border ${
                channelMode === 'stereo'
                  ? 'bg-ice-primary text-white font-semibold border-ice-primary/40 shadow-subtle'
                  : 'bg-surface-1 border-white/[0.06] text-slate-300 hover:bg-surface-3 hover:text-white'
              }`}
            >
              🔊 Stereo
            </button>
            <button
              type="button"
              aria-pressed={channelMode === 'split-coach'}
              onClick={() => handleSetChannelMode('split-coach')}
              className={`py-1.5 px-3 rounded-xl text-center text-xs font-medium transition-all border ${
                channelMode === 'split-coach'
                  ? 'bg-ice-primary text-white font-semibold border-ice-primary/40 shadow-subtle'
                  : 'bg-surface-1 border-white/[0.06] text-slate-300 hover:bg-surface-3 hover:text-white'
              }`}
            >
              🎧 Split L/R
            </button>
          </div>
        </div>

        {/* Canales Verticales */}
        <div className="flex-1 overflow-x-auto py-2 flex items-stretch justify-center gap-3">
          {/* Canales de Pistas de Audio */}
          {tracks.map((t, idx) => {
            const isMaster = idx === 0 || t.type === 'music';
            return (
              <div 
                key={t.id}
                className="w-20 sm:w-24 shrink-0 flex flex-col items-center justify-between p-2 rounded-xl bg-surface-2/60 border border-white/[0.06] select-none shadow-subtle"
                style={{ borderTop: `3px solid ${t.color}` }}
              >
                <div className="w-full text-center">
                  <span className="text-[10px] font-mono font-semibold" style={{ color: t.color }}>
                    {isMaster ? 'MASTER' : `PISTA ${idx + 1}`}
                  </span>
                  <p className="text-[10px] text-slate-300 truncate w-full font-medium">
                    {t.name}
                  </p>
                </div>

                {/* Slider Vertical de Fader de Volumen */}
                <div className="h-32 flex items-center justify-center my-2">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={t.volume}
                    onChange={(e) => setTrackVolume(t.id, parseFloat(e.target.value))}
                    className="w-28 accent-[#2E7CF6] cursor-pointer -rotate-90"
                  />
                </div>

                <span className="font-mono text-[10px] text-ice-primary font-semibold mb-2">
                  {Math.round(t.volume * 100)}%
                </span>

                {/* Mute y Solo */}
                <div className="w-full flex items-center gap-1">
                  <button
                    type="button"
                    {...press(() => toggleTrackMute(t.id))}
                    className={`press min-h-touch flex-1 rounded-md text-[9px] font-semibold uppercase transition-colors ${
                      t.muted ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30' : 'bg-surface-1 border border-white/[0.06] text-slate-400 hover:text-white'
                    }`}
                  >
                    M
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleTrackSolo(t.id)}
                    className={`flex-1 py-1 rounded-md text-[9px] font-semibold uppercase transition-colors ${
                      t.solo ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/30' : 'bg-surface-1 border border-white/[0.06] text-slate-400 hover:text-white'
                    }`}
                  >
                    S
                  </button>
                </div>
              </div>
            );
          })}

          {/* Canal Global: Metrónomo */}
          {(() => {
            const isMetroActive = globalControls.metronome.enabled && !globalControls.metronome.muted;
            return (
              <div 
                className="w-20 sm:w-24 shrink-0 flex flex-col items-center justify-between p-2 rounded-xl bg-surface-2/60 border border-white/[0.06] select-none shadow-subtle"
                style={{ borderTop: `3px solid ${isMetroActive ? '#F59E0B' : '#64748B'}` }}
              >
                <div className="w-full text-center">
                  <span className={`text-[10px] font-mono font-semibold flex items-center justify-center gap-1 transition-colors ${isMetroActive ? 'text-amber-400' : 'text-slate-400'}`}>
                    <Bell className="w-2.5 h-2.5" /> METRO
                  </span>
                  <p className="text-[10px] text-slate-400 truncate">Sintético</p>
                </div>

                <div className="h-32 flex items-center justify-center my-2">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={globalControls.metronome.volume}
                    onChange={(e) => setMetronomeVolume(parseFloat(e.target.value))}
                    className="w-28 accent-[#F59E0B] cursor-pointer -rotate-90"
                  />
                </div>

                <span className={`font-mono text-[10px] font-semibold mb-2 ${isMetroActive ? 'text-amber-400' : 'text-slate-400'}`}>
                  {Math.round(globalControls.metronome.volume * 100)}%
                </span>

                <button
                  type="button"
                  {...press(toggleMetronomeMute)}
                  aria-pressed={isMetroActive}
                  className={`press min-h-touch w-full rounded-md text-[9px] font-semibold uppercase transition-colors ${
                    isMetroActive ? 'bg-amber-400/15 text-amber-400 border border-amber-400/25' : 'bg-surface-1 border border-white/[0.06] text-slate-400 hover:text-white'
                  }`}
                >
                  {isMetroActive ? 'Activo' : 'Inactivo'}
                </button>
              </div>
            );
          })()}

          {/* Canal Global: Voces Guía */}
          <div 
            className="w-20 sm:w-24 shrink-0 flex flex-col items-center justify-between p-2 rounded-xl bg-surface-2/60 border border-white/[0.06] select-none shadow-subtle"
            style={{ borderTop: '3px solid #0D9488' }}
          >
            <div className="w-full text-center">
              <span className="text-[10px] font-mono font-semibold text-studio-mint flex items-center justify-center gap-1">
                <Mic className="w-2.5 h-2.5" /> GUÍAS
              </span>
              <p className="text-[10px] text-slate-400 truncate" title="Voz Guía automática (IA). Independiente de la voz grabada.">Voz Guía IA</p>
            </div>

            <div className="h-32 flex items-center justify-center my-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={globalControls.voiceGuide.volume}
                onChange={(e) => setVoiceGuideVolume(parseFloat(e.target.value))}
                className="w-28 accent-[#0D9488] cursor-pointer -rotate-90"
              />
            </div>

            <span className="font-mono text-[10px] text-studio-mint font-semibold mb-2">
              {Math.round(globalControls.voiceGuide.volume * 100)}%
            </span>

            <button
              type="button"
              {...press(toggleVoiceGuideMute)}
              className={`press min-h-touch w-full rounded-md text-[9px] font-semibold uppercase transition-colors ${
                globalControls.voiceGuide.muted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-surface-1 border border-white/[0.06] text-studio-mint hover:text-white'
              }`}
            >
              {globalControls.voiceGuide.muted ? 'Muted' : 'Activo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
