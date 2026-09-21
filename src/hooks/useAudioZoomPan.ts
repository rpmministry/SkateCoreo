import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';

export interface UseAudioZoomPanOptions {
  minZoom?: number;
  maxZoom?: number;
  initialZoom?: number;
  enableWheelPan?: boolean;
  widthOffset?: number;
  overscrollPx?: number;
  onZoomChange?: (zoom: number) => void;
  onScroll?: (scrollLeft: number) => void;
}

export interface UseAudioZoomPanReturn {
  zoom: number;
  containerRef: React.RefObject<HTMLDivElement>;
  containerWidth: number;
  contentWidth: number;
  overscrollPx: number;
  zoomIn: (focalX?: number) => void;
  zoomOut: (focalX?: number) => void;
  resetZoom: () => void;
  setZoomExplicit: (newZoom: number, focalX?: number) => void;
  timeToPx: (timeSec: number, totalDurationSec: number, padPx?: number) => number;
  pxToTime: (px: number, totalDurationSec: number, padPx?: number) => number;
}

/**
 * useAudioZoomPan — Motor de Zoom y Paneo Dinámico Multidispositivo
 *
 * Características Técnicas:
 * - Desktop: Ctrl / Cmd + Wheel o Trackpad Pinch con normalización de deltaY y anclaje matemático exacto bajo el cursor.
 * - Desktop: Rueda vertical normal sin modificador = paneo horizontal fluido.
 * - Móvil / Tablet: Pinch-to-Zoom de dos dedos con cálculo directo de distancia euclidiana y factor de escala lineal.
 * - Prevención estricta: Bloqueo de zoom del viewport del navegador (touch-action: none y gesture events en iOS).
 * - Cero parpadeo: Sincronización de scrollLeft previa al repintado (useLayoutEffect) para anclaje milimétrico.
 */
export function useAudioZoomPan(options: UseAudioZoomPanOptions = {}): UseAudioZoomPanReturn {
  const {
    minZoom = 1.0,
    maxZoom = 40.0,
    initialZoom = 1.0,
    enableWheelPan = true,
    widthOffset = 0,
    overscrollPx = 0,
    onZoomChange,
    onScroll,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoomState] = useState<number>(initialZoom);
  const [containerWidth, setContainerWidth] = useState<number>(1000);

  const zoomRef = useRef<number>(initialZoom);
  zoomRef.current = zoom;

  const pendingScrollRef = useRef<number | null>(null);

  // Observador de dimensiones del viewport visible del contenedor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0) {
        setContainerWidth(Math.round(rect.width));
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);

    return () => ro.disconnect();
  }, []);

  const baseWidth = Math.max(100, containerWidth - widthOffset);
  const contentWidth = Math.max(baseWidth, Math.round(baseWidth * zoom));

  // Aplicación inmediata del scrollLeft previo al renderizado visual (Zero-Flicker)
  useLayoutEffect(() => {
    if (pendingScrollRef.current !== null && containerRef.current) {
      containerRef.current.scrollLeft = pendingScrollRef.current;
      pendingScrollRef.current = null;
    }
  }, [contentWidth, zoom]);

  // Función matemática de aplicación de zoom con anclaje de punto focal
  const applyZoomExplicit = useCallback(
    (targetZoom: number, focalXScreen?: number, contentRatio?: number) => {
      const container = containerRef.current;
      if (!container) return;

      const clampedZoom = Math.max(minZoom, Math.min(maxZoom, Math.round(targetZoom * 1000) / 1000));
      const oldZoom = zoomRef.current;
      if (Math.abs(clampedZoom - oldZoom) < 0.001) return;

      const rect = container.getBoundingClientRect();
      const focalX = focalXScreen !== undefined
        ? Math.max(0, Math.min(rect.width, focalXScreen))
        : rect.width / 2;

      // Ratio del punto focal respecto al contenido de audio
      let ratio = contentRatio;
      if (ratio === undefined) {
        const currentContentW = Math.max(baseWidth, Math.round(baseWidth * oldZoom));
        const timeX = Math.max(0, container.scrollLeft + focalX - widthOffset);
        ratio = timeX / currentContentW;
      }

      const newContentW = Math.max(baseWidth, Math.round(baseWidth * clampedZoom));
      const newTimeX = ratio * newContentW;
      const targetScrollLeft = Math.max(0, Math.round(newTimeX + widthOffset - focalX));

      // Asignación síncrona en el DOM y registro para useLayoutEffect
      pendingScrollRef.current = targetScrollLeft;
      container.scrollLeft = targetScrollLeft;

      zoomRef.current = clampedZoom;
      setZoomState(clampedZoom);
      onZoomChange?.(clampedZoom);
    },
    [baseWidth, minZoom, maxZoom, widthOffset, onZoomChange]
  );

  const zoomIn = useCallback(
    (focalX?: number) => {
      applyZoomExplicit(zoomRef.current * 1.3, focalX);
    },
    [applyZoomExplicit]
  );

  const zoomOut = useCallback(
    (focalX?: number) => {
      applyZoomExplicit(zoomRef.current / 1.3, focalX);
    },
    [applyZoomExplicit]
  );

  const resetZoom = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollLeft = 0;
    }
    zoomRef.current = 1.0;
    setZoomState(1.0);
    onZoomChange?.(1.0);
  }, [onZoomChange]);

  const setZoomExplicit = useCallback(
    (newZoom: number, focalX?: number) => {
      applyZoomExplicit(newZoom, focalX);
    },
    [applyZoomExplicit]
  );

  // ── GESTIÓN DE EVENTOS DE ENTRADA UNIFICADOS (Wheel, Touch, Gestures) ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Desktop: Wheel (Ctrl/Cmd + Wheel para Zoom Focal, Wheel vertical para Paneo horizontal)
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Bloquear el zoom completo de la página del navegador
        e.preventDefault();
        e.stopPropagation();

        const rect = container.getBoundingClientRect();
        const focalX = Math.max(0, e.clientX - rect.left);

        // Normalización de delta según deltaMode (pixels, lines, pages)
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 20;
        else if (e.deltaMode === 2) delta *= 200;

        const clampedDelta = Math.max(-60, Math.min(60, delta));
        const factor = Math.exp(-clampedDelta * 0.006);
        const targetZoom = zoomRef.current * factor;

        applyZoomExplicit(targetZoom, focalX);
      } else if (enableWheelPan && e.deltaY !== 0 && e.deltaX === 0) {
        // Paneo Horizontal estándar con rueda de ratón
        if (container.scrollWidth > container.clientWidth) {
          let panDelta = e.deltaY;
          if (e.deltaMode === 1) panDelta *= 20;
          container.scrollLeft += panDelta;
          e.preventDefault();
        }
      }
    };

    // 2. Móviles: Pinch-to-Zoom matemático con dos dedos
    let touchStartDist = 0;
    let touchStartZoom = 1.0;
    let touchStartScrollLeft = 0;
    let touchStartFocalX = 0;
    let touchStartRatio = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Bloquear escalado del navegador
        e.preventDefault();
        container.style.touchAction = 'none';

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        touchStartDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        touchStartZoom = zoomRef.current;

        const rect = container.getBoundingClientRect();
        touchStartFocalX = Math.max(0, (t1.clientX + t2.clientX) / 2 - rect.left);
        touchStartScrollLeft = container.scrollLeft;

        const currentContentW = Math.max(baseWidth, Math.round(baseWidth * touchStartZoom));
        const timeX = Math.max(0, touchStartScrollLeft + touchStartFocalX - widthOffset);
        touchStartRatio = timeX / currentContentW;
      } else if (e.touches.length === 1) {
        container.style.touchAction = 'pan-x';
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchStartDist > 8) {
        // Bloquear escalado nativo del viewport
        e.preventDefault();
        e.stopPropagation();

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (currentDist < 8) return;

        // Factor de escala directo (relativo a la distancia inicial)
        const scale = currentDist / touchStartDist;
        const targetZoom = touchStartZoom * scale;

        const rect = container.getBoundingClientRect();
        const currentFocalX = Math.max(0, (t1.clientX + t2.clientX) / 2 - rect.left);

        applyZoomExplicit(targetZoom, currentFocalX, touchStartRatio);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        touchStartDist = 0;
        container.style.touchAction = 'pan-x';
      }
    };

    // Bloqueo de gestos específicos de Safari en iOS
    const handleGesture = (e: Event) => {
      e.preventDefault();
    };

    const handleNativeScroll = () => {
      onScroll?.(container.scrollLeft);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    container.addEventListener('gesturestart', handleGesture, { passive: false });
    container.addEventListener('gesturechange', handleGesture, { passive: false });
    container.addEventListener('gestureend', handleGesture, { passive: false });
    container.addEventListener('scroll', handleNativeScroll, { passive: true });

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
      container.removeEventListener('gesturestart', handleGesture);
      container.removeEventListener('gesturechange', handleGesture);
      container.removeEventListener('gestureend', handleGesture);
      container.removeEventListener('scroll', handleNativeScroll);
    };
  }, [applyZoomExplicit, baseWidth, enableWheelPan, onScroll, widthOffset]);

  // Helpers de Proyección Matemática
  const timeToPx = useCallback(
    (timeSec: number, totalDurationSec: number, padPx: number = 0): number => {
      const dur = Math.max(1, totalDurationSec);
      const ratio = Math.max(0, Math.min(1, timeSec / dur));
      const availableW = Math.max(1, contentWidth - padPx * 2);
      return padPx + ratio * availableW;
    },
    [contentWidth]
  );

  const pxToTime = useCallback(
    (px: number, totalDurationSec: number, padPx: number = 0): number => {
      const dur = Math.max(1, totalDurationSec);
      const availableW = Math.max(1, contentWidth - padPx * 2);
      const offsetPx = Math.max(0, px - padPx);
      return (offsetPx / availableW) * dur;
    },
    [contentWidth]
  );

  return {
    zoom,
    containerRef,
    containerWidth,
    contentWidth,
    overscrollPx,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoomExplicit,
    timeToPx,
    pxToTime,
  };
}
