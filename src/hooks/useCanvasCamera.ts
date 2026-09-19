/**
 * useCanvasCamera.ts — Virtual Camera Engine for 2D Interactive Canvas
 *
 * Implements:
 *  - 2-Finger Multi-Touch Gestures (Pinch-to-Zoom with Midpoint Focal Anchoring & Panning)
 *  - 1-Finger Background Panning
 *  - Inverse Coordinate Transformation (Screen-to-World)
 *  - Clamped Zoom (0.5x to 4.0x)
 *  - Zero native browser zoom interference
 */

import { useState, useRef, useCallback } from 'react';

export interface CameraState {
  x: number;     // Horizontal translation in CSS pixels
  y: number;     // Vertical translation in CSS pixels
  zoom: number;  // Scale factor (1.0 = 100%)
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4.0;

export const useCanvasCamera = (initialCamera: CameraState = { x: 0, y: 0, zoom: 1 }) => {
  const [camera, setCamera] = useState<CameraState>(initialCamera);
  const cameraRef = useRef<CameraState>(initialCamera);
  cameraRef.current = camera;

  // Active pointers registry: pointerId -> ScreenPoint (in CSS pixels relative to canvas)
  const activePointersRef = useRef<Map<number, ScreenPoint>>(new Map());

  // Pinch-to-zoom 2-finger state
  const pinchStateRef = useRef<{
    initialDistance: number;
    initialZoom: number;
    initialMidpoint: ScreenPoint;
    lastMidpoint: ScreenPoint;
  } | null>(null);

  // Background single-finger pan state
  const isPanningRef = useRef(false);
  const panStartPointRef = useRef<ScreenPoint | null>(null);

  /**
   * 1. Transformación Inversa (Screen-to-World):
   * Convierte coordenadas de pantalla del cliente (clientX, clientY) al espacio del mundo
   * del Canvas considerando el desplazamiento y zoom de la cámara virtual.
   */
  const screenToWorld = useCallback((
    clientX: number,
    clientY: number,
    canvasElement: HTMLCanvasElement
  ): ScreenPoint => {
    const rect = canvasElement.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const { x: camX, y: camY, zoom } = cameraRef.current;

    return {
      x: (screenX - camX) / zoom,
      y: (screenY - camY) / zoom,
    };
  }, []);

  /**
   * 2. Transformación Directa (World-to-Screen):
   * Convierte una coordenada del mundo a píxeles de pantalla (relativos al canvas).
   */
  const worldToScreen = useCallback((
    worldX: number,
    worldY: number
  ): ScreenPoint => {
    const { x: camX, y: camY, zoom } = cameraRef.current;
    return {
      x: camX + worldX * zoom,
      y: camY + worldY * zoom,
    };
  }, []);

  /**
   * 3. Registra eventos de puntero (pointerdown)
   */
  const onPointerDown = useCallback((
    e: React.PointerEvent<HTMLCanvasElement>,
    isHitNode: boolean
  ) => {
    const canvas = e.currentTarget;
    try { canvas.setPointerCapture(e.pointerId); } catch {}

    const rect = canvas.getBoundingClientRect();
    const screenPt: ScreenPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    activePointersRef.current.set(e.pointerId, screenPt);
    const pointers = Array.from(activePointersRef.current.values());

    if (pointers.length === 2) {
      // INICIO DE GESTO DE 2 DEDOS (PINCH-TO-ZOOM + PAN)
      isPanningRef.current = false;
      const [p1, p2] = pointers;
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const mid: ScreenPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      pinchStateRef.current = {
        initialDistance: Math.max(dist, 1),
        initialZoom: cameraRef.current.zoom,
        initialMidpoint: mid,
        lastMidpoint: mid,
      };
    } else if (pointers.length === 1 && !isHitNode) {
      // INICIO DE PANEO DE FONDO CON 1 DEDO (cuando no toca un nodo)
      isPanningRef.current = true;
      panStartPointRef.current = screenPt;
    }
  }, []);

  /**
   * 4. Procesa movimiento de puntero (pointermove)
   */
  const onPointerMove = useCallback((
    e: React.PointerEvent<HTMLCanvasElement>
  ): { isInteractingWithCamera: boolean } => {
    if (!activePointersRef.current.has(e.pointerId)) {
      return { isInteractingWithCamera: false };
    }

    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const currentPt: ScreenPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    activePointersRef.current.set(e.pointerId, currentPt);
    const pointers = Array.from(activePointersRef.current.values());

    // ── GESTO DE 2 DEDOS: PINCH-TO-ZOOM + PANEO SIMULTÁNEO ──
    if (pointers.length === 2 && pinchStateRef.current) {
      const [p1, p2] = pointers;
      const currentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const currentMid: ScreenPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      const { initialDistance, initialZoom, lastMidpoint } = pinchStateRef.current;

      // Nuevo factor de zoom acotado
      const rawZoom = initialZoom * (currentDist / initialDistance);
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, rawZoom));

      // Desplazamiento del centro del pellizco
      const deltaMidX = currentMid.x - lastMidpoint.x;
      const deltaMidY = currentMid.y - lastMidpoint.y;

      // Anclaje de punto focal: mantener el punto de mundo bajo el centro del pellizco
      const currentCam = cameraRef.current;
      const worldFocusX = (currentMid.x - currentCam.x) / currentCam.zoom;
      const worldFocusY = (currentMid.y - currentCam.y) / currentCam.zoom;

      const nextCamX = currentMid.x - worldFocusX * newZoom + deltaMidX;
      const nextCamY = currentMid.y - worldFocusY * newZoom + deltaMidY;

      pinchStateRef.current.lastMidpoint = currentMid;

      setCamera({
        x: nextCamX,
        y: nextCamY,
        zoom: newZoom,
      });

      return { isInteractingWithCamera: true };
    }

    // ── GESTO DE 1 DEDO: PANEO DEL FONDO ──
    if (pointers.length === 1 && isPanningRef.current && panStartPointRef.current) {
      const deltaX = currentPt.x - panStartPointRef.current.x;
      const deltaY = currentPt.y - panStartPointRef.current.y;

      panStartPointRef.current = currentPt;

      setCamera((prev) => ({
        ...prev,
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }));

      return { isInteractingWithCamera: true };
    }

    return { isInteractingWithCamera: false };
  }, []);

  /**
   * 5. Libera punteros (pointerup / pointercancel)
   */
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);

    if (activePointersRef.current.size < 2) {
      pinchStateRef.current = null;
    }
    if (activePointersRef.current.size === 0) {
      isPanningRef.current = false;
      panStartPointRef.current = null;
    }
  }, []);

  /**
   * 6. Resetear la cámara al centro y zoom 1.0x
   */
  const resetCamera = useCallback(() => {
    setCamera({ x: 0, y: 0, zoom: 1 });
  }, []);

  /**
   * 7. Zoom incremental por botones
   */
  const zoomIn = useCallback((canvasElement?: HTMLCanvasElement | null) => {
    setCamera((prev) => {
      const newZoom = Math.min(MAX_ZOOM, prev.zoom * 1.25);
      if (canvasElement) {
        const rect = canvasElement.getBoundingClientRect();
        const midX = rect.width / 2;
        const midY = rect.height / 2;
        const worldX = (midX - prev.x) / prev.zoom;
        const worldY = (midY - prev.y) / prev.zoom;
        return {
          x: midX - worldX * newZoom,
          y: midY - worldY * newZoom,
          zoom: newZoom,
        };
      }
      return { ...prev, zoom: newZoom };
    });
  }, []);

  const zoomOut = useCallback((canvasElement?: HTMLCanvasElement | null) => {
    setCamera((prev) => {
      const newZoom = Math.max(MIN_ZOOM, prev.zoom / 1.25);
      if (canvasElement) {
        const rect = canvasElement.getBoundingClientRect();
        const midX = rect.width / 2;
        const midY = rect.height / 2;
        const worldX = (midX - prev.x) / prev.zoom;
        const worldY = (midY - prev.y) / prev.zoom;
        return {
          x: midX - worldX * newZoom,
          y: midY - worldY * newZoom,
          zoom: newZoom,
        };
      }
      return { ...prev, zoom: newZoom };
    });
  }, []);

  return {
    camera,
    setCamera,
    resetCamera,
    zoomIn,
    zoomOut,
    screenToWorld,
    worldToScreen,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    getActivePointerCount: () => activePointersRef.current.size,
  };
};

