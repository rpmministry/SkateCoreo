import React, { useRef, useEffect, useState, useMemo } from 'react';
import { 
  Music, 
  Mic, 
  Timer, 
  Volume2, 
  Upload, 
  Sparkles, 
  Sliders, 
  Trash2,
  GripHorizontal
} from 'lucide-react';
import { AudioStudioTrack, AudioClip } from '../../types/audioStudio';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';

interface MultitrackTrackRowProps {
  track: AudioStudioTrack;
  trackNumber?: number;
  isMasterTrack?: boolean;
  totalDurationSec: number;
  currentTimeSec: number;
  contentWidth?: number;
  widthOffset?: number;
  onUploadFile?: (file: File) => void;
  onSeek?: (sec: number) => void;
  onRemove?: () => void;
}

export const MultitrackTrackRow: React.FC<MultitrackTrackRowProps> = ({
  track,
  trackNumber,
  isMasterTrack,
  totalDurationSec,
  currentTimeSec: _currentTimeSec,
  contentWidth,
  widthOffset,
  onUploadFile,
  onSeek,
  onRemove,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const activeTool = useAudioStudioStore((s) => s.activeTool);
  const selectedClipId = useAudioStudioStore((s) => s.selectedClipId);
  const setSelectedClipId = useAudioStudioStore((s) => s.setSelectedClipId);
  const splitClip = useAudioStudioStore((s) => s.splitClip);
  const moveClip = useAudioStudioStore((s) => s.moveClip);
  const deleteClip = useAudioStudioStore((s) => s.deleteClip);
  const setClipFades = useAudioStudioStore((s) => s.setClipFades);

  const setTrackVolume = useAudioStudioStore((s) => s.setTrackVolume);
  const toggleTrackMute = useAudioStudioStore((s) => s.toggleTrackMute);
  const toggleTrackSolo = useAudioStudioStore((s) => s.toggleTrackSolo);
  const metronomeConfig = useAudioStudioStore((s) => s.metronomeConfig);

  // Estado local para arrastre de clip
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [initialOffsetSec, setInitialOffsetSec] = useState<number>(0);

  // Menú de fade para clip seleccionado
  const [activeFadeClipId, setActiveFadeClipId] = useState<string | null>(null);

  const duration = Math.max(10, totalDurationSec);
  const effectiveWidth = contentWidth || 1000;

  const trackKey = (track.type === 'music' || track.type === 'voice' || track.type === 'metronome')
    ? track.type
    : track.id;

  // Color de acento de la paleta vibrante de Carbon
  const accentColor = useMemo(() => {
    if (track.color) return track.color;
    switch (track.type) {
      case 'music':
        return '#00F0FF'; // Cyan eléctrico
      case 'voice':
        return '#D946EF'; // Magenta neón
      case 'metronome':
        return '#F59E0B'; // Ámbar cálido
      default:
        return '#10F49C'; // Verde menta
    }
  }, [track.color, track.type]);

  // Icono representativo por tipo de pista
  const TrackIcon = useMemo(() => {
    switch (track.type) {
      case 'music':
        return Music;
      case 'voice':
        return Mic;
      case 'metronome':
        return Timer;
      default:
        return Sliders;
    }
  }, [track.type]);

  // Colección de clips activa de la pista (con fallback para compatibilidad)
  const clips: AudioClip[] = useMemo(() => {
    if (track.clips && track.clips.length > 0) {
      return track.clips;
    }
    if (track.buffer) {
      return [{
        id: `clip-${track.id}-legacy`,
        name: track.fileName || track.name,
        buffer: track.buffer,
        startOffsetSec: 0,
        trimStartSec: track.trimStartSec || 0,
        trimEndSec: track.trimEndSec || track.buffer.duration,
        fadeInSec: track.fadeInSec || 0,
        fadeOutSec: track.fadeOutSec || 0,
      }];
    }
    return [];
  }, [track.clips, track.buffer, track.id, track.name, track.fileName, track.trimStartSec, track.trimEndSec, track.fadeInSec, track.fadeOutSec]);

  // ── RENDERIZADO DE ONDAS EN CANVAS 2D CON COLOR-CODING CARBON ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = contentWidth || canvas.clientWidth || 1000;
    const height = canvas.clientHeight || 112;

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // 1. Pista de Metrónomo Sintético: Pulsos rítmicos exactos
    if (track.type === 'metronome') {
      const bpm = metronomeConfig.bpm || 140;
      const beatsPerMeasure = metronomeConfig.beatsPerMeasure || 4;
      const secPerBeat = 60 / bpm;
      const totalBeats = Math.floor(duration / secPerBeat);

      for (let b = 0; b <= totalBeats; b++) {
        const beatSec = b * secPerBeat;
        const x = (beatSec / duration) * width;
        const isAccent = b % beatsPerMeasure === 0;

        ctx.strokeStyle = isAccent ? '#F59E0B' : 'rgba(245, 158, 11, 0.4)';
        ctx.lineWidth = isAccent ? 2 : 1;
        ctx.beginPath();
        const barHeight = isAccent ? height * 0.75 : height * 0.4;
        const yTop = (height - barHeight) / 2;
        ctx.moveTo(x, yTop);
        ctx.lineTo(x, yTop + barHeight);
        ctx.stroke();

        if (isAccent) {
          ctx.fillStyle = '#F59E0B';
          ctx.beginPath();
          ctx.arc(x, yTop, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      return;
    }

    // 2. Si no hay clips en la pista, dibuja una rejilla sutil de pista vacía
    if (clips.length === 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // 3. Renderizar cada clip individual con su forma de onda coloreada
    clips.forEach((clip) => {
      if (!clip.buffer) return;

      const clipStartPx = (clip.startOffsetSec / duration) * width;
      const clipDuration = Math.max(0.1, clip.trimEndSec - clip.trimStartSec);
      const clipWidthPx = (clipDuration / duration) * width;

      // Fondo translúcido del bloque de clip
      ctx.fillStyle = `${accentColor}14`; // ~8% de opacidad
      ctx.fillRect(clipStartPx, 4, clipWidthPx, height - 8);

      // Borde del clip
      ctx.strokeStyle = clip.id === selectedClipId ? '#FFFFFF' : `${accentColor}55`;
      ctx.lineWidth = clip.id === selectedClipId ? 2 : 1;
      ctx.strokeRect(clipStartPx, 4, clipWidthPx, height - 8);

      // Extraer picos de este clip
      const channelData = clip.buffer.getChannelData(0);
      const samplesCount = Math.max(20, Math.min(1000, Math.floor(clipWidthPx / 3)));
      const startSample = Math.floor((clip.trimStartSec / clip.buffer.duration) * channelData.length);
      const endSample = Math.floor((clip.trimEndSec / clip.buffer.duration) * channelData.length);
      const sampleRange = Math.max(1, endSample - startSample);
      const blockSize = Math.floor(sampleRange / samplesCount);

      const midY = height / 2;
      const barWidth = Math.max(1.5, clipWidthPx / samplesCount - 1);

      for (let i = 0; i < samplesCount; i++) {
        let maxVal = 0;
        const bStart = startSample + i * blockSize;
        const bEnd = Math.min(channelData.length, bStart + blockSize);
        for (let j = bStart; j < bEnd; j += 4) {
          const val = Math.abs(channelData[j]);
          if (val > maxVal) maxVal = val;
        }

        const peak = Math.max(0.04, Math.min(1.0, maxVal));
        const effectivePeak = peak * (track.muted ? 0.2 : track.volume);
        const barH = Math.max(2, effectivePeak * (height * 0.75));

        const barX = clipStartPx + (i / samplesCount) * clipWidthPx;

        ctx.fillStyle = track.muted ? 'rgba(148, 163, 184, 0.3)' : accentColor;
        ctx.fillRect(barX, midY - barH / 2, barWidth, barH);
      }

      // Sombra visual de Fade In en el clip
      if (clip.fadeInSec > 0) {
        const fadeW = Math.min(clipWidthPx, (clip.fadeInSec / duration) * width);
        const grad = ctx.createLinearGradient(clipStartPx, 0, clipStartPx + fadeW, 0);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(clipStartPx, 4, fadeW, height - 8);
      }

      // Sombra visual de Fade Out en el clip
      if (clip.fadeOutSec > 0) {
        const fadeW = Math.min(clipWidthPx, (clip.fadeOutSec / duration) * width);
        const startFadeX = clipStartPx + clipWidthPx - fadeW;
        const grad = ctx.createLinearGradient(startFadeX, 0, clipStartPx + clipWidthPx, 0);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
        ctx.fillStyle = grad;
        ctx.fillRect(startFadeX, 4, fadeW, height - 8);
      }
    });

    ctx.restore();
  }, [
    clips,
    track.type,
    track.volume,
    track.muted,
    duration,
    metronomeConfig,
    accentColor,
    contentWidth,
    selectedClipId,
  ]);

  // ── MANEJO DE INTERACCIÓN TÁCTIL Y TIJERA ──
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !onSeek) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = contentWidth || rect.width;
    const px = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, px / w));
    const clickedSec = ratio * duration;

    // Si la tijera está activa, intentar dividir el clip que coincide con la posición
    if (activeTool === 'split') {
      const hitClip = clips.find((c) => {
        const cEnd = c.startOffsetSec + (c.trimEndSec - c.trimStartSec);
        return clickedSec >= c.startOffsetSec && clickedSec <= cEnd;
      });

      if (hitClip) {
        splitClip(trackKey, hitClip.id, clickedSec);
        return;
      }
    }

    onSeek(clickedSec);
  };

  // Arrastre horizontal de clip con puntero táctil / ratón
  const handleClipPointerDown = (clip: AudioClip, e: React.PointerEvent) => {
    e.stopPropagation();

    if (activeTool === 'split') {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, px / (contentWidth || rect.width)));
      const clickedSec = ratio * duration;
      splitClip(trackKey, clip.id, clickedSec);
      return;
    }

    if (activeTool === 'delete') {
      deleteClip(trackKey, clip.id);
      return;
    }

    // Modo Selección: Iniciar arrastre horizontal
    setSelectedClipId(clip.id);
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    setDraggingClipId(clip.id);
    setDragStartX(e.clientX);
    setInitialOffsetSec(clip.startOffsetSec);
  };

  const handleClipPointerMove = (clip: AudioClip, e: React.PointerEvent) => {
    if (draggingClipId !== clip.id || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = contentWidth || rect.width;
    const deltaPx = e.clientX - dragStartX;
    const deltaSec = (deltaPx / w) * duration;
    const newOffset = Math.max(0, initialOffsetSec + deltaSec);
    moveClip(trackKey, clip.id, newOffset);
  };

  const handleClipPointerUp = (clip: AudioClip, e: React.PointerEvent) => {
    if (draggingClipId === clip.id) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setDraggingClipId(null);
    }
  };

  const panelWidth = widthOffset !== undefined ? widthOffset : 240;

  return (
    <div
      style={{ width: contentWidth ? `${contentWidth + panelWidth}px` : '100%' }}
      className="h-28 flex items-stretch border-b border-white/5 bg-[#090D16] hover:bg-[#0c1220] transition-colors select-none"
    >
      {/* ── CABECERA DE LA PISTA (CSS GRID & CARBON ACCESIBLE 44x44px) ── */}
      <div
        style={{
          backgroundColor: `${accentColor}0D`,
          borderColor: `${accentColor}33`,
        }}
        className="w-20 sm:w-60 shrink-0 p-2 sm:p-2.5 border-r border-white/10 flex flex-col justify-between sticky left-0 z-30 shadow-md backdrop-blur-md"
      >
        {/* Fila 1: Grid CSS de Encabezado [auto_1fr_auto] */}
        <div className="grid grid-cols-[auto_1fr_auto] gap-1.5 sm:gap-2 items-center min-w-0">
          {/* Columna 1: Indicador de Color y Tipo */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="w-3 h-3 rounded-full shrink-0 shadow-sm"
              style={{
                backgroundColor: accentColor,
                boxShadow: `0 0 8px ${accentColor}`,
              }}
            />
            <TrackIcon className="w-4 h-4 shrink-0 text-slate-300" />
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                title="Eliminar esta pista"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Columna 2: Nombre de pista y estado con numeración accesible */}
          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-1.5 min-w-0">
              {trackNumber !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-black shrink-0 ${
                    isMasterTrack
                      ? 'bg-cyan text-slate-950 shadow-glow-cyan'
                      : 'bg-white/10 text-slate-200 border border-white/10'
                  }`}
                >
                  Pista {trackNumber}
                </span>
              )}
              <span className="text-xs font-bold text-slate-100 truncate" title={track.name}>
                {isMasterTrack ? `${track.name} (Principal)` : track.name}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 truncate hidden sm:block">
              {track.fileName || (track.type === 'metronome' ? `${metronomeConfig.bpm} BPM` : 'Sin audio')}
            </span>
          </div>

          {/* Columna 3: Subir archivo */}
          <div className="shrink-0">
            {track.type !== 'metronome' && (
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  title="Cargar archivo de audio a esta pista"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && onUploadFile) onUploadFile(file);
                  }}
                  className="hidden"
                />
              </div>
            )}
          </div>
        </div>

        {/* Fila 2: Botones de Mezcla Mute / Solo / Volumen (Áreas táctiles >= 44x44px) */}
        <div className="flex items-center gap-1.5 pt-1">
          {/* Botón Mute [M] accesible */}
          <button
            type="button"
            onClick={() => toggleTrackMute(trackKey)}
            className={[
              'min-w-[44px] min-h-[44px] p-2 rounded-xl text-xs font-black tracking-wider transition-all flex items-center justify-center interactive-tap',
              track.muted
                ? 'bg-red-500 text-white shadow-glow-red font-black'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10',
            ].join(' ')}
            title="Silenciar Pista (Mute)"
          >
            M
          </button>

          {/* Botón Solo [S] accesible */}
          <button
            type="button"
            onClick={() => toggleTrackSolo(trackKey)}
            className={[
              'min-w-[44px] min-h-[44px] p-2 rounded-xl text-xs font-black tracking-wider transition-all flex items-center justify-center interactive-tap',
              track.solo
                ? 'bg-amber-400 text-slate-950 font-black shadow-glow-amber'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10',
            ].join(' ')}
            title="Pista en Solitario (Solo)"
          >
            S
          </button>

          {/* Slider de Volumen (Desktop) */}
          <div className="hidden sm:flex flex-1 items-center gap-1.5 min-w-0 pl-1">
            <Volume2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={track.volume}
              onChange={(e) => setTrackVolume(trackKey, parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan"
              title={`Volumen: ${Math.round(track.volume * 100)}%`}
            />
            <span className="text-[10px] font-mono text-slate-400 w-7 text-right shrink-0">
              {Math.round(track.volume * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* ── ÁREA DE ONDA SONORA & CLIPS MULTIPISTA ── */}
      <div
        ref={containerRef}
        onClick={handleTimelineClick}
        style={{
          width: contentWidth ? `${contentWidth}px` : undefined,
          minWidth: contentWidth ? `${contentWidth}px` : undefined,
          cursor: activeTool === 'split' ? 'crosshair' : activeTool === 'delete' ? 'pointer' : 'default',
        }}
        className="flex-1 relative bg-[#050811] overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          style={{
            width: contentWidth ? `${contentWidth}px` : '100%',
            minWidth: contentWidth ? `${contentWidth}px` : undefined,
            height: '100%',
          }}
          className="block pointer-events-none"
        />

        {/* ── OVERLAY INTERACTIVO DE CLIPS CORTABLES Y ARRASTRABLES ── */}
        {clips.map((clip) => {
          const clipStartPx = (clip.startOffsetSec / duration) * effectiveWidth;
          const clipDuration = Math.max(0.1, clip.trimEndSec - clip.trimStartSec);
          const clipWidthPx = (clipDuration / duration) * effectiveWidth;
          const isSelected = selectedClipId === clip.id;

          return (
            <div
              key={clip.id}
              onPointerDown={(e) => handleClipPointerDown(clip, e)}
              onPointerMove={(e) => handleClipPointerMove(clip, e)}
              onPointerUp={(e) => handleClipPointerUp(clip, e)}
              style={{
                left: `${clipStartPx}px`,
                width: `${clipWidthPx}px`,
              }}
              className={[
                'absolute top-1 bottom-1 rounded-xl transition-shadow group flex flex-col justify-between p-1 select-none',
                isSelected
                  ? 'ring-2 ring-white shadow-xl z-10'
                  : 'hover:ring-1 hover:ring-white/40',
                activeTool === 'split'
                  ? 'cursor-crosshair'
                  : activeTool === 'delete'
                    ? 'cursor-pointer hover:bg-red-500/20'
                    : 'cursor-grab active:cursor-grabbing',
              ].join(' ')}
            >
              {/* Encabezado del clip con nombre e icono de arrastre */}
              <div className="flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-1 bg-slate-950/80 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-200 truncate max-w-[85%] border border-white/10">
                  <GripHorizontal className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                  <span className="truncate">{clip.name}</span>
                </div>

                {/* Botón rápido de fundidos en el clip */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveFadeClipId((prev) => (prev === clip.id ? null : clip.id));
                  }}
                  className="pointer-events-auto p-1 rounded bg-slate-950/70 hover:bg-white/20 text-slate-300 transition-all opacity-0 group-hover:opacity-100 min-w-[28px] min-h-[28px] flex items-center justify-center"
                  title="Configurar Fundidos Fade In / Fade Out"
                >
                  <Sparkles className="w-3 h-3 text-cyan" />
                </button>
              </div>

              {/* Panel flotante de configuración de fundidos del clip */}
              {activeFadeClipId === clip.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-8 right-2 p-3 rounded-2xl bg-slate-900 border border-white/20 shadow-2xl z-30 space-y-2 w-48 text-xs pointer-events-auto"
                >
                  <div className="flex justify-between items-center text-[11px] text-slate-300 font-bold border-b border-white/10 pb-1">
                    <span>Fundidos de Clip</span>
                    <button
                      type="button"
                      onClick={() => setActiveFadeClipId(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-300 mb-1">
                      <span>Fade In</span>
                      <span className="font-mono text-cyan">{clip.fadeInSec}s</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="6"
                      step="0.5"
                      value={clip.fadeInSec}
                      onChange={(e) => setClipFades(trackKey, clip.id, parseFloat(e.target.value), clip.fadeOutSec)}
                      className="w-full h-1.5 bg-slate-800 rounded appearance-none accent-cyan"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-300 mb-1">
                      <span>Fade Out</span>
                      <span className="font-mono text-cyan">{clip.fadeOutSec}s</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="6"
                      step="0.5"
                      value={clip.fadeOutSec}
                      onChange={(e) => setClipFades(trackKey, clip.id, clip.fadeInSec, parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-800 rounded appearance-none accent-cyan"
                    />
                  </div>
                </div>
              )}

              {/* Indicador de posición y duración */}
              <div className="text-[9px] font-mono text-slate-400 self-end bg-slate-950/60 px-1 rounded pointer-events-none">
                {clip.startOffsetSec.toFixed(1)}s - {(clip.startOffsetSec + clipDuration).toFixed(1)}s
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
