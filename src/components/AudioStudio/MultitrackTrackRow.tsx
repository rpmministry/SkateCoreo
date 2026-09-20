import React, { useRef, useEffect, useState, useMemo } from 'react';
import { 
  Music, 
  Mic, 
  Timer, 
  Volume2, 
  Upload, 
  Sparkles,
  Sliders,
  FileAudio
} from 'lucide-react';
import { AudioStudioTrack } from '../../types/audioStudio';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';

interface MultitrackTrackRowProps {
  track: AudioStudioTrack;
  totalDurationSec: number;
  currentTimeSec: number;
  onUploadFile?: (file: File) => void;
  onSeek?: (sec: number) => void;
}

export const MultitrackTrackRow: React.FC<MultitrackTrackRowProps> = ({
  track,
  totalDurationSec,
  currentTimeSec,
  onUploadFile,
  onSeek,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const setTrackVolume = useAudioStudioStore((s) => s.setTrackVolume);
  const toggleTrackMute = useAudioStudioStore((s) => s.toggleTrackMute);
  const toggleTrackSolo = useAudioStudioStore((s) => s.toggleTrackSolo);
  const setTrackFades = useAudioStudioStore((s) => s.setTrackFades);
  const metronomeConfig = useAudioStudioStore((s) => s.metronomeConfig);

  const [showFadeMenu, setShowFadeMenu] = useState(false);

  const duration = Math.max(10, totalDurationSec);

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

  // Color de resalte temático por pista
  const accentColor = useMemo(() => {
    switch (track.type) {
      case 'music':
        return '#00F0FF'; // Cyan eléctrico
      case 'voice':
        return '#10F49C'; // Menta Neón
      case 'metronome':
        return '#F59E0B'; // Ámbar
      default:
        return '#38BDF8';
    }
  }, [track.type]);

  // Extraer picos de audio de forma eficiente a partir del AudioBuffer
  const wavePeaks = useMemo(() => {
    if (!track.buffer) return [];
    const channelData = track.buffer.getChannelData(0);
    const SAMPLES = 300;
    const blockSize = Math.floor(channelData.length / SAMPLES);
    const peaks: number[] = [];

    for (let i = 0; i < SAMPLES; i++) {
      let maxVal = 0;
      const start = i * blockSize;
      const end = Math.min(channelData.length, start + blockSize);
      for (let j = start; j < end; j += 4) { // Sub-sample por 4 para máxima velocidad
        const val = Math.abs(channelData[j]);
        if (val > maxVal) maxVal = val;
      }
      peaks.push(Math.max(0.04, Math.min(1.0, maxVal)));
    }
    return peaks;
  }, [track.buffer]);

  // Renderizado de la forma de onda en Canvas 2D
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Si es pista de Metrónomo Sintético, dibujamos los pulsos rítmicos exactos
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

    // Si no hay buffer cargado, dibuja una rejilla sutil de pista vacía
    if (!track.buffer || wavePeaks.length === 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Dibujar forma de onda estéreo centrada
    const barWidth = Math.max(1.5, width / wavePeaks.length - 1);
    const midY = height / 2;

    for (let i = 0; i < wavePeaks.length; i++) {
      const x = (i / wavePeaks.length) * width;
      const peakVal = wavePeaks[i] * (track.muted ? 0.2 : track.volume);
      const barH = Math.max(2, peakVal * (height * 0.85));

      // Gradiente suave de la onda
      ctx.fillStyle = track.muted
        ? 'rgba(148, 163, 184, 0.3)'
        : accentColor;

      ctx.fillRect(x, midY - barH / 2, barWidth, barH);
    }

    // Dibujar superposición de Fade In si existe
    if (track.fadeInSec > 0) {
      const fadeW = (track.fadeInSec / duration) * width;
      const grad = ctx.createLinearGradient(0, 0, fadeW, 0);
      grad.addColorStop(0, 'rgba(0, 240, 255, 0.35)');
      grad.addColorStop(1, 'rgba(0, 240, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, fadeW, height);
    }

    // Dibujar superposición de Fade Out si existe
    if (track.fadeOutSec > 0) {
      const fadeW = (track.fadeOutSec / duration) * width;
      const startX = width - fadeW;
      const grad = ctx.createLinearGradient(startX, 0, width, 0);
      grad.addColorStop(0, 'rgba(0, 240, 255, 0)');
      grad.addColorStop(1, 'rgba(0, 240, 255, 0.35)');
      ctx.fillStyle = grad;
      ctx.fillRect(startX, 0, fadeW, height);
    }

    ctx.restore();
  }, [
    wavePeaks, 
    track.buffer, 
    track.type, 
    track.volume, 
    track.muted, 
    track.fadeInSec, 
    track.fadeOutSec, 
    duration, 
    metronomeConfig, 
    accentColor
  ]);

  const playheadPercent = (currentTimeSec / duration) * 100;

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !onSeek) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div className="h-28 w-full flex items-stretch border-b border-white/5 bg-[#090D16] hover:bg-[#0c1220] transition-colors select-none">
      {/* ── PANEL DE CONTROL IZQUIERDO (MUTE, SOLO, VOLUMEN) ── */}
      <div className="w-56 shrink-0 p-3 bg-slate-950/80 border-r border-white/10 flex flex-col justify-between">
        {/* Cabecera de la Pista */}
        <div className="flex items-center justify-between min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
              style={{ backgroundColor: accentColor }}
            />
            <TrackIcon className="w-4 h-4 shrink-0 text-slate-300" />
            <span className="text-xs font-bold text-slate-200 truncate" title={track.name}>
              {track.name}
            </span>
          </div>

          {/* Subir archivo de audio en Pista Música o Voz */}
          {track.type !== 'metronome' && (
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Cargar archivo de audio"
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

        {/* Info archivo o badges */}
        <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
          {track.fileName ? (
            <>
              <FileAudio className="w-3 h-3 text-cyan shrink-0" />
              <span className="truncate">{track.fileName}</span>
            </>
          ) : track.type === 'metronome' ? (
            <span className="text-amber-400/90 font-mono font-bold">
              {metronomeConfig.bpm} BPM · {metronomeConfig.beatsPerMeasure}/4
            </span>
          ) : (
            <span className="text-slate-500 italic">Sin audio cargado</span>
          )}
        </div>

        {/* Controles de Mezcla: Mute, Solo y Slider de Volumen */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-1.5">
            {/* Botón Mute [M] */}
            <button
              type="button"
              onClick={() => toggleTrackMute(track.type)}
              className={[
                'w-7 h-6 rounded text-[11px] font-black tracking-wider transition-all',
                track.muted
                  ? 'bg-red-500 text-white shadow-glow-red font-black'
                  : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10',
              ].join(' ')}
              title="Silenciar Pista (Mute)"
            >
              M
            </button>

            {/* Botón Solo [S] */}
            <button
              type="button"
              onClick={() => toggleTrackSolo(track.type)}
              className={[
                'w-7 h-6 rounded text-[11px] font-black tracking-wider transition-all',
                track.solo
                  ? 'bg-amber-400 text-slate-950 font-black shadow-glow-amber'
                  : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10',
              ].join(' ')}
              title="Pista en Solitario (Solo)"
            >
              S
            </button>

            {/* Slider de Volumen Permanente */}
            <div className="flex-1 flex items-center gap-1.5 min-w-0 pl-1">
              <Volume2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={track.volume}
                onChange={(e) => setTrackVolume(track.type, parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan"
                title={`Volumen: ${Math.round(track.volume * 100)}%`}
              />
              <span className="text-[10px] font-mono text-slate-400 w-7 text-right shrink-0">
                {Math.round(track.volume * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── ÁREA DE ONDA SONORA / TIMELINE DE LA PISTA ── */}
      <div
        ref={containerRef}
        onClick={handleTimelineClick}
        className="flex-1 relative cursor-pointer bg-[#050811] overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
        />

        {/* Aguja del Playhead Global */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-amber-400 shadow-glow-amber pointer-events-none z-20"
          style={{ left: `${playheadPercent}%` }}
        />

        {/* Tiradores Visuales de Fade In / Fade Out */}
        {track.type !== 'metronome' && (
          <div className="absolute top-1 right-2 z-10 flex items-center gap-1 text-[10px]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowFadeMenu((v) => !v);
              }}
              className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-medium border border-white/10 flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3 text-cyan" />
              <span>Fundidos</span>
            </button>

            {showFadeMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute top-7 right-0 p-3 rounded-2xl bg-slate-900 border border-white/15 shadow-2xl z-30 space-y-2 w-48 text-xs"
              >
                <div>
                  <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                    <span>Fade In</span>
                    <span className="font-mono text-cyan">{track.fadeInSec}s</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="6"
                    step="0.5"
                    value={track.fadeInSec}
                    onChange={(e) => setTrackFades(track.type as 'music' | 'voice', parseFloat(e.target.value), track.fadeOutSec)}
                    className="w-full h-1.5 bg-slate-800 rounded appearance-none accent-cyan"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                    <span>Fade Out</span>
                    <span className="font-mono text-cyan">{track.fadeOutSec}s</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="6"
                    step="0.5"
                    value={track.fadeOutSec}
                    onChange={(e) => setTrackFades(track.type as 'music' | 'voice', track.fadeInSec, parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded appearance-none accent-cyan"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
