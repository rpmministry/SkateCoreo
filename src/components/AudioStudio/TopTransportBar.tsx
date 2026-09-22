import React, { useState, useRef } from 'react';
import { 
  ArrowLeft, 
  Home,
  Settings, 
  Upload, 
  Send, 
  FileText, 
  Layers, 
  Bell, 
  Mic, 
  Magnet,
  X
} from 'lucide-react';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { ACCEPTED_AUDIO_FORMATS } from '../../constants/mediaFormats';
import { usePressAction } from '../../hooks/usePressAction';
import { useIosFileCapture } from '../../hooks/useIosFileCapture';

interface TopTransportBarProps {
  onBackToRink?: () => void;
  onGoHome?: () => void;
  onExportToRink?: () => void;
  onImportGlobalAudio?: (file: File) => void;
  isExporting?: boolean;
}

const fmtTimeWithMs = (sec: number): string => {
  const s = Math.max(0, sec);
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
};

export const TopTransportBar: React.FC<TopTransportBarProps> = ({
  onBackToRink,
  onGoHome,
  onExportToRink,
  onImportGlobalAudio,
  isExporting = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentTimeSec = useAudioStudioStore((s) => s.currentTimeSec);

  const globalControls = useAudioStudioStore((s) => s.globalControls);
  // Activación táctil inmediata y fiable en móvil/tablet
  const press = usePressAction();
  const setGlobalBpm = useAudioStudioStore((s) => s.setGlobalBpm);
  const toggleMetronomeMute = useAudioStudioStore((s) => s.toggleMetronomeMute);
  const setMetronomeVolume = useAudioStudioStore((s) => s.setMetronomeVolume);
  const toggleVoiceGuideMute = useAudioStudioStore((s) => s.toggleVoiceGuideMute);
  const setVoiceGuideVolume = useAudioStudioStore((s) => s.setVoiceGuideVolume);

  const analyzeBpm = useAudioStudioStore((s) => s.analyzeBpm);
  const isAnalyzingBpm = useAudioStudioStore((s) => s.isAnalyzingBpm);

  const [activeTab, setActiveTab] = useState<'arrangement' | 'notes' | 'settings'>('arrangement');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notesText, setNotesText] = useState('');
  const snapEnabled = useAudioStudioStore((s) => s.snapEnabled);
  const setSnapEnabled = useAudioStudioStore((s) => s.setSnapEnabled);

  // Tap tempo
  const tapTimesRef = useRef<number[]>([]);
  const handleTapTempo = () => {
    const now = performance.now();
    const times = tapTimesRef.current.filter((t) => now - t < 2500);
    times.push(now);
    tapTimesRef.current = times;

    if (times.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < times.length; i++) {
        intervals.push(times[i] - times[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avgInterval);
      if (bpm >= 40 && bpm <= 240) {
        setGlobalBpm(bpm);
      }
    }
  };

  const { handleChange: handleFileChange } = useIosFileCapture(fileInputRef, (file) => {
    if (onImportGlobalAudio) onImportGlobalAudio(file);
  });

  return (
    <>
      <header 
        className="relative z-40 shrink-0 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-2 py-1.5 bg-black border-b border-white/10 text-white select-none pt-safe px-safe sm:flex-nowrap sm:justify-between sm:gap-4 sm:px-4 sm:py-2"
      >
        {/* ── IZQUIERDA: Inicio + Regreso a Pista (destinos distintos, sin duplicar) ── */}
        <div className="flex items-center gap-2 shrink-0">
          {onGoHome && (
            <button
              type="button"
              onClick={onGoHome}
              className="press flex h-11 w-11 min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-slate-200 hover:bg-white/20 hover:text-white"
              title="Ir al Inicio"
              aria-label="Ir al Inicio"
            >
              <Home className="w-4 h-4 text-cyan shrink-0" />
            </button>
          )}
          {onBackToRink && (
            <button
              type="button"
              onClick={onBackToRink}
              className="press h-11 min-h-touch px-3 rounded-full flex items-center gap-1.5 text-slate-200 hover:text-white bg-white/10 hover:bg-white/20 border border-white/15 shadow-sm font-bold text-xs shrink-0"
              title="Salir del Estudio y volver a la Pista 2D"
            >
              <ArrowLeft className="w-4 h-4 text-cyan shrink-0" />
              <span className="hidden sm:inline">Volver a Pista 2D</span>
              <span className="sm:hidden">Pista 2D</span>
            </button>
          )}

          {/* Display Digital de Tiempo (BandLab 00:00.0) */}
          <div className="flex items-center gap-1.5 font-mono text-xs font-black text-white pl-1 shrink-0">
            <span>{fmtTimeWithMs(currentTimeSec)}</span>
            <button
              type="button"
              onClick={() => setSnapEnabled((v) => !v)}
              className={`p-1.5 rounded transition-colors ${
                snapEnabled ? 'text-cyan bg-cyan/15' : 'text-slate-500 hover:text-slate-300'
              }`}
              title={snapEnabled ? 'Snap a la cuadrícula: Activado' : 'Snap desactivado'}
            >
              <Magnet className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── CENTRO: Cápsula Flotante Segmentada (BandLab Pill: Waveform / Notes / Settings) ── */}
        <div className="flex items-center p-0.5 rounded-full bg-zinc-900 border border-white/10 shadow-inner shrink-0">
          {/* 1. Modo Vista de Arreglos (Arrangement View) */}
          <button
            type="button"
            onClick={() => setActiveTab('arrangement')}
            className={`h-8 px-3 rounded-full flex items-center justify-center transition-all ${
              activeTab === 'arrangement'
                ? 'bg-white text-black shadow font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Vista de Arreglos"
          >
            <Layers className="w-4 h-4" />
          </button>

          {/* 2. Notas / Guía Coreográfica */}
          <button
            type="button"
            onClick={() => setShowNotesModal(true)}
            className={`h-8 px-3 rounded-full flex items-center justify-center transition-all ${
              showNotesModal
                ? 'bg-white text-black shadow font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Notas del Programa y Coreografía"
          >
            <FileText className="w-4 h-4" />
          </button>

          {/* 3. Ajustes de Proyecto (BPM, Metrónomo, Voces) */}
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className={`h-8 px-3 rounded-full flex items-center justify-center transition-all ${
              showSettingsModal
                ? 'bg-white text-black shadow font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Configuración de Tempo & Guías"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* ── DERECHA: Cargar Audio + Guardar/Exportar a la Pista (BandLab Cloud Icon) ── */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Botón Importar Archivo de Audio Directo */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-10 min-h-touch px-3 rounded-full flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-xs font-bold transition-all active:scale-95 shadow-sm"
            title="Importar archivo de audio (MP3, WAV, M4A)"
          >
            <Upload className="w-4 h-4 text-cyan" />
            <span className="hidden sm:inline">Importar</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_AUDIO_FORMATS}
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Botón Acción Principal: Enviar Mezcla a la Pista 2D */}
          {onExportToRink && (
            <button
              type="button"
              onClick={onExportToRink}
              disabled={isExporting}
              className="h-10 min-h-touch px-3.5 rounded-full flex items-center gap-1.5 bg-gradient-to-r from-cyan to-teal-400 text-black hover:brightness-110 transition-all active:scale-95 shadow-md shadow-cyan/25 font-bold text-xs disabled:opacity-50"
              title="Transferir mezcla terminada y nodos al mostrador de audio de la Pista 2D"
            >
              {isExporting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="hidden sm:inline">Enviando...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 fill-black stroke-none shrink-0" />
                  <span className="hidden sm:inline">Enviar a Pista 2D</span>
                  <span className="sm:hidden">Enviar</span>
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* ── MODAL DE AJUSTES DE PROYECTO (BPM, METRÓNOMO, VOCES) ── */}
      {showSettingsModal && (
        <div 
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setShowSettingsModal(false)}
        >
          <div 
            className="w-full max-w-sm bg-zinc-900 border border-white/15 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-sm font-black uppercase tracking-wider text-cyan flex items-center gap-1.5">
                <Settings className="w-4 h-4" /> Ajustes del Estudio
              </h3>
              <button 
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* BPM */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span>Tempo (BPM)</span>
                <span className="font-mono text-cyan text-sm">{globalControls.bpm} BPM</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setGlobalBpm(globalControls.bpm - 5)}
                  className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-bold"
                >
                  -5
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalBpm(globalControls.bpm - 1)}
                  className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-bold"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalBpm(globalControls.bpm + 1)}
                  className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-bold"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalBpm(globalControls.bpm + 5)}
                  className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-bold"
                >
                  +5
                </button>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleTapTempo}
                  className="flex-1 py-1 rounded bg-cyan/20 text-cyan text-xs font-black uppercase tracking-wider"
                >
                  Tap Tempo
                </button>
                <button
                  type="button"
                  onClick={() => analyzeBpm()}
                  disabled={isAnalyzingBpm}
                  className="flex-1 py-1 rounded bg-white/10 text-xs font-bold text-slate-300"
                >
                  {isAnalyzingBpm ? '...' : 'Auto-BPM (DSP)'}
                </button>
              </div>
            </div>

            {/* Metrónomo */}
            <div className="pt-2 border-t border-white/10 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-amber-400">
                <span className="flex items-center gap-1">
                  <Bell className="w-3.5 h-3.5" /> Metrónomo
                </span>
                <button
                  type="button"
                  {...press(toggleMetronomeMute)}
                  aria-pressed={globalControls.metronome.muted}
                  className={`press min-h-touch min-w-touch rounded px-2.5 text-[10px] font-black uppercase ${
                    globalControls.metronome.muted ? 'bg-rose-500/20 text-rose-400' : 'bg-green-500/20 text-green-400'
                  }`}
                >
                  {globalControls.metronome.muted ? 'Silenciado' : 'Activo'}
                </button>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={globalControls.metronome.volume}
                onChange={(e) => setMetronomeVolume(parseFloat(e.target.value))}
                className="w-full accent-amber-400 h-1.5 bg-white/10 rounded cursor-pointer"
              />
            </div>

            {/* Voces Guía */}
            <div className="pt-2 border-t border-white/10 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-fuchsia-400">
                <span className="flex items-center gap-1">
                  <Mic className="w-3.5 h-3.5" /> Cues & Guías Vocales
                </span>
                <button
                  type="button"
                  {...press(toggleVoiceGuideMute)}
                  aria-pressed={globalControls.voiceGuide.muted}
                  className={`press min-h-touch min-w-touch rounded px-2.5 text-[10px] font-black uppercase ${
                    globalControls.voiceGuide.muted ? 'bg-rose-500/20 text-rose-400' : 'bg-green-500/20 text-green-400'
                  }`}
                >
                  {globalControls.voiceGuide.muted ? 'Silenciado' : 'Activo'}
                </button>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={globalControls.voiceGuide.volume}
                onChange={(e) => setVoiceGuideVolume(parseFloat(e.target.value))}
                className="w-full accent-fuchsia-400 h-1.5 bg-white/10 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE NOTAS / LETRAS DE RUTINA (BandLab Feather Icon) ── */}
      {showNotesModal && (
        <div 
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setShowNotesModal(false)}
        >
          <div 
            className="w-full max-w-sm bg-zinc-900 border border-white/15 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-cyan" /> Notas de Coreografía
              </h3>
              <button 
                type="button"
                onClick={() => setShowNotesModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Escribe notas, conteos o acentos musicales para la rutina..."
              className="w-full h-32 p-2.5 rounded-lg bg-black/60 border border-white/15 text-xs text-slate-200 resize-none focus:outline-none focus:border-cyan"
            />
            <button
              type="button"
              onClick={() => setShowNotesModal(false)}
              className="w-full py-2 rounded-lg bg-cyan text-black font-bold text-xs"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </>
  );
};
