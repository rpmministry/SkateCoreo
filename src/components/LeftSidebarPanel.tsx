import React from 'react';
import {
  Music,
  Clock,
  Mic,
  Headphones,
  Timer,
  Layers,
  Eye,

  Sparkles,

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
  Building2,
  Users,
} from 'lucide-react';
import { audioEngine } from '../services/audioEngine';
import { getBuildLabel } from '../core/audio/buildInfo';
import { tabAudioCoordinator } from '../core/audio/tabAudioCoordinator';
import { TIME_SIGNATURES, METRONOME_SUBDIVISIONS } from '../core/audio/Metronome';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { useChoreographyStore } from '../store/useChoreographyStore';
import { useAuthStore, isOwnerOrAdmin } from '../store/useAuthStore';
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
const AdminDashboardModalLazy = React.lazy(() =>
  import('./admin/AdminDashboardModal').then((m) => ({ default: m.AdminDashboardModal }))
);
const PaperToDigitalModal = (props: React.ComponentProps<typeof PaperToDigitalModalLazy>) => (
  <React.Suspense fallback={null}><PaperToDigitalModalLazy {...props} /></React.Suspense>
);
const DeviceSecurityModal = (props: React.ComponentProps<typeof DeviceSecurityModalLazy>) => (
  <React.Suspense fallback={null}><DeviceSecurityModalLazy {...props} /></React.Suspense>
);
const AdminDashboardModal = (props: React.ComponentProps<typeof AdminDashboardModalLazy>) => (
  <React.Suspense fallback={null}><AdminDashboardModalLazy {...props} /></React.Suspense>
);

interface LeftSidebarPanelProps {
  preRollSec: number;
  onPreRollSecChange: (sec: number) => void;
  onClearRink?: () => void;
  // NOTA: se eliminó `onResetDemo`. La app arranca sin datos de prueba
  // (lienzo en blanco) y ya no existe coreografía ni música de demostración.
  /** Cierre de sesión unificado (misma limpieza que el resto de la app). */
  onLogout?: () => void;
  showHeader?: boolean;
  isMobileModal?: boolean;
  onOpenCoachPortal?: () => void;
}


/**
 * Left sidebar panel — IBM Carbon Design System aesthetic.
 * Uses soft surfaces, IBM Carbon Blue 60 active states and clear indicators.
 */
export const LeftSidebarPanel: React.FC<LeftSidebarPanelProps> = ({
  preRollSec,
  onPreRollSecChange,
  onLogout,
  showHeader = true,
  isMobileModal = false,
  onOpenCoachPortal,
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
  const [showAdminModal, setShowAdminModal] = React.useState(false);
  const isAdmin = role === 'superadmin' || isOwnerOrAdmin(user?.email);

  React.useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#admin' && isAdmin) {
        setShowAdminModal(true);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [isAdmin]);

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
            <h3 className="flex items-center gap-1.5 text-[10px] font-mono font-medium uppercase tracking-[0.16em] text-neutral-300">
              <BookOpen className="w-3.5 h-3.5 text-ice-primary" />
              Reglamento 2026
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-ice-primary/10 text-ice-light border border-ice-primary/25 tracking-wider">
              {categoria}
            </span>
          </div>

          {/* Input Edad y Categoría Calculada */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-neutral-400 font-medium">Edad del Atleta</span>
              <span className="text-[10px] font-mono text-neutral-500">
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
                className="w-20 px-3 py-1.5 rounded-lg bg-surface-2 border border-white/[0.08] text-white font-mono font-medium text-xs focus:outline-none focus:border-ice-primary transition-all text-center"
              />
              <div className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-surface-2 border border-white/[0.06] flex items-center justify-between gap-1">
                <span className="text-[10px] text-neutral-400 font-medium truncate-safe">Categoría:</span>
                <span className="text-xs font-semibold text-ice-light tracking-wide truncate-safe">{categoria}</span>
              </div>
            </div>
          </div>

          {/* Selector de Eficiencia */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-neutral-400 font-medium flex items-center justify-between">
              <span className="truncate-safe">Nivel de Eficiencia</span>
              <span className="text-[10px] text-ice-light font-mono font-medium shrink-0">{eficiencia}</span>
            </label>
            <div className="grid grid-cols-3 gap-1">
              {EFICIENCIAS_DISPONIBLES.map((eff) => (
                <button
                  key={eff}
                  type="button"
                  onClick={() => setEficiencia(eff)}
                  className={[
                    'press min-w-0 min-h-[36px] overflow-hidden rounded-lg px-1 py-1.5 text-center text-[9px] font-medium leading-[1.15] wrap-anywhere transition-colors',
                    eficiencia === eff
                      ? 'bg-ice-primary/15 text-ice-light border border-ice-primary/40 shadow-elevation-1'
                      : 'bg-surface-2 text-neutral-400 hover:text-white hover:bg-surface-3 border border-white/[0.07]',
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
          <h3 className="flex items-center gap-1.5 text-[10px] font-mono font-medium uppercase tracking-[0.16em] text-neutral-300">
            <Timer className="w-3.5 h-3.5 text-ice-primary" />
            Intro &amp; Pre-Inicio
          </h3>

          <div className="flex gap-1.5">
            {[0, 3, 5, 8].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => onPreRollSecChange(val)}
                className={[
                  'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  preRollSec === val
                    ? 'bg-ice-primary/15 text-ice-light border border-ice-primary/40 shadow-elevation-1'
                    : 'bg-surface-2 text-neutral-400 hover:text-white hover:bg-surface-3 border border-white/[0.07]',
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
            <h3 className="flex items-center gap-1.5 text-[10px] font-mono font-medium uppercase tracking-[0.16em] text-neutral-300">
              <Music className="w-3.5 h-3.5 text-ice-primary" />
              Mezclador de Audio
            </h3>
            <span className="text-[10px] text-neutral-500 font-mono">3 canales</span>
          </div>

          {/* Channel routing */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-neutral-400 flex items-center gap-1">
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
                    'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    audio.channelMode === mode
                      ? 'bg-ice-primary/15 text-ice-light border border-ice-primary/40 shadow-elevation-1'
                      : 'bg-surface-2 text-neutral-400 hover:text-white hover:bg-surface-3 border border-white/[0.07]',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-neutral-500">
              {audio.channelMode === 'split-coach'
                ? 'L: Música · R: Metrónomo/Voz'
                : 'L+R: Mezcla balanceada'}
            </p>
          </div>

          {/* Music Volume */}
          <VolumeSlider
            icon={<Music className="w-3 h-3 text-neutral-400" />}
            label="Música"
            value={audio.musicVolume}
            onChange={(v) => audio.setMusicVolume(v)}
          />

          {/* Metronome Volume */}
          <VolumeSlider
            icon={<Clock className="w-3 h-3 text-neutral-400" />}
            label="Metrónomo"
            value={audio.metronome.volume}
            onChange={(v) => audio.metronome.setVolume(v)}
          />

          {/* Metronome Controls */}
          <div className="bg-surface-2 border border-white/[0.07] rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-200">
                Metrónomo
              </span>
              <button
                type="button"
                onClick={() => audio.metronome.toggle()}
                className={[
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  audio.metronome.enabled
                    ? 'bg-studio-primary/20 text-studio-light border border-studio-primary/40'
                    : 'bg-surface-3 text-neutral-400 hover:text-white border border-white/[0.06]',
                ].join(' ')}
              >
                {audio.metronome.enabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {audio.metronome.enabled && (
              <div className="space-y-3 pt-3 border-t border-white/[0.06]">
                {/* ── Tempo (BPM) — fila completa ── */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="text-neutral-400 font-medium">Tempo</label>
                    <span className="font-mono font-medium text-studio-light">
                      {audio.metronome.bpm} BPM
                    </span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={240}
                    value={audio.metronome.bpm}
                    onChange={(e) => audio.metronome.setBpm(parseInt(e.target.value, 10))}
                    className="w-full h-1 accent-studio-primary bg-white/[0.08] rounded-full cursor-pointer"
                    aria-label="Tempo del metrónomo en BPM"
                  />
                </div>

                {/* ── Compás (Time Signature) — fila completa ── */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="text-neutral-400 font-medium">Compás</label>
                    <span className="font-mono font-medium text-ice-light">
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
                            'min-h-[38px] w-full min-w-0 flex items-center justify-center rounded-lg px-1 text-xs font-medium tabular-nums transition-colors',
                            isActive
                              ? 'bg-ice-primary/15 text-ice-light border border-ice-primary/40 shadow-elevation-1'
                              : 'bg-surface-3 text-neutral-400 hover:text-white border border-white/[0.06]',
                          ].join(' ')}
                        >
                          {ts.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Subdivisión (pulsos por beat): 1/1 · 1/2 · 1/4 · 1/8 ── */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="text-neutral-400 font-medium">Subdivisión</label>
                    <span className="font-mono font-medium text-ice-light">
                      {METRONOME_SUBDIVISIONS.find(
                        (s) => s.value === audio.metronome.subdivision
                      )?.label ?? '1/1'}
                    </span>
                  </div>
                  <div
                    role="group"
                    aria-label="Subdivisión del metrónomo"
                    className="grid grid-cols-4 gap-1"
                  >
                    {METRONOME_SUBDIVISIONS.map((sub) => {
                      const isActive = audio.metronome.subdivision === sub.value;
                      return (
                        <button
                          key={sub.label}
                          type="button"
                          onClick={() => audio.metronome.setSubdivision(sub.value)}
                          aria-pressed={isActive}
                          aria-label={`Subdivisión ${sub.label}`}
                          title={`Subdivisión ${sub.label}`}
                          className={[
                            'min-h-[38px] w-full min-w-0 flex items-center justify-center rounded-lg px-1 text-xs font-medium tabular-nums transition-colors',
                            isActive
                              ? 'bg-ice-primary/15 text-ice-light border border-ice-primary/40 shadow-elevation-1'
                              : 'bg-surface-3 text-neutral-400 hover:text-white border border-white/[0.06]',
                          ].join(' ')}
                        >
                          {sub.label}
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
            icon={<Mic className="w-3 h-3 text-neutral-400" />}
            label="Voz del Coach"
            value={audio.coachVolume}
            onChange={(v) => audio.setCoachVolume(v)}
          />

          {/* Sincronización Anticipada de la Voz Guía (Anticipatory Cues) */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-neutral-400 flex items-center gap-1">
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
                      'min-h-[38px] w-full min-w-0 flex items-center justify-center rounded-lg px-1 text-xs font-medium tabular-nums transition-colors',
                      isActive
                        ? 'bg-ice-primary/15 text-ice-light border border-ice-primary/40 shadow-elevation-1'
                        : 'bg-surface-2 text-neutral-400 hover:text-white hover:bg-surface-3 border border-white/[0.06]',
                    ].join(' ')}
                  >
                    {sec}s
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] leading-snug text-neutral-400">
              La figura se anuncia antes del conteo 3-2-1 para que el patinador
              llegue preparado al punto de ejecución.
            </p>
          </div>

          {/* Voz Guía ESTÁNDAR (única voz femenina latina, sin selectores) */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-[10px] font-medium text-neutral-400">
              <Sparkles className="w-3 h-3" />
              Voz Guía
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-studio-primary/30 bg-studio-primary/10 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-studio-primary" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-studio-light">Femenina latina estándar</p>
                <p className="text-[10px] leading-snug text-slate-400">
                  Voz única y pregenerada para todo el conteo y las figuras.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                // La prueba usa el MISMO AudioContext del motor (nunca uno
                // paralelo): se inicializa aquí dentro del gesto del usuario.
                audioEngine.initAudioContext();
                audioEngine.voiceCueEngine.testVoice();
              }}
                // La prueba usa el MISMO AudioContext del motor (nunca uno
                // paralelo): se inicializa aquí dentro del gesto del usuario.
                audioEngine.initAudioContext();
                audioEngine.voiceCueEngine.testVoice();
              }}
              className="press flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-surface-2 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-surface-3 hover:text-white transition-colors"
            >
              <Mic className="h-3.5 w-3.5 text-ice-primary" />
              Probar Voz Guía
            </button>
          </div>
        </section>

        {/* ═══ 3. Skater avatar ═════════════════════════════ */}
        <section className="px-4 py-3.5 space-y-2.5">
          <h3 className="flex items-center gap-1.5 text-[10px] font-mono font-medium uppercase tracking-[0.16em] text-neutral-300">
            <Layers className="w-3.5 h-3.5 text-ice-primary" />
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
                  'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  skaterGender === gender
                    ? 'bg-ice-primary/15 text-ice-light border border-ice-primary/40 shadow-elevation-1'
                    : 'bg-surface-2 text-neutral-400 hover:text-white hover:bg-surface-3 border border-white/[0.07]',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* ═══ 4. Rink view toggles ═════════════════════════ */}
        <section className="px-4 py-3.5 space-y-2">
          <h3 className="flex items-center gap-1.5 text-[10px] font-mono font-medium uppercase tracking-[0.16em] text-neutral-300">
            <Eye className="w-3.5 h-3.5 text-ice-primary" />
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
        <section className="px-4 py-3.5 space-y-2 bg-gradient-to-b from-white/[0.02] to-transparent">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[10px] font-mono font-medium uppercase tracking-[0.16em] text-neutral-300">
              <Camera className="w-3.5 h-3.5 text-ice-primary" />
              Paper-to-Digital
            </h3>
            <span className="text-[9px] font-medium text-studio-light px-2 py-0.5 rounded-full bg-studio-primary/10 border border-studio-primary/25">
              World Skate
            </span>
          </div>
          <p className="text-[11px] text-neutral-400 leading-snug">
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
              className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-neutral-300 hover:text-white border border-white/[0.07] text-xs font-medium transition-colors"
              title="Descargar plantilla A4 para imprimir"
            >
              <FileDown className="w-3.5 h-3.5 text-ice-primary" />
              <span>Plantilla A4</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPaperModal(true)}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-ice-primary/15 hover:bg-ice-primary/25 text-ice-light border border-ice-primary/30 text-xs font-medium transition-colors"
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
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-danger/10 hover:bg-danger/20 text-red-300 border border-danger/25 text-xs font-medium transition-colors mt-1.5"
              title="Descartar calco de la plantilla de papel"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-300" />
              <span>Descartar Plantilla / Calco</span>
            </button>
          )}
        </section>

        {/* ═══ SaaS / Sesión AlsizTech ═══════════════════════ */}
        <section className="px-4 py-3 bg-white/[0.02] border-t border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-medium uppercase tracking-[0.16em] text-neutral-400">
              Cuenta AlsizTech
            </span>
            <span className="inline-flex items-center gap-1 text-[9px] font-medium uppercase px-2 py-0.5 rounded-full bg-studio-primary/10 text-studio-light border border-studio-primary/25">
              <ShieldCheck className="w-2.5 h-2.5" />
              {role === 'tester' ? 'Beta Tester' : role === 'superadmin' ? 'Admin' : subscription_plan === 'club' ? 'Licencia Club' : 'Individual'}
            </span>
          </div>

          {/* Botón Panel Administrativo (Clubes & Licencias) */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAdminModal(true)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-white/[0.07] text-xs font-medium text-neutral-200 hover:text-white transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-ice-primary" />
                <span>Panel Clubes &amp; Licencias</span>
              </span>
              <span className="text-[10px] text-ice-light font-medium">Admin &gt;</span>
            </button>
          )}

          {/* Botón Panel de Entrenadores */}
          {onOpenCoachPortal && (
            <button
              type="button"
              onClick={onOpenCoachPortal}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-white/[0.07] text-xs font-medium text-neutral-200 hover:text-white transition-colors"
              title="Panel de Entrenadores: Atletas, Fichas, Coreografías y Almacenamiento"
            >
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-coach-primary" />
                <span>Panel de Entrenadores</span>
              </span>
              <span className="text-[10px] text-coach-light font-medium">Abrir &gt;</span>
            </button>
          )}

          {/* Botón Mis Dispositivos (Anti-Sharing) */}
          {user && (
            <button
              type="button"
              onClick={() => setShowDeviceModal(true)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-white/[0.07] text-xs font-medium text-neutral-300 hover:text-white transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-ice-primary" />
                <span>Mis Dispositivos &amp; Clave</span>
              </span>
              <span className="text-[10px] text-neutral-400 font-medium">Ver &gt;</span>
            </button>
          )}

          <div className="flex items-center justify-between text-xs text-neutral-300">
            <span className="truncate max-w-[170px] text-neutral-400 text-[11px]" title={user?.email || 'Usuario'}>
              {user?.email || 'Sesión Activa'}
            </span>
            <button
              type="button"
              onClick={onLogout ?? logout}
              className="flex items-center gap-1 text-[11px] font-medium text-red-300 hover:text-white transition-colors py-1 px-2 rounded-lg hover:bg-danger/10"
              title="Cerrar sesión de forma segura"
            >
              <LogOut className="w-3 h-3" />
              Salir
            </button>
          </div>
        </section>

        {/* ═══ Versión instalada / actualización (diagnóstico Android) ═══════ */}
        <section className="px-4 py-3 space-y-2 border-t border-white/5">
          <div className="flex items-center justify-between gap-2">
            <span
              className="truncate text-[10px] font-mono text-slate-500"
              title={`Build ${getBuildLabel()} · tab ${tabAudioCoordinator.tabId}`}
            >
              Versión {getBuildLabel()}
            </span>
            <button
              type="button"
              onClick={() => {
                // Forzar comprobación de actualización del Service Worker:
                // garantiza que Android/Brave no queden atrapados en una versión
                // cacheada anterior.
                void (async () => {
                  try {
                    if ('serviceWorker' in navigator) {
                      const reg = await navigator.serviceWorker.getRegistration();
                      if (reg) {
                        await reg.update();
                        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                      }
                    }
                  } catch {
                    /* sin Service Worker (dev o navegador antiguo) */
                  } finally {
                    window.setTimeout(() => window.location.reload(), 350);
                  }
                })();
              }}
              className="press shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-white/5"
              title="Comprueba si hay una versión nueva y recarga la aplicación"
            >
              Buscar actualización
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
        <AdminDashboardModal
          isOpen={showAdminModal}
          onClose={() => setShowAdminModal(false)}
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
      <AdminDashboardModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
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
        <span className="flex items-center gap-1.5 text-neutral-300 font-medium">
          {icon}
          {label}
        </span>
        <span className="font-mono text-ice-light font-medium text-[11px]">
          {Math.round(value * 100)}%
        </span>
      </div>
      <input
        type="range" min={0} max={1} step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 accent-ice-primary bg-white/[0.08] rounded-full cursor-pointer"
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
        'press flex w-full min-w-0 min-h-[38px] flex-col items-center justify-center gap-1 overflow-hidden rounded-lg px-1 py-1.5 text-center transition-colors',
        active
          ? 'bg-ice-primary/15 text-ice-light border border-ice-primary/40 shadow-elevation-1 font-medium'
          : 'bg-surface-2 text-neutral-400 hover:text-white hover:bg-surface-3 border border-white/[0.07]',
      ].join(' ')}
    >
      <span className="shrink-0 leading-none">{icon}</span>
      <span
        className="wrap-anywhere block w-full text-[10px] font-medium leading-[1.15]"
        style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', hyphens: 'auto' }}
      >
        {label}
      </span>
    </button>
  );
}
