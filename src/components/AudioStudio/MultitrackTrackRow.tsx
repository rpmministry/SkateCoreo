import React, { useRef, useState } from 'react';
import { 
  Upload, 
  Mic, 
  Music, 
  Activity, 
  Layers, 
  MoreVertical 
} from 'lucide-react';
import { AudioStudioTrack } from '../../types/audioStudio';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { AudioClipItem } from './AudioClipItem';
import { BandLabTrackMenuModal } from './BandLabTrackMenuModal';

interface MultitrackTrackRowProps {
  track: AudioStudioTrack;
  trackIndex: number; // 0 = Master, 1..4 = Adicionales
  totalTracks: number;
  totalDurationSec: number;
  contentWidth: number;
  trackLaneHeight?: number;
  onUploadFile: (file: File) => void;
  onTrackHop?: (fromTrackId: string, toTrackIndex: number, clipId: string, newOffsetSec: number) => void;
  onRemoveTrack?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDuplicate?: () => void;
}

export const MultitrackTrackRow: React.FC<MultitrackTrackRowProps> = ({
  track,
  trackIndex,
  totalTracks,
  totalDurationSec,
  contentWidth,
  trackLaneHeight = 64,
  onUploadFile,
  onTrackHop,
  onRemoveTrack,
  onMoveUp,
  onMoveDown,
  onDuplicate,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);

  const activeTrackId = useAudioStudioStore((s) => s.activeTrackId);
  const setActiveTrackId = useAudioStudioStore((s) => s.setActiveTrackId);
  const pasteClip = useAudioStudioStore((s) => s.pasteClip);
  const audioClipboard = useAudioStudioStore((s) => s.audioClipboard);

  const [showTrackMenu, setShowTrackMenu] = useState(false);

  const isMasterTrack = trackIndex === 0 || track.type === 'music';
  const isActive = activeTrackId === track.id || (isMasterTrack && (activeTrackId === 'music' || activeTrackId === 'track-music' || activeTrackId === 'master'));
  const displayName = isMasterTrack ? 'Master' : track.name;

  // Icono dinámico según la pista estilo BandLab
  const getTrackIcon = () => {
    if (isMasterTrack) return Music;
    if (trackIndex === 1) return Mic;
    if (trackIndex === 2) return Activity;
    return Layers;
  };
  const IconComponent = getTrackIcon();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFile(file);
      // Reset input value para permitir recargar el mismo archivo si es necesario
      e.target.value = '';
    }
  };

  const handleLaneClick = (e: React.MouseEvent) => {
    setActiveTrackId(track.id);
    if (e.target === laneRef.current) {
      const rect = laneRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const safeDuration = Math.max(10, totalDurationSec);
      const clickedTimeSec = (clickX / contentWidth) * safeDuration;

      if (audioClipboard && e.detail === 2) {
        pasteClip(track.id, clickedTimeSec);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setActiveTrackId(track.id);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      onUploadFile(file);
    }
  };

  return (
    <>
      <div 
        className={`relative flex items-stretch border-b border-white/5 transition-colors ${
          isActive ? 'bg-zinc-950/80 ring-1 ring-inset ring-cyan/30' : 'bg-black/60 hover:bg-black/80'
        }`}
        style={{ height: `${trackLaneHeight}px` }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {/* ── CABECERA DE PISTA (Estilo BandLab: Icono circular + Nombre + Fx tag + Indicador Activa) ── */}
        <div 
          onClick={() => {
            setActiveTrackId(track.id);
            setShowTrackMenu(true);
          }}
          className={`relative z-20 shrink-0 w-24 sm:w-28 border-r border-white/10 flex items-center justify-between px-2 py-1 cursor-pointer select-none transition-colors group ${
            isActive ? 'bg-zinc-900' : 'bg-zinc-950/90 hover:bg-zinc-900'
          }`}
          style={{ borderLeft: `3.5px solid ${track.color}` }}
          title={`Pista: ${displayName} (Toca para opciones de pista)`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {/* Círculo de Icono con color de pista */}
            <div 
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-sm relative"
              style={{ backgroundColor: `${track.color}25`, color: track.color }}
            >
              <IconComponent className="w-3.5 h-3.5" />
              {isActive && (
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan ring-1 ring-black animate-pulse" />
              )}
            </div>

            {/* Nombre y Tag */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold text-white truncate leading-tight">
                  {displayName}
                </span>
              </div>
              <span className={`text-[8.5px] font-mono truncate ${isActive ? 'text-cyan font-bold' : 'text-slate-400'}`}>
                {isActive ? '● Activa' : (isMasterTrack ? 'Master' : '+ Fx')}
              </span>
            </div>
          </div>

          {/* Indicador de Mute o Solo activo */}
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            {track.muted && (
              <span className="px-1 py-0.2 rounded text-[8px] font-black bg-rose-500 text-white">
                M
              </span>
            )}
            {track.solo && (
              <span className="px-1 py-0.2 rounded text-[8px] font-black bg-amber-400 text-black">
                S
              </span>
            )}
            <MoreVertical className="w-3 h-3 text-slate-500 group-hover:text-white transition-colors" />
          </div>
        </div>

        {/* ── CARRIL DE CLIPS (Timeline Lane / Drop Zone) ── */}
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
                  const laneOffset = Math.round(deltaY / trackLaneHeight);
                  const targetIndex = Math.max(0, Math.min(totalTracks - 1, trackIndex + laneOffset));
                  onTrackHop(track.id, targetIndex, clipId, newOffsetSec);
                }
              }}
            />
          ))}

          {/* Estado vacío: Condicional de Pista Master vs Pista Única / Pistas Adicionales */}
          {(!track.clips || track.clips.length === 0) && (
            isMasterTrack && totalTracks > 1 ? (
              <div className="absolute inset-0 flex items-center justify-center p-2 pointer-events-auto">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-950/40 border border-cyan/25 text-cyan text-xs font-medium backdrop-blur-xs">
                  <Layers className="w-3.5 h-3.5 text-cyan shrink-0" />
                  <span className="hidden sm:inline">Lienzo Master: Pega clips cortados de las pistas auxiliares</span>
                  <span className="sm:hidden">Lienzo Master (Ensamblaje)</span>
                  {audioClipboard && (
                    <button
                      type="button"
                      onClick={() => pasteClip(track.id, 0)}
                      className="ml-1 px-2.5 py-0.5 rounded-full bg-cyan text-slate-950 text-[11px] font-black hover:bg-cyan-300 transition-all shadow-md active:scale-95"
                      title="Pegar clip copiado al inicio de la Pista Master"
                    >
                      Pegar Clip (Ctrl+V)
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-2 pointer-events-auto">
                <label 
                  htmlFor={`file-upload-${track.id}`}
                  className="cursor-pointer h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 border border-white/15 transition-all shadow-sm active:scale-95"
                >
                  <Upload className="w-3.5 h-3.5 text-cyan" />
                  <span>Cargar archivo de audio</span>
                </label>
                <input
                  id={`file-upload-${track.id}`}
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="sr-only"
                  onChange={handleFileChange}
                />
              </div>
            )
          )}
        </div>
      </div>

      {/* Menú Flotante de Opciones de Pista (Estilo BandLab 3_Mix-Editor-Menu-1.webp) */}
      <BandLabTrackMenuModal
        track={track}
        trackIndex={trackIndex}
        totalTracks={totalTracks}
        isOpen={showTrackMenu}
        onClose={() => setShowTrackMenu(false)}
        onUploadFile={onUploadFile}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDuplicate={onDuplicate}
        onRemove={onRemoveTrack}
      />
    </>
  );
};
