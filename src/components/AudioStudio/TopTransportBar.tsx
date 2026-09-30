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
  Sparkles, 
  Magnet,
  FileEdit,
  Music,
  X,
  Trash2
} from 'lucide-react';
import { ConfirmDialog } from '../ConfirmDialog';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';
import { useRinkAudioStore } from '../../store/useRinkAudioStore';
import { ACCEPTED_AUDIO_FORMATS } from '../../constants/mediaFormats';
import { usePressAction } from '../../hooks/usePressAction';
import { useIosFileCapture } from '../../hooks/useIosFileCapture';
import { audioEngine } from '../../services/audioEngine';

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
  const loadPublishedIntoStudio = useAudioStudioStore((s) => s.loadPublishedIntoStudio);
  const clearAllStudioTracks = useAudioStudioStore((s) => s.clearAllStudioTracks);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  // Estado DRAFT → PUBLISH: el Studio es un borrador hasta "Enviar a Pista 2D".
  const studioDirty = useRinkAudioStore((s) => s.studioDirty);
  const hasPublishedAudio = useRinkAudioStore((s) => !!s.publishedAudio);
  const snapEnabled = useAudioStudioStore((s) => s.snapEnabled);
  const setSnapEnabled = useAudioStudioStore((s) => s.setSnapEnabled);

  const [channelMode, setChannelMode] = useState(() => audioEngine.getChannelMode());

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
              <Home className="w-4 h-4 text-[#78a9ff] shrink-0" />
            </button>
          )}
          {onBackToRink && (
            <button
              type="button"
              onClick={onBackToRink}
              className="press h-11 min-h-touch px-3 rounded-full flex items-center gap-1.5 text-slate-200 hover:text-white bg-white/10 hover:bg-white/20 border border-white/15 shadow-sm font-bold text-xs shrink-0"
              title="Salir del Estudio y volver a la Pista 2D"
            >
              <ArrowLeft className="w-4 h-4 text-[#78a9ff] shrink-0" />
              <span className="hidden sm:inline">Volver a Pista 2D</span>
              <span className="sm:hidden">Pista 2D</span>
            </button>
          )}
          {/* Identidad de pantalla: deja claro que esto es la mesa de edición/mezcla */}
          <span className="studio-brand-label text-[10px] font-black uppercase tracking-widest text-[#78a9ff] shrink-0">
            Audio Studio
          </span>

          {/* Display Digital de Tiempo (BandLab 00:00.0) */}
          <div className="flex items-center gap-1.5 font-mono text-xs font-black text-white pl-1 shrink-0">
            <span>{fmtTimeWithMs(currentTimeSec)}</span>
            <button
              type="button"
              onClick={() => setSnapEnabled((v) => !v)}
              className={`p-1.5 rounded transition-colors ${
                snapEnabled ? 'text-[#78a9ff] bg-[#0f62fe]/20' : 'text-slate-500 hover:text-slate-300'
              }`}
              title={snapEnabled ? 'Snap a la cuadrícula: Activado' : 'Snap desactivado'}
              aria-label={snapEnabled ? 'Desactivar ajuste a la cuadrícula' : 'Activar ajuste a la cuadrícula'}
            >
              <Magnet className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── CENTRO: Cápsula Flotante Segmentada (Pill: Waveform / Notes / Settings) ── */}
        <div className="flex items-center p-0.5 rounded-xl bg-surface-1 border border-white/10 shadow-inner shrink-0 gap-0.5">
          {/* 1. Modo Vista de Arreglos (Arrangement View) */}
          <button
            type="button"
            onClick={() => setActiveTab('arrangement')}
            className={`h-8 px-3 rounded-lg flex items-center justify-center transition-all ${
              activeTab === 'arrangement'
                ? 'bg-surface-3 text-white font-bold border border-[#0f62fe] shadow-sm ring-1 ring-[#0f62fe]/40'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
            title="Vista de Arreglos"
            aria-label="Vista de Arreglos"
          >
            <Layers className="w-4 h-4" />
          </button>

          {/* 2. Notas / Guía Coreográfica */}
          <button
            type="button"
            onClick={() => setShowNotesModal(true)}
            className={`h-8 px-3 rounded-lg flex items-center justify-center transition-all ${
              showNotesModal
                ? 'bg-surface-3 text-white font-bold border border-[#0f62fe] shadow-sm ring-1 ring-[#0f62fe]/40'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
            title="Notas del Programa y Coreografía"
            aria-label="Notas del Programa y Coreografía"
          >
            <FileText className="w-4 h-4" />
          </button>

          {/* 3. Ajustes de Proyecto (BPM, Metrónomo, Voces) */}
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className={`h-8 px-3 rounded-lg flex items-center justify-center transition-all ${
              showSettingsModal
                ? 'bg-surface-3 text-white font-bold border border-[#0f62fe] shadow-sm ring-1 ring-[#0f62fe]/40'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
            title="Configuración de Tempo & Guías"
            aria-label="Configuración de Tempo y Guías"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* ── DERECHA: Cargar Audio + Guardar/Exportar a la Pista ── */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Botón Importar Archivo de Audio Directo */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-10 min-h-touch px-3 rounded-xl flex items-center gap-1.5 bg-surface-2 hover:bg-surface-3 text-slate-200 hover:text-white text-xs font-semibold border border-white/10 transition-all active:scale-95 shadow-sm"
            title="Importar archivo de audio (MP3, WAV, M4A)"
          >
            <Upload className="w-4 h-4 text-[#78a9ff]" />
            <span className="hidden sm:inline">Importar</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_AUDIO_FORMATS}
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Botón Limpiar Pistas del Estudio */}
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="h-10 min-h-touch px-3 rounded-xl flex items-center gap-1.5 bg-[#da1e28]/10 hover:bg-[#da1e28]/20 text-[#ff8389] hover:text-white text-xs font-semibold border border-[#da1e28]/30 transition-all active:scale-95 shadow-sm"
            title="Eliminar todas las pistas y clips del Estudio de Audio"
            aria-label="Limpiar pistas"
          >
            <Trash2 className="w-4 h-4 text-[#ff8389]" />
            <span className="hidden sm:inline">Limpiar pistas</span>
          </button>

          {/* Estado DRAFT → PUBLISH */}
          <div className="hidden md:flex items-center gap-1.5 mr-1">
            <span
              className={[
                'h-7 px-2 rounded-lg flex items-center gap-1 text-[10px] font-bold border whitespace-nowrap',
                studioDirty
                  ? 'bg-amber-500/15 text-amber-300 border-amber-400/40'
                  : 'bg-surface-2 text-slate-400 border-white/10',
              ].join(' ')}
              title="El Audio Studio es un borrador: la música activa de la Pista 2D no cambia hasta enviarlo"
            >
              <FileEdit className="w-3 h-3" />
              Borrador{studioDirty ? ' · sin enviar' : ''}
            </span>
            {hasPublishedAudio && (
              <button
                type="button"
                onClick={() => loadPublishedIntoStudio()}
                className="h-7 px-2 rounded-lg flex items-center gap-1 text-[10px] font-semibold bg-surface-2 hover:bg-surface-3 text-slate-300 border border-white/10 transition-colors whitespace-nowrap"
                title="Traer al Estudio una copia del audio activo de la Pista 2D para editarlo (no lo modifica)"
              >
                <Music className="w-3 h-3 text-[#78a9ff]" />
                Importar audio del visor
              </button>
            )}
          </div>

          {/* PUBLICACIÓN (acción principal) */}
          {onExportToRink && (
            <button
              type="button"
              onClick={onExportToRink}
              disabled={isExporting}
              className="h-10 min-h-touch px-4 rounded-xl flex items-center gap-2 bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white hover:brightness-105 transition-all active:scale-95 shadow-sm font-bold text-xs disabled:opacity-50"
              title="Publicar esta mezcla: pasará a ser la música activa de la Pista 2D (no cambia el borrador)"
              aria-label="Enviar al visor: publicar la mezcla en la Pista 2D"
            >
              {isExporting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="hidden sm:inline">Enviando al visor…</span>
                  <span className="sm:hidden">Enviando…</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 fill-white text-white shrink-0" />
                  <span className="hidden sm:inline">Enviar al visor</span>
                  <span className="sm:hidden">Enviar al visor</span>
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* ── MODAL DE AJUSTES DE PROYECTO (BPM, METRÓNOMO, VOCES) ── */}
      {showSettingsModal && (
        <div 
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-3 pb-safe animate-in fade-in duration-150"
          onClick={() => setShowSettingsModal(false)}
        >
          <div 
            className="w-full max-w-sm max-h-[85dvh] overflow-y-auto overscroll-contain bg-zinc-900 border border-white/15 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-sm font-black uppercase tracking-wider text-[#78a9ff] flex items-center gap-1.5">
                <Settings className="w-4 h-4" /> Ajustes del Estudio
              </h3>
              <button 
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white p-1"
                aria-label="Cerrar ajustes del estudio"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* BPM */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span>Tempo (BPM)</span>
                <span className="font-mono text-[#78a9ff] text-sm">{globalControls.bpm} BPM</span>
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
                  className="flex-1 py-1 rounded bg-[#0f62fe]/20 text-[#78a9ff] hover:bg-[#0f62fe]/30 text-xs font-black uppercase tracking-wider"
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
            {(() => {
              const isMetroActive = globalControls.metronome.enabled && !globalControls.metronome.muted;
              return (
                <div className="pt-2 border-t border-white/10 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className={`flex items-center gap-1 transition-colors ${isMetroActive ? 'text-amber-400' : 'text-slate-400'}`}>
                      <Bell className="w-3.5 h-3.5" /> Metrónomo
                    </span>
                    <button
                      type="button"
                      {...press(toggleMetronomeMute)}
                      aria-pressed={isMetroActive}
                      className={`press min-h-touch min-w-touch rounded px-2.5 text-[10px] font-black uppercase transition-colors ${
                        isMetroActive ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/5 text-slate-400 border border-white/5'
                      }`}
                    >
                      {isMetroActive ? 'Activo' : 'Inactivo'}
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
              );
            })()}

            {/* Voz Guía automática (IA) — distinta de la voz grabada de la entrenadora */}
            <div className="pt-2 border-t border-white/10 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-fuchsia-400">
                <span
                  className="flex items-center gap-1"
                  title="Voz Guía automática (IA, femenina latina). No afecta a la voz grabada de la entrenadora."
                >
                  <Sparkles className="w-3.5 h-3.5" /> Voz Guía IA
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

            {/* Modo de Salida (Stereo vs Split L/R) */}
            <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                <span>Modo de Salida</span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {channelMode === 'split-coach' ? 'Split L/R' : 'Stereo'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  aria-pressed={channelMode === 'stereo'}
                  onClick={() => handleSetChannelMode('stereo')}
                  className={`py-2 px-2.5 rounded-xl text-center text-xs font-bold transition-all border active:scale-[0.96] ${
                    channelMode === 'stereo'
                      ? 'bg-surface-3 text-white font-bold border border-[#0f62fe] shadow-sm ring-1 ring-[#0f62fe]/40'
                      : 'bg-surface-1 border-white/10 text-slate-300 hover:bg-surface-2 hover:text-white'
                  }`}
                >
                  🔊 Stereo
                </button>
                <button
                  type="button"
                  aria-pressed={channelMode === 'split-coach'}
                  onClick={() => handleSetChannelMode('split-coach')}
                  className={`py-2 px-2.5 rounded-xl text-center text-xs font-bold transition-all border active:scale-[0.96] ${
                    channelMode === 'split-coach'
                      ? 'bg-surface-3 text-white font-bold border border-[#0f62fe] shadow-sm ring-1 ring-[#0f62fe]/40'
                      : 'bg-surface-1 border-white/10 text-slate-300 hover:bg-surface-2 hover:text-white'
                  }`}
                >
                  🎧 Split L/R
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 font-medium">
                {channelMode === 'split-coach'
                  ? 'L: 100% Música · R: 100% Metrónomo + Voz Guía (0% música)'
                  : 'L + R: Mezcla estéreo balanceada en ambos oídos'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE NOTAS / LETRAS DE RUTINA (BandLab Feather Icon) ── */}
      {showNotesModal && (
        <div 
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-3 pb-safe animate-in fade-in duration-150"
          onClick={() => setShowNotesModal(false)}
        >
          <div 
            className="w-full max-w-sm max-h-[85dvh] overflow-y-auto overscroll-contain bg-zinc-900 border border-white/15 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#78a9ff]" /> Notas de Coreografía
              </h3>
              <button 
                type="button"
                onClick={() => setShowNotesModal(false)}
                className="text-slate-400 hover:text-white p-1"
                aria-label="Cerrar notas de coreografía"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Escribe notas, conteos o acentos musicales para la rutina..."
              className="w-full h-32 p-2.5 rounded-lg bg-black/60 border border-white/15 text-xs text-slate-200 resize-none focus:outline-none focus:border-[#0f62fe]"
            />
            <button
              type="button"
              onClick={() => setShowNotesModal(false)}
              className="w-full py-2 rounded-lg bg-[#0f62fe] hover:bg-[#0353e9] text-white font-bold text-xs shadow-sm transition-colors"
            >
              Listo
            </button>
          </div>
        </div>
      )}

      {/* Modal de confirmación para Limpiar Pistas del Estudio */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        title="¿Limpiar todas las pistas del Estudio?"
        message="Se eliminarán todas las pistas, clips y marcadores del Estudio de Audio. La música activa de la Pista 2D no se verá afectada."
        confirmLabel="Limpiar pistas"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={() => {
          setShowClearConfirm(false);
          clearAllStudioTracks();
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </>
  );
};
