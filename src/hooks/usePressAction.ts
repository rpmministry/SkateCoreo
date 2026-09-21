import { useCallback, useRef } from 'react';

/**
 * usePressAction — Activación táctil inmediata SIN doble disparo.
 *
 * Problema que resuelve:
 * Un control con `onPointerDown` + `onClick` ejecuta la acción DOS veces por
 * cada toque (pointerdown y luego el click sintético), lo que en un toggle
 * Play/Pausa se traduce en "reproducción fantasma" (se activa y desactiva solo).
 *
 * Solución:
 * - `pointerdown` ejecuta la acción de inmediato (latencia cero, crítico para
 *   transporte de audio).
 * - El `click` posterior se ignora mediante una ventana de guarda temporal.
 * - Un `click` sin `pointerdown` precedente (teclado: Enter/Espacio, o
 *   activación programática) SÍ ejecuta la acción, manteniendo accesibilidad.
 *
 * @param guardMs Ventana en ms durante la cual un click se considera sintético.
 */
export function usePressAction(guardMs: number = 450) {
  const lastPointerActivationRef = useRef(0);

  const bind = useCallback(
    (action: (() => void) | undefined, options?: { enabled?: boolean }) => {
      const enabled = options?.enabled !== false;
      const run = () => {
        if (!enabled || !action) return;
        action();
      };

      return {
        onPointerDown: (e: React.PointerEvent) => {
          if (!enabled) return;
          // Solo botón principal del ratón; cualquier contacto táctil/pen vale.
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          lastPointerActivationRef.current = performance.now();
          // Evita el click sintético y la selección de texto, sin bloquear el gesto.
          e.preventDefault();
          run();
        },
        onClick: (e: React.MouseEvent) => {
          if (!enabled) return;
          // Click sintético posterior a un pointerdown ya atendido → ignorar.
          if (performance.now() - lastPointerActivationRef.current < guardMs) return;
          e.preventDefault();
          run();
        },
      };
    },
    [guardMs]
  );

  return bind;
}
