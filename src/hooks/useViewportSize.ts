import { useEffect, useRef, useState, type RefObject } from 'react';

export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * useViewportSize — Tamaño real de un elemento, robusto en móvil.
 *
 * PROBLEMA QUE RESUELVE
 * --------------------
 * El layout del Audio Studio solo reaccionaba al ancho del contenedor
 * (`ResizeObserver` dentro de `useAudioZoomPan`), así que la ALTURA disponible
 * —que en móvil cambia al aparecer/ocultarse la barra del navegador, el teclado o
 * al girar el dispositivo— no se tenía en cuenta. Además, medir sin agrupar puede
 * disparar decenas de actualizaciones por segundo durante un resize.
 *
 * SOLUCIÓN (idea de AudioMass `MainHeight()` + `visualViewport`, MIT)
 * ------------------------------------------------------------------
 *  - `ResizeObserver` sobre el propio elemento (fuente principal).
 *  - `visualViewport.resize` + `orientationchange` + `window.resize` como señales
 *    adicionales (iOS/Android con barra dinámica).
 *  - Todas las señales se agrupan en un solo `requestAnimationFrame`.
 *  - Solo se hace `setState` cuando el valor redondeado CAMBIA de verdad.
 *
 * Devuelve `{ width: 0, height: 0 }` hasta la primera medición, para que el
 * consumidor pueda aplicar un respaldo determinista en el primer render.
 */
export function useViewportSize(ref: RefObject<HTMLElement | null>): ViewportSize {
  const [size, setSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const lastRef = useRef<ViewportSize>({ width: 0, height: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      const last = lastRef.current;
      if (width === last.width && height === last.height) return;
      lastRef.current = { width, height };
      setSize({ width, height });
    };

    const schedule = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        measure();
      });
    };

    measure();

    const el = ref.current;
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (observer && el) observer.observe(el);

    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', schedule);

    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      visualViewport?.removeEventListener('resize', schedule);
    };
    // `ref` es estable (useRef), así que el efecto se registra una sola vez.
  }, [ref]);

  return size;
}
