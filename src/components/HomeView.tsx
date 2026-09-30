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

/* ── Glifos vectoriales compactos de precisión técnica ───────────── */

const RinkGlyph: React.FC = () => (
  <svg viewBox="0 0 240 70" className="h-full w-full" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="rinkStroke" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0072FF" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#00E599" stopOpacity="0.9" />
      </linearGradient>
      <radialGradient id="rinkGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#0072FF" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#0072FF" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect x="6" y="6" width="228" height="58" rx="16" fill="url(#rinkGlow)" />
    <rect
      x="6"
      y="6"
      width="228"
      height="58"
      rx="16"
      stroke="rgba(0,114,255,0.25)"
      strokeWidth="1.2"
      strokeDasharray="4 4"
    />
    <line x1="120" y1="6" x2="120" y2="64" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3 3" />
    <circle cx="120" cy="35" r="13" stroke="rgba(0,114,255,0.2)" strokeWidth="1" />
    <path
      d="M26 48 C 65 14, 95 54, 138 22 S 192 46, 214 20"
      stroke="url(#rinkStroke)"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    <circle cx="26" cy="48" r="3.5" fill="#00E599" />
    <circle cx="138" cy="22" r="3.5" fill="#FFFFFF" />
    <circle cx="214" cy="20" r="3.5" fill="#FF3366" />
  </svg>
);

const WAVE_BARS = [14, 26, 38, 20, 48, 30, 52, 34, 42, 22, 50, 32, 40, 18, 36, 26, 44, 20, 30, 16];

const WaveGlyph: React.FC = () => (
  <svg viewBox="0 0 240 70" className="h-full w-full" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="waveGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#00E599" stopOpacity="0.1" />
        <stop offset="100%" stopColor="#00E599" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect x="6" y="6" width="228" height="58" rx="14" fill="url(#waveGlow)" />
    {WAVE_BARS.map((h, i) => (
      <rect
        key={i}
        x={16 + i * 10.8}
        y={35 - h / 2}
        width="3.5"
        height={h}
        rx="1.5"
        fill="#00E599"
        opacity={0.35 + (i % 4) * 0.18}
      />
    ))}
    <line x1="12" y1="35" x2="228" y2="35" stroke="rgba(0,229,153,0.3)" strokeWidth="1" />
  </svg>
);

const CoachGlyph: React.FC = () => (
  <svg viewBox="0 0 240 70" className="h-full w-full" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <defs>
      <radialGradient id="coachGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FF3366" stopOpacity="0.1" />
        <stop offset="100%" stopColor="#FF3366" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect x="6" y="6" width="228" height="58" rx="14" fill="url(#coachGlow)" />
    <circle cx="120" cy="24" r="11" stroke="#FF3366" strokeWidth="1.8" opacity="0.9" />
    <path
      d="M94 52 C94 40, 104 36, 120 36 C136 36, 146 40, 146 52"
      stroke="#FF3366"
      strokeWidth="1.8"
      strokeLinecap="round"
      opacity="0.9"
    />
    <circle cx="70" cy="28" r="8" stroke="rgba(255,51,102,0.45)" strokeWidth="1.2" />
    <path
      d="M52 52 C52 44, 59 40, 70 40 C81 40, 88 44, 88 52"
      stroke="rgba(255,51,102,0.45)"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    <circle cx="170" cy="28" r="8" stroke="rgba(255,51,102,0.45)" strokeWidth="1.2" />
    <path
      d="M152 52 C152 44, 159 40, 170 40 C181 40, 188 44, 188 52"
      stroke="rgba(255,51,102,0.45)"
      strokeWidth="1.2"
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
  className?: string;
  isWideOnTablet?: boolean;
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
  className = '',
  isWideOnTablet = false,
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
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-surface-1/90 backdrop-blur-md p-4 sm:p-4.5 lg:p-5 border transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-elevation-2 active:scale-[0.99] select-none ${toneConfig.border} ${className}`}
    >
      {/* Resplandor ambiental de profundidad */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${toneConfig.glow}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full blur-2xl ${toneConfig.radial}`}
      />

      {/* Contenido en tablet cuando la tarjeta se expande a dos columnas */}
      {isWideOnTablet ? (
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between lg:flex-col lg:items-stretch gap-3">
          {/* Bloque Izquierdo / Principal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-inner ${toneConfig.iconBg}`}>
                  {icon}
                </div>
                <div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider block ${toneConfig.eyebrow}`}>
                    {eyebrow}
                  </span>
                  <div className="font-display font-bold text-base sm:text-lg text-white tracking-tight flex items-center gap-2">
                    <span>{title}</span>
                    {locked && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-surface-2 px-1.5 py-0.5 rounded border border-white/10">
                        <Lock className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                        <span>Bloqueado</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {tag && (
                <Badge variant={toneConfig.badgeVariant} size="xs" className="shrink-0">
                  {tag}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1 mt-1.5">
              {lines.map((line) => (
                <div key={line} className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneConfig.dot}`} />
                  <span className="truncate">{line}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bloque Derecho: Glifo y Botón */}
          <div className="flex flex-col md:flex-row lg:flex-col items-stretch md:items-center lg:items-stretch gap-2 shrink-0 md:w-auto lg:w-full mt-2 md:mt-0 lg:mt-2">
            <div className="hidden sm:block md:w-44 lg:w-full h-9 rounded-lg border border-white/[0.05] bg-surface-2/60 p-1 overflow-hidden shadow-inner">
              {glyph}
            </div>

            <Button
              variant={locked ? 'outline' : toneConfig.buttonVariant}
              size="sm"
              className="w-full md:w-48 lg:w-full justify-between"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
            >
              <span>{cta}</span>
              {locked ? (
                <Sparkles className="h-3.5 w-3.5 text-coral-400 shrink-0" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1 shrink-0" />
              )}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Cabecera del módulo con icono y etiqueta */}
          <div className="relative flex items-start justify-between gap-2 mb-2 sm:mb-2.5">
            <div className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl shadow-inner ${toneConfig.iconBg}`}>
              {icon}
            </div>
            {tag && (
              <Badge variant={toneConfig.badgeVariant} size="xs">
                {tag}
              </Badge>
            )}
          </div>

          {/* Cuerpo principal con títulos y lista */}
          <div className="relative flex flex-col gap-1 mb-2">
            <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${toneConfig.eyebrow}`}>
              {eyebrow}
            </span>
            <div className="font-display font-bold text-base sm:text-lg text-white tracking-tight flex items-center justify-between gap-2">
              <span>{title}</span>
              {locked && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-surface-2 px-1.5 py-0.5 rounded border border-white/10">
                  <Lock className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                  <span>Bloqueado</span>
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-col gap-1">
              {lines.map((line) => (
                <div key={line} className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-400">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneConfig.dot}`} />
                  <span className="truncate">{line}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Glifo técnico compacto */}
          <div className="relative my-1.5 rounded-lg border border-white/[0.05] bg-surface-2/60 p-1 overflow-hidden shadow-inner h-9 sm:h-10">
            {glyph}
          </div>

          {/* Botón de acción */}
          <div className="relative mt-1">
            <Button
              variant={locked ? 'outline' : toneConfig.buttonVariant}
              size="sm"
              className="w-full justify-between"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
            >
              <span>{cta}</span>
              {locked ? (
                <Sparkles className="h-3.5 w-3.5 text-coral-400 shrink-0" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1 shrink-0" />
              )}
            </Button>
          </div>
        </>
      )}
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
      className="relative flex-1 min-h-0 overflow-y-auto scroll-touch bg-canvas w-full flex flex-col justify-between"
    >
      <div className="relative mx-auto w-full max-w-6xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8 lg:py-5 flex flex-col flex-1 justify-between min-h-full">
        {/* Luces sutiles de fondo (estáticas, rendimiento óptimo) */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cobalt-500/10 blur-[100px]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-8 right-8 h-64 w-64 rounded-full bg-mint-500/[0.07] blur-[100px]"
        />

        {/* ── Header de Marca y Hero (Sleek, Compact & Balanced) ── */}
        <header className="relative flex flex-col items-center text-center mb-3 sm:mb-4 lg:mb-5">
          <div className="flex justify-center mb-1">
            <SkateCoreoBrand size="md" />
          </div>

          <h1 className="mt-1 font-display text-lg sm:text-2xl lg:text-2xl font-bold text-white tracking-tight max-w-[28ch]">
            Tecnología para crear <span className="text-gradient-brand">el movimiento perfecto</span>.
          </h1>

          <div className="mt-1 flex items-center gap-2 text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            <span>Diseña</span>
            <span className="text-cobalt-400">·</span>
            <span>Sincroniza</span>
            <span className="text-mint-400">·</span>
            <span>Visualiza</span>
            <span className="text-coral-400">·</span>
            <span>Evalúa</span>
          </div>
        </header>

        {/* ── Los tres accesos principales (responsivo 3 cols desktop, 2 cols + 1 wide en tablet, 1 col móvil) ── */}
        <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 lg:gap-5 mb-3 sm:mb-4">
          <AccessModule
            tone="cobalt"
            tag="Editor principal"
            icon={<Compass className="h-5 w-5" />}
            eyebrow="Coreografía"
            title="Pista 2D"
            lines={['Trazado técnico y curvas de Bézier', 'Visualización espacial y tiempos']}
            cta="Abrir Pista 2D"
            glyph={<RinkGlyph />}
            onClick={onOpenRink}
          />

          <AccessModule
            tone="mint"
            tag="Segundo pilar"
            icon={<AudioLines className="h-5 w-5" />}
            eyebrow="Audio"
            title="Audio Studio"
            lines={['Mezcla multipista y BPM sincrónico', 'Cues, recortes y fundidos']}
            cta="Editar en Estudio"
            glyph={<WaveGlyph />}
            onClick={onOpenStudio}
          />

          <AccessModule
            tone="coral"
            tag={isCoach ? 'Entrenador Activo' : 'Exclusivo Entrenadores'}
            icon={<Users className="h-5 w-5" />}
            eyebrow="Gestión Deportiva"
            title="Panel de Entrenador"
            lines={[
              'Atletas, fichas y expedientes deportivos',
              'Evaluación técnica oficial RollArt / FEP / White',
            ]}
            cta={isCoach ? 'Abrir Panel de Entrenador' : 'Conocer Plan Entrenador'}
            glyph={<CoachGlyph />}
            onClick={isCoach ? (onOpenCoach || (() => {})) : (onUpgradeToCoach || (() => {}))}
            locked={!isCoach}
            className="md:col-span-2 lg:col-span-1"
            isWideOnTablet={true}
          />
        </div>

        {/* ── Herramientas complementarias (Discretas y centradas) ── */}
        <div className="relative flex flex-col items-center gap-2 pb-1">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="h-px w-8 bg-white/10" />
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Herramientas rápidas
            </span>
            <span aria-hidden="true" className="h-px w-8 bg-white/10" />
          </div>

          <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto">
            <Button variant="secondary" size="sm" onClick={onImportCoreo}>
              <FolderOpen className="h-3.5 w-3.5 text-cobalt-400" />
              <span>Importar .coreo</span>
            </Button>

            {onOpenPaperToDigital && (
              <Button variant="secondary" size="sm" onClick={onOpenPaperToDigital}>
                <ScanLine className="h-3.5 w-3.5 text-mint-400" />
                <span>Digitalizar plantilla A4</span>
              </Button>
            )}

            {onOpenCoach && (
              <Button variant="secondary" size="sm" onClick={onOpenCoach}>
                <Users className="h-3.5 w-3.5 text-coral-400" />
                <span>Panel de Entrenadores</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
