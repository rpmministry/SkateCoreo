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
  <svg viewBox="0 0 220 78" className="h-full w-full" fill="none" aria-hidden="true">
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
  <svg viewBox="0 0 220 78" className="h-full w-full" fill="none" aria-hidden="true">
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
      className={`home-module press group relative flex flex-col justify-between overflow-hidden rounded-[28px] border bg-gradient-to-br ${cardWash} via-white/[0.02] to-transparent text-left shadow-soft-elevation transition-colors ${cardBorder}`}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid-veil opacity-30" />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-3xl ${glow}`}
      />

      <span className="relative flex items-start justify-between gap-3">
        <span className={`home-module-icon flex shrink-0 items-center justify-center rounded-2xl ring-1 ${ring}`}>
          {icon}
        </span>
        {tag && (
          <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">
            {tag}
          </span>
        )}
      </span>

      <span className="home-module-block relative flex flex-col gap-1.5">
        <span className={`text-[10px] font-black uppercase tracking-[0.24em] ${accentText}`}>
          {eyebrow}
        </span>
        <span className="home-module-title font-display font-black tracking-tight text-white">
          {title}
        </span>
        <span className="mt-1 flex flex-col gap-0.5">
          {lines.map((line) => (
            <span key={line} className="flex items-center gap-2 text-[11px] text-slate-400 sm:text-xs">
              <span aria-hidden="true" className={`h-1 w-1 shrink-0 rounded-full ${dot}`} />
              {line}
            </span>
          ))}
        </span>
      </span>

      <span className="home-module-block relative block">
        <span className="home-module-glyph block">{glyph}</span>
      </span>

      <span
        className={`home-module-block relative inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black ${ctaClass}`}
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
      <div className="home-shell relative mx-auto min-h-full w-full max-w-5xl px-4 animate-fade-in sm:px-6 lg:px-8">
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
            <SkateCoreoBrand size="lg" />
          </div>

          <h1 className="home-title mt-2 max-w-[16ch] font-display font-extrabold text-white sm:max-w-[24ch]">
            Tecnología para crear <span className="text-gradient-brand">el movimiento perfecto</span>.
          </h1>

          <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.34em] text-slate-400 sm:text-xs">
            Diseña · Sincroniza · Visualiza
          </p>
        </header>

        {/* ── Los dos accesos principales ── */}
        <div className="relative grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[1.35fr_1fr]">
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
            title="Audio Studio"
            lines={['Editar y mezclar la música', 'Cortar, fundidos y multipista', 'Enviar la mezcla al visor']}
            cta="Editar mezcla en Estudio"
            glyph={<WaveGlyph />}
            onClick={onOpenStudio}
          />
        </div>

        {/* ── Herramientas complementarias ── */}
        <div className="relative flex flex-col items-center gap-3">
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
