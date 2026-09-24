import React from 'react';
import { Compass, AudioLines, FolderOpen, ScanLine, ArrowRight } from 'lucide-react';
import { SkateCoreoBrand } from './brand/SkateCoreoBrand';
import { Button } from './ui/Button';

/**
 * HomeViewProps — se mantiene la interfaz completa (App sigue pasando los
 * mismos callbacks/datos). El Home sólo presenta los accesos principales; el
 * resto de datos del proyecto ya vive dentro de la Pista 2D y el Estudio de
 * Audio, por lo que no se desestructuran aquí para no duplicar información.
 */
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

/* ── Glifos abstractos (decorativos, minimalistas) ──────────────── */

const RinkGlyph: React.FC = () => (
  <svg viewBox="0 0 220 78" className="h-14 w-full" fill="none" aria-hidden="true">
    <rect
      x="5"
      y="12"
      width="210"
      height="54"
      rx="18"
      stroke="rgba(0,210,255,0.30)"
      strokeWidth="1.5"
    />
    <path
      d="M24 54 C 62 18, 96 66, 134 28 S 186 50, 196 24"
      stroke="#00D2FF"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.9"
    />
    <circle cx="24" cy="54" r="4" fill="#10F49C" />
    <circle cx="134" cy="28" r="4" fill="#FFFFFF" />
    <circle cx="196" cy="24" r="4" fill="#FF4C79" />
  </svg>
);

const WAVE_BARS = [14, 30, 46, 22, 58, 34, 66, 40, 52, 26, 60, 38, 48, 20, 44, 30, 56, 24, 36, 18];

const WaveGlyph: React.FC = () => (
  <svg viewBox="0 0 220 78" className="h-14 w-full" fill="none" aria-hidden="true">
    {WAVE_BARS.map((h, i) => (
      <rect
        key={i}
        x={10 + i * 10.2}
        y={39 - h / 2}
        width="4"
        height={h}
        rx="2"
        fill="#10F49C"
        opacity={0.35 + (i % 4) * 0.16}
      />
    ))}
    <line x1="6" y1="39" x2="214" y2="39" stroke="rgba(16,244,156,0.35)" strokeWidth="1" />
  </svg>
);

/* ── Módulo de acceso principal ─────────────────────────────────── */

interface AccessModuleProps {
  tone: 'cyan' | 'mint';
  icon: React.ReactNode;
  tag?: string;
  eyebrow: string;
  title: string;
  lines: string[];
  cta: string;
  glyph: React.ReactNode;
  onClick: () => void;
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
}) => {
  const isCyan = tone === 'cyan';
  const ring = isCyan ? 'bg-cyan/12 text-cyan ring-cyan/25' : 'bg-mint/12 text-mint ring-mint/25';
  const cardBorder = isCyan
    ? 'border-cyan/25 hover:border-cyan/50'
    : 'border-mint/25 hover:border-mint/50';
  const cardWash = isCyan ? 'from-cyan/[0.13]' : 'from-mint/[0.13]';
  const glow = isCyan ? 'bg-cyan/15' : 'bg-mint/15';
  const accentText = isCyan ? 'text-cyan' : 'text-mint';
  const dot = isCyan ? 'bg-cyan' : 'bg-mint';
  const ctaClass = isCyan
    ? 'bg-cyan text-neon-canvas shadow-glow-cyan'
    : 'bg-mint text-neon-canvas shadow-glow-mint';

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={cta}
      className={`press group relative flex min-h-[248px] flex-col justify-between overflow-hidden rounded-[28px] border bg-gradient-to-br ${cardWash} via-white/[0.02] to-transparent p-5 text-left shadow-soft-elevation transition-colors sm:min-h-[280px] sm:p-6 lg:min-h-[344px] lg:p-7 ${cardBorder}`}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid-veil opacity-30" />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-3xl ${glow}`}
      />

      <span className="relative flex items-start justify-between gap-3">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${ring}`}>
          {icon}
        </span>
        {tag && (
          <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">
            {tag}
          </span>
        )}
      </span>

      <span className="relative mt-5 flex flex-col gap-1.5">
        <span className={`text-[10px] font-black uppercase tracking-[0.24em] ${accentText}`}>
          {eyebrow}
        </span>
        <span className="font-display text-2xl font-black leading-none tracking-tight text-white sm:text-[28px]">
          {title}
        </span>
        <span className="mt-1.5 flex flex-col gap-1">
          {lines.map((line) => (
            <span key={line} className="flex items-center gap-2 text-[11px] text-slate-400 sm:text-xs">
              <span aria-hidden="true" className={`h-1 w-1 shrink-0 rounded-full ${dot}`} />
              {line}
            </span>
          ))}
        </span>
      </span>

      <span className="relative mt-5 block">{glyph}</span>

      <span
        className={`relative mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black ${ctaClass}`}
      >
        {cta}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
};

/* ── Vista principal ─────────────────────────────────────────── */

export const HomeView: React.FC<HomeViewProps> = ({
  onOpenRink,
  onOpenStudio,
  onImportCoreo,
  onOpenPaperToDigital,
}) => {
  return (
    <section
      aria-label="Inicio"
      className="relative flex-1 min-h-0 overflow-y-auto scroll-touch bg-neon-canvas"
    >
      <div className="relative mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center px-4 py-10 animate-fade-in sm:px-6 lg:px-8 lg:py-14">
        {/* Ambiente sutil (estático, sin consumo de GPU en bucle) */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan/10 blur-[110px]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 right-6 h-64 w-64 rounded-full bg-mint/[0.07] blur-[110px]"
        />

        {/* ── Marca + mensaje ── */}
        <header className="relative flex flex-col items-center text-center">
          <div className="flex justify-center">
            <SkateCoreoBrand size="xl" />
          </div>

          <h1 className="mt-5 max-w-[15ch] font-display text-[clamp(1.6rem,6vw,2.75rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-white sm:max-w-[24ch]">
            Tecnología para crear <span className="text-gradient-brand">el movimiento perfecto</span>.
          </h1>

          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.34em] text-slate-400 sm:text-xs">
            Diseña · Sincroniza · Visualiza
          </p>
        </header>

        {/* ── Los dos accesos principales ── */}
        <div className="relative mt-8 grid grid-cols-1 gap-4 sm:mt-10 md:grid-cols-2 lg:grid-cols-[1.35fr_1fr] lg:gap-5">
          <AccessModule
            tone="cyan"
            tag="Editor principal"
            icon={<Compass className="h-6 w-6" />}
            eyebrow="Coreografía"
            title="Pista 2D"
            lines={['Diseño coreográfico', 'Trazado técnico y curvas', 'Visualización espacial']}
            cta="Abrir Pista 2D"
            glyph={<RinkGlyph />}
            onClick={onOpenRink}
          />

          <AccessModule
            tone="mint"
            tag="Segundo pilar"
            icon={<AudioLines className="h-6 w-6" />}
            eyebrow="Audio"
            title="Estudio de Audio"
            lines={['Música, ritmo y sincronía', 'Edición y mezcla multipista', 'Cues vocales y tempo']}
            cta="Abrir Estudio de Audio"
            glyph={<WaveGlyph />}
            onClick={onOpenStudio}
          />
        </div>

        {/* ── Herramientas complementarias ── */}
        <div className="relative mt-8 flex flex-col items-center gap-3 sm:mt-10">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="h-px w-8 bg-white/10" />
            <span className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
              Herramientas complementarias
            </span>
            <span aria-hidden="true" className="h-px w-8 bg-white/10" />
          </div>

          <div className="flex w-full flex-col items-stretch gap-2.5 sm:w-auto sm:flex-row sm:items-center">
            <Button variant="secondary" onClick={onImportCoreo}>
              <FolderOpen className="h-4 w-4 text-cyan" />
              Importar .coreo
            </Button>

            {onOpenPaperToDigital && (
              <Button variant="secondary" onClick={onOpenPaperToDigital}>
                <ScanLine className="h-4 w-4 text-mint" />
                Digitalizar plantilla A4
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
