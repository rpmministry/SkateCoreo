import { useCallback, useEffect, useRef } from 'react';

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

export interface UseLongPressOptions {
  /** Tiempo de presión sostenida antes de disparar (por defecto 500 ms). */
  delay?: number;
  /** Movimiento máximo tolerado (px) antes de cancelar la pulsación larga. */
  moveTolerance?: number;
  /** Se ejecuta al mantenerse pulsado el tiempo indicado. */
  onLongPress: (e: React.PointerEvent) => void;
  /** Se ejecuta si el gesto termina antes de tiempo (tap normal). */
  onCancel?: () => void;
}

/**
 * useLongPress — Detección de pulsación prolongada multiplataforma.
 *
 * Diseño:
 * - Se apoya en Pointer Events, que unifican ratón, táctil y lápiz en WebKit,
 *   Blink y Gecko (no depende de `touchstart`/`touchmove`, que en Safari iOS
 *   tienen comportamientos distintos y latencias de 300 ms).
 * - Ignora gestos multi-touch (pinch/zoom) y botones secundarios del ratón.
 * - Cancela la cuenta si el puntero se desplaza más de `moveTolerance` px: así un
 *   arrastre normal no se interpreta como presión larga.
 * - Limpia SIEMPRE el temporizador al desmontar (sin timers colgados).
 */
export function useLongPress({
  delay = 500,
  moveTolerance = 10,
  onLongPress,
  onCancel,
}: UseLongPressOptions): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const cancel = useCallback(
    (notify: boolean) => {
      clearTimer();
      startPosRef.current = null;
      if (notify && !firedRef.current) onCancel?.();
      firedRef.current = false;
    },
    [clearTimer, onCancel]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Solo botón principal del ratón; cualquier contacto táctil/lápiz vale.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Gesto multi-touch (pinza) → nunca es una pulsación larga.
      const nativeTouches = (e.nativeEvent as unknown as { touches?: TouchList }).touches;
      if (nativeTouches && nativeTouches.length > 1) return;

      firedRef.current = false;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();

      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        timerRef.current = null;
        onLongPress(e);
      }, delay);
    },
    [clearTimer, delay, onLongPress]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startPosRef.current;
      if (!start || firedRef.current) return;
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx > moveTolerance || dy > moveTolerance) {
        cancel(true);
      }
    },
    [cancel, moveTolerance]
  );

  const onPointerUp = useCallback(() => {
    // Si ya se disparó la pulsación larga, el consumidor gestiona el "drop".
    cancel(true);
  }, [cancel]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave: onPointerUp,
    onPointerCancel: onPointerUp,
  };
}
