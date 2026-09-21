import React, { useRef, useState } from 'react';
import { 
  Volume2, 
  VolumeX, 
  Upload, 
  Trash2, 
  Copy, 
  ChevronUp, 
  ChevronDown, 
  Palette, 
  Edit3, 
  X,
  Check
} from 'lucide-react';
import { AudioStudioTrack, CARBON_TRACK_COLORS } from '../../types/audioStudio';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';

interface BandLabTrackMenuModalProps {
  track: AudioStudioTrack;
  trackIndex: number; // 0 = Master
  totalTracks: number;
  isOpen: boolean;
  onClose: () => void;
  onUploadFile: (file: File) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
}

export const BandLabTrackMenuModal: React.FC<BandLabTrackMenuModalProps> = ({
  track,
  trackIndex,
  totalTracks,
  isOpen,
  onClose,
  onUploadFile,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const setTrackVolume = useAudioStudioStore((s) => s.setTrackVolume);
  const toggleTrackMute = useAudioStudioStore((s) => s.toggleTrackMute);
  const toggleTrackSolo = useAudioStudioStore((s) => s.toggleTrackSolo);

  const [isEditingName, setIsEditingName] = useState(false);
  const [customName, setCustomName] = useState(track.name);
  const [showColorPicker, setShowColorPicker] = useState(false);

  if (!isOpen) return null;

  const isMaster = trackIndex === 0 || track.type === 'music';

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFile(file);
      onClose();
    }
  };

  const handleSaveName = () => {
    if (customName.trim()) {
      useAudioStudioStore.setState((state) => {
        if (state.tracks[track.id]) {
          return {
            tracks: {
              ...state.tracks,
              [track.id]: { ...state.tracks[track.id], name: customName.trim() },
            },
          };
        }
        return {
          additionalTracks: state.additionalTracks.map((t) =>
            t.id === track.id ? { ...t, name: customName.trim() } : t
          ),
        };
      });
    }
    setIsEditingName(false);
  };

  const handleChangeColor = (newColor: string) => {
    useAudioStudioStore.setState((state) => {
      if (state.tracks[track.id]) {
        return {
          tracks: {
            ...state.tracks,
            [track.id]: { ...state.tracks[track.id], color: newColor },
          },
        };
      }
      return {
        additionalTracks: state.additionalTracks.map((t) =>
          t.id === track.id ? { ...t, color: newColor } : t
        ),
      };
    });
    setShowColorPicker(false);
  };

  return (
    <div 
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div 
        className="w-full sm:max-w-md bg-zinc-900/95 border border-white/10 sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col p-4 text-slate-100 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Menú BandLab */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div 
              className="w-4 h-4 rounded-full shadow-sm"
              style={{ backgroundColor: track.color }}
            />
            {isEditingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="bg-black/60 border border-cyan/50 rounded px-2 py-0.5 text-xs text-white font-bold"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  className="p-1 rounded bg-cyan text-black"
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-black text-white">{track.name}</h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  {track.fileName || (isMaster ? 'Master Track' : 'Pista Adicional')}
                </span>
              </div>
            )}
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Controles de Fader: Volumen, Mute & Solo */}
        <div className="py-3 flex flex-col gap-2.5 border-b border-white/10">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center gap-1 font-bold">
              {track.muted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-cyan" />}
              Volumen
            </span>
            <span className="font-mono text-cyan font-bold">{Math.round(track.volume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            value={track.volume}
            onChange={(e) => setTrackVolume(track.id, parseFloat(e.target.value))}
            className="w-full accent-cyan h-2 bg-white/10 rounded-lg cursor-pointer"
          />

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => toggleTrackMute(track.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                track.muted ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30' : 'bg-white/10 text-slate-300 hover:bg-white/20'
              }`}
            >
              Mute
            </button>
            <button
              type="button"
              onClick={() => toggleTrackSolo(track.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                track.solo ? 'bg-amber-400 text-black shadow-md shadow-amber-400/30' : 'bg-white/10 text-slate-300 hover:bg-white/20'
              }`}
            >
              Solo
            </button>
          </div>
        </div>

        {/* Acciones de la Pista (Estilo BandLab) */}
        <div className="py-2 flex flex-col gap-1">
          {/* Cargar / Reemplazar Audio */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2.5 px-3 rounded-lg flex items-center justify-between text-xs font-bold text-cyan hover:bg-cyan/10 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              <span>Cargar / Reemplazar Audio</span>
            </span>
            <span className="text-[10px] text-slate-400">MP3, WAV, M4A</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileSelected}
          />

          {/* Reordenar: Subir / Bajar Pista */}
          {!isMaster && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onMoveUp}
                disabled={trackIndex <= 1}
                className="flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-30"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Subir Pista</span>
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={trackIndex >= totalTracks - 1}
                className="flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-30"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Bajar Pista</span>
              </button>
            </div>
          )}

          {/* Renombrar */}
          <button
            type="button"
            onClick={() => setIsEditingName(true)}
            className="w-full py-2.5 px-3 rounded-lg flex items-center gap-2 text-xs font-bold text-slate-200 hover:bg-white/5 transition-colors"
          >
            <Edit3 className="w-4 h-4 text-slate-400" />
            <span>Renombrar Pista</span>
          </button>

          {/* Cambiar Color */}
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => setShowColorPicker((v) => !v)}
              className="w-full py-2.5 px-3 rounded-lg flex items-center justify-between text-xs font-bold text-slate-200 hover:bg-white/5 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-slate-400" />
                <span>Cambiar Color</span>
              </span>
              <div 
                className="w-3.5 h-3.5 rounded-full"
                style={{ backgroundColor: track.color }}
              />
            </button>
            {showColorPicker && (
              <div className="flex items-center justify-around p-2 bg-black/40 rounded-lg my-1 gap-1">
                {CARBON_TRACK_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleChangeColor(c)}
                    className="w-6 h-6 rounded-full hover:scale-110 transition-transform flex items-center justify-center"
                    style={{ backgroundColor: c }}
                  >
                    {track.color === c && <Check className="w-3 h-3 text-black font-black" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Duplicar Pista */}
          {onDuplicate && (
            <button
              type="button"
              onClick={() => {
                onDuplicate();
                onClose();
              }}
              className="w-full py-2.5 px-3 rounded-lg flex items-center gap-2 text-xs font-bold text-slate-200 hover:bg-white/5 transition-colors"
            >
              <Copy className="w-4 h-4 text-slate-400" />
              <span>Duplicar Pista</span>
            </button>
          )}

          {/* Eliminar Pista (Solo secundarias) */}
          {!isMaster && onRemove && (
            <button
              type="button"
              onClick={() => {
                onRemove();
                onClose();
              }}
              className="w-full py-2.5 px-3 rounded-lg flex items-center gap-2 text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Eliminar Pista</span>
            </button>
          )}
        </div>

        {/* Botón Cancelar */}
        <div className="pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
