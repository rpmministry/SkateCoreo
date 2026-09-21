import { useRef, useState, useEffect, useCallback } from 'react';

export interface UseAudioZoomPanOptions {
  minZoom?: number;
  maxZoom?: number;
  initialZoom?: number;
  enableWheelPan?: boolean;
  widthOffset?: number;
  onZoomChange?: (zoom: number) => void;
  onScroll?: (scrollLeft: number) => void;
}

export interface UseAudioZoomPanReturn {
  zoom: number;
  containerRef: React.RefObject<HTMLDivElement>;
  containerWidth: number;
  contentWidth: number;
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
 * Interacciones soportadas:
 * - Desktop: Ctrl/Cmd + Rueda del ratón = Zoom In / Zoom Out centrado en cursor.
 * - Desktop: Rueda vertical normal = Paneo horizontal fluido.
 * - Móvil: 1 dedo = Scroll horizontal nativo (-webkit-overflow-scrolling: touch).
 * - Móvil: 2 dedos (Pinch) = Zoom In / Out centrado en el punto medio de los dedos.
 * - Prevención de Conflicto: e.preventDefault() con { passive: false } EXCLUSIVAMENTE en el contenedor.
 * - Cero CSS scaleX: El zoom escala la geometría matemática y píxeles por segundo.
 */
export function useAudioZoomPan(options: UseAudioZoomPanOptions = {}): UseAudioZoomPanReturn {
  const {
    minZoom = 1.0,
    maxZoom = 40.0,
    initialZoom = 1.0,
    enableWheelPan = true,
    widthOffset = 0,
    onZoomChange,
    onScroll,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoomState] = useState<number>(initialZoom);
  const [containerWidth, setContainerWidth] = useState<number>(1000);

  const zoomRef = useRef<number>(initialZoom);
  zoomRef.current = zoom;

  const pendingScrollRef = useRef<{ focalRatio: number; focalX: number } | null>(null);
  const touchPinchRef = useRef<{
    initialDist: number;
    lastDist: number;
    focalX: number;
  } | null>(null);

  // Observador responsivo del ancho del contenedor visible
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

  // Aplicación del punto focal tras redimensionar el contenido en el DOM
  useEffect(() => {
    if (!pendingScrollRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const { focalRatio, focalX } = pendingScrollRef.current;
    pendingScrollRef.current = null;

    const newScrollWidth = container.scrollWidth;
    const targetScrollLeft = focalRatio * newScrollWidth - focalX;
    container.scrollLeft = Math.max(0, Math.min(newScrollWidth - container.clientWidth, targetScrollLeft));
  }, [contentWidth, zoom]);

  // Función matemática de aplicación de zoom con punto focal
  const applyZoom = useCallback(
    (factorOrTarget: number, focalXScreen?: number, isAbsolute: boolean = false) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const focalX = focalXScreen !== undefined
        ? Math.max(0, Math.min(rect.width, focalXScreen))
        : rect.width / 2;

      const currentScrollLeft = container.scrollLeft;
      const currentScrollWidth = Math.max(container.clientWidth, container.scrollWidth);

      // Coordenada del punto focal dentro del contenido antes del cambio
      const focalContentX = currentScrollLeft + focalX;
      const focalRatio = focalContentX / currentScrollWidth;

      const oldZoom = zoomRef.current;
      const targetZoom = isAbsolute ? factorOrTarget : oldZoom * factorOrTarget;
      const clampedZoom = Math.max(minZoom, Math.min(maxZoom, Math.round(targetZoom * 1000) / 1000));

      if (Math.abs(clampedZoom - oldZoom) < 0.001) return;

      pendingScrollRef.current = { focalRatio, focalX };
      zoomRef.current = clampedZoom;
      setZoomState(clampedZoom);
      onZoomChange?.(clampedZoom);
    },
    [minZoom, maxZoom, onZoomChange]
  );

  const zoomIn = useCallback(
    (focalX?: number) => {
      applyZoom(1.3, focalX, false);
    },
    [applyZoom]
  );

  const zoomOut = useCallback(
    (focalX?: number) => {
      applyZoom(1 / 1.3, focalX, false);
    },
    [applyZoom]
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
      applyZoom(newZoom, focalX, true);
    },
    [applyZoom]
  );

  // ── GESTIÓN DE EVENTOS DE ESCRITORIO Y TÁCTILES ({ passive: false }) ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Desktop: Wheel (Ctrl/Cmd + Wheel para Zoom Focal, Wheel vertical para Paneo horizontal)
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // PREVENCIÓN CRÍTICA: Bloquear zoom de la ventana completa del navegador
        e.preventDefault();
        e.stopPropagation();

        const rect = container.getBoundingClientRect();
        const focalX = Math.max(0, e.clientX - rect.left - widthOffset);

        // Sensibilidad suave de zoom según la intensidad del scroll
        const intensity = Math.min(Math.abs(e.deltaY) / 100, 2);
        const zoomStep = 1 + 0.15 * Math.max(1, intensity);
        const factor = e.deltaY < 0 ? zoomStep : 1 / zoomStep;

        applyZoom(factor, focalX, false);
      } else if (enableWheelPan && e.deltaY !== 0 && e.deltaX === 0) {
        // Paneo Horizontal en Desktop con rueda de ratón estándar
        if (container.scrollWidth > container.clientWidth) {
          container.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      }
    };

    // 2. Móviles y Tablets: Pinch-to-Zoom con 2 Dedos
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const rect = container.getBoundingClientRect();
        const focalX = (t1.clientX + t2.clientX) / 2 - rect.left;

        touchPinchRef.current = {
          initialDist: dist,
          lastDist: dist,
          focalX,
        };
      } else {
        touchPinchRef.current = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchPinchRef.current) {
        // PREVENCIÓN CRÍTICA: Bloquear el pinch-to-zoom nativo de Safari/Chrome móvil
        e.preventDefault();
        e.stopPropagation();

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const { lastDist, focalX } = touchPinchRef.current;

        if (lastDist > 10 && currentDist > 10) {
          const ratio = currentDist / lastDist;
          touchPinchRef.current.lastDist = currentDist;
          applyZoom(ratio, focalX, false);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        touchPinchRef.current = null;
      }
    };

    const handleNativeScroll = () => {
      onScroll?.(container.scrollLeft);
    };

    // Registro con { passive: false } obligatorio para poder invocar e.preventDefault()
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    container.addEventListener('scroll', handleNativeScroll, { passive: true });

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
      container.removeEventListener('scroll', handleNativeScroll);
    };
  }, [applyZoom, enableWheelPan, onScroll]);

  // Helpers de Proyección Matemática (Sin CSS scaleX)
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
      const clampedPx = Math.max(0, Math.min(availableW, px - padPx));
      return (clampedPx / availableW) * dur;
    },
    [contentWidth]
  );

  return {
    zoom,
    containerRef,
    containerWidth,
    contentWidth,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoomExplicit,
    timeToPx,
    pxToTime,
  };
}
