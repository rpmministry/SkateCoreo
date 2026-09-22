import React from 'react';
import { useLoadProgressStore } from '../store/loadProgressStore';

/**
 * LoadProgressBar — Indicador de carga global NO invasivo.
 *
 * Diseño:
 * - Barra ultradelgada (3px) pegada al borde superior, por encima de todo.
 * - Una píldora minimalista con la fase + porcentaje, solo visible mientras hay
 *   una carga activa.
 * - `pointer-events: none` en todo el contenedor: NUNCA bloquea toques ni la
 *   interacción (crítico en móvil/iOS, donde un overlay con captura de eventos
 *   puede congelar la navegación).
 * - Respeta el notch/barra de estado con `env(safe-area-inset-top)`.
 */
export const LoadProgressBar: React.FC = () => {
  const active = useLoadProgressStore((s) => s.active);
  const percent = useLoadProgressStore((s) => s.percent);
  const label = useLoadProgressStore((s) => s.label);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-label={label || 'Progreso de carga'}
      aria-hidden={!active}
      className="pointer-events-none fixed inset-x-0 top-0 z-[120] select-none"
      style={{
        opacity: active ? 1 : 0,
        transition: 'opacity 260ms ease',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      {/* Riel + relleno animado */}
      <div className="h-[3px] w-full overflow-hidden bg-white/5">
        <div
          className="h-full bg-gradient-to-r from-cyan via-teal-400 to-cyan shadow-[0_0_10px_rgba(0,210,255,0.7)]"
          style={{
            width: `${percent}%`,
            transition: 'width 180ms ease-out',
          }}
        />
      </div>

      {/* Píldora con fase y porcentaje */}
      {active && label && (
        <div className="mx-auto mt-1.5 flex w-fit max-w-[92vw] items-center gap-2 rounded-full border border-cyan/30 bg-zinc-950/85 px-3 py-1 shadow-lg backdrop-blur-md">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-cyan" />
          <span className="truncate text-[10px] font-bold text-slate-200">{label}</span>
          <span className="shrink-0 font-mono text-[10px] font-black text-cyan">
            {Math.round(percent)}%
          </span>
        </div>
      )}
    </div>
  );
};
