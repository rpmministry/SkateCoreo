import React, { useEffect, useState, useRef } from 'react';
import {
  Play,
  Pause,
  Square,
  ArrowRight,
  Sparkles,
  Upload,
  MapPin,
  Trash2,
  Activity,
  Layers,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { audioEngine } from '../../services/audioEngine';
import { AudioTimeRuler } from './AudioTimeRuler';
import { MultitrackTrackRow } from './MultitrackTrackRow';

interface AudioStudioViewProps {
  onExportToRink?: () => void;
  onBackToRink?: () => void;
}

const fmtTimeWithMs = (sec: number): string => {
  const s = Math.max(0, sec);
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

export const AudioStudioView: React.FC<AudioStudioViewProps> = ({
  onExportToRink,
  onBackToRink,
}) => {
  const tracks = useAudioStudioStore((s) => s.tracks);
  const audioNodes = useAudioStudioStore((s) => s.audioNodes);
  const currentTimeSec = useAudioStudioStore((s) => s.currentTimeSec);
  const totalDurationSec = useAudioStudioStore((s) => s.totalDurationSec);
  const isPlaying = useAudioStudioStore((s) => s.isPlaying);
  const metronomeConfig = useAudioStudioStore((s) => s.metronomeConfig);
  const isAnalyzingBpm = useAudioStudioStore((s) => s.isAnalyzingBpm);

  const setCurrentTimeSec = useAudioStudioStore((s) => s.setCurrentTimeSec);
  const setIsPlaying = useAudioStudioStore((s) => s.setIsPlaying);
  const setTrackBuffer = useAudioStudioStore((s) => s.setTrackBuffer);
  const setMetronomeConfig = useAudioStudioStore((s) => s.setMetronomeConfig);
  const analyzeBpm = useAudioStudioStore((s) => s.analyzeBpm);
  const clearTimeNodes = useAudioStudioStore((s) => s.clearTimeNodes);
  const deleteTimeNode = useAudioStudioStore((s) => s.deleteTimeNode);
  const updateTimeNode = useAudioStudioStore((s) => s.updateTimeNode);
  const sendMixToChoreo = useAudioStudioStore((s) => s.sendMixToChoreo);

  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sincronizar tiempo de AudioEngine con el store de AudioStudio
  useEffect(() => {
    const unsubTime = audioEngine.onTimeUpdate((ms) => {
      setCurrentTimeSec(ms / 1000);
    });

    const unsubState = audioEngine.onStateChange((state) => {
      setIsPlaying(state.isPlaying);
    });

    return () => {
      unsubTime();
      unsubState();
    };
  }, [setCurrentTimeSec, setIsPlaying]);

  // Si hay buffer de música cargado en AudioEngine y no en el store, sincronizarlo
  useEffect(() => {
    const engineBuffer = (audioEngine as any).audioBuffer;
    if (engineBuffer && !tracks.music.buffer) {
      setTrackBuffer('music', engineBuffer, (audioEngine as any).fileName || 'Musica.wav');
    }
  }, [tracks.music.buffer, setTrackBuffer]);

  // Manejo de reproducción / pausa
  const handleTogglePlay = () => {
    if (isPlaying) {
      audioEngine.pause();
    } else {
      // Si no hay buffer cargado, generar o asegurar el demo
      if (!tracks.music.buffer) {
        audioEngine.ensureAudioBuffer();
        const buf = (audioEngine as any).audioBuffer;
        if (buf) {
          setTrackBuffer('music', buf, 'Pista_Demo.wav');
        }
      }
      audioEngine.play(currentTimeSec * 1000);
    }
  };

  const handleStop = () => {
    audioEngine.stop();
    setCurrentTimeSec(0);
  };

  const handleSeek = (sec: number) => {
    const clamped = Math.max(0, Math.min(totalDurationSec, sec));
    setCurrentTimeSec(clamped);
    audioEngine.seek(clamped * 1000);
  };

  // Carga de archivo de audio
  const handleFileUpload = async (file: File, trackKey: 'music' | 'voice' = 'music') => {
    try {
      audioEngine.initAudioContext();
      const ctx = (audioEngine as any).ctx as AudioContext;
      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

      setTrackBuffer(trackKey, decodedBuffer, file.name);

      if (trackKey === 'music') {
        audioEngine.setAudioBuffer(decodedBuffer, file.name);
        // Analizar BPM automáticamente al cargar nueva pista musical
        void analyzeBpm();
      }
    } catch (err: any) {
      alert('Error al procesar el archivo de audio: ' + (err?.message || err));
    }
  };

  // Detección manual de BPM
  const handleDetectBpm = async () => {
    if (!tracks.music.buffer) {
      alert('Carga primero una pista musical para detectar su tempo.');
      return;
    }
    const bpm = await analyzeBpm();
    if (bpm) {
      setExportNotice(`Tempo detectado: ${bpm} BPM. Metrónomo sincronizado.`);
      setTimeout(() => setExportNotice(null), 4000);
    }
  };

  // Exportar mezcla y nodos a la Pista 2D
  const handleExportToChoreo = () => {
    if (audioNodes.length === 0) {
      if (!window.confirm('No has creado ningún marcador temporal en la regla. ¿Deseas exportar la música a la Pista 2D sin nodos de audio?')) {
        return;
      }
    }

    const result = sendMixToChoreo();
    if (result.success) {
      setExportNotice(`¡Éxito! ${result.nodes.length} nodos exportados a la Bandeja de la Pista 2D.`);
      setTimeout(() => {
        setExportNotice(null);
        if (onExportToRink) onExportToRink();
        else if (onBackToRink) onBackToRink();
      }, 600);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-[#070A12] text-slate-100 select-none overflow-hidden font-sans">
      {/* ═══════════════════════════════════════════════
          HEADER: Barra de Transporte y Navegación DAW Lite
          ═══════════════════════════════════════════════ */}
      <header className="h-14 shrink-0 bg-[#0E1322] border-b border-white/10 px-4 flex items-center justify-between z-20">
        {/* Izquierda: Volver a la Pista + Título */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToRink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
            title="Regresar a la vista de la pista 2D"
          >
            <span>← Pista 2D</span>
          </button>

          <div className="flex items-center gap-2 border-l border-white/10 pl-3">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan shadow-glow-cyan" />
            <span className="text-sm font-black tracking-wide text-white uppercase">Estudio de Audio</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan/10 text-cyan border border-cyan/25 font-bold uppercase">
              DAW Lite
            </span>
          </div>
        </div>

        {/* Centro: Controles de Transporte Master (Play / Pause / Stop / Tiempo) */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1.5 rounded-2xl border border-white/10 shadow-soft-elevation">
            <button
              type="button"
              onClick={handleTogglePlay}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                isPlaying
                  ? 'bg-coral text-white shadow-glow-coral'
                  : 'bg-cyan text-slate-950 hover:bg-cyan/90 shadow-glow-cyan font-black'
              }`}
              title={isPlaying ? 'Pausar' : 'Reproducir'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current stroke-none" />
              ) : (
                <Play className="w-4 h-4 fill-current stroke-none ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={handleStop}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
              title="Detener y volver al inicio"
            >
              <Square className="w-3.5 h-3.5 fill-current stroke-none" />
            </button>

            <div className="font-mono text-xs px-2 text-slate-300 flex items-center gap-1">
              <span className="text-cyan font-bold tracking-wider">{fmtTimeWithMs(currentTimeSec)}</span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-400">{fmtTimeWithMs(totalDurationSec)}</span>
            </div>
          </div>

          {/* Sección de Sincronización BPM y Metrónomo */}
          <div className="hidden md:flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-2xl border border-white/10 text-xs">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400 font-medium">BPM:</span>
              <input
                type="number"
                min="50"
                max="240"
                value={metronomeConfig.bpm}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 40 && val <= 260) {
                    setMetronomeConfig({ bpm: val });
                  }
                }}
                className="w-14 bg-slate-900 border border-white/10 rounded px-1.5 py-0.5 text-amber-400 font-mono font-bold text-center"
              />
            </div>

            {/* Selector de Compás */}
            <select
              value={metronomeConfig.beatsPerMeasure}
              onChange={(e) => setMetronomeConfig({ beatsPerMeasure: parseInt(e.target.value, 10) as 1 | 2 | 3 | 4 | 6 })}
              className="bg-slate-900 border border-white/10 text-slate-300 text-xs rounded px-2 py-0.5 font-mono cursor-pointer"
            >
              <option value="1">1/1</option>
              <option value="2">2/4</option>
              <option value="3">3/4 (Vals)</option>
              <option value="4">4/4</option>
              <option value="6">6/8</option>
            </select>

            {/* Botón Detección Inteligente de BPM */}
            <button
              type="button"
              onClick={handleDetectBpm}
              disabled={isAnalyzingBpm || !tracks.music.buffer}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-all disabled:opacity-30 disabled:pointer-events-none"
              title="Detecta automáticamente el tempo de la pista de música"
            >
              <Sparkles className={`w-3 h-3 ${isAnalyzingBpm ? 'animate-spin' : ''}`} />
              <span>{isAnalyzingBpm ? 'Analizando...' : 'Auto-Sync BPM'}</span>
            </button>
          </div>
        </div>

        {/* Derecha: CTA Exportar a Pista 2D */}
        <div className="flex items-center gap-2">
          {/* Cargar Música */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
            title="Cargar archivo de música"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cargar Audio</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file, 'music');
            }}
          />

          {/* CTA Exportar a Pista 2D */}
          <button
            type="button"
            onClick={handleExportToChoreo}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-black bg-cyan text-slate-950 hover:bg-cyan/90 border border-white/20 shadow-glow-cyan transition-all interactive-tap"
            title="Exporta los marcadores temporales a la bandeja de colocación en la Pista 2D"
          >
            <span>Exportar a Pista 2D</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </header>

      {/* Banner de Notificación de Éxito */}
      {exportNotice && (
        <div className="bg-cyan/20 border-b border-cyan/40 px-4 py-2 flex items-center justify-between text-xs text-cyan font-bold animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan" />
            <span>{exportNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            className="text-cyan/70 hover:text-cyan text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          BODY PRINCIPAL: Multitrack Workspace & Timeline
          ═══════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Regla Graduada de Tiempo con Marcadores */}
        <div className="shrink-0">
          <AudioTimeRuler
            totalDurationSec={totalDurationSec}
            currentTimeSec={currentTimeSec}
            onSeek={handleSeek}
          />
        </div>

        {/* Pistas Multitrack (Música, Voz, Metrónomo) */}
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/5 bg-[#060911]">
          {/* Pista 1: Música Principal */}
          <MultitrackTrackRow
            track={tracks.music}
            totalDurationSec={totalDurationSec}
            currentTimeSec={currentTimeSec}
            onUploadFile={(file) => handleFileUpload(file, 'music')}
            onSeek={handleSeek}
          />

          {/* Pista 2: Voz y Guías Técnicas */}
          <MultitrackTrackRow
            track={tracks.voice}
            totalDurationSec={totalDurationSec}
            currentTimeSec={currentTimeSec}
            onUploadFile={(file) => handleFileUpload(file, 'voice')}
            onSeek={handleSeek}
          />

          {/* Pista 3: Metrónomo Sintético */}
          <MultitrackTrackRow
            track={tracks.metronome}
            totalDurationSec={totalDurationSec}
            currentTimeSec={currentTimeSec}
            onSeek={handleSeek}
          />
        </div>

        {/* ═══════════════════════════════════════════════
            PANEL INFERIOR: Lista y Gestión de Nodos Temporales
            ═══════════════════════════════════════════════ */}
        <div className="h-44 shrink-0 bg-[#0A0E1A] border-t border-white/10 flex flex-col">
          {/* Header del panel de nodos */}
          <div className="h-8 px-4 bg-slate-950/60 border-b border-white/5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-cyan" />
              <span className="font-bold text-slate-200">Lista de Nodos Temporales para la Coreografía</span>
              <span className="text-[11px] text-slate-400">
                ({audioNodes.length} marcas listas para ubicar en la Pista 2D)
              </span>
            </div>

            {audioNodes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('¿Eliminar todos los marcadores temporales creados?')) {
                    clearTimeNodes();
                  }
                }}
                className="flex items-center gap-1 text-[11px] text-red-400/80 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Limpiar todos</span>
              </button>
            )}
          </div>

          {/* Lista scrolleable de nodos */}
          <div className="flex-1 p-3 overflow-x-auto overflow-y-hidden flex items-center gap-3">
            {audioNodes.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-xs gap-1.5 border border-dashed border-white/10 rounded-2xl">
                <MapPin className="w-5 h-5 text-slate-600" />
                <span>Aún no hay marcadores temporales.</span>
                <span className="text-[11px] text-slate-600">
                  Haz <span className="text-cyan font-bold">doble clic</span> o <span className="text-cyan font-bold">Shift + Clic</span> en la regla de tiempo para crear el <span className="text-slate-300 font-semibold">Nodo 1</span>.
                </span>
              </div>
            ) : (
              audioNodes.map((node) => {
                const mins = Math.floor(node.timestampSec / 60);
                const secs = (node.timestampSec % 60).toFixed(2);
                const formattedTime = `${mins}:${node.timestampSec % 60 < 10 ? '0' : ''}${secs}`;

                return (
                  <div
                    key={node.id}
                    className="w-48 shrink-0 h-28 bg-[#0D1424] hover:bg-[#11192e] border border-cyan/20 hover:border-cyan/50 rounded-2xl p-2.5 flex flex-col justify-between transition-all shadow-md group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-cyan text-slate-950 font-black text-xs flex items-center justify-center">
                          {node.numeroSecuencial}
                        </span>
                        <span className="text-xs font-bold text-slate-200">
                          Nodo {node.numeroSecuencial}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteTimeNode(node.id)}
                        className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors opacity-0 group-hover:opacity-100"
                        title="Eliminar este nodo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Tiempo exacto */}
                    <div className="flex items-center gap-1 text-[11px] font-mono text-cyan bg-cyan/10 px-2 py-0.5 rounded-lg border border-cyan/20 w-fit">
                      <Clock className="w-3 h-3" />
                      <span>{formattedTime}s</span>
                    </div>

                    {/* Etiqueta opcional */}
                    <input
                      type="text"
                      placeholder="Etiqueta (ej: Salto Axel)"
                      value={node.label || ''}
                      onChange={(e) => updateTimeNode(node.id, node.timestampSec, e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan"
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
