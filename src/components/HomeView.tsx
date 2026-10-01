import React from 'react';
import {
  AudioLines,
  FolderOpen,
  ScanLine,
  ArrowRight,
  Users,
  Lock,
  Sparkles,
} from 'lucide-react';
import { RinkIcon } from './icons/RinkIcon';
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

/* ── Glifos vectoriales técnicos sobrios (Inspirados en Bear & Herramientas Pro) ────── */

const RinkGlyph: React.FC = () => (
  <svg viewBox="0 0 240 64" className="h-full w-full" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <rect x="4" y="4" width="232" height="56" rx="8" fill="rgba(46, 124, 246, 0.05)" />
    <rect
      x="4"
      y="4"
      width="232"
      height="56"
      rx="8"
      stroke="rgba(46, 124, 246, 0.2)"
      strokeWidth="1"
      strokeDasharray="4 4"
    />
    <line x1="120" y1="4" x2="120" y2="60" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" strokeDasharray="3 3" />
    <circle cx="120" cy="32" r="12" stroke="rgba(46, 124, 246, 0.25)" strokeWidth="1" />
    <path
      d="M26 44 C 65 14, 95 50, 138 20 S 192 42, 214 18"
      stroke="#2E7CF6"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
    <circle cx="26" cy="44" r="2.5" fill="#10B981" />
    <circle cx="138" cy="20" r="2.5" fill="#FFFFFF" />
    <circle cx="214" cy="18" r="2.5" fill="#E11D48" />
  </svg>
);

const WAVE_BARS = [12, 24, 36, 18, 44, 28, 48, 32, 38, 20, 46, 30, 36, 16, 34, 24, 40, 18, 28, 14];

const WaveGlyph: React.FC = () => (
  <svg viewBox="0 0 240 64" className="h-full w-full" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <rect x="4" y="4" width="232" height="56" rx="8" fill="rgba(13, 148, 136, 0.05)" />
    {WAVE_BARS.map((h, i) => (
      <rect
        key={i}
        x={16 + i * 10.8}
        y={32 - h / 2}
        width="2.5"
        height={h}
        rx="1"
        fill="#0D9488"
        opacity={0.35 + (i % 4) * 0.16}
      />
    ))}
    <line x1="10" y1="32" x2="230" y2="32" stroke="rgba(13, 148, 136, 0.25)" strokeWidth="1" />
  </svg>
);

const CoachGlyph: React.FC = () => (
  <svg viewBox="0 0 240 64" className="h-full w-full" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <rect x="4" y="4" width="232" height="56" rx="8" fill="rgba(225, 29, 72, 0.05)" />
    <circle cx="120" cy="22" r="9" stroke="#E11D48" strokeWidth="1.5" opacity="0.8" />
    <path
      d="M98 48 C98 39, 106 35, 120 35 C134 35, 142 39, 142 48"
      stroke="#E11D48"
      strokeWidth="1.5"
      strokeLinecap="round"
      opacity="0.8"
    />
    <circle cx="72" cy="26" r="6" stroke="rgba(225, 29, 72, 0.4)" strokeWidth="1" />
    <path
      d="M58 48 C58 42, 63 39, 72 39 C81 39, 86 42, 86 48"
      stroke="rgba(225, 29, 72, 0.4)"
      strokeWidth="1"
      strokeLinecap="round"
    />
    <circle cx="168" cy="26" r="6" stroke="rgba(225, 29, 72, 0.4)" strokeWidth="1" />
    <path
      d="M154 48 C154 42, 159 39, 168 39 C177 39, 182 42, 182 48"
      stroke="rgba(225, 29, 72, 0.4)"
      strokeWidth="1"
      strokeLinecap="round"
    />
  </svg>
);

/* ── Módulo de acceso principal (100% IDÉNTICO EN PROPORCIONES Y SISTEMA) ── */

interface AccessModuleProps {
  tone: 'blue' | 'teal' | 'magenta';
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
  const config = {
    blue: {
      border: 'border-white/[0.07] hover:border-ice-primary/40',
      iconBox: 'bg-ice-primary/10 text-ice-primary border border-ice-primary/20',
      eyebrow: 'text-ice-light',
      dot: 'bg-ice-primary',
      badgeVariant: 'cobalt' as const,
      btnVariant: 'primary' as const,
    },
    teal: {
      border: 'border-white/[0.07] hover:border-studio-primary/40',
      iconBox: 'bg-studio-primary/10 text-studio-light border border-studio-primary/20',
      eyebrow: 'text-studio-light',
      dot: 'bg-studio-primary',
      badgeVariant: 'mint' as const,
      btnVariant: 'mint' as const,
    },
    magenta: {
      border: 'border-white/[0.07] hover:border-coach-primary/40',
      iconBox: 'bg-coach-primary/10 text-coach-light border border-coach-primary/20',
      eyebrow: 'text-coach-light',
      dot: 'bg-coach-primary',
      badgeVariant: 'coral' as const,
      btnVariant: locked ? ('outline' as const) : ('coach' as const),
    },
  }[tone];

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
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-surface-1 border p-5 sm:p-6 transition-all duration-200 cursor-pointer select-none hover:shadow-elevation-2 active:scale-[0.99] h-full ${config.border}`}
    >
      {/* ── 1. Cabecera de la tarjeta: Icono alineado y Tag Badge ── */}
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm ${config.iconBox}`}>
          {icon}
        </div>
        {tag && (
          <Badge variant={config.badgeVariant} size="xs" className="shrink-0 font-medium">
            {tag}
          </Badge>
        )}
      </div>

      {/* ── 2. Cuerpo: Eyebrow + Título + Viñetas de función ── */}
      <div className="flex-1 flex flex-col justify-start">
        <span className={`text-[10px] font-mono uppercase tracking-wider font-medium ${config.eyebrow}`}>
          {eyebrow}
        </span>

        <div className="mt-1 font-display font-medium text-lg sm:text-xl text-white tracking-tight flex items-center justify-between gap-2">
          <span>{title}</span>
          {locked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-neutral-400 bg-surface-2 px-2 py-0.5 rounded-full border border-white/[0.08] shrink-0">
              <Lock className="h-3 w-3 text-neutral-400" />
              <span>Bloqueado</span>
            </span>
          )}
        </div>

        {/* Lista de características (flex-1 para absorber cualquier diferencia de texto) */}
        <div className="mt-3 flex flex-col gap-1.5 flex-1 min-h-[44px]">
          {lines.map((line) => (
            <div key={line} className="flex items-center gap-2 text-xs text-neutral-400 leading-tight">
              <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`} />
              <span className="truncate">{line}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3. Glifo técnico idéntico para las 3 tarjetas ── */}
      <div className="my-3 rounded-xl border border-white/[0.05] bg-[#0E1013] p-1 overflow-hidden h-11 w-full">
        {glyph}
      </div>

      {/* ── 4. Botón de acción (perfectamente alineado en el pie) ── */}
      <div className="mt-1 pt-1">
        <Button
          variant={config.btnVariant}
          size="sm"
          className="w-full justify-between font-medium"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <span>{cta}</span>
          {locked ? (
            <Sparkles className="h-3.5 w-3.5 text-coach-light shrink-0" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1 shrink-0" />
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
      className="relative flex-1 min-h-0 overflow-y-auto scroll-touch bg-canvas w-full flex flex-col justify-between"
    >
      <div className="relative mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 flex flex-col flex-1 justify-between min-h-full">
        {/* ── Header de Marca y Hero (Sleek, Bear-inspired & High Contrast) ── */}
        <header className="relative flex flex-col items-center text-center mb-5 sm:mb-6">
          <div className="flex justify-center mb-2">
            <SkateCoreoBrand size="md" />
          </div>

          <h1 className="mt-1 font-display text-xl sm:text-2xl font-semibold text-white tracking-tight max-w-[28ch]">
            Tecnología para crear <span className="text-gradient-brand">el movimiento perfecto</span>.
          </h1>

          <div className="mt-1.5 flex items-center gap-2 text-[10px] sm:text-xs font-mono font-medium uppercase tracking-[0.16em] text-neutral-400">
            <span>Diseña</span>
            <span className="text-ice-primary">·</span>
            <span>Sincroniza</span>
            <span className="text-studio-primary">·</span>
            <span>Visualiza</span>
            <span className="text-coach-primary">·</span>
            <span>Evalúa</span>
          </div>
        </header>

        {/* ── Cuadrícula de las 3 Tarjetas Principales (Proporciones 100% Idénticas) ── */}
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5 mb-5 items-stretch">
          <AccessModule
            tone="blue"
            tag="Editor principal"
            icon={<RinkIcon className="h-5 w-5" />}
            eyebrow="Coreografía"
            title="Pista 2D"
            lines={['Trazado técnico y curvas de Bézier', 'Visualización espacial y tiempos']}
            cta="Abrir Pista 2D"
            glyph={<RinkGlyph />}
            onClick={onOpenRink}
          />

          <AccessModule
            tone="teal"
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
            tone="magenta"
            tag={isCoach ? 'Entrenador Activo' : 'Exclusivo Entrenadores'}
            icon={<Users className="h-5 w-5" />}
            eyebrow="Gestión Deportiva"
            title="Panel del Entrenador"
            lines={[
              'Atletas y expedientes deportivos',
              'Evaluación técnica oficial RollArt / FEP',
            ]}
            cta={isCoach ? 'Abrir Panel del Entrenador' : 'Conocer Plan Entrenador'}
            glyph={<CoachGlyph />}
            onClick={isCoach ? (onOpenCoach || (() => {})) : (onUpgradeToCoach || (() => {}))}
            locked={!isCoach}
          />
        </div>

        {/* ── Herramientas complementarias (Discretas y alineadas en el pie) ── */}
        <div className="relative flex flex-col items-center gap-2 pb-2 pt-3 border-t border-white/[0.06]">
          <span className="text-[10px] font-mono font-medium uppercase tracking-[0.16em] text-neutral-400">
            Herramientas rápidas
          </span>

          <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto">
            <Button variant="secondary" size="sm" onClick={onImportCoreo}>
              <FolderOpen className="h-3.5 w-3.5 text-ice-primary" />
              <span>Importar .coreo</span>
            </Button>

            {onOpenPaperToDigital && (
              <Button variant="secondary" size="sm" onClick={onOpenPaperToDigital}>
                <ScanLine className="h-3.5 w-3.5 text-studio-primary" />
                <span>Digitalizar plantilla A4</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

