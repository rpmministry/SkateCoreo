import React from 'react';
import {
  Sparkles,
  AudioLines,
  FolderClock,
  Settings2,
  Upload,
  HardDrive,
  FolderOpen,
  Save,
  Compass,
  Users,
  Music4,
  Gauge,
  CircleDot,
  ChevronRight,
  CheckCircle2,
  Loader2,
  ScanLine,
  ArrowRight,
} from 'lucide-react';
import { SkateCoreoBrand } from './brand/SkateCoreoBrand';
import { useAuthStore } from '../store/useAuthStore';
import { Button } from './ui/Button';

export interface HomeViewProps {
  skaterName?: string | null;
  skaterCategory?: string | null;
  programTitle?: string | null;
  pointsCount: number;
  unplacedNodesCount: number;
  audioFileName?: string | null;
  hasAudioLoaded: boolean;
  bpm: number;
  isSavingOffline: boolean;
  offlineSaved: boolean;
  onOpenRink: () => void;
  onOpenStudio: () => void;
  onOpenSkaters: () => void;
  onOpenSettings: () => void;
  onLoadAudio: () => void;
  onImportCoreo: () => void;
  onExportCoreo: () => void;
  onSaveOffline: () => void;
  /** Abre la digitalización de la plantilla A4 (Paper-to-Digital). */
  onOpenPaperToDigital?: () => void;
}

type Tone = 'cyan' | 'mint' | 'coral' | 'amber' | 'violet' | 'slate';

const PILL_TONE: Record<Tone, string> = {
  cyan: 'text-cyan border-cyan/25 bg-cyan/10',
  mint: 'text-mint border-mint/25 bg-mint/10',
  coral: 'text-coral border-coral/25 bg-coral/10',
  amber: 'text-amber-400 border-amber-400/25 bg-amber-400/10',
  violet: 'text-violet-300 border-violet-400/25 bg-violet-400/10',
  slate: 'text-slate-300 border-white/10 bg-white/[0.04]',
};

const ICON_RING: Record<Tone, string> = {
  cyan: 'bg-cyan/12 text-cyan ring-cyan/25',
  mint: 'bg-mint/12 text-mint ring-mint/25',
  coral: 'bg-coral/12 text-coral ring-coral/25',
  amber: 'bg-amber-400/12 text-amber-400 ring-amber-400/25',
  violet: 'bg-violet-400/12 text-violet-300 ring-violet-400/25',
  slate: 'bg-white/[0.06] text-slate-300 ring-white/10',
};

/* ── Presentacionales ─────────────────────────────────────────── */

const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mb-3 flex items-center gap-2">
    <h2 className="font-display text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
      {children}
    </h2>
    <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
  </div>
);

const MetaPill: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: Tone;
}> = ({ icon, label, value, tone = 'slate' }) => (
  <div className={`flex min-w-0 flex-col gap-0.5 rounded-xl border px-2.5 py-2 ${PILL_TONE[tone]}`}>
    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
      <span className="shrink-0 opacity-90">{icon}</span>
      {label}
    </span>
    <span className="truncate text-xs font-black text-white">{value}</span>
  </div>
);

interface ModuleCardProps {
  tone: 'cyan' | 'mint';
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  icon: React.ReactNode;
  onClick: () => void;
  badge?: number;
}

const ModuleCard: React.FC<ModuleCardProps> = ({
  tone,
  eyebrow,
  title,
  description,
  cta,
  icon,
  onClick,
  badge,
}) => {
  const border = tone === 'cyan' ? 'border-cyan/25 hover:border-cyan/50' : 'border-mint/25 hover:border-mint/50';
  const wash = tone === 'cyan' ? 'from-cyan/12' : 'from-mint/12';
  const ctaColor = tone === 'cyan' ? 'text-cyan' : 'text-mint';

  return (
    <button
      type="button"
      onClick={onClick}
      title={description}
      className={`press group relative flex min-h-[150px] flex-col justify-between overflow-hidden rounded-3xl border bg-white/[0.03] bg-gradient-to-br ${wash} to-transparent p-4 text-left shadow-soft-elevation sm:p-5 ${border}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/[0.05] blur-2xl"
      />
      <span className="relative flex items-start justify-between gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${ICON_RING[tone]}`}>
          {icon}
        </span>
        {typeof badge === 'number' && badge > 0 && (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[10px] font-black text-slate-950">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>

      <span className="relative mt-4 flex flex-col gap-0.5">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
          {eyebrow}
        </span>
        <span className="font-display text-base font-black leading-tight text-white">{title}</span>
        <span className="text-[11px] leading-snug text-slate-400">{description}</span>
      </span>

      <span className={`relative mt-3 inline-flex items-center gap-1.5 text-xs font-black ${ctaColor}`}>
        {cta}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
};

interface ToolItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  tone?: Tone;
  disabled?: boolean;
  badge?: string;
}

const ToolItem: React.FC<ToolItemProps> = ({
  icon,
  title,
  description,
  onClick,
  tone = 'slate',
  disabled,
  badge,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={description}
    className="press group flex min-h-touch items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-left hover:border-white/20 hover:bg-white/[0.07] disabled:pointer-events-none disabled:opacity-40 sm:flex-col sm:items-start sm:gap-2 sm:p-4"
  >
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${ICON_RING[tone]}`}
    >
      {icon}
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex items-center gap-1.5">
        <span className="wrap-anywhere text-[13px] font-bold leading-tight text-white">{title}</span>
        {badge && (
          <span className="rounded-full border border-mint/30 bg-mint/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-mint">
            {badge}
          </span>
        )}
      </span>
      <span className="wrap-anywhere text-[11px] leading-snug text-slate-400">{description}</span>
    </span>
    <ChevronRight className="h-4 w-4 shrink-0 text-slate-500 sm:hidden" />
  </button>
);

/* ── Vista principal ─────────────────────────────────────────── */

export const HomeView: React.FC<HomeViewProps> = ({
  skaterName,
  skaterCategory,
  programTitle,
  pointsCount,
  unplacedNodesCount,
  audioFileName,
  hasAudioLoaded,
  bpm,
  isSavingOffline,
  offlineSaved,
  onOpenRink,
  onOpenStudio,
  onOpenSkaters,
  onOpenSettings,
  onLoadAudio,
  onImportCoreo,
  onExportCoreo,
  onSaveOffline,
  onOpenPaperToDigital,
}) => {
  const trimmedAudio = audioFileName
    ? audioFileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ')
    : null;

  // Indicador de promoción Beta Tester (30 días): el plan lo fija el backend.
  const subscriptionPlan = useAuthStore((s) => s.subscription_plan);
  const getDaysRemaining = useAuthStore((s) => s.getDaysRemaining);
  const getFormattedExpiration = useAuthStore((s) => s.getFormattedExpiration);
  const isBetaTester = subscriptionPlan === 'beta_tester';
  const betaDays = isBetaTester ? getDaysRemaining() : 0;
  const betaExpiry = isBetaTester ? getFormattedExpiration() : null;

  return (
    <section
      aria-label="Inicio"
      className="flex-1 min-h-0 overflow-y-auto scroll-touch bg-neon-canvas"
    >
      <div className="mx-auto w-full max-w-[1200px] px-3 pb-8 pt-3 sm:px-5 sm:pt-5 lg:px-8 lg:pt-8">
        {/* ══════════ INDICADOR BETA TESTER (discreto) ══════════ */}
        {isBetaTester && (
          <div
            role="status"
            className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-coral/30 bg-coral/10 px-3 py-2 text-[11px]"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-coral" />
            <span className="font-black uppercase tracking-wide text-coral">Beta Tester</span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono font-bold text-white">
              {betaDays} {betaDays === 1 ? 'día restante' : 'días restantes'}
            </span>
            {betaExpiry && (
              <>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="text-slate-400">vence {betaExpiry}</span>
              </>
            )}
          </div>
        )}

        {/* ══════════ ENCABEZADO COMPACTO ══════════ */}
        <header className="relative isolate overflow-hidden rounded-3xl glass-panel px-4 py-4 shadow-soft-elevation sm:px-6 sm:py-6">
          <span aria-hidden="true" className="absolute inset-0 grid-veil opacity-60" />
          <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <SkateCoreoBrand size="lg" />
              <p className="mt-2 max-w-[48ch] text-[13px] leading-relaxed text-slate-300 sm:text-sm">
                Tu espacio de trabajo para diseñar, sincronizar y preparar coreografías.
              </p>
            </div>

            <span
              className={[
                'inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider sm:self-auto',
                hasAudioLoaded
                  ? 'border-mint/30 bg-mint/10 text-mint'
                  : 'border-white/10 bg-white/[0.04] text-slate-400',
              ].join(' ')}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${hasAudioLoaded ? 'bg-mint animate-glow-pulse' : 'bg-slate-600'}`}
              />
              {hasAudioLoaded ? 'Audio listo' : 'Sin audio'}
            </span>
          </div>
        </header>

        {/* ══════════ PROYECTO ACTUAL ══════════ */}
        <section aria-label="Proyecto actual" className="mt-4">
          <SectionHeading>Proyecto actual</SectionHeading>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan/12 text-cyan ring-1 ring-cyan/25">
                <FolderClock className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="wrap-anywhere font-display text-base font-black leading-tight text-white sm:text-lg">
                  {programTitle || 'Sin programa seleccionado'}
                </p>
                <p className="text-[11px] text-slate-400">
                  {skaterName
                    ? `${skaterName} · ${skaterCategory || 'Standard'}`
                    : 'Selecciona un atleta para comenzar'}
                </p>
              </div>
            </div>

            <div className="mt-3.5 grid grid-cols-3 gap-2">
              <MetaPill
                icon={<CircleDot className="h-3.5 w-3.5" />}
                label="Nodos"
                value={`${pointsCount}`}
                tone="coral"
              />
              <MetaPill
                icon={<Gauge className="h-3.5 w-3.5" />}
                label="Tempo"
                value={`${bpm} BPM`}
                tone="slate"
              />
              <MetaPill
                icon={<Music4 className="h-3.5 w-3.5" />}
                label="Pista"
                value={trimmedAudio || 'Sin audio'}
                tone="cyan"
              />
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button variant="primary" block onClick={onOpenRink}>
                Continuar en Pista 2D
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="secondary" block onClick={onOpenSkaters}>
                <Users className="h-4 w-4 text-cyan" />
                Cambiar atleta o programa
              </Button>
            </div>
          </div>
        </section>

        {/* ══════════ MÓDULOS PRINCIPALES ══════════ */}
        <section aria-label="Módulos principales" className="mt-5">
          <SectionHeading>Editor principal</SectionHeading>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ModuleCard
              tone="cyan"
              eyebrow="Módulo principal"
              title="Pista 2D"
              description="Diseña la coreografía y traza las trayectorias sobre la pista reglamentaria."
              cta="Abrir Pista"
              icon={<Compass className="h-5 w-5" />}
              onClick={onOpenRink}
            />
            <ModuleCard
              tone="mint"
              eyebrow="Módulo principal"
              title="Editor de Audio"
              description="Corta, mezcla y sincroniza tu música y cues vocales con la rutina."
              cta="Abrir Editor"
              icon={<AudioLines className="h-5 w-5" />}
              onClick={onOpenStudio}
              badge={unplacedNodesCount}
            />
          </div>
        </section>

        {/* ══════════ MÁS HERRAMIENTAS ══════════ */}
        <section aria-label="Más herramientas" className="mt-5">
          <SectionHeading>Más herramientas</SectionHeading>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            <ToolItem
              tone="violet"
              icon={<FolderClock className="h-[18px] w-[18px]" />}
              title="Proyectos recientes"
              description="Retoma programas guardados y cambia de atleta."
              onClick={onOpenSkaters}
            />
            <ToolItem
              tone="cyan"
              icon={<Upload className="h-[18px] w-[18px]" />}
              title="Cargar música"
              description="Importa MP3, WAV o M4A como pista oficial."
              onClick={onLoadAudio}
            />
            <ToolItem
              tone="mint"
              icon={<FolderOpen className="h-[18px] w-[18px]" />}
              title="Importar .coreo"
              description="Recupera una rutina con audio y nodos 2D."
              onClick={onImportCoreo}
            />
            <ToolItem
              tone="coral"
              icon={<Save className="h-[18px] w-[18px]" />}
              title="Exportar .coreo"
              description="Comparte el bundle completo de la rutina."
              onClick={onExportCoreo}
            />
            <ToolItem
              tone="mint"
              icon={
                isSavingOffline ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin" />
                ) : offlineSaved ? (
                  <CheckCircle2 className="h-[18px] w-[18px]" />
                ) : (
                  <HardDrive className="h-[18px] w-[18px]" />
                )
              }
              title={offlineSaved ? 'Sesión guardada' : 'Modo Offline'}
              description="Guarda audio y nodos en el dispositivo para entrenar sin red."
              onClick={onSaveOffline}
              disabled={!hasAudioLoaded || isSavingOffline}
              badge={offlineSaved ? 'Listo' : undefined}
            />
            {onOpenPaperToDigital && (
              <ToolItem
                tone="amber"
                icon={<ScanLine className="h-[18px] w-[18px]" />}
                title="Digitalizar plantilla A4"
                description="Escanea la hoja manuscrita y conviértela en nodos."
                onClick={onOpenPaperToDigital}
              />
            )}
            <ToolItem
              tone="slate"
              icon={<Settings2 className="h-[18px] w-[18px]" />}
              title="Ajustes de Pista"
              description="Cuadrícula, guías World Skate, pre-inicio y mezcla."
              onClick={onOpenSettings}
            />
          </div>
        </section>
      </div>
    </section>
  );
};
