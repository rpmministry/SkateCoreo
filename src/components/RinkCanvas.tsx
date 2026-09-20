import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Trash2, 
  Eye, 
  Layers, 
  Clock, 
  Sparkles,
  Move,
  Maximize2,
  Minimize2,
  Gauge,
  Undo2,
  SkipBack,
  SkipForward,
  Headphones,
  MinusCircle,
  X,
  Tag,
  SlidersHorizontal,
  Music,
  Mic,
  PenTool,
  Route,
  Eraser
} from 'lucide-react';

import { ChoreographyPathPoint, ChoreographyPoint, Program, ElementLog, isMainNode } from '../types';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { audioEngine } from '../core/audio/AudioEngine';
import { RinkMath, DEFAULT_RINK_DIMENSIONS, CanvasViewportMetrics } from '../core/canvas/RinkMath';
import { RinkRenderer } from '../core/canvas/RinkRenderer';
import { useChoreographyStore, DEFAULT_CHOREOGRAPHY_POINTS } from '../store/useChoreographyStore';
import { isSpeakableFigure } from '../core/audio/VoiceCueEngine';
import { InteractiveWaveform } from './InteractiveWaveform';
import { useCanvasCamera } from '../hooks/useCanvasCamera';
import { FreehandPathEngine, Point2D } from '../core/math/FreehandPathEngine';

interface RinkCanvasProps {
  currentProgram: Program | null;
  onProgramUpdated: (updated: Program) => void;
  elements: ElementLog[];
  onSelectElement?: (element: ElementLog) => void;
  layoutMode?: 'standalone' | 'ide';
  /**
   * Disparado ÚNICAMENTE en un "Tap" intencional sobre un nodo (movimiento < 5px).
   * Si es null, el usuario tocó el lienzo vacío (deselección).
   */
  onNodeSelect?: (id: string | null) => void;
  /**
   * Notifica el inicio y fin de arrastre activo para suprimir Bottom Sheets / Menús.
   */
  onDragChange?: (isDragging: boolean) => void;
}



interface DragState {
  targetId: string;
  type: 'anchor' | 'grip' | 'curve' | 'point';
  t?: number;
}

import { STANDARD_FIGURES, ROLLART_STANDARD_FIGURES } from '../constants/figures';
export { STANDARD_FIGURES, ROLLART_STANDARD_FIGURES };


export const RinkCanvas: React.FC<RinkCanvasProps> = ({
  currentProgram,
  onProgramUpdated,
  elements,
  layoutMode = 'standalone',
  onNodeSelect,
  onDragChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Motor Headless de Audio (Web Audio API limpia y desacoplada)
  const audio = useAudioEngine();

  // Cámara Virtual Interactiva (Pan, Pinch-to-Zoom y Transformación Screen-to-World)
  const cameraEngine = useCanvasCamera();
  const {
    camera,
    zoomIn,
    zoomOut,
    resetCamera,
    screenToWorld,
    onPointerDown: camPointerDown,
    onPointerMove: camPointerMove,
    onPointerUp: camPointerUp,
  } = cameraEngine;

  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 1000,
    height: 540,
  });

  // Observador de Redimensionamiento Responsivo (100% Ancho y Altura)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    };

    updateSize();
    const ro = new ResizeObserver(() => {
      updateSize();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHud, setShowHud] = useState(true);

  // Gestor de Estado Global Unificado (Zustand)
  const points = useChoreographyStore((state) => state.points);
  const selectedPointId = useChoreographyStore((state) => state.selectedPointId);
  const skaterGender = useChoreographyStore((state) => state.skaterGender);
  const phase = useChoreographyStore((state) => state.phase);
  const showControlHandles = useChoreographyStore((state) => state.showControlHandles);
  const showRinkGrid = useChoreographyStore((state) => state.showRinkGrid);
  const history = useChoreographyStore((state) => state.history);

  const setPoints = useChoreographyStore((state) => state.setPoints);
  const setSelectedPointId = useChoreographyStore((state) => state.setSelectedPointId);
  const setSkaterGender = useChoreographyStore((state) => state.setSkaterGender);
  const setPhase = useChoreographyStore((state) => state.setPhase);
  const setShowControlHandles = useChoreographyStore((state) => state.setShowControlHandles);
  const setShowRinkGrid = useChoreographyStore((state) => state.setShowRinkGrid);
  const addPointAtCanvas = useChoreographyStore((state) => state.addPointAtCanvas);
  const updateSegmentControlPoints = useChoreographyStore((state) => state.updateSegmentControlPoints);
  const updatePointMetadata = useChoreographyStore((state) => state.updatePointMetadata);
  const deletePoint = useChoreographyStore((state) => state.deletePoint);
  const clearAllPoints = useChoreographyStore((state) => state.clearAllPoints);
  const straightenSegment = useChoreographyStore((state) => state.straightenSegment);
  const undo = useChoreographyStore((state) => state.undo);
  const pushHistory = useChoreographyStore((state) => state.pushHistory);
  const loadProgramPoints = useChoreographyStore((state) => state.loadProgramPoints);

  // Trazado Dinámico
  const showFullTrailOverride = useChoreographyStore((state) => state.showFullTrailOverride);

  // Estado de Arrastre (Zero-Friction Drag & Drop)
  const [isDragging, setIsDragging] = useState(false);
  const dragTargetRef = useRef<DragState | null>(null);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const curveDragStartPosRef = useRef<{ mX: number; mY: number } | null>(null);
  const curveInitialCpsRef = useRef<{
    cp1: { x: number; y: number };
    cp2: { x: number; y: number };
  } | null>(null);
  const pointsBeforeDragRef = useRef<ChoreographyPathPoint[] | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const [cursorStyle, setCursorStyle] = useState<'default' | 'crosshair' | 'grab' | 'grabbing' | 'pointer'>('crosshair');

  // Motor de Trazado a Mano Alzada (Freehand Pathing) y Long Press (~600ms)
  const rawStrokeRef = useRef<Point2D[]>([]);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressActiveRef = useRef<boolean>(false);
  const strokeStartNodeRef = useRef<ChoreographyPoint | null>(null);

  // Limpieza del temporizador de Long Press y selección al desmontar
  useEffect(() => {
    return () => {
      setSelectedPointId(null);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, [setSelectedPointId]);

  // Limpieza de selección y estados efímeros al cambiar de modo (Nodos <-> Trazado <-> Borrador)
  useEffect(() => {
    setSelectedPointId(null);
    rawStrokeRef.current = [];
    strokeStartNodeRef.current = null;
    dragTargetRef.current = null;
    setIsDragging(false);
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, [phase, setSelectedPointId]);


  // Función Deshacer (Undo / Ctrl+Z)
  const handleUndo = useCallback(() => {
    undo();
    const currentPts = useChoreographyStore.getState().points;
    audio.setNodes(currentPts);
    if (currentProgram) {
      onProgramUpdated({
        ...currentProgram,
        choreography_path: currentPts
      });
    }
  }, [currentProgram, onProgramUpdated, audio, undo]);

  // Salto al Punto Anterior en la pista y tiempo de audio
  const handleJumpToPrevPoint = useCallback(() => {
    if (points.length === 0) return;
    const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);
    const prev = [...sorted].reverse().find(p => p.time_ms < audio.currentTimeMs - 350);
    const target = prev || sorted[0];
    audio.seek(target.time_ms);
    setSelectedPointId(target.id);
  }, [points, audio, setSelectedPointId]);

  // Salto al Punto Siguiente en la pista y tiempo de audio
  const handleJumpToNextPoint = useCallback(() => {
    if (points.length === 0) return;
    const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);
    const next = sorted.find(p => p.time_ms > audio.currentTimeMs + 350);
    const target = next || sorted[sorted.length - 1];
    audio.seek(target.time_ms);
    setSelectedPointId(target.id);
  }, [points, audio, setSelectedPointId]);

  // Borrar tiradores / enderezar tramo Bézier del punto seleccionado (Fase 3)
  const handleStraightenSegment = useCallback(() => {
    if (!selectedPointId) return;
    straightenSegment(selectedPointId);
    const updated = useChoreographyStore.getState().points;
    audio.setNodes(updated);
    if (currentProgram) {
      onProgramUpdated({
        ...currentProgram,
        choreography_path: updated
      });
    }
  }, [selectedPointId, currentProgram, onProgramUpdated, audio, straightenSegment]);

  // Cargar puntos del programa al montar o cambiar de programa
  useEffect(() => {
    if (currentProgram?.choreography_path && currentProgram.choreography_path.length > 0) {
      loadProgramPoints(currentProgram.choreography_path);
      audio.setNodes(currentProgram.choreography_path);
    }
  }, [currentProgram?.id]);

  // Sincronizar nodos con el motor de audio continuamente
  useEffect(() => {
    audio.setNodes(points);
    if (currentProgram && currentProgram.choreography_path !== points) {
      onProgramUpdated({
        ...currentProgram,
        choreography_path: points
      });
    }
  }, [points]);

  // Fase se resetea a 'plot' si se eliminan todos los puntos
  useEffect(() => {
    if (points.length === 0 && phase === 'curve') {
      setPhase('plot');
    }
  }, [points.length, phase, setPhase]);


  // Viewport Metrics con cálculo adaptativo responsivo
  const getMetrics = useCallback((): CanvasViewportMetrics => {
    const w = containerSize.width || 1000;
    const h = containerSize.height || 540;
    const padding = w < 640 ? 12 : 28;
    return RinkMath.calculateViewportMetrics(w, h, DEFAULT_RINK_DIMENSIONS, padding);
  }, [containerSize]);

  // Estado cinemático del avatar patinador (activo automáticamente al haber 2 o más puntos)
  const isPathGenerated = points.length >= 2;
  const skaterState = isPathGenerated ? RinkMath.interpolateSkaterPosition(points, audio.currentTimeMs) : null;

  // Render Frame Unificado de Canvas 2D con Cámara Virtual y Retina Display (devicePixelRatio)
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const cssW = containerSize.width || 1000;
    const cssH = containerSize.height || 540;

    const physicalW = Math.round(cssW * dpr);
    const physicalH = Math.round(cssH * dpr);

    if (canvas.width !== physicalW || canvas.height !== physicalH) {
      canvas.width = physicalW;
      canvas.height = physicalH;
    }

    const metrics = getMetrics();
    const currentPoints = useChoreographyStore.getState().points;
    const currentSelectedId = useChoreographyStore.getState().selectedPointId;
    const currentShowHandles = useChoreographyStore.getState().showControlHandles;
    const currentShowGrid = useChoreographyStore.getState().showRinkGrid;
    const currentFullTrail = useChoreographyStore.getState().showFullTrailOverride;

    const currentPlayTime = audio.isPlaying ? audioEngine.getCurrentTimeMs() : audio.currentTimeMs;
    const currentAvatar = currentPoints.length >= 2
      ? RinkMath.interpolateSkaterPosition(currentPoints, currentPlayTime)
      : null;

    ctx.save();
    // 1. Escala para pantallas Retina/OLED de alta densidad
    ctx.scale(dpr, dpr);
    // 2. Limpieza total del frame anterior (Elimina cualquier rastro previo o artefactos visuales)
    ctx.clearRect(0, 0, cssW, cssH);

    // 3. Aplicación de la Cámara Virtual (Pan & Zoom)
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    const renderOpts = {
      showRinkGrid: currentShowGrid,
      showControlHandles: currentShowHandles,
      selectedPointId: currentSelectedId,
      activeSegmentIndex: currentAvatar?.activePointIndex ?? null,
      isPathGenerated: currentPoints.length >= 2,
      phase,
      isPlaying: audio.isPlaying,
      showFullTrailOverride: currentFullTrail,
      currentTimeMs: currentPlayTime,
      avatar: currentAvatar
    };

    // Capa 0: Pista reglamentaria y marcas World Skate
    RinkRenderer.drawRinkFloor(ctx, metrics, DEFAULT_RINK_DIMENSIONS, renderOpts);

    // Capa 1: Curvas de trayectoria (Línea guía permanente en pausa, o Trazado Dinámico durante reproducción)
    RinkRenderer.drawTrajectories(ctx, metrics, currentPoints, renderOpts);

    // Capa 2: Puntos de anclaje de Nodos Principales exclusivamente (Menta Neón)
    RinkRenderer.drawAnchorPoints(ctx, metrics, currentPoints, currentSelectedId);

    // Capa 5: Elementos técnicos RollArt
    RinkRenderer.drawTechnicalElements(ctx, metrics, currentPoints, elements);

    // Capa 6: AVATAR CINEMÁTICO DEL PATINADOR/A (CAPA SUPERIOR)
    if (currentPoints.length >= 2 && currentAvatar) {
      RinkRenderer.drawSkaterAvatar(ctx, metrics, currentAvatar, skaterGender);
    }

    // Capa 7: Trazado a Mano Alzada en Tiempo Real (Active Freehand Glowing Trail)
    const activeStroke = rawStrokeRef.current;
    if (activeStroke && activeStroke.length >= 2) {
      ctx.save();
      // Resplandor exterior difuso (Cyan Outer Glow)
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < activeStroke.length; i++) {
        const ptPx = RinkMath.metersToPixels(activeStroke[i].x, activeStroke[i].y, metrics);
        if (i === 0) ctx.moveTo(ptPx.px, ptPx.py);
        else ctx.lineTo(ptPx.px, ptPx.py);
      }
      ctx.stroke();

      // Trazo central nítido (Cyan Core Line)
      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let i = 0; i < activeStroke.length; i++) {
        const ptPx = RinkMath.metersToPixels(activeStroke[i].x, activeStroke[i].y, metrics);
        if (i === 0) ctx.moveTo(ptPx.px, ptPx.py);
        else ctx.lineTo(ptPx.px, ptPx.py);
      }
      ctx.stroke();

      // Punta luminosa en la coordenada exacta del dedo / puntero
      const tip = activeStroke[activeStroke.length - 1];
      const tipPx = RinkMath.metersToPixels(tip.x, tip.y, metrics);
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = '#00F0FF';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(tipPx.px, tipPx.py, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();
  }, [
    containerSize,
    getMetrics,
    camera,
    phase,
    audio.isPlaying,
    audio.currentTimeMs,
    elements,
    skaterGender
  ]);

  // Loop de Renderizado Fluido a 60fps con requestAnimationFrame durante reproducción
  useEffect(() => {
    if (!audio.isPlaying) {
      renderFrame();
      return;
    }

    let animId: number;
    const loop = () => {
      renderFrame();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [audio.isPlaying, renderFrame]);

  // Redibujado reactivo instantáneo ante cualquier cambio de coordenadas, selección o cámara en modo edición
  useEffect(() => {
    if (!audio.isPlaying) {
      renderFrame();
    }
  }, [
    points,
    selectedPointId,
    showControlHandles,
    showRinkGrid,
    showFullTrailOverride,
    audio.currentTimeMs,
    renderFrame
  ]);

  // POINTER DOWN: Hit Testing con soporte para Freehand Pathing y Long Press (~600ms)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cancelar cualquier temporizador de Long Press previo
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    isLongPressActiveRef.current = false;
    rawStrokeRef.current = [];
    strokeStartNodeRef.current = null;

    // Transformación Inversa Screen-to-World: obtener coordenada real del mundo
    const { x: worldPx, y: worldPy } = screenToWorld(e.clientX, e.clientY, canvas);
    const metrics = getMetrics();
    const { mX, mY } = RinkMath.pixelsToMeters(worldPx, worldPy, metrics, DEFAULT_RINK_DIMENSIONS);
    pointsBeforeDragRef.current = points;
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };

    // Radio de hit-test dinámico para Nodos Principales: 32px en pantalla
    const hitRadius = 32 / camera.zoom;
    let hitFound = false;

    // 1. Comprobar si tocó un Nodo Maestro existente (Nodos Principales) con hitbox táctil optimizado
    let hitNode: ChoreographyPoint | null = null;
    let minNodeDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!isMainNode(p, i, points)) continue;

      const { px, py } = RinkMath.metersToPixels(p.x, p.y, metrics);
      const dist = Math.hypot(worldPx - px, worldPy - py);
      if (dist < hitRadius && dist < minNodeDist) {
        minNodeDist = dist;
        hitNode = p;
      }
    }

    if (phase === 'erase') {
      if (hitNode) {
        // En Modo Borrador: eliminar inmediatamente el nodo tocado
        const idToDelete = hitNode.id;
        deletePoint(idToDelete);
        setSelectedPointId(null);
        try {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(40);
          }
        } catch (err) {}
        const updatedPoints = points.filter(p => p.id !== idToDelete);
        if (currentProgram && onProgramUpdated) {
          onProgramUpdated({
            ...currentProgram,
            choreography_path: updatedPoints,
          });
        }
        audio.setNodes(updatedPoints);
        renderFrame();
      }
      return;
    }

    if (hitNode) {
      hitFound = true;
      strokeStartNodeRef.current = hitNode;

      // Configurar temporizador de Long Press (~600ms) para abrir inspector de propiedades si no hay arrastre
      const targetNode = hitNode;
      longPressTimerRef.current = setTimeout(() => {
        isLongPressActiveRef.current = true;
        // Feedback háptico
        try {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(50);
          }
        } catch (err) {}
        // Seleccionar nodo y abrir el modal / Bottom Sheet de propiedades
        setSelectedPointId(targetNode.id);
        onNodeSelect?.(targetNode.id);
        // Cancelar el trazo en curso para evitar dibujar mientras se abre el menú
        rawStrokeRef.current = [];
        strokeStartNodeRef.current = null;
        dragTargetRef.current = null;
        setIsDragging(false);
        renderFrame();
      }, 600);

      // Caso B (Sobre un nodo existente): Captura el nodo y lo establece como startNode temporal.
      // El trazo se ancla ESTRICTAMENTE a las coordenadas exactas de ese nodo (previene duplicados).
      dragTargetRef.current = null;
      rawStrokeRef.current = [{ x: hitNode.x, y: hitNode.y }];
    }

    // 2. Manipulación Directa de Curvas (Drag-to-Curve sin tiradores visuales)
    // Path Proximity Detection con tolerancia invisible (~24px en pantalla) para facilitar agarre táctil
    if (!hitFound && !audio.isPlaying && points.length >= 2) {
      const touchTolerance = 24 / camera.zoom;
      let closestSegment: { p0: ChoreographyPoint; p1: ChoreographyPoint; t: number } | null = null;
      let minCurveDist = Infinity;

      const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);
      for (let i = 0; i < sorted.length - 1; i++) {
        const p0 = sorted[i];
        const p1 = sorted[i + 1];
        const { cp1, cp2 } = RinkMath.getSegmentControlPoints(p0, p1);

        const steps = 25;
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const curvePtM = RinkMath.evaluateCubicBezier(p0, cp1, cp2, p1, t);
          const { px: curvePx, py: curvePy } = RinkMath.metersToPixels(curvePtM.x, curvePtM.y, metrics);
          const dist = Math.hypot(worldPx - curvePx, worldPy - curvePy);

          if (dist < minCurveDist && dist <= touchTolerance) {
            minCurveDist = dist;
            closestSegment = { p0, p1, t };
          }
        }
      }

      if (closestSegment) {
        hitFound = true;
        setSelectedPointId(closestSegment.p0.id);
        const target: DragState = { targetId: closestSegment.p0.id, type: 'curve', t: closestSegment.t };
        dragTargetRef.current = target;
        setCursorStyle('grabbing');
      }
    }

    // 3. Si no tocó ningún elemento y está dentro de la pista, preparar trazo a mano alzada nuevo
    if (!hitFound && mX >= 0.2 && mX <= 49.8 && mY >= 0.2 && mY <= 24.8) {
      strokeStartNodeRef.current = null;
      rawStrokeRef.current = [{ x: mX, y: mY }];
    }

    // Notificar al motor de cámara (si tocó un nodo o control, no activa paneo de 1 dedo)
    camPointerDown(e, hitFound);
  };

  // POINTER MOVE: Trazado libre en tiempo real a 60fps con cancelación de Long Press (>8px)
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 1. GESTOS MULTI-TOUCH: Si hay 2+ dedos (Pinch-to-Zoom / Pan), delegar a la cámara y suspender trazos
    if (cameraEngine.getActivePointerCount() >= 2) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      rawStrokeRef.current = [];
      strokeStartNodeRef.current = null;
      camPointerMove(e);
      if (dragTargetRef.current) {
        dragTargetRef.current = null;
        setIsDragging(false);
        onDragChange?.(false);
      }
      return;
    }

    // Si estamos en Modo Borrador, no permitir arrastre ni dibujo
    if (phase === 'erase') {
      setCursorStyle('pointer');
      return;
    }

    // 2. Cancelar Long Press si el dedo se mueve más de 8px
    const movedDistance = pointerDownPosRef.current
      ? Math.hypot(e.clientX - pointerDownPosRef.current.x, e.clientY - pointerDownPosRef.current.y)
      : 0;

    if (movedDistance > 8 && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // Si el Long Press ya se disparó, no permitir dibujar
    if (isLongPressActiveRef.current) {
      return;
    }

    const metrics = getMetrics();
    const { x: worldPx, y: worldPy } = screenToWorld(e.clientX, e.clientY, canvas);
    const { mX, mY } = RinkMath.pixelsToMeters(worldPx, worldPy, metrics, DEFAULT_RINK_DIMENSIONS);

    // 3. REPOSICIONAMIENTO DE NODOS EN TIEMPO REAL (MODO NODOS: DRAG & DROP A 60 FPS)
    if (dragTargetRef.current && dragTargetRef.current.type === 'point' && movedDistance >= 5) {
      if (!isDragging) {
        setIsDragging(true);
        onDragChange?.(true);
      }

      // Restringir a los límites de la pista reglamentaria (0.4m margen de seguridad)
      const clampedX = Math.max(0.4, Math.min(DEFAULT_RINK_DIMENSIONS.lengthMeters - 0.4, mX));
      const clampedY = Math.max(0.4, Math.min(DEFAULT_RINK_DIMENSIONS.widthMeters - 0.4, mY));

      const targetId = dragTargetRef.current.targetId;
      useChoreographyStore.getState().updatePointPosition(targetId, clampedX, clampedY);
      renderFrame();
      return;
    }

    // 4. Arrastre de Spline Grip Point (curvas Catmull-Rom sobre el tramo)
    if (dragTargetRef.current && (dragTargetRef.current.type === 'grip' || dragTargetRef.current.type === 'curve')) {
      if (movedDistance >= 5 && !isDragging) {
        setIsDragging(true);
        onDragChange?.(true);
        onNodeSelect?.(null);
      }
      const currentTarget = dragTargetRef.current;
      const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);
      const idx = sorted.findIndex(p => p.id === currentTarget.targetId);
      if (idx >= 0 && idx < sorted.length - 1) {
        const p0 = sorted[idx];
        const p1 = sorted[idx + 1];
        const tParam = currentTarget.t !== undefined ? currentTarget.t : 0.5;
        const { cp1, cp2 } = RinkMath.computeControlPointsFromThroughPoint(p0, p1, mX, mY, tParam);
        updateSegmentControlPoints(p0.id, cp1, cp2);
      }
      renderFrame();
      return;
    }

    // 4. TRAZADO A MANO ALZADA (FREEHAND DRAWING) EN TIEMPO REAL
    if (rawStrokeRef.current.length > 0 && movedDistance >= 8) {
      if (!isDragging) {
        setIsDragging(true);
        onDragChange?.(true);
      }

      // Restringir dentro de los límites de la pista con margen de 0.3m
      const clampedX = Math.max(0.3, Math.min(DEFAULT_RINK_DIMENSIONS.lengthMeters - 0.3, mX));
      const clampedY = Math.max(0.3, Math.min(DEFAULT_RINK_DIMENSIONS.widthMeters - 0.3, mY));

      const lastPt = rawStrokeRef.current[rawStrokeRef.current.length - 1];
      // Filtro de distancia (3px a 5px en pantalla): acumula coordenadas con alta resolución para círculos y bucles
      const minStepMeters = Math.max(0.06, 3.5 / (metrics.scale * (camera.zoom || 1)));
      if (!lastPt || Math.hypot(clampedX - lastPt.x, clampedY - lastPt.y) >= minStepMeters) {
        rawStrokeRef.current.push({ x: clampedX, y: clampedY });
        renderFrame();
      }
      return;
    }

    // 5. Paneo de fondo con 1 dedo (cuando no se está dibujando ni arrastrando)
    if (rawStrokeRef.current.length === 0 && !dragTargetRef.current) {
      const { isInteractingWithCamera } = camPointerMove(e);
      if (isInteractingWithCamera) return;
    }

    // Feedback del Cursor para Nodos Principales y Deformación de Curvas
    let isHovering = false;
    const hitRadius = 32 / camera.zoom;

    // 1. Proximidad a Nodos Principales
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!isMainNode(p, i, points)) continue;

      const { px, py } = RinkMath.metersToPixels(p.x, p.y, metrics);
      if (Math.hypot(worldPx - px, worldPy - py) < hitRadius) {
        isHovering = true;
        break;
      }
    }

    // 2. Proximidad a la Curva (Direct Drag-to-Curve)
    if (!isHovering && !audio.isPlaying && points.length >= 2) {
      const touchTolerance = 22 / camera.zoom;
      const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);
      for (let i = 0; i < sorted.length - 1; i++) {
        const p0 = sorted[i];
        const p1 = sorted[i + 1];
        const { cp1, cp2 } = RinkMath.getSegmentControlPoints(p0, p1);
        for (let s = 1; s < 16; s++) {
          const t = s / 16;
          const curvePtM = RinkMath.evaluateCubicBezier(p0, cp1, cp2, p1, t);
          const { px, py } = RinkMath.metersToPixels(curvePtM.x, curvePtM.y, metrics);
          if (Math.hypot(worldPx - px, worldPy - py) <= touchTolerance) {
            isHovering = true;
            break;
          }
        }
        if (isHovering) break;
      }
    }

    setCursorStyle(isHovering ? 'grab' : 'crosshair');
  };

  // POINTER UP: Finalización de trazo a mano alzada, creación de Nodos Maestros o Tap contextual
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas && e.pointerId !== undefined) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    }

    camPointerUp(e);

    // Cancelar temporizador de Long Press
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // Si el Long Press ya se ejecutó con éxito, reiniciar flags y salir
    if (isLongPressActiveRef.current) {
      isLongPressActiveRef.current = false;
      rawStrokeRef.current = [];
      strokeStartNodeRef.current = null;
      setIsDragging(false);
      onDragChange?.(false);
      renderFrame();
      return;
    }

    // Si estamos en Modo Borrador, limpiar estados y salir sin crear nodos
    if (phase === 'erase') {
      setIsDragging(false);
      dragTargetRef.current = null;
      pointerDownPosRef.current = null;
      rawStrokeRef.current = [];
      strokeStartNodeRef.current = null;
      onDragChange?.(false);
      renderFrame();
      return;
    }

    const movedDistance = pointerDownPosRef.current
      ? Math.hypot(e.clientX - pointerDownPosRef.current.x, e.clientY - pointerDownPosRef.current.y)
      : 0;

    const currentTarget = dragTargetRef.current;

    // 0. Finalización de reposicionamiento de Nodo Principal (Mover Nodo en Modo Nodos)
    if (currentTarget && currentTarget.type === 'point' && isDragging) {
      if (pointsBeforeDragRef.current) {
        pushHistory();
        pointsBeforeDragRef.current = null;
      }
      const updatedPoints = useChoreographyStore.getState().points;
      audio.setNodes(updatedPoints);
      if (currentProgram) {
        onProgramUpdated({
          ...currentProgram,
          choreography_path: updatedPoints,
        });
      }
      setIsDragging(false);
      dragTargetRef.current = null;
      onDragChange?.(false);
      renderFrame();
      return;
    }

    // 1. Finalización de arrastre de Spline Grip Point
    if (currentTarget && (currentTarget.type === 'grip' || currentTarget.type === 'curve') && isDragging) {
      if (pointsBeforeDragRef.current) {
        pushHistory();
        pointsBeforeDragRef.current = null;
      }
      audio.setNodes(points);
      if (currentProgram) {
        onProgramUpdated({
          ...currentProgram,
          choreography_path: points,
        });
      }
      setIsDragging(false);
      dragTargetRef.current = null;
      onDragChange?.(false);
      renderFrame();
      return;
    }

    // 2. FINALIZACIÓN DE TRAZO A MANO ALZADA (FREEHAND PATH COMPLETION)
    const rawStroke = rawStrokeRef.current;
    rawStrokeRef.current = [];
    const startNode = strokeStartNodeRef.current;
    strokeStartNodeRef.current = null;

    // Coordenada exacta de liberación táctil (Touch End)
    let touchEndM: { mX: number; mY: number } | null = null;
    if (canvas) {
      const metrics = getMetrics();
      const { x: worldPx, y: worldPy } = screenToWorld(e.clientX, e.clientY, canvas);
      touchEndM = RinkMath.pixelsToMeters(worldPx, worldPy, metrics, DEFAULT_RINK_DIMENSIONS);
    }

    if (rawStroke.length > 0 && touchEndM) {
      const clampedEndM = {
        x: Math.max(0.2, Math.min(DEFAULT_RINK_DIMENSIONS.lengthMeters - 0.2, touchEndM.mX)),
        y: Math.max(0.2, Math.min(DEFAULT_RINK_DIMENSIONS.widthMeters - 0.2, touchEndM.mY)),
      };
      // Forzar que el último punto del trazo coincida exactamente con la coordenada donde se levantó el dedo
      rawStroke[rawStroke.length - 1] = clampedEndM;
    }

    if (startNode && rawStroke.length > 0) {
      // Forzar que el primer punto coincida exactamente con el nodo de origen
      rawStroke[0] = { x: startNode.x, y: startNode.y };
    }

    let totalStrokeLength = 0;
    for (let i = 1; i < rawStroke.length; i++) {
      totalStrokeLength += Math.hypot(rawStroke[i].x - rawStroke[i - 1].x, rawStroke[i].y - rawStroke[i - 1].y);
    }

    // Si el trazo fue significativo (al menos 0.35 metros de longitud total o 2 puntos bien separados)
    if (rawStroke.length >= 2 && totalStrokeLength >= 0.35) {
      const sortedPts = [...points].sort((a, b) => a.time_ms - b.time_ms);
      let baseTime = 0;
      if (startNode) {
        baseTime = startNode.time_ms;
      } else if (sortedPts.length > 0) {
        baseTime = sortedPts[sortedPts.length - 1].time_ms + 1000;
      } else {
        baseTime = audio.currentTimeMs > 0 ? audio.currentTimeMs : 0;
      }

      // Convertir el gesto libre preservando la huella geométrica (loops, círculos, ochos) y Nodos Maestros
      const generated = FreehandPathEngine.convertStrokeToChoreographyPoints(rawStroke, baseTime);

      if (generated.length >= 2) {
        pushHistory();
        let finalPoints: ChoreographyPoint[] = [];

        if (startNode) {
          // Conectar al Nodo Maestro existente (Nodo 1 -> Curva / Loop / Spline -> Nodo 2)
          // Asigna la huella de alta fidelidad y tiradores de respaldo al nodo de inicio
          const updatedExisting: ChoreographyPoint[] = points.map((p) => {
            if (p.id === startNode.id) {
              const cp1 = generated[0].controlPoint1 || { x: generated[0].x, y: generated[0].y };
              const cp2 = generated[0].controlPoint2 || { x: generated[0].x, y: generated[0].y };
              return {
                ...p,
                cp1x: cp1.x,
                cp1y: cp1.y,
                cp2x: cp2.x,
                cp2y: cp2.y,
                controlPoint1: cp1,
                controlPoint2: cp2,
                path: generated[0].path, // Huella geométrica completa del trazo
              };
            }
            return p;
          });

          // Puntos nuevos de la extensión: exactamente UN nuevo Nodo Maestro (Nodo 2)
          const newExtensionPoints: ChoreographyPoint[] = generated.slice(1).map((pt, idx) => ({
            ...pt,
            id: `pt-freehand-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'Step',
            label: '',
            isMainNode: true,
          }));

          finalPoints = [...updatedExisting, ...newExtensionPoints].sort((a, b) => a.time_ms - b.time_ms);
        } else {
          // Trazo nuevo independiente: exactamente dos Nodos Maestros (Nodo A inicio y Nodo B fin)
          const stamped: ChoreographyPoint[] = generated.map((pt, idx) => ({
            ...pt,
            id: `pt-freehand-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'Step',
            label: '',
            isMainNode: true,
          }));

          finalPoints = [...points, ...stamped].sort((a, b) => a.time_ms - b.time_ms);
        }

        setPoints(finalPoints);
        const lastCreated = finalPoints[finalPoints.length - 1];
        if (lastCreated) {
          setSelectedPointId(lastCreated.id);
        }
        if (finalPoints.length >= 2) {
          setPhase('curve');
        }
        audio.setNodes(finalPoints);
        if (currentProgram && onProgramUpdated) {
          onProgramUpdated({
            ...currentProgram,
            choreography_path: finalPoints,
          });
        }
      }

      setIsDragging(false);
      onDragChange?.(false);
      renderFrame();
      return;
    }

    // 3. CASO TOQUE RÁPIDO (TAP < 8px):
    if (movedDistance < 8) {
      if (startNode) {
        // Tap rápido en nodo existente: Seleccionar nodo
        // (El menú de propiedades solo se abre con Long Press ~600ms)
        setSelectedPointId(startNode.id);
      } else if (currentTarget && (currentTarget.type === 'curve' || currentTarget.type === 'grip')) {
        setSelectedPointId(currentTarget.targetId);
      } else if (canvas) {
        // Clic en fondo vacío

        // Comprobar doble tap para dividir segmento
        const now = Date.now();
        const isDoubleTap =
          lastTapRef.current &&
          now - lastTapRef.current.time < 350 &&
          Math.hypot(e.clientX - lastTapRef.current.x, e.clientY - lastTapRef.current.y) < 25;

        if (isDoubleTap) {
          const handled = handleCanvasDoubleClick(e.clientX, e.clientY);
          if (handled) {
            lastTapRef.current = null;
            setIsDragging(false);
            dragTargetRef.current = null;
            pointerDownPosRef.current = null;
            return;
          }
        }
        lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };

        // Tap en vacío coloca un "Nodo Aislado"
        const metrics = getMetrics();
        const { x: worldPx, y: worldPy } = screenToWorld(e.clientX, e.clientY, canvas);
        const { mX, mY } = RinkMath.pixelsToMeters(worldPx, worldPy, metrics, DEFAULT_RINK_DIMENSIONS);
        if (mX >= 0.5 && mX <= 49.5 && mY >= 0.5 && mY <= 24.5) {
          if (phase === 'plot' || points.length === 0) {
            const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);
            const lastTime = sorted.length > 0 ? sorted[sorted.length - 1].time_ms : 0;
            const newTime = audio.currentTimeMs > 0 ? audio.currentTimeMs : (sorted.length === 0 ? 0 : lastTime + 3000);
            const newPt = addPointAtCanvas(mX, mY, newTime);
            setSelectedPointId(newPt.id);
            renderFrame();
          } else {
            // En modo trazado con nodos existentes, tap en vacío deselecciona
            setSelectedPointId(null);
          }
        }
      }
    }

    setIsDragging(false);
    dragTargetRef.current = null;
    pointerDownPosRef.current = null;
    curveDragStartPosRef.current = null;
    curveInitialCpsRef.current = null;
    setCursorStyle('crosshair');
    onDragChange?.(false);
    renderFrame();
  };

  // ── INSERCIÓN POR DOBLE CLIC: Coloca nuevos nodos en la pista o divide líneas existentes ──
  const handleCanvasDoubleClick = (clientX: number, clientY: number): boolean => {
    const canvas = canvasRef.current;
    if (!canvas || phase === 'erase') return false;

    const metrics = getMetrics();
    const { x: worldPx, y: worldPy } = screenToWorld(clientX, clientY, canvas);
    const { mX, mY } = RinkMath.pixelsToMeters(worldPx, worldPy, metrics, DEFAULT_RINK_DIMENSIONS);

    // 1. Si la ruta está conectada y hay 2+ nodos, verificar si hizo doble clic sobre una línea (tolerancia 15px)
    if (points.length >= 2 && phase !== 'plot') {
      const nearest = RinkMath.findNearestPointOnPath(points, mX, mY);
      if (nearest) {
        const distPxOnScreen = nearest.distanceMeters * metrics.scale * (camera.zoom || 1);
        if (distPxOnScreen <= 15) {
          const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);
          const p0 = sorted[nearest.segmentIndex];
          const p1 = sorted[nearest.segmentIndex + 1];
          if (p0 && p1) {
            const split = RinkMath.splitBezierSegmentAtT(p0, p1, nearest.t);
            const newTimeMs = nearest.time_ms > p0.time_ms && nearest.time_ms < p1.time_ms
              ? nearest.time_ms
              : Math.round(p0.time_ms + (p1.time_ms - p0.time_ms) * nearest.t);

            const newPointId = crypto.randomUUID();
            const newPoint: ChoreographyPoint = {
              id: newPointId,
              x: split.midPoint.x,
              y: split.midPoint.y,
              time_ms: newTimeMs,
              timestamp: newTimeMs,
              type: 'Step',
              label: '',
              cp1x: split.rightCp1.x,
              cp1y: split.rightCp1.y,
              cp2x: split.rightCp2.x,
              cp2y: split.rightCp2.y,
              controlPoint1: { x: split.rightCp1.x, y: split.rightCp1.y },
              controlPoint2: { x: split.rightCp2.x, y: split.rightCp2.y },
            };

            pushHistory();

            const updatedPoints = points.map((p) => {
              if (p.id === p0.id) {
                return {
                  ...p,
                  cp1x: split.leftCp1.x,
                  cp1y: split.leftCp1.y,
                  cp2x: split.leftCp2.x,
                  cp2y: split.leftCp2.y,
                  controlPoint1: { x: split.leftCp1.x, y: split.leftCp1.y },
                  controlPoint2: { x: split.leftCp2.x, y: split.leftCp2.y },
                };
              }
              return p;
            });

            updatedPoints.push(newPoint);
            updatedPoints.sort((a, b) => a.time_ms - b.time_ms);

            setPoints(updatedPoints);
            setSelectedPointId(newPointId);
            onNodeSelect?.(newPointId);

            audio.setNodes(updatedPoints);
            if (currentProgram) {
              onProgramUpdated({
                ...currentProgram,
                choreography_path: updatedPoints,
              });
            }

            renderFrame();
            return true;
          }
        }
      }
    }

    // 2. Colocar Nuevo Nodo con DOBLE CLIC en cualquier zona de la pista
    if (mX >= 0.5 && mX <= 49.5 && mY >= 0.5 && mY <= 24.5) {
      const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);
      const lastTime = sorted.length > 0 ? sorted[sorted.length - 1].time_ms : 0;
      const newTime = audio.currentTimeMs > 0 ? audio.currentTimeMs : lastTime + 10000;
      const newPt = addPointAtCanvas(mX, mY, newTime);
      setSelectedPointId(newPt.id);
      onNodeSelect?.(newPt.id);
      renderFrame();
      return true;
    }

    return false;
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    handleCanvasDoubleClick(e.clientX, e.clientY);
  };

  // Eliminar punto seleccionado (Sincronizado: Canvas y Waveform)
  const handleDeleteSelected = () => {
    if (!selectedPointId) return;
    deletePoint(selectedPointId);
    if (useChoreographyStore.getState().points.length < 2) {
      setPhase('plot');
    }
  };

  // Actualizar figura/etiqueta de un punto
  const handleUpdatePointLabel = (id: string, label: string) => {
    updatePointMetadata(id, label);
  };

  // Actualizar tiempo de un punto
  const handleUpdatePointTime = (id: string, time_ms: number) => {
    pushHistory();
    const updated = points.map(p => p.id === id ? { ...p, time_ms, timestamp: time_ms } : p).sort((a, b) => a.timestamp - b.timestamp);
    setPoints(updated);
  };

  // Limpiar pista por completo
  const handleClearAllPoints = () => {
    if (window.confirm('¿Deseas limpiar todos los puntos de la pista para trazar una nueva coreografía desde cero?')) {
      clearAllPoints();
    }
  };

  // Restablecer la coreografía demo y cargar la pista de prueba (con confirmación de seguridad)
  const handleResetDemoPath = async () => {
    if (points.length > 0 && !window.confirm('¿Deseas reemplazar los nodos actuales de la pista por la coreografía demo?')) {
      return;
    }
    pushHistory();
    loadProgramPoints(DEFAULT_CHOREOGRAPHY_POINTS);
    try {
      await audio.loadDemoTrack();
    } catch (e) {
      console.warn('Error al cargar pista demo:', e);
    }
  };

  // Atajos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }

      // Deshacer (Ctrl+Z)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Borrar punto (Delete / Backspace)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedPointId) {
          e.preventDefault();
          handleDeleteSelected();
        }
        return;
      }

      // Flechas para saltar entre puntos
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleJumpToPrevPoint();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleJumpToNextPoint();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleDeleteSelected, handleJumpToPrevPoint, handleJumpToNextPoint, selectedPointId]);

  // Pantalla Completa
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const selectedPoint = points.find(p => p.id === selectedPointId);
  const selectedPointIndex = selectedPoint ? points.findIndex(p => p.id === selectedPoint.id) : -1;

  // ── IDE mode: bare canvas filling parent container ──────────
  if (layoutMode === 'ide') {
    return (
      <div
        ref={containerRef}
        className="relative w-full h-full flex items-center justify-center bg-zinc-950 overflow-hidden"
      >
        {/* Pre-roll countdown overlay — always shown regardless of layout mode */}
        {audio.isPreRollActive && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-zinc-950/95 border-2 border-teal-400 px-6 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md animate-bounce pointer-events-none">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">¡En Posición!</span>
            <span className="text-3xl font-black font-mono text-teal-400">
              {audio.preRollCountdown > 0 ? audio.preRollCountdown : '¡YA!'}
            </span>
          </div>
        )}

        {/* Mode Toggles: Colocar Nodos / Trazar Líneas / Borrador */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center bg-zinc-950/90 backdrop-blur-md p-1 rounded-2xl border border-white/10 shadow-2xl gap-1 select-none">
          <button
            type="button"
            onClick={() => {
              setPhase('plot');
              setSelectedPointId(null);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
              phase === 'plot'
                ? 'bg-amber-500 text-black shadow-glow-amber font-black'
                : 'text-slate-300 hover:text-white hover:bg-zinc-800'
            }`}
            title="Modo Nodos: Un clic en el lienzo vacío coloca nodos. Las líneas están ocultas."
          >
            <PenTool className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Colocar Nodos</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (phase === 'curve') {
                setPhase('plot');
              } else {
                setPhase('curve');
              }
              setSelectedPointId(null);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
              phase === 'curve'
                ? 'bg-cyan text-black shadow-glow-cyan font-black'
                : 'text-slate-300 hover:text-white hover:bg-zinc-800'
            }`}
            title="Modo Trazado: Muestra las líneas conectadas y puntos para esculpir la ruta."
          >
            <Route className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Trazar Líneas</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (phase === 'erase') {
                setPhase('plot');
              } else {
                setPhase('erase');
              }
              setSelectedPointId(null);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
              phase === 'erase'
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/40 font-black'
                : 'text-slate-300 hover:text-red-400 hover:bg-zinc-800'
            }`}
            title="Modo Borrador: Toca cualquier nodo en la pista para eliminarlo instantáneamente."
          >
            <Eraser className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Borrador</span>
          </button>
        </div>

        {/* Floating Camera & Trail Control HUD */}
        <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md border border-white/10 px-2 py-1.5 rounded-xl shadow-soft-elevation select-none">


          <button
            type="button"
            onClick={() => zoomOut(canvasRef.current)}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 active:scale-95 text-base font-bold transition-all border border-white/5"
            title="Alejar (Zoom Out)"
          >
            −
          </button>
          <button
            type="button"
            onClick={resetCamera}
            className="px-2 h-7 flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan active:scale-95 text-[11px] font-mono font-bold transition-all border border-white/5"
            title="Restablecer Vista (100% y centrar)"
          >
            {Math.round(camera.zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => zoomIn(canvasRef.current)}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 active:scale-95 text-base font-bold transition-all border border-white/5"
            title="Acercar (Zoom In)"
          >
            +
          </button>
        </div>

        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            width: `${containerSize.width}px`,
            height: `${containerSize.height}px`,
            cursor: cursorStyle,
            touchAction: 'none'
          }}
          className="block touch-none select-none"
        />
      </div>
    );
  }

  // ── Standalone mode: original full-featured layout ───────────
  return (
    <div ref={containerRef} className={`space-y-3.5 ${isFullscreen ? 'bg-zinc-950 p-6 overflow-y-auto' : ''}`}>

      {/* 0. BARRA SUPERIOR GLOBAL: MINIMALISTA Y ELEGANTE */}
      <div className="flex flex-wrap items-center justify-between px-1 gap-2 bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3 shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-teal-400 shadow-sm shadow-teal-400/80" />
          <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wide text-white flex items-center gap-2">
            <span>Editor Coreográfico de Pista 2D</span>
            <span className="text-zinc-600 font-normal">|</span>
            <span className="text-xs font-semibold text-zinc-400 normal-case tracking-normal">
              Reglamentaria 50m × 25m
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Selector de Avatar: Patinadora ♀ (Por defecto) / Patinador ♂ */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5 text-xs font-bold shadow-inner">
            <button
              type="button"
              aria-pressed={skaterGender === 'female'}
              onClick={() => setSkaterGender('female')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 active:scale-[0.96] ${
                skaterGender === 'female'
                  ? 'bg-teal-400 text-zinc-950 font-black shadow-md shadow-teal-400/25 border border-teal-300'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
              title="Avatar de Patinadora Femenina (♀)"
            >
              <span>♀</span>
              <span className="hidden sm:inline text-[11px]">Patinadora</span>
            </button>
            <button
              type="button"
              aria-pressed={skaterGender === 'male'}
              onClick={() => setSkaterGender('male')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 active:scale-[0.96] ${
                skaterGender === 'male'
                  ? 'bg-teal-400 text-zinc-950 font-black shadow-md shadow-teal-400/25 border border-teal-300'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
              title="Avatar de Patinador Masculino (♂)"
            >
              <span>♂</span>
              <span className="hidden sm:inline text-[11px]">Patinador</span>
            </button>
          </div>

          <div className="h-4 w-[1px] bg-zinc-800 mx-0.5" />

          {/* Tiradores Bézier */}
          <button
            type="button"
            aria-pressed={showControlHandles}
            onClick={() => setShowControlHandles(!showControlHandles)}
            className={`p-2 rounded-xl border text-xs font-bold transition-all active:scale-[0.96] ${
              showControlHandles
                ? 'bg-teal-400 text-zinc-950 border-teal-300 shadow-md shadow-teal-400/25 font-black'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
            title="Alternar visibilidad de tiradores Bézier"
          >
            <Layers className="w-4 h-4" />
          </button>

          {/* Marcas de Pista */}
          <button
            type="button"
            aria-pressed={showRinkGrid}
            onClick={() => setShowRinkGrid(!showRinkGrid)}
            className={`p-2 rounded-xl border text-xs font-medium transition-all active:scale-[0.96] ${
              showRinkGrid
                ? 'bg-teal-400 text-zinc-950 border-teal-300 shadow-md shadow-teal-400/25 font-black'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
            title="Alternar marcas reglamentarias de pista"
          >
            <Eye className="w-4 h-4" />
          </button>

          {/* Pantalla Completa */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className={`p-2 rounded-xl border transition-all active:scale-[0.96] ${
              isFullscreen
                ? 'bg-teal-400 text-zinc-950 border-teal-300 shadow-md'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border-zinc-800'
            }`}
            title="Pantalla Completa"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Toggle HUD Mezclador */}
          <button
            type="button"
            aria-pressed={showHud}
            onClick={() => setShowHud(!showHud)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all active:scale-[0.96] ${
              showHud
                ? 'bg-teal-400 text-zinc-950 border-teal-300 shadow-md shadow-teal-400/25 font-black'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
            }`}
            title="Mostrar / Ocultar HUD de Mezcla superpuesto en el lienzo"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">HUD Mezclador</span>
          </button>
        </div>
      </div>

      {/* 1. LIENZO 2D: EL PROTAGONISTA INDISCUTIBLE */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-2 sm:p-3 shadow-2xl overflow-hidden flex flex-col items-center relative">
        <div className="relative w-full max-w-5xl flex flex-col items-center">
          {audio.isPreRollActive && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-zinc-950/95 border-2 border-teal-400 px-6 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md animate-bounce">
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">¡En Posición!</span>
              <span className="text-3xl font-black font-mono text-teal-400">
                {audio.preRollCountdown > 0 ? audio.preRollCountdown : '¡YA!'}
              </span>
            </div>
          )}

          {/* HUD SUPERPUESTO EN LIENZO 2D (GLASSMORPHISM TRANSLÚCIDO) */}
          {showHud ? (
            <div className="absolute top-3 right-3 z-20 w-72 sm:w-80 backdrop-blur-xl bg-zinc-950/85 border border-zinc-800/90 rounded-2xl p-3.5 shadow-2xl text-zinc-100 text-xs select-none animate-in fade-in zoom-in-95 duration-150">
              {/* Encabezado del HUD */}
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400" />
                  <span className="font-extrabold uppercase tracking-wider text-[11px] text-white">
                    HUD Mezcla & Audio
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHud(false)}
                  className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-all active:scale-[0.96]"
                  title="Ocultar HUD del lienzo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Sección 1: Ruteo de Canales */}
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Headphones className="w-3 h-3 text-teal-400" />
                    Canales de Salida
                  </span>
                  <span className="text-zinc-300 font-mono text-[9px]">
                    {audio.channelMode === 'split-coach' ? 'Split L/R' : 'Estéreo'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    aria-pressed={audio.channelMode === 'stereo'}
                    onClick={() => audio.setChannelMode('stereo')}
                    className={`py-1.5 px-2 rounded-xl text-center text-xs font-bold transition-all border active:scale-[0.96] ${
                      audio.channelMode === 'stereo'
                        ? 'bg-teal-400 text-zinc-950 font-black border-teal-300 shadow-md shadow-teal-400/25'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    🔊 Estéreo
                  </button>
                  <button
                    type="button"
                    aria-pressed={audio.channelMode === 'split-coach'}
                    onClick={() => audio.setChannelMode('split-coach')}
                    className={`py-1.5 px-2 rounded-xl text-center text-xs font-bold transition-all border active:scale-[0.96] ${
                      audio.channelMode === 'split-coach'
                        ? 'bg-teal-400 text-zinc-950 font-black border-teal-300 shadow-md shadow-teal-400/25'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    🎧 Split L/R
                  </button>
                </div>
                <p className="text-[10px] text-zinc-400 font-medium">
                  {audio.channelMode === 'split-coach'
                    ? 'L: Música · R: Metrónomo y Voz Guía'
                    : 'L+R: Mezcla estéreo balanceada en ambos oídos'}
                </p>
              </div>

              {/* Sección 2: Sliders Independientes de Volumen */}
              <div className="space-y-2.5 border-t border-zinc-800/80 pt-2.5 mb-1">
                {/* 1. Música */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                      <Music className="w-3 h-3 text-teal-400" />
                      Pista Musical
                    </span>
                    <span className="font-mono text-teal-300 font-bold">
                      {Math.round(audio.musicVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={audio.musicVolume}
                    onChange={(e) => audio.setMusicVolume(parseFloat(e.target.value))}
                    className="w-full accent-teal-400 h-1.5 bg-zinc-900 border border-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* 2. Metrónomo */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-teal-400" />
                      <span className="text-zinc-300 font-semibold">Metrónomo</span>
                      <button
                        type="button"
                        aria-pressed={audio.metronome.enabled}
                        onClick={() => audio.metronome.toggle()}
                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold transition-all border active:scale-[0.96] ${
                          audio.metronome.enabled
                            ? 'bg-teal-400 text-zinc-950 border-teal-300 shadow-sm'
                            : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                        }`}
                      >
                        {audio.metronome.enabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <span className="font-mono text-teal-300 font-bold">
                      {Math.round(audio.metronome.volume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={audio.metronome.volume}
                    onChange={(e) => audio.metronome.setVolume(parseFloat(e.target.value))}
                    className="w-full accent-teal-400 h-1.5 bg-zinc-900 border border-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* 3. Voz Guía (Coach) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                      <Mic className="w-3 h-3 text-teal-400" />
                      Voz Guía
                    </span>
                    <span className="font-mono text-teal-300 font-bold">
                      {Math.round(audio.coachVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={audio.coachVolume}
                    onChange={(e) => audio.setCoachVolume(parseFloat(e.target.value))}
                    className="w-full accent-teal-400 h-1.5 bg-zinc-900 border border-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowHud(true)}
              className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-bold shadow-lg transition-all active:scale-[0.96]"
              title="Mostrar HUD de Mezcla y Audio"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400" />
              <span>HUD Mezcla</span>
            </button>
          )}

          {/* Floating Camera Control HUD (Pinch / Pan Indicator & Zoom Buttons) */}
          <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1 bg-slate-950/85 backdrop-blur-md border border-white/10 px-2 py-1.5 rounded-xl shadow-soft-elevation select-none">
            <button
              type="button"
              onClick={() => zoomOut(canvasRef.current)}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 active:scale-95 text-base font-bold transition-all border border-white/5"
              title="Alejar (Zoom Out)"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetCamera}
              className="px-2 h-7 flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan active:scale-95 text-[11px] font-mono font-bold transition-all border border-white/5"
              title="Restablecer Vista (100% y centrar)"
            >
              {Math.round(camera.zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => zoomIn(canvasRef.current)}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 active:scale-95 text-base font-bold transition-all border border-white/5"
              title="Acercar (Zoom In)"
            >
              +
            </button>
          </div>

          {/* Mode Toggles: Colocar Nodos / Trazar Líneas / Borrador */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center bg-zinc-950/90 backdrop-blur-md p-1 rounded-2xl border border-white/10 shadow-2xl gap-1 select-none">
            <button
              type="button"
              onClick={() => {
                setPhase('plot');
                setSelectedPointId(null);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                phase === 'plot'
                  ? 'bg-amber-500 text-black shadow-glow-amber font-black'
                  : 'text-slate-300 hover:text-white hover:bg-zinc-800'
              }`}
              title="Modo Nodos: Un clic en el lienzo vacío coloca nodos. Las líneas están ocultas."
            >
              <PenTool className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Colocar Nodos</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (phase === 'curve') {
                  setPhase('plot');
                } else {
                  setPhase('curve');
                }
                setSelectedPointId(null);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                phase === 'curve'
                  ? 'bg-cyan text-black shadow-glow-cyan font-black'
                  : 'text-slate-300 hover:text-white hover:bg-zinc-800'
              }`}
              title="Modo Trazado: Muestra las líneas conectadas y puntos para esculpir la ruta."
            >
              <Route className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Trazar Líneas</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (phase === 'erase') {
                  setPhase('plot');
                } else {
                  setPhase('erase');
                }
                setSelectedPointId(null);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                phase === 'erase'
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/40 font-black'
                  : 'text-slate-300 hover:text-red-400 hover:bg-zinc-800'
              }`}
              title="Modo Borrador: Toca cualquier nodo en la pista para eliminarlo instantáneamente."
            >
              <Eraser className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Borrador</span>
            </button>
          </div>

          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            style={{
              width: `${containerSize.width}px`,
              height: `${containerSize.height}px`,
              cursor: cursorStyle,
              touchAction: 'none'
            }}
            className="w-full max-w-5xl h-auto block rounded-xl touch-none select-none shadow-2xl"
          />
        </div>
      </div>

      {/* 2. BARRA INFERIOR / DOCK FLOTANTE DE TRANSPORTE */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-2.5 sm:p-3 shadow-xl flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Botón Simular (Play) */}
          <button
            type="button"
            onClick={() => audio.play()}
            disabled={audio.isAudioActive}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.96] border ${
              audio.isPreRollActive
                ? 'bg-teal-400 text-zinc-950 border-teal-300 ring-2 ring-teal-300 animate-pulse font-black'
                : audio.isAudioActive
                ? 'bg-teal-400 text-zinc-950 border-teal-300 shadow-md font-black'
                : 'bg-zinc-900 hover:bg-teal-400 hover:text-zinc-950 hover:border-teal-300 text-zinc-100 font-bold border-zinc-800'
            }`}
            title="Iniciar simulación de la coreografía con la música"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>
              {audio.isPreRollActive
                ? (audio.preRollCountdown > 0 ? `${audio.preRollCountdown}s...` : '¡YA!')
                : 'Simular'}
            </span>
          </button>

          {/* Botón Pausa Dedicado */}
          <button
            type="button"
            onClick={() => audio.pause()}
            disabled={!audio.isAudioActive}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs border transition-all active:scale-[0.96] ${
              audio.isAudioActive
                ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-700 font-bold shadow-sm'
                : 'bg-zinc-900/40 text-zinc-600 border-zinc-800/40 opacity-40 cursor-not-allowed'
            }`}
            title="Pausar la reproducción en el segundo actual"
          >
            <Pause className="w-4 h-4 fill-current" />
            <span>Pausa</span>
          </button>

          {/* Botón Regresar al Inicio (00:00) */}
          <button
            type="button"
            onClick={() => {
              audio.pause();
              audio.seek(0);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 font-bold text-xs transition-all active:scale-[0.96] shadow-sm"
            title="Regresar la pista al inicio (00:00) sin borrar los nodos puestos"
          >
            <RotateCcw className="w-4 h-4 text-zinc-400" />
            <span>Inicio</span>
          </button>

          {/* Botón Explícito: Deshacer último cambio */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 text-zinc-200 border border-zinc-800 font-bold text-xs transition-all active:scale-[0.96] shadow-sm"
            title="Deshacer último cambio (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4 text-teal-400" />
            <span>Deshacer último cambio</span>
          </button>

          <div className="h-4 w-[1px] bg-zinc-800 mx-0.5" />

          {/* Navegación temporal entre puntos */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5">
            <button
              type="button"
              onClick={handleJumpToPrevPoint}
              disabled={points.length === 0}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 disabled:opacity-30 transition-all active:scale-[0.96]"
              title="Punto anterior (←)"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleJumpToNextPoint}
              disabled={points.length === 0}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 disabled:opacity-30 transition-all active:scale-[0.96]"
              title="Punto siguiente (→)"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Limpiar todos los puntos */}
          <button
            type="button"
            onClick={handleClearAllPoints}
            disabled={points.length === 0}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-red-500 hover:text-white disabled:opacity-30 text-zinc-400 border border-zinc-800 transition-all active:scale-[0.96]"
            title="Limpiar todos los puntos de la pista"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Cargar Demo */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDemoPath}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 font-bold text-xs transition-all active:scale-[0.96] shadow-sm"
            title="Cargar coreografía de prueba y pista demo oficial"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden sm:inline">Cargar Demo</span>
          </button>
        </div>
      </div>

      {/* 3. INTERFAZ AUDIO-FIRST: ONDA MUSICAL INTERACTIVA Y GENERADOR DE NODOS */}
      <InteractiveWaveform
        currentTimeMs={audio.currentTimeMs}
        durationMs={audio.durationMs}
        isPlaying={audio.isAudioActive}
        onSeek={audio.seek}
        fileName={audio.fileName}
      />

      {/* 4. TELEMETRÍA EN VIVO */}
      <div className="w-full flex flex-wrap items-center justify-between text-[11px] font-mono border-t border-zinc-800/80 pt-2 px-1 gap-2 text-zinc-400">
        <div className="flex items-center gap-3">
          <span>Pista Oficial: <strong className="text-zinc-200 font-bold">50m × 25m</strong></span>
          <span>Nodos: <strong className="text-teal-400 font-bold">{points.length}</strong></span>
          <span>
            Avatar:{' '}
            <strong className="text-zinc-200 font-bold">
              {skaterGender === 'female' ? "♀ Patinadora" : "♂ Patinador"}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-4">
          {skaterState && (
            <span className="flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-teal-400" />
              Velocidad: <strong className="text-zinc-200 font-bold">{skaterState.speedMps} m/s</strong>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-teal-400" />
            Tiempo Audio: <strong className="text-teal-300 font-bold">{formatTime(audio.currentTimeMs)}</strong>
          </span>
          {selectedPoint && (
            <span className="text-zinc-300 font-semibold flex items-center gap-1">
              <Move className="w-3 h-3 text-teal-400" />
              Nodo #{selectedPointIndex + 1}: X={selectedPoint.x.toFixed(1)}m, Y={selectedPoint.y.toFixed(1)}m
            </span>
          )}
        </div>
      </div>

      {/* 5. BARRA DE INSPECCIÓN DESACOPLADA (FUERA DEL CANVAS)
          Se muestra únicamente cuando hay un nodo seleccionado Y el usuario NO está arrastrando (isDragging === false) */}
      {selectedPoint && !isDragging && (
        <div className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3 mb-3">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-zinc-900 text-teal-400 flex items-center justify-center text-xs font-bold font-mono border border-zinc-800 shadow-inner">
                #{selectedPointIndex + 1}
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wide flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-400" />
                  <span>{selectedPoint.label ? selectedPoint.label : 'Configuración de Elemento Técnico'}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-300 border border-zinc-800">
                    X: {selectedPoint.x.toFixed(1)}m · Y: {selectedPoint.y.toFixed(1)}m
                  </span>
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Ajusta la figura técnica o arrastra los tiradores dorados (salida) y cianes (llegada) en la pista.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleStraightenSegment}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-bold transition-all active:scale-[0.96]"
                title="Enderezar tramo Bézier"
              >
                <MinusCircle className="w-3.5 h-3.5 text-teal-400" />
                <span>Enderezar Curva</span>
              </button>

              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-600 hover:text-white border border-red-800 text-red-300 text-xs font-bold transition-all active:scale-[0.96]"
                title="Eliminar este punto (Supr)"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>Eliminar Punto</span>
              </button>

              <button
                onClick={() => setSelectedPointId(null)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-all active:scale-[0.96] ml-1"
                title="Cerrar inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Formulario desacoplado en columnas limpias */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            {/* Columna 1: Selector Figura Estándar */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <Tag className="w-3 h-3 text-teal-400" />
                Figura Técnica:
              </label>
              <select
                value={STANDARD_FIGURES.includes(selectedPoint.label || '') ? selectedPoint.label : (selectedPoint.label ? 'custom' : '')}
                onChange={(e) => {
                  const val = e.target.value === 'custom' ? (selectedPoint.label || '') : e.target.value;
                  handleUpdatePointLabel(selectedPoint.id, val);
                }}
                className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2 text-xs focus:border-teal-400 outline-none font-medium cursor-pointer"
              >
                <option value="">-- Seleccionar Figura Estándar --</option>
                {STANDARD_FIGURES.map(fig => (
                  <option key={fig} value={fig}>{fig}</option>
                ))}
                <option value="custom">Otro / Personalizado...</option>
              </select>
            </div>

            {/* Columna 2: Nombre personalizado / descripción */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                Nombre / Guía de Voz:
              </label>
              <input
                type="text"
                placeholder="Ej: Salchow, Secuencia Pasos, etc."
                value={selectedPoint.label || ''}
                onChange={(e) => handleUpdatePointLabel(selectedPoint.id, e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-teal-400 outline-none font-mono"
              />
            </div>

            {/* Columna 3: Tiempo en Audio y Sincronización */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-teal-400" />
                  Momento en Audio:
                </span>
                <span className="font-mono text-teal-300 font-bold">
                  {formatTime(selectedPoint.time_ms)}
                </span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={Math.round(selectedPoint.time_ms / 100) / 10}
                  onChange={(e) => {
                    const sec = parseFloat(e.target.value) || 0;
                    handleUpdatePointTime(selectedPoint.id, Math.round(sec * 1000));
                  }}
                  className="w-24 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-center font-mono text-teal-300 font-bold text-xs outline-none focus:border-teal-400"
                />
                <span className="font-mono text-zinc-400 text-xs">segundos</span>

                <button
                  onClick={() => audio.seek(selectedPoint.time_ms)}
                  className="px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-bold transition-all active:scale-[0.96]"
                  title="Mover reproducción a este punto"
                >
                  Escuchar
                </button>
              </div>
            </div>
          </div>

          {/* Banner de Alerta Anticipada Sincronizada (Nombre de figura primero + cuenta atrás) */}
          {selectedPoint.label && isSpeakableFigure(selectedPoint.label, selectedPoint.type) && (
            <div className="mt-3 bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-zinc-200">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-teal-400 flex-shrink-0" />
                <div>
                  <span className="font-extrabold text-teal-400 uppercase tracking-wide text-[11px] block">
                    Secuencia Vocal Sincronizada:
                  </span>
                  <p className="text-xs text-white font-semibold mt-0.5">
                    "{selectedPoint.label}, en tres, dos, uno, ¡ya!"
                  </p>
                  <span className="text-[10px] text-zinc-400">
                    (Aviso previo: {Math.max(0, (selectedPoint.time_ms - 4200) / 1000).toFixed(1)}s → Conteo: {Math.max(0, (selectedPoint.time_ms - 3000) / 1000).toFixed(1)}s → Salto/Ejecución: {(selectedPoint.time_ms / 1000).toFixed(1)}s)
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-teal-300 bg-zinc-800 px-2.5 py-1 rounded-lg font-bold border border-zinc-700 shrink-0">
                {audio.channelMode === 'split-coach' ? 'Canal R (Coach)' : 'Canales L + R'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
