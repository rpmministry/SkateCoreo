import React, { useRef, useState } from 'react';
import { 
  Volume2, 
  VolumeX, 
  Upload, 
  Trash2 
} from 'lucide-react';
import { AudioStudioTrack } from '../../types/audioStudio';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { AudioClipItem } from './AudioClipItem';

interface MultitrackTrackRowProps {
  track: AudioStudioTrack;
  trackIndex: number; // 0 = Pista Principal, 1..4 = Adicionales
  totalDurationSec: number;
  contentWidth: number;
  trackLaneHeight?: number;
  onUploadFile?: (file: File) => void;
  onTrackHop?: (fromTrackId: string, toTrackIndex: number, clipId: string, newOffsetSec: number) => void;
  onRemoveTrack?: () => void;
}

export const MultitrackTrackRow: React.FC<MultitrackTrackRowProps> = ({
  track,
  trackIndex,
  totalDurationSec,
  contentWidth,
  trackLaneHeight = 56,
  onUploadFile,
  onTrackHop,
  onRemoveTrack,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);

  const setTrackVolume = useAudioStudioStore((s) => s.setTrackVolume);
  const toggleTrackMute = useAudioStudioStore((s) => s.toggleTrackMute);
  const toggleTrackSolo = useAudioStudioStore((s) => s.toggleTrackSolo);
  const pasteClip = useAudioStudioStore((s) => s.pasteClip);
  const audioClipboard = useAudioStudioStore((s) => s.audioClipboard);

  const [showVolumePopover, setShowVolumePopover] = useState(false);

  const isMasterTrack = trackIndex === 0 || track.type === 'music';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadFile) {
      onUploadFile(file);
    }
  };

  const handleLaneClick = (e: React.MouseEvent) => {
    // Si se hace clic en área vacía del carril y hay un clip en clipboard, permitir pegar rápido
    if (e.target === laneRef.current) {
      const rect = laneRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const safeDuration = Math.max(10, totalDurationSec);
      const clickedTimeSec = (clickX / contentWidth) * safeDuration;

      if (audioClipboard && e.detail === 2) {
        // Doble tap para pegar
        pasteClip(track.id, clickedTimeSec);
      }
    }
  };

  return (
    <div 
      className="relative flex items-stretch border-b border-white/5 bg-zinc-950/60 hover:bg-zinc-950/80 transition-colors"
      style={{ height: `${trackLaneHeight}px` }}
    >
      {/* ── CABECERA COMPACTA DE PISTA (Landscape Mobile: 48px - 60px) ── */}
      <div 
        className="relative z-20 shrink-0 w-12 sm:w-16 border-r border-white/10 flex flex-col justify-between p-1 bg-zinc-900/90 select-none"
        style={{
          borderLeft: `3px solid ${track.color}`,
        }}
      >
        {/* Fila Superior: Título/Número y opciones */}
        <div className="flex items-center justify-between">
          <span 
            className="text-[10px] font-mono font-black truncate"
            style={{ color: track.color }}
            title={track.name}
          >
            {isMasterTrack ? 'M1' : `P${trackIndex + 1}`}
          </span>

          {/* Botón Borrar (Solo pistas secundarias) */}
          {!isMasterTrack && onRemoveTrack && (
            <button
              type="button"
              onClick={onRemoveTrack}
              className="text-slate-500 hover:text-rose-400 transition-colors"
              title="Eliminar esta pista"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {/* Fila Media: Botones Mute y Solo */}
        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => toggleTrackMute(track.id)}
            className={`flex-1 h-4 rounded text-[9px] font-black uppercase transition-colors ${
              track.muted 
                ? 'bg-rose-500 text-white shadow-sm' 
                : 'bg-white/10 text-slate-400 hover:text-white'
            }`}
            title={track.muted ? 'Desmutear pista' : 'Silenciar pista (Mute)'}
          >
            M
          </button>
          <button
            type="button"
            onClick={() => toggleTrackSolo(track.id)}
            className={`flex-1 h-4 rounded text-[9px] font-black uppercase transition-colors ${
              track.solo 
                ? 'bg-amber-400 text-black shadow-sm' 
                : 'bg-white/10 text-slate-400 hover:text-white'
            }`}
            title={track.solo ? 'Desactivar Solo' : 'Pista en Solo'}
          >
            S
          </button>
        </div>

        {/* Fila Inferior: Mini indicador de volumen / Trigger de Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowVolumePopover((v) => !v)}
            className="w-full h-3.5 flex items-center justify-between px-1 rounded bg-black/40 hover:bg-black/60 text-[9px] font-mono text-slate-300 transition-colors"
            title="Ajustar volumen de la pista"
          >
            {track.muted ? <VolumeX className="w-2 h-2 text-rose-400" /> : <Volume2 className="w-2 h-2 text-slate-400" />}
            <span>{Math.round(track.volume * 100)}%</span>
          </button>

          {/* Popover flotante de volumen (para no invadir el lienzo horizontal) */}
          {showVolumePopover && (
            <div className="absolute left-full bottom-0 ml-1 z-50 w-36 p-2 rounded-lg bg-zinc-900/98 border border-white/20 shadow-2xl backdrop-blur-md flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-300">
                <span className="truncate">{track.name}</span>
                <span className="font-mono text-cyan">{Math.round(track.volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={track.volume}
                onChange={(e) => setTrackVolume(track.id, parseFloat(e.target.value))}
                className="w-full accent-cyan h-1.5 bg-white/10 rounded cursor-pointer"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── CARRIL DE CLIPS (Timeline Lane) ── */}
      <div 
        ref={laneRef}
        onClick={handleLaneClick}
        className="relative flex-1 overflow-hidden"
        style={{ width: `${contentWidth}px` }}
      >
        {/* Renderizado de Clips */}
        {track.clips && track.clips.map((clip) => (
          <AudioClipItem
            key={clip.id}
            clip={clip}
            trackId={track.id}
            trackColor={track.color}
            totalDurationSec={totalDurationSec}
            contentWidth={contentWidth}
            trackLaneHeight={trackLaneHeight}
            onTrackHop={(clipId, deltaY, newOffsetSec) => {
              if (onTrackHop) {
                // Calcular carril destino según deltaY
                const laneOffset = Math.round(deltaY / trackLaneHeight);
                const targetIndex = Math.max(0, Math.min(4, trackIndex + laneOffset));
                onTrackHop(track.id, targetIndex, clipId, newOffsetSec);
              }
            }}
          />
        ))}

        {/* Mensaje o botón si la pista está vacía */}
        {(!track.clips || track.clips.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="pointer-events-auto h-6 px-2 rounded-full flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
            >
              <Upload className="w-2.5 h-2.5" />
              <span>Cargar audio en esta pista</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}
      </div>
    </div>
  );
};
