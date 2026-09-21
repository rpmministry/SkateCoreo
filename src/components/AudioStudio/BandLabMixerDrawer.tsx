import React from 'react';
import { 
  X, 
  Bell, 
  Mic, 
  Sliders 
} from 'lucide-react';
import { AudioStudioTrack } from '../../types/audioStudio';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';

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
  const setVoiceGuideVolume = useAudioStudioStore((s) => s.setVoiceGuideVolume);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div 
        className="w-full max-w-4xl bg-zinc-950/98 border-t border-white/10 rounded-t-3xl shadow-2xl p-4 flex flex-col gap-3 text-white max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Mezclador BandLab */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-cyan" />
            <h2 className="text-sm font-black uppercase tracking-wider text-white">
              Mezclador Multitrack (Mix Editor)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Canales Verticales (Estilo Consola de Mezclas BandLab) */}
        <div className="flex-1 overflow-x-auto py-2 flex items-stretch justify-center gap-3">
          {/* Canales de Pistas de Audio */}
          {tracks.map((t, idx) => {
            const isMaster = idx === 0 || t.type === 'music';
            return (
              <div 
                key={t.id}
                className="w-20 sm:w-24 shrink-0 flex flex-col items-center justify-between p-2 rounded-xl bg-zinc-900/90 border border-white/5 select-none"
                style={{ borderTop: `4px solid ${t.color}` }}
              >
                <div className="w-full text-center">
                  <span className="text-[10px] font-mono font-black" style={{ color: t.color }}>
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
                    className="w-28 accent-cyan cursor-pointer -rotate-90"
                  />
                </div>

                <span className="font-mono text-[10px] text-cyan font-bold mb-2">
                  {Math.round(t.volume * 100)}%
                </span>

                {/* Mute y Solo */}
                <div className="w-full flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleTrackMute(t.id)}
                    className={`flex-1 py-1 rounded text-[9px] font-black uppercase transition-all ${
                      t.muted ? 'bg-rose-500 text-white shadow-sm' : 'bg-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    M
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleTrackSolo(t.id)}
                    className={`flex-1 py-1 rounded text-[9px] font-black uppercase transition-all ${
                      t.solo ? 'bg-amber-400 text-black shadow-sm' : 'bg-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    S
                  </button>
                </div>
              </div>
            );
          })}

          {/* Canal Global: Metrónomo */}
          <div 
            className="w-20 sm:w-24 shrink-0 flex flex-col items-center justify-between p-2 rounded-xl bg-zinc-900/90 border border-white/5 select-none"
            style={{ borderTop: '4px solid #F59E0B' }}
          >
            <div className="w-full text-center">
              <span className="text-[10px] font-mono font-black text-amber-400 flex items-center justify-center gap-1">
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
                className="w-28 accent-amber-400 cursor-pointer -rotate-90"
              />
            </div>

            <span className="font-mono text-[10px] text-amber-400 font-bold mb-2">
              {Math.round(globalControls.metronome.volume * 100)}%
            </span>

            <button
              type="button"
              onClick={toggleMetronomeMute}
              className={`w-full py-1 rounded text-[9px] font-black uppercase transition-all ${
                globalControls.metronome.muted ? 'bg-rose-500 text-white' : 'bg-white/10 text-amber-400'
              }`}
            >
              {globalControls.metronome.muted ? 'Muted' : 'Activo'}
            </button>
          </div>

          {/* Canal Global: Voces Guía */}
          <div 
            className="w-20 sm:w-24 shrink-0 flex flex-col items-center justify-between p-2 rounded-xl bg-zinc-900/90 border border-white/5 select-none"
            style={{ borderTop: '4px solid #D946EF' }}
          >
            <div className="w-full text-center">
              <span className="text-[10px] font-mono font-black text-fuchsia-400 flex items-center justify-center gap-1">
                <Mic className="w-2.5 h-2.5" /> GUÍAS
              </span>
              <p className="text-[10px] text-slate-400 truncate">Voz / Cues</p>
            </div>

            <div className="h-32 flex items-center justify-center my-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={globalControls.voiceGuide.volume}
                onChange={(e) => setVoiceGuideVolume(parseFloat(e.target.value))}
                className="w-28 accent-fuchsia-400 cursor-pointer -rotate-90"
              />
            </div>

            <span className="font-mono text-[10px] text-fuchsia-400 font-bold mb-2">
              {Math.round(globalControls.voiceGuide.volume * 100)}%
            </span>

            <button
              type="button"
              onClick={toggleVoiceGuideMute}
              className={`w-full py-1 rounded text-[9px] font-black uppercase transition-all ${
                globalControls.voiceGuide.muted ? 'bg-rose-500 text-white' : 'bg-white/10 text-fuchsia-400'
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
