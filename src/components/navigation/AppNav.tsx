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
   ──────────────────────────────────────────────────────────────── */
export const BottomNav: React.FC<NavProps> = ({ active, onSelect, badges }) => (
  <nav
    aria-label="Navegación principal"
    className="fm-mobile-only lg:hidden shrink-0 z-40 grid grid-cols-5 items-stretch bg-surface-1/95 backdrop-blur-md border-t border-white/[0.08] nav-safe-bottom pl-safe pr-safe touch-manipulation overscroll-contain shadow-elevation-2"
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
            'press relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1',
            'rounded-lg px-1 py-1.5 transition-colors',
            isActive ? 'text-[#78a9ff]' : 'text-[#8d8d8d] hover:text-[#f4f4f4]',
          ].join(' ')}
        >
          {/* Indicador superior de pestaña activa */}
          <span
            aria-hidden="true"
            className={[
              'absolute top-0 h-[2px] w-7 rounded-full transition-all duration-150',
              isActive ? 'bg-[#0f62fe] opacity-100' : 'opacity-0',
            ].join(' ')}
          />
          <span className="relative flex items-center justify-center">
            <Icon className={`h-5 w-5 transition-transform ${isActive ? 'stroke-[2.2] scale-105' : 'stroke-[1.8]'}`} />
            {badge > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f1c21b] px-1 text-[9px] font-bold text-slate-950">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </span>
          <span className={`max-w-full truncate text-[10px] leading-none ${isActive ? 'font-semibold text-white' : 'font-medium'}`}>{tab.short}</span>
        </button>
      );
    })}
  </nav>
);

/* ────────────────────────────────────────────────────────────────
   BARRA DE NAVEGACIÓN SUPERIOR — Escritorio y tablet ≥7"
   ──────────────────────────────────────────────────────────────── */
export const DesktopHeaderNav: React.FC<NavProps> = ({ active, onSelect, badges }) => (
  <nav
    aria-label="Navegación principal"
    className="fm-desktop-flex hidden lg:flex lg:justify-self-center items-center gap-1 rounded-lg border border-white/[0.08] bg-surface-1 p-1 shrink-0 touch-manipulation shadow-sm"
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
            'press relative flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-colors select-none',
            isActive
              ? 'bg-surface-3 text-[#f4f4f4] font-semibold border border-white/10 shadow-sm'
              : 'text-[#c6c6c6] hover:bg-white/[0.04] hover:text-white font-medium',
          ].join(' ')}
        >
          <Icon className={`h-4 w-4 shrink-0 transition-colors ${isActive ? 'text-[#78a9ff] stroke-[2]' : 'text-[#8d8d8d] stroke-[1.8]'}`} />
          <span className="fm-nav-label hidden xl:inline whitespace-nowrap">{tab.short}</span>
          {badge > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f1c21b] px-1 text-[9px] font-bold text-slate-950">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </button>
      );
    })}
  </nav>
);
