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
} from 'lucide-react';
import { SkateCoreoBrand } from './brand/SkateCoreoBrand';
import { useAuthStore } from '../store/useAuthStore';

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
}

/* ── Subcomponentes presentacionales ─────────────────────────── */

const StatChip: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'cyan' | 'mint' | 'coral' | 'slate';
}> = ({ icon, label, value, tone = 'slate' }) => {
  const tones: Record<string, string> = {
    cyan: 'text-cyan border-cyan/25 bg-cyan/10',
    mint: 'text-mint border-mint/25 bg-mint/10',
    coral: 'text-coral border-coral/25 bg-coral/10',
    slate: 'text-slate-300 border-white/10 bg-white/[0.04]',
  };
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-2.5 py-2 ${tones[tone]}`}
    >
      <span className="shrink-0 opacity-90">{icon}</span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[9px] font-bold uppercase tracking-wider text-slate-400">
          {label}
        </span>
        <span className="truncate text-xs font-black text-white">{value}</span>
      </span>
    </div>
  );
};

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  tone: 'cyan' | 'mint' | 'coral' | 'amber' | 'violet';
  disabled?: boolean;
  badge?: string;
}

const TONE_RING: Record<ActionCardProps['tone'], string> = {
  cyan: 'bg-cyan/12 text-cyan ring-cyan/25',
  mint: 'bg-mint/12 text-mint ring-mint/25',
  coral: 'bg-coral/12 text-coral ring-coral/25',
  amber: 'bg-amber-400/12 text-amber-400 ring-amber-400/25',
  violet: 'bg-violet-400/12 text-violet-300 ring-violet-400/25',
};

const ActionCard: React.FC<ActionCardProps> = ({
  icon,
  title,
  description,
  onClick,
  tone,
  disabled,
  badge,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={description}
    className="press group relative flex min-h-[104px] flex-col items-start gap-2 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-left hover:border-white/20 hover:bg-white/[0.07] disabled:pointer-events-none disabled:opacity-40 lg:p-4"
  >
    {/* Halo decorativo de la tarjeta */}
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-white/[0.04] blur-2xl transition-opacity group-hover:opacity-100"
    />
    <span className="flex w-full items-start justify-between gap-2">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${TONE_RING[tone]}`}
      >
        {icon}
      </span>
      {badge && (
        <span className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-300">
          {badge}
        </span>
      )}
    </span>
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="wrap-anywhere font-display text-[13px] font-bold leading-tight text-white">
        {title}
      </span>
      <span className="wrap-anywhere text-[11px] leading-snug text-slate-400">{description}</span>
    </span>
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
      <div className="mx-auto w-full max-w-[1440px] px-3 pb-6 pt-3 sm:px-5 sm:pb-8 sm:pt-4 lg:px-8 lg:pt-6">
        {/* ══════════ INDICADOR BETA TESTER (acceso de 30 días) ══════════ */}
        {isBetaTester && (
          <div
            role="status"
            className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-coral/40 bg-coral/12 px-4 py-3 sm:mb-4"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-coral" />
            <span className="text-xs font-black uppercase tracking-wide text-coral">
              Acceso Beta Tester
            </span>
            <span className="rounded-full border border-coral/40 bg-black/30 px-2.5 py-0.5 font-mono text-[11px] font-bold text-white">
              {betaDays} {betaDays === 1 ? 'día restante' : 'días restantes'}
            </span>
            {betaExpiry && (
              <span className="text-[11px] text-slate-300">Vence el {betaExpiry}</span>
            )}
            <span className="ml-auto hidden text-[10px] text-slate-400 sm:inline">
              Cortesía de 30 días · un solo uso
            </span>
          </div>
        )}

        {/* ══════════ HERO HEADER ══════════ */}
        <header className="hero-aurora relative isolate overflow-hidden rounded-[24px] border border-white/10 glass-panel shadow-soft-elevation">
          <span aria-hidden="true" className="absolute inset-0 grid-veil opacity-70" />

          <div className="relative z-10 flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between lg:gap-10 lg:p-9">
            {/* Identidad + Propuesta de valor */}
            <div className="flex min-w-0 flex-col gap-4 lg:max-w-[620px]">
              <SkateCoreoBrand size="xl" className="animate-fade-up" />

              <h1 className="animate-fade-up font-display text-[clamp(1.6rem,5.2vw,2.65rem)] font-extrabold leading-[1.08] tracking-[-0.03em] text-white [animation-delay:60ms]">
                Diseña, sincroniza y <span className="text-gradient-brand">domina</span> cada trazo
                de tu rutina.
              </h1>

              <p className="max-w-[54ch] text-[13px] leading-relaxed text-slate-300/90 sm:text-sm">
                Pista reglamentaria 2D, mezclador multipista con cues vocales y cálculo técnico
                World Skate en un solo flujo de trabajo. Todo funciona sin conexión.
              </p>

              <div className="flex flex-col gap-2.5 pt-1 sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={onOpenRink}
                  className="press flex min-h-touch items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan to-teal-400 px-5 py-3 text-sm font-black text-neon-canvas shadow-glow-cyan hover:brightness-110"
                >
                  <Sparkles className="h-4 w-4 shrink-0" />
                  Nueva Coreografía
                </button>
                <button
                  type="button"
                  onClick={onOpenStudio}
                  className="press flex min-h-touch items-center justify-center gap-2 rounded-2xl border border-cyan/40 bg-cyan/12 px-5 py-3 text-sm font-bold text-cyan hover:bg-cyan/20"
                >
                  <AudioLines className="h-4 w-4 shrink-0" />
                  Abrir Editor de Audio
                  {unplacedNodesCount > 0 && (
                    <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-slate-950">
                      {unplacedNodesCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Panel de estado en vivo */}
            <div className="flex w-full min-w-0 flex-col gap-3 lg:max-w-[420px]">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                    Sesión activa
                  </span>
                  <span
                    className={[
                      'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider',
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

                <div className="grid grid-cols-2 gap-2">
                  <StatChip
                    icon={<Users className="h-4 w-4" />}
                    label="Atleta"
                    value={skaterName || 'Sin atleta'}
                    tone="cyan"
                  />
                  <StatChip
                    icon={<Compass className="h-4 w-4" />}
                    label="Categoría"
                    value={skaterCategory || '—'}
                    tone="mint"
                  />
                  <StatChip
                    icon={<CircleDot className="h-4 w-4" />}
                    label="Nodos en pista"
                    value={`${pointsCount}`}
                    tone="coral"
                  />
                  <StatChip
                    icon={<Gauge className="h-4 w-4" />}
                    label="Tempo"
                    value={`${bpm} BPM`}
                    tone="slate"
                  />
                </div>

                <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2">
                  <Music4 className="h-4 w-4 shrink-0 text-cyan" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Pista musical
                    </span>
                    <span className="truncate text-xs font-bold text-slate-200">
                      {trimmedAudio || 'Ninguna pista cargada'}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ══════════ PROYECTO ACTUAL ══════════ */}
        <section aria-label="Proyecto actual" className="mt-4 lg:mt-6">
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between lg:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan/12 text-cyan ring-1 ring-cyan/25">
                <FolderClock className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Programa en curso
                </p>
                <p className="wrap-anywhere font-display text-base font-bold leading-tight text-white">
                  {programTitle || 'Sin programa seleccionado'}
                </p>
                <p className="text-[11px] text-slate-400">
                  {skaterName ? `${skaterName} · ${skaterCategory || 'Standard'}` : 'Selecciona un atleta para comenzar'}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={onOpenSkaters}
                className="press flex min-h-touch items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/[0.09] hover:text-white"
              >
                <Users className="h-4 w-4 text-cyan" />
                Cambiar atleta o programa
              </button>
              <button
                type="button"
                onClick={onOpenRink}
                className="press flex min-h-touch items-center justify-center gap-2 rounded-xl bg-white/[0.06] px-4 py-2.5 text-xs font-bold text-white hover:bg-white/[0.12]"
              >
                Continuar en Pista 2D
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {/* ══════════ ACCIONES RÁPIDAS ══════════ */}
        <section aria-label="Acciones rápidas" className="mt-5 lg:mt-7">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-display text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
              Acciones rápidas
            </h2>
            <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-3">
            <ActionCard
              tone="violet"
              icon={<FolderClock className="h-[18px] w-[18px]" />}
              title="Proyectos Recientes"
              description="Retoma programas guardados y cambia de atleta."
              onClick={onOpenSkaters}
            />
            <ActionCard
              tone="cyan"
              icon={<Upload className="h-[18px] w-[18px]" />}
              title="Cargar Música"
              description="Importa MP3, WAV o M4A como pista oficial."
              onClick={onLoadAudio}
            />
            <ActionCard
              tone="mint"
              icon={<FolderOpen className="h-[18px] w-[18px]" />}
              title="Importar Paquete .coreo"
              description="Recupera una rutina con audio y nodos 2D."
              onClick={onImportCoreo}
            />
            <ActionCard
              tone="coral"
              icon={<Save className="h-[18px] w-[18px]" />}
              title="Exportar Paquete .coreo"
              description="Comparte el bundle completo de la rutina."
              onClick={onExportCoreo}
            />
            <ActionCard
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
            <ActionCard
              tone="amber"
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
