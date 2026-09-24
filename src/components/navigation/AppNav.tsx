import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Home, Compass, AudioLines, Users, Settings2 } from 'lucide-react';

export type AppTab = 'home' | 'rink' | 'studio' | 'skaters' | 'settings';

export interface AppTabDef {
  id: AppTab;
  label: string;
  short: string;
  icon: LucideIcon;
  hint: string;
  /** `false` cuando la pestaña no aplica en la barra superior de escritorio. */
  desktop?: boolean;
}

/**
 * Fuente única de verdad para la navegación principal de la app.
 * Alimenta la Bottom Navigation Bar (portrait), la Sidebar compacta
 * (landscape) y la barra superior (desktop), evitando duplicar lógica.
 */
export const APP_TABS: AppTabDef[] = [
  {
    id: 'home',
    label: 'Inicio',
    short: 'Inicio',
    icon: Home,
    hint: 'Panel de inicio y accesos rápidos',
  },
  {
    id: 'rink',
    label: 'Pista 2D',
    short: 'Pista',
    icon: Compass,
    hint: 'Editor de coreografía sobre la pista reglamentaria',
  },
  {
    id: 'studio',
    label: 'Estudio de Audio',
    short: 'Estudio',
    icon: AudioLines,
    hint: 'DAW multipista: corta, mezcla y sincroniza',
  },
  {
    id: 'skaters',
    label: 'Atletas y Programas',
    short: 'Atletas',
    icon: Users,
    hint: 'Gestión de patinadores y programas',
  },
  {
    id: 'settings',
    label: 'Preparación y Ajustes',
    short: 'Ajustes',
    icon: Settings2,
    hint: 'Reglamento, pre-inicio, mezcla y utilidades',
    // En escritorio el panel de preparación es siempre visible (aside izquierdo),
    // por lo que esta entrada se omite para no duplicar la acción.
    desktop: false,
  },
];

/** Pestañas visibles en la barra superior de escritorio. */
export const DESKTOP_TABS = APP_TABS.filter((t) => t.desktop !== false);

export type NavBadges = Partial<Record<AppTab, number>>;

interface NavProps {
  active: AppTab;
  onSelect: (tab: AppTab) => void;
  badges?: NavBadges;
}

/* ────────────────────────────────────────────────────────────────
   BOTTOM NAVIGATION BAR — Portrait móvil y tablet (< lg)
   Ergonómica para el pulgar + Safe Area inferior.
   ──────────────────────────────────────────────────────────────── */
export const BottomNav: React.FC<NavProps> = ({ active, onSelect, badges }) => (
  <nav
    aria-label="Navegación principal"
    className="lg:hidden shrink-0 z-40 grid grid-cols-5 items-stretch glass-hud border-t border-white/10 nav-safe-bottom pl-safe pr-safe touch-manipulation overscroll-contain"
  >
    {APP_TABS.map((tab) => {
      const Icon = tab.icon;
      const isActive = active === tab.id;
      const badge = badges?.[tab.id] ?? 0;
      return (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          aria-current={isActive ? 'page' : undefined}
          aria-label={tab.hint}
          title={tab.hint}
          className={[
            'press relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-1',
            'rounded-2xl px-1 py-1.5',
            isActive ? 'text-cyan' : 'text-slate-400 hover:text-slate-100',
          ].join(' ')}
        >
          {/* Indicador superior de pestaña activa */}
          <span
            aria-hidden="true"
            className={[
              'absolute top-0 h-[3px] w-8 rounded-full transition-all duration-200',
              isActive ? 'bg-cyan shadow-glow-cyan opacity-100' : 'opacity-0',
            ].join(' ')}
          />
          <span className="relative flex items-center justify-center">
            <Icon className={`h-[22px] w-[22px] ${isActive ? 'stroke-[2.4]' : 'stroke-[1.9]'}`} />
            {badge > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-black text-slate-950">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </span>
          <span className="max-w-full truncate text-[10px] font-bold leading-none">{tab.short}</span>
        </button>
      );
    })}
  </nav>
);

/* ────────────────────────────────────────────────────────────────
   BARRA DE NAVEGACIÓN SUPERIOR — Desktop exclusivo (lg+)
   ──────────────────────────────────────────────────────────────── */
export const DesktopHeaderNav: React.FC<NavProps> = ({ active, onSelect, badges }) => (
  <nav
    aria-label="Navegación principal"
    className="hidden lg:flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1 shadow-soft-elevation shrink-0 touch-manipulation"
  >
    {DESKTOP_TABS.map((tab) => {
      const Icon = tab.icon;
      const isActive = active === tab.id;
      const badge = badges?.[tab.id] ?? 0;
      return (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          aria-current={isActive ? 'page' : undefined}
          title={tab.hint}
          className={[
            'press relative flex min-h-touch items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold',
            isActive
              ? 'bg-cyan text-neon-canvas font-black shadow-glow-cyan'
              : 'text-slate-300 hover:bg-white/5 hover:text-white',
          ].join(' ')}
        >
          <Icon className="h-4 w-4 shrink-0 stroke-[2]" />
          <span className="hidden xl:inline whitespace-nowrap">{tab.short}</span>
          {badge > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-black text-slate-950">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </button>
      );
    })}
  </nav>
);
