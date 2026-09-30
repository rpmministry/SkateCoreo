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

/* ── Glifos vectoriales técnicos sobrios (Inspirados en Carbon) ────── */

const RinkGlyph: React.FC = () => (
  <svg viewBox="0 0 240 64" className="h-full w-full" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <rect x="4" y="4" width="232" height="56" rx="10" fill="rgba(15, 98, 254, 0.06)" />
    <rect
      x="4"
      y="4"
      width="232"
      height="56"
      rx="10"
      stroke="rgba(15, 98, 254, 0.25)"
      strokeWidth="1"
      strokeDasharray="4 4"
    />
    <line x1="120" y1="4" x2="120" y2="60" stroke="rgba(255, 255, 255, 0.12)" strokeWidth="1" strokeDasharray="3 3" />
    <circle cx="120" cy="32" r="12" stroke="rgba(15, 98, 254, 0.3)" strokeWidth="1" />
    <path
      d="M26 44 C 65 14, 95 50, 138 20 S 192 42, 214 18"
      stroke="#4589ff"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <circle cx="26" cy="44" r="3" fill="#24a148" />
    <circle cx="138" cy="20" r="3" fill="#ffffff" />
    <circle cx="214" cy="18" r="3" fill="#ee5396" />
  </svg>
);

const WAVE_BARS = [12, 24, 36, 18, 44, 28, 48, 32, 38, 20, 46, 30, 36, 16, 34, 24, 40, 18, 28, 14];

const WaveGlyph: React.FC = () => (
  <svg viewBox="0 0 240 64" className="h-full w-full" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <rect x="4" y="4" width="232" height="56" rx="10" fill="rgba(0, 157, 154, 0.06)" />
    {WAVE_BARS.map((h, i) => (
      <rect
        key={i}
        x={16 + i * 10.8}
        y={32 - h / 2}
        width="3"
        height={h}
        rx="1"
        fill="#009d9a"
        opacity={0.4 + (i % 4) * 0.18}
      />
    ))}
    <line x1="10" y1="32" x2="230" y2="32" stroke="rgba(0, 157, 154, 0.35)" strokeWidth="1" />
  </svg>
);

const CoachGlyph: React.FC = () => (
  <svg viewBox="0 0 240 64" className="h-full w-full" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <rect x="4" y="4" width="232" height="56" rx="10" fill="rgba(238, 83, 150, 0.06)" />
    <circle cx="120" cy="22" r="10" stroke="#ee5396" strokeWidth="1.5" opacity="0.85" />
    <path
      d="M96 48 C96 38, 105 34, 120 34 C135 34, 144 38, 144 48"
      stroke="#ee5396"
      strokeWidth="1.5"
      strokeLinecap="round"
      opacity="0.85"
    />
    <circle cx="72" cy="26" r="7" stroke="rgba(238, 83, 150, 0.45)" strokeWidth="1" />
    <path
      d="M56 48 C56 41, 62 38, 72 38 C82 38, 88 41, 88 48"
      stroke="rgba(238, 83, 150, 0.45)"
      strokeWidth="1"
      strokeLinecap="round"
    />
    <circle cx="168" cy="26" r="7" stroke="rgba(238, 83, 150, 0.45)" strokeWidth="1" />
    <path
      d="M152 48 C152 41, 158 38, 168 38 C178 38, 184 41, 184 48"
      stroke="rgba(238, 83, 150, 0.45)"
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
      border: 'border-white/[0.08] hover:border-[#0f62fe]/50',
      iconBox: 'bg-[#0f62fe]/10 text-[#78a9ff] border border-[#0f62fe]/25',
      eyebrow: 'text-[#78a9ff]',
      dot: 'bg-[#0f62fe]',
      badgeVariant: 'cobalt' as const,
      btnVariant: 'primary' as const,
    },
    teal: {
      border: 'border-white/[0.08] hover:border-[#009d9a]/50',
      iconBox: 'bg-[#009d9a]/10 text-[#3ddbd9] border border-[#009d9a]/25',
      eyebrow: 'text-[#3ddbd9]',
      dot: 'bg-[#009d9a]',
      badgeVariant: 'mint' as const,
      btnVariant: 'mint' as const,
    },
    magenta: {
      border: 'border-white/[0.08] hover:border-[#ee5396]/50',
      iconBox: 'bg-[#ee5396]/10 text-[#ff7eb6] border border-[#ee5396]/25',
      eyebrow: 'text-[#ff7eb6]',
      dot: 'bg-[#ee5396]',
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
      className={`group relative flex flex-col justify-between overflow-hidden rounded-xl bg-surface-1 border p-4 sm:p-5 transition-all duration-150 cursor-pointer select-none hover:-translate-y-0.5 hover:shadow-elevation-2 active:scale-[0.99] h-full ${config.border}`}
    >
      {/* ── 1. Cabecera de la tarjeta: Icono alineado y Tag Badge ── */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg shadow-sm ${config.iconBox}`}>
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
        <span className={`text-[10px] font-mono uppercase tracking-wider font-semibold ${config.eyebrow}`}>
          {eyebrow}
        </span>

        <div className="mt-0.5 font-display font-semibold text-base sm:text-lg text-[#f4f4f4] tracking-tight flex items-center justify-between gap-2">
          <span>{title}</span>
          {locked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#8d8d8d] bg-surface-2 px-1.5 py-0.5 rounded border border-white/10 shrink-0">
              <Lock className="h-3 w-3 text-[#8d8d8d]" />
              <span>Bloqueado</span>
            </span>
          )}
        </div>

        {/* Lista de características (flex-1 para absorber cualquier diferencia de texto) */}
        <div className="mt-2.5 flex flex-col gap-1.5 flex-1 min-h-[44px]">
          {lines.map((line) => (
            <div key={line} className="flex items-center gap-2 text-xs text-[#c6c6c6] leading-tight">
              <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`} />
              <span className="truncate">{line}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3. Glifo técnico idéntico para las 3 tarjetas ── */}
      <div className="my-2.5 rounded-lg border border-white/[0.06] bg-[#12161f]/80 p-1 overflow-hidden h-9 sm:h-10 w-full shadow-inner">
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
            <Sparkles className="h-3.5 w-3.5 text-[#ff7eb6] shrink-0" />
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
        {/* ── Header de Marca y Hero (Sleek, Carbon-inspired & High Contrast) ── */}
        <header className="relative flex flex-col items-center text-center mb-4 sm:mb-5">
          <div className="flex justify-center mb-1.5">
            <SkateCoreoBrand size="md" />
          </div>

          <h1 className="mt-0.5 font-display text-lg sm:text-2xl font-bold text-[#f4f4f4] tracking-tight max-w-[28ch]">
            Tecnología para crear <span className="text-gradient-brand">el movimiento perfecto</span>.
          </h1>

          <div className="mt-1 flex items-center gap-2 text-[10px] sm:text-xs font-mono font-medium uppercase tracking-[0.2em] text-[#8d8d8d]">
            <span>Diseña</span>
            <span className="text-[#0f62fe]">·</span>
            <span>Sincroniza</span>
            <span className="text-[#009d9a]">·</span>
            <span>Visualiza</span>
            <span className="text-[#ee5396]">·</span>
            <span>Evalúa</span>
          </div>
        </header>

        {/* ── Cuadrícula de las 3 Tarjetas Principales (Proporciones 100% Idénticas) ── */}
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5 mb-4 items-stretch">
          <AccessModule
            tone="blue"
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
            title="Panel de Entrenador"
            lines={[
              'Atletas y expedientes deportivos',
              'Evaluación técnica oficial RollArt / FEP',
            ]}
            cta={isCoach ? 'Abrir Panel de Entrenador' : 'Conocer Plan Entrenador'}
            glyph={<CoachGlyph />}
            onClick={isCoach ? (onOpenCoach || (() => {})) : (onUpgradeToCoach || (() => {}))}
            locked={!isCoach}
          />
        </div>

        {/* ── Herramientas complementarias (Discretas y alineadas en el pie) ── */}
        <div className="relative flex flex-col items-center gap-2 pb-1 pt-1 border-t border-white/[0.06]">
          <span className="text-[10px] font-mono font-medium uppercase tracking-[0.2em] text-[#8d8d8d]">
            Herramientas rápidas
          </span>

          <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto">
            <Button variant="secondary" size="sm" onClick={onImportCoreo}>
              <FolderOpen className="h-3.5 w-3.5 text-[#78a9ff]" />
              <span>Importar .coreo</span>
            </Button>

            {onOpenPaperToDigital && (
              <Button variant="secondary" size="sm" onClick={onOpenPaperToDigital}>
                <ScanLine className="h-3.5 w-3.5 text-[#3ddbd9]" />
                <span>Digitalizar plantilla A4</span>
              </Button>
            )}

            {onOpenCoach && (
              <Button variant="secondary" size="sm" onClick={onOpenCoach}>
                <Users className="h-3.5 w-3.5 text-[#ff7eb6]" />
                <span>Panel de Entrenadores</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

