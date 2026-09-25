import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { createTimelineGeometry } from '../core/audio/timeline/AudioTimelineGeometry';

export interface UseAudioZoomPanOptions {
  minZoom?: number;
  maxZoom?: number;
  initialZoom?: number;
  enableWheelPan?: boolean;
  widthOffset?: number;
  overscrollPx?: number;
  onZoomChange?: (zoom: number) => void;
  onScroll?: (scrollLeft: number) => void;
  /**
   * Valor de `touch-action` aplicado UNA sola vez al contenedor.
   * `pan-x pan-y` permite desplazar con un dedo pero desactiva el zoom nativo
   * del navegador, de modo que el gesto de pinza llega íntegro a este hook.
   */
  touchAction?: string;
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
  /**
   * `true` mientras el usuario arrastra, hace pinza o mueve la rueda sobre el
   * timeline (y durante un breve margen tras soltar). Se lee desde el bucle de
   * frames del playhead para NO robarle el control durante la edición.
   */
  isInteracting: () => boolean;
}

interface PinchState {
  active: boolean;
  startDist: number;
  startZoom: number;
  /** Proporción (0..1) del contenido situada bajo el punto medio inicial. */
  anchorRatio: number;
  moved: boolean;
}

/**
 * useAudioZoomPan — Motor de Zoom y Paneo Dinámico Multidispositivo.
 *
 * Correcciones clave de esta versión:
 * 1. Los callbacks (`onZoomChange`, `onScroll`) y la función de zoom viven en
 *    REFS, así el listener nunca se vuelve a registrar durante un gesto. Antes,
 *    cada cambio de zoom provocaba un render → nueva función inline → el efecto
 *    se limpiaba y volvía a montarse → la distancia inicial de los dedos se
 *    reseteaba a 0 y la pinza moría tras el primer incremento.
 * 2. El estado de la pinza persiste en un ref y se RE-ANCLA cuando cambia el
 *    número de dedos (2 → 1 → 2), algo habitual en landscape.
 * 3. `touch-action: pan-x pan-y` fijo: un dedo desplaza, dos dedos hacen zoom
 *    propio sin que el navegador escale el viewport.
 * 4. Sin `return` temprano cuando el zoom ya está en el tope: el contenido sigue
 *    a los dedos (paneo durante pinza) sin perder el anclaje.
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
    touchAction = 'pan-x pan-y',
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoomState] = useState<number>(initialZoom);
  const [containerWidth, setContainerWidth] = useState<number>(1000);

  const zoomRef = useRef<number>(initialZoom);
  zoomRef.current = zoom;

  const pendingScrollRef = useRef<number | null>(null);

  // Estado de interacción directa del usuario (pan/pinch/rueda). Se mantiene en
  // un ref para leerlo desde el rAF del playhead sin provocar re-renders.
  const interactingRef = useRef(false);
  const interactionTimerRef = useRef<number | null>(null);

  const beginInteraction = useCallback(() => {
    interactingRef.current = true;
    if (interactionTimerRef.current !== null) {
      window.clearTimeout(interactionTimerRef.current);
      interactionTimerRef.current = null;
    }
  }, []);

  // Margen tras soltar: absorbe la inercia del scroll y el último frame del gesto.
  const endInteraction = useCallback(() => {
    if (interactionTimerRef.current !== null) window.clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = window.setTimeout(() => {
      interactionTimerRef.current = null;
      interactingRef.current = false;
    }, 180);
  }, []);

  const isInteracting = useCallback(() => interactingRef.current, []);

  useEffect(
    () => () => {
      if (interactionTimerRef.current !== null) window.clearTimeout(interactionTimerRef.current);
    },
    []
  );

  // Callbacks y geometría en refs: deps estables para los listeners nativos
  const callbacksRef = useRef({ onZoomChange, onScroll });
  callbacksRef.current = { onZoomChange, onScroll };

  const geometryRef = useRef({ widthOffset, minZoom, maxZoom });
  geometryRef.current = { widthOffset, minZoom, maxZoom };

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

  // Aplicación inmediata del scrollLeft previo al renderizado visual (Zero-Flicker).
  // Se acota contra el nuevo `scrollWidth` (ya con el contenido reescalado) para
  // que el ancla focal no dependa del recorte implícito del navegador.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (pendingScrollRef.current !== null && container) {
      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      container.scrollLeft = Math.max(0, Math.min(pendingScrollRef.current, maxScroll));
      pendingScrollRef.current = null;
    }
  }, [contentWidth, zoom]);

  // Función matemática de aplicación de zoom con anclaje de punto focal
  const applyZoomExplicit = useCallback(
    (targetZoom: number, focalXScreen?: number, contentRatio?: number) => {
      const container = containerRef.current;
      if (!container) return;

      const { widthOffset: wOffset, minZoom: minZ, maxZoom: maxZ } = geometryRef.current;
      const clampedZoom = Math.max(minZ, Math.min(maxZ, Math.round(targetZoom * 1000) / 1000));
      const oldZoom = zoomRef.current;
      const zoomChanged = Math.abs(clampedZoom - oldZoom) >= 0.0005;

      const rect = container.getBoundingClientRect();
      const focalX =
        focalXScreen !== undefined
          ? Math.max(0, Math.min(rect.width, focalXScreen))
          : rect.width / 2;

      const currentContentW = Math.max(baseWidth, Math.round(baseWidth * oldZoom));

      // Ratio del punto focal respecto al contenido de audio
      const ratio =
        contentRatio !== undefined
          ? Math.max(0, Math.min(1, contentRatio))
          : Math.max(0, container.scrollLeft + focalX - wOffset) / Math.max(1, currentContentW);

      const newContentW = Math.max(baseWidth, Math.round(baseWidth * clampedZoom));
      const targetScrollLeft = Math.max(0, Math.round(ratio * newContentW + wOffset - focalX));

      if (zoomChanged) {
        // Asignación síncrona + registro para useLayoutEffect (sin parpadeo)
        pendingScrollRef.current = targetScrollLeft;
        container.scrollLeft = targetScrollLeft;
        zoomRef.current = clampedZoom;
        setZoomState(clampedZoom);
        callbacksRef.current.onZoomChange?.(clampedZoom);
      } else {
        // Zoom topado: el contenido igualmente sigue a los dedos
        pendingScrollRef.current = null;
        if (container.scrollLeft !== targetScrollLeft) {
          container.scrollLeft = targetScrollLeft;
        }
      }
    },
    [baseWidth]
  );

  // La función de zoom también vive en un ref para que los listeners sean estables
  const applyZoomRef = useRef(applyZoomExplicit);
  applyZoomRef.current = applyZoomExplicit;

  const zoomIn = useCallback((focalX?: number) => {
    applyZoomRef.current(zoomRef.current * 1.3, focalX);
  }, []);

  const zoomOut = useCallback((focalX?: number) => {
    applyZoomRef.current(zoomRef.current / 1.3, focalX);
  }, []);

  const resetZoom = useCallback(() => {
    const container = containerRef.current;
    if (container) container.scrollLeft = 0;
    pendingScrollRef.current = null;
    zoomRef.current = 1.0;
    setZoomState(1.0);
    callbacksRef.current.onZoomChange?.(1.0);
  }, []);

  const setZoomExplicit = useCallback((newZoom: number, focalX?: number) => {
    applyZoomRef.current(newZoom, focalX);
  }, []);

  // ── GESTIÓN DE EVENTOS DE ENTRADA UNIFICADOS (Wheel, Touch, Gestures) ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Aplicado una sola vez: nunca se muta durante un gesto (evita conflictos
    // con React y con el navegador a mitad de la pinza).
    const previousTouchAction = container.style.touchAction;
    if (touchAction) container.style.touchAction = touchAction;

    // 1. Desktop: Wheel (Ctrl/Cmd + Wheel = Zoom Focal, Wheel = Paneo horizontal)
    const handleWheel = (e: WheelEvent) => {
      beginInteraction();
      try {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          e.stopPropagation();

          const rect = container.getBoundingClientRect();
          const focalX = Math.max(0, e.clientX - rect.left);

          let delta = e.deltaY;
          if (e.deltaMode === 1) delta *= 20;
          else if (e.deltaMode === 2) delta *= 200;

          const clampedDelta = Math.max(-60, Math.min(60, delta));
          const factor = Math.exp(-clampedDelta * 0.006);
          applyZoomRef.current(zoomRef.current * factor, focalX);
        } else if (enableWheelPan && e.deltaY !== 0 && e.deltaX === 0) {
          if (container.scrollWidth > container.clientWidth) {
            let panDelta = e.deltaY;
            if (e.deltaMode === 1) panDelta *= 20;
            container.scrollLeft += panDelta;
            e.preventDefault();
          }
        }
      } finally {
        endInteraction();
      }
    };

    // 2. Móviles/Tablets: Pinch-to-Zoom con distancia euclidiana exacta.
    //    Estado persistente en ref para sobrevivir a cualquier re-render.
    const pinch: PinchState = {
      active: false,
      startDist: 0,
      startZoom: 1,
      anchorRatio: 0,
      moved: false,
    };

    const midpoint = (t1: Touch, t2: Touch) => ({
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    });

    const distance = (t1: Touch, t2: Touch) =>
      Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

    const baselinePinch = (touches: TouchList) => {
      const { widthOffset: wOffset } = geometryRef.current;
      const t1 = touches[0];
      const t2 = touches[1];
      const dist = distance(t1, t2);
      const mid = midpoint(t1, t2);
      const rect = container.getBoundingClientRect();
      const midX = Math.max(0, mid.x - rect.left);

      const currentZoom = zoomRef.current;
      const currentContentW = Math.max(baseWidth, Math.round(baseWidth * currentZoom));
      const timeX = Math.max(0, container.scrollLeft + midX - wOffset);

      pinch.active = true;
      pinch.moved = false;
      pinch.startDist = Math.max(1, dist);
      pinch.startZoom = currentZoom;
      pinch.anchorRatio = Math.max(0, Math.min(1, timeX / Math.max(1, currentContentW)));
    };

    const handleTouchStart = (e: TouchEvent) => {
      beginInteraction();
      if (e.touches.length === 2) {
        // Primera pinza o reincorporación de un segundo dedo → re-anclar
        baselinePinch(e.touches);
      } else if (e.touches.length === 1) {
        pinch.active = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Cualquier movimiento táctil (paneo nativo o pinza) es interacción directa.
      beginInteraction();
      if (e.touches.length !== 2) return;

      // Si el segundo dedo entró sin un touchstart limpio, anclar ahora
      if (!pinch.active) {
        baselinePinch(e.touches);
        return;
      }

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = distance(t1, t2);
      if (currentDist < 4 || pinch.startDist < 4) return;

      // Somos dueños del gesto: bloquea el zoom/scroll nativo del navegador
      if (e.cancelable) e.preventDefault();

      const scale = currentDist / pinch.startDist;
      if (Math.abs(scale - 1) > 0.01) pinch.moved = true;

      const rect = container.getBoundingClientRect();
      const midX = Math.max(0, midpoint(t1, t2).x - rect.left);

      // El punto anclado del contenido viaja bajo el centro ACTUAL de los dedos:
      // permite zoom y paneo simultáneos (comportamiento de app nativa).
      applyZoomRef.current(pinch.startZoom * scale, midX, pinch.anchorRatio);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinch.active = false;
      } else if (e.touches.length === 2) {
        // 1 → 2 dedos: volver a anclar con la nueva geometría
        baselinePinch(e.touches);
      }
      // Se programa el fin de interacción; si queda un dedo moviendo, el
      // `touchmove` la reactiva. Así el auto-follow nunca pelea con el gesto.
      endInteraction();
    };

    // Safari iOS: los gestos de pinza nativos se bloquean y también cuentan como interacción.
    const handleGesture = (e: Event) => {
      e.preventDefault();
      beginInteraction();
      endInteraction();
    };
    const handleGestureStart = (e: Event) => {
      e.preventDefault();
      beginInteraction();
    };
    const handleGestureEnd = (e: Event) => {
      e.preventDefault();
      endInteraction();
    };

    const handleNativeScroll = () => {
      callbacksRef.current.onScroll?.(container.scrollLeft);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    container.addEventListener('gesturestart', handleGestureStart, { passive: false });
    container.addEventListener('gesturechange', handleGesture, { passive: false });
    container.addEventListener('gestureend', handleGestureEnd, { passive: false });
    container.addEventListener('scroll', handleNativeScroll, { passive: true });

    return () => {
      container.style.touchAction = previousTouchAction;
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
      container.removeEventListener('gesturestart', handleGestureStart);
      container.removeEventListener('gesturechange', handleGesture);
      container.removeEventListener('gestureend', handleGestureEnd);
      container.removeEventListener('scroll', handleNativeScroll);
    };
    // Deps deliberadamente mínimas: los valores variables se leen desde refs
    // para que los listeners NO se re-registren a mitad de un gesto.
  }, [baseWidth, enableWheelPan, touchAction, beginInteraction, endInteraction]);

  // Helpers de Proyección Matemática.
  // Delegan en la ÚNICA geometría temporal compartida (`AudioTimelineGeometry`)
  // para que no exista una segunda fórmula tiempo ↔ píxeles en el proyecto.
  const timeToPx = useCallback(
    (timeSec: number, totalDurationSec: number, padPx: number = 0): number =>
      createTimelineGeometry({
        contentWidth,
        durationSec: Math.max(1, totalDurationSec),
        insetPx: padPx,
      }).timeToPx(timeSec, true),
    [contentWidth]
  );

  const pxToTime = useCallback(
    (px: number, totalDurationSec: number, padPx: number = 0): number =>
      createTimelineGeometry({
        contentWidth,
        durationSec: Math.max(1, totalDurationSec),
        insetPx: padPx,
      }).pxToTime(px, true),
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
    isInteracting,
  };
}
