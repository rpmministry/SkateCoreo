import React from 'react';
import {
  Music,
  Clock,
  Mic,
  Headphones,
  Timer,
  Layers,
  Eye,
  SkipBack,
  Sparkles,
  Undo2,
  Trash2,
  BookOpen,
  LogOut,
  ShieldCheck,
  Smartphone,
  Compass,
  CircleDot,
  Camera,
  Footprints,
  FileDown,
  CheckCircle2,
} from 'lucide-react';
import { audioEngine } from '../services/audioEngine';
import { TIME_SIGNATURES } from '../core/audio/Metronome';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { useChoreographyStore } from '../store/useChoreographyStore';
import { useAuthStore } from '../store/useAuthStore';
import { 
  EFICIENCIAS_DISPONIBLES, 
  getDescripcionCategoria 
} from '../constants/reglamento';

/**
 * Modales pesados (visión artificial + seguridad de dispositivo) cargados BAJO
 * DEMANDA: no forman parte del bundle inicial de la Pista 2D. Se envuelven en
 * Suspense para preservar exactamente la misma API de props.
 */
const PaperToDigitalModalLazy = React.lazy(() =>
  import('./PaperToDigital/PaperToDigitalModal').then((m) => ({ default: m.PaperToDigitalModal }))
);
const DeviceSecurityModalLazy = React.lazy(() =>
  import('./DeviceSecurityModal').then((m) => ({ default: m.DeviceSecurityModal }))
);
const PaperToDigitalModal = (props: React.ComponentProps<typeof PaperToDigitalModalLazy>) => (
  <React.Suspense fallback={null}><PaperToDigitalModalLazy {...props} /></React.Suspense>
);
const DeviceSecurityModal = (props: React.ComponentProps<typeof DeviceSecurityModalLazy>) => (
  <React.Suspense fallback={null}><DeviceSecurityModalLazy {...props} /></React.Suspense>
);

interface LeftSidebarPanelProps {
  preRollSec: number;
  onPreRollSecChange: (sec: number) => void;
  onUndo: () => void;
  onClearRink?: () => void;
  // NOTA: se eliminó `onResetDemo`. La app arranca sin datos de prueba
  // (lienzo en blanco) y ya no existe coreografía ni música de demostración.
  onOpenAudioStudio?: () => void;
  /** Cierre de sesión unificado (misma limpieza que el resto de la app). */
  onLogout?: () => void;
  showHeader?: boolean;
  isMobileModal?: boolean;
}


/**
 * Left sidebar panel — Dark Mode Neon aesthetic.
 * Uses soft surfaces, cyan electric active states and mint indicators.
 */
export const LeftSidebarPanel: React.FC<LeftSidebarPanelProps> = ({
  preRollSec,
  onPreRollSecChange,
  onUndo,
  onOpenAudioStudio,
  onLogout,
  showHeader = true,
  isMobileModal = false,
}) => {
  const audio = useAudioEngine();

  const skaterGender = useChoreographyStore((s) => s.skaterGender);
  const setSkaterGender = useChoreographyStore((s) => s.setSkaterGender);
  const showRinkGrid = useChoreographyStore((s) => s.showRinkGrid);
  const setShowRinkGrid = useChoreographyStore((s) => s.setShowRinkGrid);
  const showReglamentaryGuides = useChoreographyStore((s) => s.showReglamentaryGuides);
  const setShowReglamentaryGuides = useChoreographyStore((s) => s.setShowReglamentaryGuides);
  const showCompulsoryFigures = useChoreographyStore((s) => s.showCompulsoryFigures);
  const setShowCompulsoryFigures = useChoreographyStore((s) => s.setShowCompulsoryFigures);
  const showSkaterDuringPlayback = useChoreographyStore((s) => s.showSkaterDuringPlayback);
  const setShowSkaterDuringPlayback = useChoreographyStore((s) => s.setShowSkaterDuringPlayback);
  const paperTraceOverlay = useChoreographyStore((s) => s.paperTraceOverlay);
  const clearPaperTraceOverlay = useChoreographyStore((s) => s.clearPaperTraceOverlay);
  const history = useChoreographyStore((s) => s.history);

  // Reglamento 2026
  const edad = useChoreographyStore((s) => s.edad);
  const categoria = useChoreographyStore((s) => s.categoria);
  const eficiencia = useChoreographyStore((s) => s.eficiencia);
  const setEdad = useChoreographyStore((s) => s.setEdad);
  const setEficiencia = useChoreographyStore((s) => s.setEficiencia);

  // SaaS Auth state
  const { user, role, subscription_plan, logout } = useAuthStore();
  const [showDeviceModal, setShowDeviceModal] = React.useState(false);
  const [showPaperModal, setShowPaperModal] = React.useState(false);

  // Voz Guía ESTÁNDAR: única voz femenina latina para toda la app. No hay
  // selectores de motor/voz/modelo/género (decisión de producto).
  //
  // Sincronización anticipada de la Voz Guía (segundos antes del nodo).
  const [anticipationSec, setAnticipationSec] = React.useState<number>(
    () => audioEngine.voiceCueEngine.getConfig().anticipationSec
  );

  /**
   * Sincronización anticipada (Anticipatory Cues): cuánto antes del nodo se
   * anuncia el nombre de la figura. El motor recalcula los avisos al instante.
   */
  const handleAnticipationChange = (sec: number) => {
    audioEngine.voiceCueEngine.setAnticipation(sec);
    setAnticipationSec(audioEngine.voiceCueEngine.getConfig().anticipationSec);
  };

  /** Opciones de antelación de la instrucción (segundos). */
  const ANTICIPATION_OPTIONS = [1, 1.5, 2, 3] as const;

  /**
   * Etiqueta de compás real (p. ej. "6/8", no "6/4"). Se deriva del catálogo
   * `TIME_SIGNATURES`, que es la única fuente de verdad de la métrica.
   */
  const currentTimeSigLabel =
    TIME_SIGNATURES.find((ts) => ts.beats === audio.metronome.beatsPerMeasure)?.label ??
    `${audio.metronome.beatsPerMeasure}/4`;

  const content = (
    <>
      {/* ═══ 0. Reglamento & Categoría 2026 ═══════════════ */}
        <section className="px-4 py-3.5 space-y-3 bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan">
              <BookOpen className="w-3.5 h-3.5 text-cyan" />
              Reglamento 2026
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan/15 text-cyan border border-cyan/30 tracking-wider">
              {categoria}
            </span>
          </div>

          {/* Input Edad y Categoría Calculada */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-medium">Edad del Atleta</span>
              <span className="text-[10px] font-mono text-slate-500">
                {getDescripcionCategoria(categoria)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={3}
                max={99}
                value={edad}
                onChange={(e) => setEdad(parseInt(e.target.value) || 0)}
                className="w-20 px-3 py-1.5 rounded-xl bg-neon-card border border-white/10 text-white font-mono font-bold text-xs focus:outline-none focus:border-cyan transition-all text-center"
              />
              <div className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-neon-card border border-white/5 flex items-center justify-between gap-1">
                <span className="text-[10px] text-slate-400 font-semibold truncate-safe">Categoría:</span>
                <span className="text-xs font-black text-mint tracking-wide truncate-safe">{categoria}</span>
              </div>
            </div>
          </div>

          {/* Selector de Eficiencia */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
              <span className="truncate-safe">Nivel de Eficiencia</span>
              <span className="text-[10px] text-cyan font-mono font-bold shrink-0">{eficiencia}</span>
            </label>
            <div className="grid grid-cols-3 gap-1">
              {EFICIENCIAS_DISPONIBLES.map((eff) => (
                <button
                  key={eff}
                  type="button"
                  onClick={() => setEficiencia(eff)}
                  className={[
                    'press min-w-0 min-h-touch overflow-hidden rounded-xl px-1 py-1.5 text-center text-[9px] font-bold leading-[1.15] wrap-anywhere',
                    eficiencia === eff
                      ? 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
                      : 'bg-neon-card text-slate-400 hover:text-white hover:bg-neon-hover shadow-soft-elevation',
                  ].join(' ')}
                  title={`Eficiencia ${eff}`}
                >
                  {eff}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Nota: el modo de trazado (Nodos/Trazar/Borrar) tiene su ÚNICA ubicación
            en el Inspector de Nodo (desktop) y en la barra/rail contextual (móvil).
            Aquí se eliminó la copia duplicada. */}

        {/* ═══ 1. Intro countdown ═══════════════════════════ */}
        <section className="px-4 py-3.5 space-y-2.5">
          <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <Timer className="w-3.5 h-3.5 text-cyan" />
            Intro &amp; Pre-Inicio
          </h3>

          <div className="flex gap-1.5">
            {[0, 3, 5, 8].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => onPreRollSecChange(val)}
                className={[
                  'flex-1 py-2 rounded-xl text-xs font-bold interactive-tap transition-all',
                  preRollSec === val
                    ? 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
                    : 'bg-neon-card text-slate-400 hover:text-white hover:bg-neon-hover shadow-soft-elevation',
                ].join(' ')}
              >
                {val === 0 ? 'Off' : `${val}s`}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {preRollSec === 0
              ? 'Sin cuenta atrás — la música inicia en 00:00.'
              : `${Array.from({ length: preRollSec }, (_, i) => preRollSec - i).join(' → ')} → ¡Ya! → música`}
          </p>
        </section>

        {/* ═══ 2. Audio mixer ═══════════════════════════════ */}
        <section className="px-4 py-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <Music className="w-3.5 h-3.5 text-cyan" />
              Mezclador de Audio
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">3 canales</span>
          </div>

          {onOpenAudioStudio && (
            <button
              type="button"
              onClick={onOpenAudioStudio}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/30 text-xs font-bold transition-all interactive-tap shadow-soft-elevation"
            >
              <span>🎛️ Abrir Estudio de Audio (DAW)</span>
            </button>
          )}

          {/* Channel routing */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
              <Headphones className="w-3 h-3" />
              Modo de Salida
            </label>
            <div className="flex gap-1.5">
              {(
                [
                  { mode: 'stereo', label: 'Estéreo' },
                  { mode: 'split-coach', label: 'Split L/R' },
                ] as const
              ).map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={audio.channelMode === mode}
                  onClick={() => audio.setChannelMode(mode)}
                  className={[
                    'flex-1 py-2 rounded-xl text-xs font-bold interactive-tap transition-all',
                    audio.channelMode === mode
                      ? 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
                      : 'bg-neon-card text-slate-400 hover:text-white hover:bg-neon-hover shadow-soft-elevation',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500">
              {audio.channelMode === 'split-coach'
                ? 'L: Música · R: Metrónomo/Voz'
                : 'L+R: Mezcla balanceada'}
            </p>
          </div>

          {/* Music Volume */}
          <VolumeSlider
            icon={<Music className="w-3 h-3 text-slate-400" />}
            label="Música"
            value={audio.musicVolume}
            onChange={(v) => audio.setMusicVolume(v)}
          />

          {/* Metronome Volume */}
          <VolumeSlider
            icon={<Clock className="w-3 h-3 text-slate-400" />}
            label="Metrónomo"
            value={audio.metronome.volume}
            onChange={(v) => audio.metronome.setVolume(v)}
          />

          {/* Metronome Controls */}
          <div className="bg-neon-card shadow-soft-elevation rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                Metrónomo
              </span>
              <button
                type="button"
                onClick={() => audio.metronome.toggle()}
                className={[
                  'px-3 py-1 rounded-lg text-xs font-extrabold interactive-tap transition-all',
                  audio.metronome.enabled
                    ? 'bg-mint text-neon-canvas shadow-glow-mint'
                    : 'bg-neon-surface text-slate-500',
                ].join(' ')}
              >
                {audio.metronome.enabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {audio.metronome.enabled && (
              <div className="space-y-3 pt-3 border-t border-white/5">
                {/* ── Tempo (BPM) — fila completa ── */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="text-slate-400 font-medium">Tempo</label>
                    <span className="font-mono font-bold text-mint">
                      {audio.metronome.bpm} BPM
                    </span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={240}
                    value={audio.metronome.bpm}
                    onChange={(e) => audio.metronome.setBpm(parseInt(e.target.value, 10))}
                    className="w-full h-1.5 accent-mint bg-neon-surface rounded-full cursor-pointer"
                    aria-label="Tempo del metrónomo en BPM"
                  />
                </div>

                {/* ── Compás (Time Signature) — fila completa.
                    Rejilla de 4 columnas: cada celda mide ≥44px de alto y el
                    ancho se reparte al 100% del panel, así los números nunca
                    se apilan ni se salen en móvil, tablet ni escritorio. ── */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="text-slate-400 font-medium">Compás</label>
                    <span className="font-mono font-bold text-mint">
                      {currentTimeSigLabel}
                    </span>
                  </div>
                  <div
                    role="group"
                    aria-label="Métrica del metrónomo"
                    className="grid grid-cols-4 gap-1"
                  >
                    {TIME_SIGNATURES.map((ts) => {
                      const isActive = audio.metronome.beatsPerMeasure === ts.beats;
                      return (
                        <button
                          key={ts.label}
                          type="button"
                          onClick={() => audio.metronome.setBeats(ts.beats)}
                          aria-pressed={isActive}
                          aria-label={`Compás ${ts.label}`}
                          title={`Compás ${ts.label}`}
                          className={[
                            'min-h-[44px] w-full min-w-0 flex items-center justify-center rounded-lg px-1 text-[11px] font-bold tabular-nums interactive-tap transition-all',
                            isActive
                              ? 'bg-mint text-neon-canvas shadow-glow-mint font-black'
                              : 'bg-neon-surface text-slate-400 hover:text-white hover:bg-neon-hover',
                          ].join(' ')}
                        >
                          {ts.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Coach Voice Volume */}
          <VolumeSlider
            icon={<Mic className="w-3 h-3 text-slate-400" />}
            label="Voz del Coach"
            value={audio.coachVolume}
            onChange={(v) => audio.setCoachVolume(v)}
          />

          {/* Sincronización Anticipada de la Voz Guía (Anticipatory Cues).
              Sustituye al antiguo selector de género (eliminado): la Voz Guía es
              siempre femenina latina, así que ese espacio se dedica a un ajuste
              realmente útil para el patinador. */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
              <Timer className="w-3 h-3" />
              Anticipación de la Voz
            </label>
            <div className="grid grid-cols-4 gap-1">
              {ANTICIPATION_OPTIONS.map((sec) => {
                const isActive = Math.abs(anticipationSec - sec) < 0.01;
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => handleAnticipationChange(sec)}
                    aria-pressed={isActive}
                    aria-label={`Anunciar la figura ${sec} segundos antes del nodo`}
                    title={`La figura se anuncia ${sec} s antes del nodo`}
                    className={[
                      'min-h-[44px] w-full min-w-0 flex items-center justify-center rounded-lg px-1 text-[11px] font-bold tabular-nums interactive-tap transition-all',
                      isActive
                        ? 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
                        : 'bg-neon-surface text-slate-400 hover:text-white hover:bg-neon-hover',
                    ].join(' ')}
                  >
                    {sec}s
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] leading-snug text-slate-500">
              La figura se anuncia antes del conteo 3-2-1 para que el patinador
              llegue preparado al punto de ejecución.
            </p>
          </div>

          {/* Voz Guía ESTÁNDAR (única voz femenina latina, sin selectores) */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
              <Sparkles className="w-3 h-3" />
              Voz Guía
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-mint/25 bg-mint/10 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-mint" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-mint">Femenina latina estándar</p>
                <p className="text-[10px] leading-snug text-slate-400">
                  Voz única y pregenerada para todo el conteo y las figuras.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => audioEngine.voiceCueEngine.testVoice()}
              className="press flex min-h-touch w-full items-center justify-center gap-1.5 rounded-xl border border-cyan/30 bg-cyan/15 px-3 py-2 text-[11px] font-bold text-cyan hover:bg-cyan/25"
            >
              <Mic className="h-3.5 w-3.5" />
              Probar Voz Guía
            </button>
          </div>
        </section>

        {/* ═══ 3. Skater avatar ═════════════════════════════ */}
        <section className="px-4 py-3.5 space-y-2.5">
          <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <Layers className="w-3.5 h-3.5 text-cyan" />
            Avatar Cinemático
          </h3>
          <div className="flex gap-1.5">
            {(
              [
                { gender: 'female', label: 'Patinadora' },
                { gender: 'male', label: 'Patinador' },
              ] as const
            ).map(({ gender, label }) => (
              <button
                key={gender}
                type="button"
                onClick={() => setSkaterGender(gender)}
                className={[
                  'flex-1 py-2 rounded-xl text-xs font-bold interactive-tap transition-all',
                  skaterGender === gender
                    ? 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
                    : 'bg-neon-card text-slate-400 hover:text-white hover:bg-neon-hover shadow-soft-elevation',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* ═══ 4. Rink view toggles ═════════════════════════ */}
        <section className="px-4 py-3.5 space-y-2">
          <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <Eye className="w-3.5 h-3.5 text-cyan" />
            Superposiciones de Pista
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            <ToggleButton
              icon={<Layers className="w-3 h-3" />}
              label="Cuadrícula"
              active={showRinkGrid}
              onClick={() => setShowRinkGrid(!showRinkGrid)}
              title="Mostrar u ocultar cuadrícula World Skate"
            />
            <ToggleButton
              icon={<Compass className="w-3 h-3" />}
              label="Guías 3/4"
              active={showReglamentaryGuides}
              onClick={() => setShowReglamentaryGuides(!showReglamentaryGuides)}
              title="Ejes y marcas de 3/4 para Skating Skills y Tijeras"
            />
            <ToggleButton
              icon={<CircleDot className="w-3 h-3" />}
              label="Figuras"
              active={showCompulsoryFigures}
              onClick={() => setShowCompulsoryFigures(!showCompulsoryFigures)}
              title="Círculos oficiales de Figuras Obligatorias (World Skate)"
            />
          </div>

          {/* Reproducción: elegir entre patinador + trazado, o sólo trazado. */}
          <ToggleButton
            icon={<Footprints className="w-3 h-3" />}
            label="Patinador en reproducción"
            active={showSkaterDuringPlayback}
            onClick={() => setShowSkaterDuringPlayback(!showSkaterDuringPlayback)}
            title="Durante PLAY: mostrar al patinador siguiendo el trazado. Desactivado: se reproduce sólo el trazado, sin patinador."
          />
        </section>

        {/* ═══ Paper-to-Digital Ecosystem ═══════════════════ */}
        <section className="px-4 py-3.5 space-y-2 bg-gradient-to-b from-white/[0.03] to-transparent">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan">
              <Camera className="w-3.5 h-3.5 text-cyan" />
              Paper-to-Digital
            </h3>
            <span className="text-[9px] font-black text-mint px-1.5 py-0.5 rounded bg-mint/10 border border-mint/20">
              World Skate
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Imprime la plantilla oficial, dibuja a mano alzada y digitaliza al instante.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                // Import dinámico: jsPDF + html2canvas solo se descargan al pulsar.
                void import('../services/pdfTemplateGenerator').then((m) =>
                  m.PdfTemplateGenerator.downloadTemplate()
                );
              }}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-neon-card hover:bg-neon-hover text-slate-300 hover:text-white border border-white/5 text-xs font-bold transition-all interactive-tap shadow-soft-elevation"
              title="Descargar plantilla A4 para imprimir"
            >
              <FileDown className="w-3.5 h-3.5 text-cyan" />
              <span>Plantilla A4</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPaperModal(true)}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/30 text-xs font-bold transition-all interactive-tap shadow-soft-elevation"
              title="Tomar foto o subir dibujo en papel"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Digitalizar</span>
            </button>
          </div>

          {paperTraceOverlay && (
            <button
              type="button"
              onClick={() => clearPaperTraceOverlay()}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-xs font-bold transition-all interactive-tap mt-1.5"
              title="Descartar calco de la plantilla de papel"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Descartar Plantilla / Calco</span>
            </button>
          )}
        </section>

        {/* ═══ 5. Secondary actions ═════════════════════════ */}
        <section className="px-4 py-3.5 space-y-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Herramientas
          </h3>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onUndo}
              disabled={history.length === 0}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-neon-card hover:bg-neon-hover text-slate-300 hover:text-white shadow-soft-elevation interactive-tap disabled:opacity-30 disabled:pointer-events-none"
            >
              <Undo2 className="w-3.5 h-3.5 text-coral" />
              Deshacer
            </button>
          </div>
          <button
            type="button"
            onClick={() => { audio.pause(); audio.seek(0); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-neon-card py-2.5 text-xs font-bold text-slate-300 shadow-soft-elevation hover:bg-neon-hover hover:text-white interactive-tap"
          >
            <SkipBack className="w-3.5 h-3.5 text-slate-400" />
            Volver al Inicio (00:00)
          </button>

          {/* «Limpiar Pista 2D» se movió a la barra principal (desktop) y al rail
              de herramientas (móvil/tablet), con confirmación previa. Aquí se
              evita duplicar la acción. */}
        </section>

        {/* ═══ SaaS / Sesión AlsizTech ═══════════════════════ */}
        <section className="px-4 py-3 bg-white/[0.02] border-t border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Cuenta AlsizTech
            </span>
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-mint/15 text-mint border border-mint/20">
              <ShieldCheck className="w-2.5 h-2.5" />
              {role === 'tester' ? 'Beta Tester' : role === 'superadmin' ? 'Admin' : subscription_plan === 'club' ? 'Licencia Club' : 'Individual'}
            </span>
          </div>

          {/* Botón Mis Dispositivos (Anti-Sharing) */}
          {user && (
            <button
              type="button"
              onClick={() => setShowDeviceModal(true)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-white/5 text-[11px] font-medium text-slate-300 hover:text-white transition-all interactive-tap"
            >
              <span className="flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-cyan" />
                <span>Mis Dispositivos &amp; Clave</span>
              </span>
              <span className="text-[10px] text-cyan font-bold">Ver &gt;</span>
            </button>
          )}

          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="truncate max-w-[170px] text-slate-400 text-[11px]" title={user?.email || 'Usuario'}>
              {user?.email || 'Sesión Activa'}
            </span>
            <button
              type="button"
              onClick={onLogout ?? logout}
              className="flex items-center gap-1 text-[11px] font-semibold text-coral/80 hover:text-coral transition-colors py-1 px-2 rounded-lg hover:bg-coral/10 interactive-tap"
              title="Cerrar sesión de forma segura"
            >
              <LogOut className="w-3 h-3" />
              Salir
            </button>
          </div>
        </section>

        {/* ═══ Footer Attribution (Carbon Design System) ═════════════════════════ */}
        <section className="px-4 py-3 bg-white/[0.01] border-t border-white/5 text-center">
          <p className="text-xs text-gray-500 font-normal leading-relaxed">
            Desarrollado por{' '}
            <a
              href="http://www.alsitech.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline hover:text-blue-400 transition-colors font-medium"
            >
              AlsisTech
            </a>
            {' | '}
            Asesoría Técnica: Avril Andrade Sanchez
          </p>
        </section>
    </>
  );

  if (isMobileModal) {
    return (
      <div
        className="w-full text-white select-none"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        {showHeader && (
          <div className="flex-none flex items-center px-4 py-3 border-b border-white/5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Preparación &amp; Audio
            </p>
          </div>
        )}
        <div className="divide-y divide-white/5">
          {content}
        </div>
        <DeviceSecurityModal
          isOpen={showDeviceModal}
          onClose={() => setShowDeviceModal(false)}
        />
        <PaperToDigitalModal
          isOpen={showPaperModal}
          onClose={() => setShowPaperModal(false)}
        />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full w-full bg-neon-surface text-white select-none"
      style={{
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        touchAction: 'pan-y',
      }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {/* ── Panel header ── */}
      {showHeader && (
        <div className="flex-none flex items-center px-4 py-3 border-b border-white/5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Preparación &amp; Audio
          </p>
        </div>
      )}

      {/* ── Scrollable body ── */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain divide-y divide-white/5"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        {content}
      </div>

      <DeviceSecurityModal
        isOpen={showDeviceModal}
        onClose={() => setShowDeviceModal(false)}
      />
      <PaperToDigitalModal
        isOpen={showPaperModal}
        onClose={() => setShowPaperModal(false)}
      />
    </div>
  );
};


/* ─── Reusable Subcomponents ─────────────────────────── */

function VolumeSlider({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-slate-300 font-medium">
          {icon}
          {label}
        </span>
        <span className="font-mono text-cyan font-bold text-[11px]">
          {Math.round(value * 100)}%
        </span>
      </div>
      <input
        type="range" min={0} max={1} step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 accent-cyan bg-neon-surface rounded-full cursor-pointer"
      />
    </div>
  );
}

function ToggleButton({
  icon,
  label,
  active,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      className={[
        // Columna icono + etiqueta: la etiqueta dispone de todo el ancho del
        // cajón y puede partirse en dos líneas sin desbordar ni solaparse.
        'press flex w-full min-w-0 min-h-touch flex-col items-center justify-center gap-1 overflow-hidden rounded-xl px-1 py-1.5 text-center',
        active
          ? 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
          : 'bg-neon-card text-slate-400 hover:text-white hover:bg-neon-hover shadow-soft-elevation',
      ].join(' ')}
    >
      <span className="shrink-0 leading-none">{icon}</span>
      <span
        className="wrap-anywhere block w-full text-[10px] font-bold leading-[1.15]"
        style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', hyphens: 'auto' }}
      >
        {label}
      </span>
    </button>
  );
}
