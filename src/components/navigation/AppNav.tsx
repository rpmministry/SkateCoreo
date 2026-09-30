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
    label: 'Audio Studio',
    short: 'Estudio',
    icon: AudioLines,
    hint: 'Editar mezcla en Estudio: cortar, mezclar y publicar al visor',
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
   BOTTOM NAVIGATION BAR — SOLO TELÉFONO
   (`.fm-mobile-only` la oculta en tablets ≥7", que usan la navegación
   superior de escritorio). Ergonómica para el pulgar + Safe Area inferior.
   ──────────────────────────────────────────────────────────────── */
export const BottomNav: React.FC<NavProps> = ({ active, onSelect, badges }) => (
  <nav
    aria-label="Navegación principal"
    className="fm-mobile-only lg:hidden shrink-0 z-40 grid grid-cols-5 items-stretch bg-surface-1/95 backdrop-blur-xl border-t border-white/[0.08] nav-safe-bottom pl-safe pr-safe touch-manipulation overscroll-contain shadow-elevation-2"
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
            'rounded-2xl px-1 py-1.5 transition-colors',
            isActive ? 'text-cobalt-400' : 'text-slate-400 hover:text-slate-100',
          ].join(' ')}
        >
          {/* Indicador superior de pestaña activa */}
          <span
            aria-hidden="true"
            className={[
              'absolute top-0 h-[2.5px] w-8 rounded-full transition-all duration-200',
              isActive ? 'bg-cobalt-400 shadow-glow-cobalt opacity-100' : 'opacity-0',
            ].join(' ')}
          />
          <span className="relative flex items-center justify-center">
            <Icon className={`h-[22px] w-[22px] transition-transform ${isActive ? 'stroke-[2.4] scale-105' : 'stroke-[1.9]'}`} />
            {badge > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-black text-slate-950">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </span>
          <span className={`max-w-full truncate text-[10px] leading-none ${isActive ? 'font-bold text-white' : 'font-medium'}`}>{tab.short}</span>
        </button>
      );
    })}
  </nav>
);

/* ────────────────────────────────────────────────────────────────
   BARRA DE NAVEGACIÓN SUPERIOR — Escritorio y tablet ≥7"
   (`.fm-desktop-flex` la habilita en tablets táctiles desde 768 px).
   ──────────────────────────────────────────────────────────────── */
export const DesktopHeaderNav: React.FC<NavProps> = ({ active, onSelect, badges }) => (
  <nav
    aria-label="Navegación principal"
    className="fm-desktop-flex hidden lg:flex lg:justify-self-center items-center gap-1 rounded-xl border border-white/[0.08] bg-surface-2/80 p-1 shadow-inner shrink-0 touch-manipulation backdrop-blur-md"
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
            'press relative flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all select-none',
            isActive
              ? 'bg-cobalt-600/30 text-white font-semibold shadow-elevation-1 border border-cobalt-400/40 text-glow-cobalt'
              : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100 font-medium',
          ].join(' ')}
        >
          <Icon className={`h-4 w-4 shrink-0 transition-colors ${isActive ? 'text-cobalt-400 stroke-[2.2]' : 'text-slate-400 stroke-[1.8]'}`} />
          <span className="fm-nav-label hidden xl:inline whitespace-nowrap">{tab.short}</span>
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
