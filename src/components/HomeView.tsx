import React from 'react';
import {
  Compass,
  AudioLines,
  FolderOpen,
  ScanLine,
  ArrowRight,
  Users,
  Lock,
  Sparkles,
} from 'lucide-react';
import { SkateCoreoBrand } from './brand/SkateCoreoBrand';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

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
  /** Acceso al Panel de Entrenadores. */
  onOpenCoach?: () => void;
  /** Estado de rol de entrenador. */
  isCoach?: boolean;
  /** Acción para abrir modal de upgrade a entrenador. */
  onUpgradeToCoach?: () => void;
}

/* ── Glifos vectoriales de precisión arquitectónica ──────────────── */

const RinkGlyph: React.FC = () => (
  <svg viewBox="0 0 240 86" className="h-full w-full" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="rinkStroke" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0072FF" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#00E599" stopOpacity="0.9" />
      </linearGradient>
      <radialGradient id="rinkGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#0072FF" stopOpacity="0.15" />
        <stop offset="100%" stopColor="#0072FF" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect x="6" y="8" width="228" height="70" rx="20" fill="url(#rinkGlow)" />
    <rect
      x="6"
      y="8"
      width="228"
      height="70"
      rx="20"
      stroke="rgba(0,114,255,0.25)"
      strokeWidth="1.5"
      strokeDasharray="4 4"
    />
    <line x1="120" y1="8" x2="120" y2="78" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3 3" />
    <circle cx="120" cy="43" r="16" stroke="rgba(0,114,255,0.2)" strokeWidth="1" />
    <path
      d="M26 62 C 65 16, 95 68, 138 28 S 192 56, 214 26"
      stroke="url(#rinkStroke)"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <circle cx="26" cy="62" r="4.5" fill="#00E599" className="shadow-glow-mint" />
    <circle cx="138" cy="28" r="4.5" fill="#FFFFFF" />
    <circle cx="214" cy="26" r="4.5" fill="#FF3366" className="shadow-glow-coral" />
  </svg>
);

const WAVE_BARS = [16, 32, 48, 24, 62, 38, 70, 42, 54, 28, 64, 40, 50, 22, 46, 32, 58, 26, 38, 20];

const WaveGlyph: React.FC = () => (
  <svg viewBox="0 0 240 86" className="h-full w-full" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="waveGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#00E599" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#00E599" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect x="6" y="8" width="228" height="70" rx="16" fill="url(#waveGlow)" />
    {WAVE_BARS.map((h, i) => (
      <rect
        key={i}
        x={14 + i * 11}
        y={43 - h / 2}
        width="4"
        height={h}
        rx="2"
        fill="#00E599"
        opacity={0.35 + (i % 4) * 0.18}
      />
    ))}
    <line x1="10" y1="43" x2="230" y2="43" stroke="rgba(0,229,153,0.3)" strokeWidth="1" />
  </svg>
);

const CoachGlyph: React.FC = () => (
  <svg viewBox="0 0 240 86" className="h-full w-full" fill="none" aria-hidden="true">
    <defs>
      <radialGradient id="coachGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FF3366" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#FF3366" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect x="6" y="8" width="228" height="70" rx="16" fill="url(#coachGlow)" />
    <circle cx="120" cy="30" r="14" stroke="#FF3366" strokeWidth="2" opacity="0.9" />
    <path
      d="M86 66 C86 50, 100 46, 120 46 C140 46, 154 50, 154 66"
      stroke="#FF3366"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.9"
    />
    <circle cx="62" cy="36" r="10" stroke="rgba(255,51,102,0.5)" strokeWidth="1.5" />
    <path
      d="M40 66 C40 55, 49 51, 62 51 C75 51, 84 55, 84 66"
      stroke="rgba(255,51,102,0.5)"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle cx="178" cy="36" r="10" stroke="rgba(255,51,102,0.5)" strokeWidth="1.5" />
    <path
      d="M156 66 C156 55, 165 51, 178 51 C191 51, 200 55, 200 66"
      stroke="rgba(255,51,102,0.5)"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

/* ── Módulo de acceso principal ─────────────────────────────────── */

interface AccessModuleProps {
  tone: 'cobalt' | 'mint' | 'coral';
  icon: React.ReactNode;
  tag?: string;
  eyebrow: string;
  title: string;
  lines: string[];
  cta: string;
  glyph: React.ReactNode;
  onClick: () => void;
  locked?: boolean;
}

const AccessModule: React.FC<AccessModuleProps> = ({
  tone,
  icon,
  tag,
  eyebrow,
  title,
  lines,
  cta,
  glyph,
  onClick,
  locked,
}) => {
  const isCobalt = tone === 'cobalt';
  const isMint = tone === 'mint';

  const toneConfig = isCobalt
    ? {
        border: 'border-white/[0.08] hover:border-cobalt-500/50',
        glow: 'from-cobalt-600/[0.12] via-transparent to-transparent',
        radial: 'bg-cobalt-500/10',
        iconBg: 'bg-cobalt-500/15 text-cobalt-400 ring-1 ring-cobalt-400/30',
        eyebrow: 'text-cobalt-400',
        dot: 'bg-cobalt-400',
        buttonVariant: 'cobalt' as const,
        badgeVariant: 'cobalt' as const,
      }
    : isMint
    ? {
        border: 'border-white/[0.08] hover:border-mint-500/50',
        glow: 'from-mint-600/[0.12] via-transparent to-transparent',
        radial: 'bg-mint-500/10',
        iconBg: 'bg-mint-500/15 text-mint-400 ring-1 ring-mint-400/30',
        eyebrow: 'text-mint-400',
        dot: 'bg-mint-400',
        buttonVariant: 'mint' as const,
        badgeVariant: 'mint' as const,
      }
    : {
        border: locked
          ? 'border-white/[0.08] hover:border-coral-500/40'
          : 'border-white/[0.08] hover:border-coral-500/50',
        glow: 'from-coral-600/[0.12] via-transparent to-transparent',
        radial: 'bg-coral-500/10',
        iconBg: 'bg-coral-500/15 text-coral-400 ring-1 ring-coral-400/30',
        eyebrow: 'text-coral-400',
        dot: 'bg-coral-400',
        buttonVariant: 'coach' as const,
        badgeVariant: 'coral' as const,
      };

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={cta}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-surface-1/90 backdrop-blur-md p-6 border transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-elevation-2 active:scale-[0.99] select-none ${toneConfig.border}`}
    >
      {/* Resplandor angular superior */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${toneConfig.glow}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full blur-3xl ${toneConfig.radial}`}
      />

      {/* Cabecera del módulo con icono y etiqueta */}
      <div className="relative flex items-start justify-between gap-3 mb-5">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-inner ${toneConfig.iconBg}`}>
          {icon}
        </div>
        {tag && (
          <Badge variant={toneConfig.badgeVariant} size="sm">
            {tag}
          </Badge>
        )}
      </div>

      {/* Cuerpo principal con títulos y lista */}
      <div className="relative flex flex-col gap-1.5 mb-4">
        <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${toneConfig.eyebrow}`}>
          {eyebrow}
        </span>
        <div className="font-display font-bold text-xl text-white tracking-tight flex items-center justify-between gap-2">
          <span>{title}</span>
          {locked && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-surface-2 px-2 py-0.5 rounded-md border border-white/10">
              <Lock className="h-3 w-3 text-slate-400 shrink-0" />
              <span>Bloqueado</span>
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-col gap-1.5">
          {lines.map((line) => (
            <div key={line} className="flex items-center gap-2 text-xs text-slate-400">
              <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneConfig.dot}`} />
              <span>{line}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Glifo técnico */}
      <div className="relative my-3 rounded-xl border border-white/[0.05] bg-surface-2/60 p-2 overflow-hidden shadow-inner">
        {glyph}
      </div>

      {/* Botón de acción */}
      <div className="relative mt-2">
        <Button
          variant={locked ? 'outline' : toneConfig.buttonVariant}
          size="md"
          className="w-full justify-between"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <span>{cta}</span>
          {locked ? (
            <Sparkles className="h-4 w-4 text-coral-400 shrink-0" />
          ) : (
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 shrink-0" />
          )}
        </Button>
      </div>
    </div>
  );
};

/* ── Vista principal ─────────────────────────────────────────── */

export const HomeView: React.FC<HomeViewProps> = ({
  onOpenRink,
  onOpenStudio,
  onImportCoreo,
  onOpenPaperToDigital,
  onOpenCoach,
  isCoach = false,
  onUpgradeToCoach,
}) => {
  return (
    <section
      aria-label="Inicio"
      className="relative flex-1 min-h-0 overflow-y-auto scroll-touch bg-canvas"
    >
      <div className="relative mx-auto min-h-full w-full max-w-6xl px-4 py-8 animate-fade-in sm:px-6 lg:px-8">
        {/* Luces sutiles de fondo (estáticas, rendimiento óptimo) */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-cobalt-500/10 blur-[120px]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-12 right-12 h-72 w-72 rounded-full bg-mint-500/[0.08] blur-[120px]"
        />

        {/* ── Header de Marca y Hero ── */}
        <header className="relative flex flex-col items-center text-center mb-8">
          <div className="flex justify-center mb-2">
            <SkateCoreoBrand size="lg" />
          </div>

          <h1 className="mt-2 max-w-[20ch] font-display text-2xl sm:text-3xl font-bold text-white tracking-tight sm:max-w-[26ch]">
            Tecnología para crear <span className="text-gradient-brand">el movimiento perfecto</span>.
          </h1>

          <div className="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
            <span>Diseña</span>
            <span className="text-cobalt-400">·</span>
            <span>Sincroniza</span>
            <span className="text-mint-400">·</span>
            <span>Visualiza</span>
          </div>
        </header>

        {/* ── Los tres accesos principales (responsivos 1-2-3 col) ── */}
        <div className="relative grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 mb-10">
          <AccessModule
            tone="cobalt"
            tag="Editor principal"
            icon={<Compass className="h-6 w-6" />}
            eyebrow="Coreografía"
            title="Pista 2D"
            lines={['Diseño coreográfico reglamentario', 'Trazado técnico y curvas de Bézier', 'Visualización espacial y tiempos']}
            cta="Abrir Pista 2D"
            glyph={<RinkGlyph />}
            onClick={onOpenRink}
          />

          <AccessModule
            tone="mint"
            tag="Segundo pilar"
            icon={<AudioLines className="h-6 w-6" />}
            eyebrow="Audio"
            title="Audio Studio"
            lines={['Edición y mezcla multipista', 'Recortes, fundidos y cues', 'Exportación directa al visor']}
            cta="Editar en Estudio"
            glyph={<WaveGlyph />}
            onClick={onOpenStudio}
          />

          <AccessModule
            tone="coral"
            tag={isCoach ? 'Entrenador Activo' : 'Exclusivo Entrenadores'}
            icon={<Users className="h-6 w-6" />}
            eyebrow="Gestión Deportiva"
            title="Panel de Entrenador"
            lines={[
              'Atletas y fichas deportivas',
              'Evaluación técnica de rutinas (RollArt / FEP)',
              'Sincronización en la nube (1-clic)',
            ]}
            cta={isCoach ? 'Abrir Panel de Entrenador' : 'Conocer Plan Entrenador'}
            glyph={<CoachGlyph />}
            onClick={isCoach ? (onOpenCoach || (() => {})) : (onUpgradeToCoach || (() => {}))}
            locked={!isCoach}
          />
        </div>

        {/* ── Herramientas complementarias ── */}
        <div className="relative flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="h-px w-10 bg-white/10" />
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
              Herramientas complementarias
            </span>
            <span aria-hidden="true" className="h-px w-10 bg-white/10" />
          </div>

          <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button variant="secondary" onClick={onImportCoreo}>
              <FolderOpen className="h-4 w-4 text-cobalt-400" />
              <span>Importar .coreo</span>
            </Button>

            {onOpenPaperToDigital && (
              <Button variant="secondary" onClick={onOpenPaperToDigital}>
                <ScanLine className="h-4 w-4 text-mint-400" />
                <span>Digitalizar plantilla A4</span>
              </Button>
            )}

            {onOpenCoach && (
              <Button variant="secondary" onClick={onOpenCoach}>
                <Users className="h-4 w-4 text-coral-400" />
                <span>Panel de Entrenadores</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
