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
        className="relative z-40 shrink-0 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-2 py-1.5 bg-canvas border-b border-white/[0.06] text-white select-none pt-safe px-safe sm:flex-nowrap sm:justify-between sm:gap-4 sm:px-4 sm:py-2"
      >
        {/* ── IZQUIERDA: Inicio + Regreso a Pista ── */}
        <div className="flex items-center gap-2 shrink-0">
          {onGoHome && (
            <button
              type="button"
              onClick={onGoHome}
              className="press flex h-10 w-10 min-h-touch min-w-touch shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-surface-1 text-slate-300 hover:bg-surface-2 hover:text-white transition-colors"
              title="Ir al Inicio"
              aria-label="Ir al Inicio"
            >
              <Home className="w-4 h-4 text-ice-primary shrink-0" />
            </button>
          )}
          {onBackToRink && (
            <button
              type="button"
              onClick={onBackToRink}
              className="press h-10 min-h-touch px-3 rounded-xl flex items-center gap-1.5 text-slate-300 hover:text-white bg-surface-1 hover:bg-surface-2 border border-white/[0.06] shadow-subtle font-medium text-xs shrink-0 transition-colors"
              title="Salir del Estudio y volver a la Pista 2D"
            >
              <ArrowLeft className="w-4 h-4 text-ice-primary shrink-0" />
              <span className="hidden sm:inline">Volver a Pista 2D</span>
              <span className="sm:hidden">Pista 2D</span>
            </button>
          )}
          {/* Identidad de pantalla */}
          <span className="studio-brand-label text-[10px] font-semibold uppercase tracking-widest text-slate-400 shrink-0">
            Audio Studio
          </span>

          {/* Display Digital de Tiempo */}
          <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-white pl-1 shrink-0">
            <span>{fmtTimeWithMs(currentTimeSec)}</span>
            <button
              type="button"
              onClick={() => setSnapEnabled((v) => !v)}
              className={`p-1.5 rounded-lg transition-colors ${
                snapEnabled ? 'text-ice-primary bg-ice-primary/10' : 'text-slate-500 hover:text-slate-300'
              }`}
              title={snapEnabled ? 'Snap a la cuadrícula: Activado' : 'Snap desactivado'}
              aria-label={snapEnabled ? 'Desactivar ajuste a la cuadrícula' : 'Activar ajuste a la cuadrícula'}
            >
              <Magnet className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── CENTRO: Cápsula Flotante Segmentada ── */}
        <div className="flex items-center p-0.5 rounded-xl bg-surface-2/60 border border-white/[0.06] shadow-subtle shrink-0 gap-0.5">
          {/* 1. Modo Vista de Arreglos */}
          <button
            type="button"
            onClick={() => setActiveTab('arrangement')}
            className={`h-8 px-3 rounded-lg flex items-center justify-center transition-all ${
              activeTab === 'arrangement'
                ? 'bg-surface-1 text-ice-primary font-semibold shadow-subtle border border-white/[0.08]'
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
                ? 'bg-surface-1 text-ice-primary font-semibold shadow-subtle border border-white/[0.08]'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
            title="Notas del Programa y Coreografía"
            aria-label="Notas del Programa y Coreografía"
          >
            <FileText className="w-4 h-4" />
          </button>

          {/* 3. Ajustes de Proyecto */}
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className={`h-8 px-3 rounded-lg flex items-center justify-center transition-all ${
              showSettingsModal
                ? 'bg-surface-1 text-ice-primary font-semibold shadow-subtle border border-white/[0.08]'
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
            className="h-10 min-h-touch px-3 rounded-xl flex items-center gap-1.5 bg-surface-1 hover:bg-surface-2 text-slate-300 hover:text-white text-xs font-medium border border-white/[0.06] transition-all active:scale-95 shadow-subtle"
            title="Importar archivo de audio (MP3, WAV, M4A)"
          >
            <Upload className="w-4 h-4 text-ice-primary" />
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
            className="h-10 min-h-touch px-3 rounded-xl flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/15 text-red-400 hover:text-red-300 text-xs font-medium border border-red-500/20 transition-all active:scale-95 shadow-subtle"
            title="Eliminar todas las pistas y clips del Estudio de Audio"
            aria-label="Limpiar pistas"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
            <span className="hidden sm:inline">Limpiar pistas</span>
          </button>

          {/* Estado DRAFT → PUBLISH */}
          <div className="hidden md:flex items-center gap-1.5 mr-1">
            <span
              className={[
                'h-7 px-2 rounded-lg flex items-center gap-1 text-[10px] font-medium border whitespace-nowrap',
                studioDirty
                  ? 'bg-amber-500/10 text-amber-300 border-amber-400/30'
                  : 'bg-surface-1 text-slate-400 border-white/[0.06]',
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
                className="h-7 px-2 rounded-lg flex items-center gap-1 text-[10px] font-medium bg-surface-1 hover:bg-surface-2 text-slate-300 border border-white/[0.06] transition-colors whitespace-nowrap"
                title="Traer al Estudio una copia del audio activo de la Pista 2D para editarlo (no lo modifica)"
              >
                <Music className="w-3 h-3 text-ice-primary" />
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
              className="h-10 min-h-touch px-4 rounded-xl flex items-center gap-2 bg-ice-primary hover:bg-ice-primary/90 text-white transition-all active:scale-95 shadow-subtle font-medium text-xs disabled:opacity-50"
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
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3 pb-safe animate-in fade-in duration-150"
          onClick={() => setShowSettingsModal(false)}
        >
          <div 
            className="w-full max-w-sm max-h-[85dvh] overflow-y-auto overscroll-contain bg-surface-1 border border-white/[0.08] rounded-2xl p-4 shadow-elevation flex flex-col gap-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-ice-primary flex items-center gap-1.5">
                <Settings className="w-4 h-4" /> Ajustes del Estudio
              </h3>
              <button 
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06]"
                aria-label="Cerrar ajustes del estudio"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* BPM */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span>Tempo (BPM)</span>
                <span className="font-mono text-ice-primary text-sm font-medium">{globalControls.bpm} BPM</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setGlobalBpm(globalControls.bpm - 5)}
                  className="flex-1 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 border border-white/[0.06] text-xs font-medium text-slate-300 hover:text-white"
                >
                  -5
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalBpm(globalControls.bpm - 1)}
                  className="flex-1 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 border border-white/[0.06] text-xs font-medium text-slate-300 hover:text-white"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalBpm(globalControls.bpm + 1)}
                  className="flex-1 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 border border-white/[0.06] text-xs font-medium text-slate-300 hover:text-white"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => setGlobalBpm(globalControls.bpm + 5)}
                  className="flex-1 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 border border-white/[0.06] text-xs font-medium text-slate-300 hover:text-white"
                >
                  +5
                </button>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleTapTempo}
                  className="flex-1 py-1.5 rounded-lg bg-ice-primary/10 text-ice-primary border border-ice-primary/20 hover:bg-ice-primary/20 text-xs font-semibold uppercase tracking-wider"
                >
                  Tap Tempo
                </button>
                <button
                  type="button"
                  onClick={() => analyzeBpm()}
                  disabled={isAnalyzingBpm}
                  className="flex-1 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-white/[0.06] text-xs font-medium text-slate-300 hover:text-white"
                >
                  {isAnalyzingBpm ? '...' : 'Auto-BPM (DSP)'}
                </button>
              </div>
            </div>

            {/* Metrónomo */}
            {(() => {
              const isMetroActive = globalControls.metronome.enabled && !globalControls.metronome.muted;
              return (
                <div className="pt-2 border-t border-white/[0.06] flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className={`flex items-center gap-1 transition-colors ${isMetroActive ? 'text-amber-400' : 'text-slate-400'}`}>
                      <Bell className="w-3.5 h-3.5" /> Metrónomo
                    </span>
                    <button
                      type="button"
                      {...press(toggleMetronomeMute)}
                      aria-pressed={isMetroActive}
                      className={`press min-h-touch min-w-touch rounded-lg px-2.5 text-[10px] font-semibold uppercase transition-colors ${
                        isMetroActive ? 'bg-amber-400/10 text-amber-400 border border-amber-400/25' : 'bg-surface-2 text-slate-400 border border-white/[0.06]'
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
                    className="w-full accent-[#F59E0B] h-1.5 bg-surface-3 rounded cursor-pointer"
                  />
                </div>
              );
            })()}

            {/* Voz Guía automática (IA) */}
            <div className="pt-2 border-t border-white/[0.06] flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-studio-mint">
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
                  className={`press min-h-touch min-w-touch rounded-lg px-2.5 text-[10px] font-semibold uppercase ${
                    globalControls.voiceGuide.muted ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-studio-mint/10 text-studio-mint border border-studio-mint/20'
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
                className="w-full accent-[#0D9488] h-1.5 bg-surface-3 rounded cursor-pointer"
              />
            </div>

            {/* Modo de Salida (Stereo vs Split L/R) */}
            <div className="pt-2 border-t border-white/[0.06] flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                <span>Modo de Salida</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {channelMode === 'split-coach' ? 'Split L/R' : 'Stereo'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  aria-pressed={channelMode === 'stereo'}
                  onClick={() => handleSetChannelMode('stereo')}
                  className={`py-2 px-2.5 rounded-xl text-center text-xs font-medium transition-all border ${
                    channelMode === 'stereo'
                      ? 'bg-surface-2 text-white font-semibold border-ice-primary/40 shadow-subtle'
                      : 'bg-surface-1 border-white/[0.06] text-slate-300 hover:bg-surface-2 hover:text-white'
                  }`}
                >
                  🔊 Stereo
                </button>
                <button
                  type="button"
                  aria-pressed={channelMode === 'split-coach'}
                  onClick={() => handleSetChannelMode('split-coach')}
                  className={`py-2 px-2.5 rounded-xl text-center text-xs font-medium transition-all border ${
                    channelMode === 'split-coach'
                      ? 'bg-surface-2 text-white font-semibold border-ice-primary/40 shadow-subtle'
                      : 'bg-surface-1 border-white/[0.06] text-slate-300 hover:bg-surface-2 hover:text-white'
                  }`}
                >
                  🎧 Split L/R
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-normal">
                {channelMode === 'split-coach'
                  ? 'L: 100% Música · R: 100% Metrónomo + Voz Guía (0% música)'
                  : 'L + R: Mezcla estéreo balanceada en ambos oídos'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE NOTAS / LETRAS DE RUTINA ── */}
      {showNotesModal && (
        <div 
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3 pb-safe animate-in fade-in duration-150"
          onClick={() => setShowNotesModal(false)}
        >
          <div 
            className="w-full max-w-sm max-h-[85dvh] overflow-y-auto overscroll-contain bg-surface-1 border border-white/[0.08] rounded-2xl p-4 shadow-elevation flex flex-col gap-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-white flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-ice-primary" /> Notas de Coreografía
              </h3>
              <button 
                type="button"
                onClick={() => setShowNotesModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06]"
                aria-label="Cerrar notas de coreografía"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Escribe notas, conteos o acentos musicales para la rutina..."
              className="w-full h-32 p-2.5 rounded-xl bg-surface-2 border border-white/[0.08] text-xs text-slate-200 placeholder:text-slate-500 resize-none focus:outline-none focus:border-ice-primary/50 focus:ring-1 focus:ring-ice-primary/20"
            />
            <button
              type="button"
              onClick={() => setShowNotesModal(false)}
              className="w-full py-2.5 rounded-xl bg-ice-primary hover:bg-ice-primary/90 text-white font-medium text-xs shadow-subtle transition-colors interactive-tap"
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
