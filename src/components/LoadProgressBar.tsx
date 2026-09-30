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
  const indeterminate = useLoadProgressStore((s) => s.indeterminate);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(percent)}
      aria-label={label || 'Progreso de carga'}
      aria-hidden={!active}
      className="pointer-events-none fixed inset-x-0 top-0 z-[120] select-none"
      style={{
        opacity: active ? 1 : 0,
        transition: 'opacity 260ms ease',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      {/* Riel + relleno. Mientras no hay medición real, se muestra una barra
          INDETERMINADA en vez de un "0%" engañoso. */}
      <div className="h-[3px] w-full overflow-hidden bg-white/5">
        <div
          className={[
            'h-full bg-gradient-to-r from-[#0f62fe] via-[#4589ff] to-[#0f62fe] shadow-[0_0_8px_rgba(15,98,254,0.4)]',
            indeterminate ? 'w-full animate-pulse opacity-70' : '',
          ].join(' ')}
          style={
            indeterminate
              ? undefined
              : { width: `${percent}%`, transition: 'width 180ms ease-out' }
          }
        />
      </div>

      {/* Píldora con fase (y porcentaje solo cuando es real) */}
      {active && label && (
        <div className="mx-auto mt-1.5 flex w-fit max-w-[92vw] items-center gap-2 rounded-full border border-[#0f62fe]/30 bg-zinc-950/85 px-3 py-1 shadow-lg backdrop-blur-md">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#0f62fe]" />
          <span className="truncate text-[10px] font-bold text-slate-200">{label}</span>
          {!indeterminate && (
            <span className="shrink-0 font-mono text-[10px] font-black text-[#78a9ff]">
              {Math.round(percent)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
};
