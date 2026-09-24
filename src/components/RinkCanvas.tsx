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
  Eraser,
  Plus,
  Minus
} from 'lucide-react';

import { ChoreographyPathPoint, ChoreographyPoint, Program, ElementLog, isMainNode } from '../types';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { audioEngine } from '../core/audio/AudioEngine';
import { RinkMath, DEFAULT_RINK_DIMENSIONS, CanvasViewportMetrics } from '../core/canvas/RinkMath';
import { RinkRenderer } from '../core/canvas/RinkRenderer';
import { useChoreographyStore } from '../store/useChoreographyStore';
import { collectNodeFigures } from '../core/audio/VoiceCueEngine';
import { InteractiveWaveform } from './InteractiveWaveform';
import { useCanvasCamera } from '../hooks/useCanvasCamera';
import type { CameraBounds } from '../core/canvas/cameraBounds';
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

/**
 * Límites de WebKit iOS para el backing store de un <canvas>.
 *
 * Safari descarta SILENCIOSAMENTE un canvas cuyo lado o área exceda sus límites
 * de memoria: el elemento queda en blanco/negro sin lanzar ningún error. En un
 * iPad a DPR 2 con una vista grande se puede superar el umbral de área.
 */
const MAX_CANVAS_SIDE = 8192;
const MAX_CANVAS_AREA = 16_777_216; // 4096 × 4096 — umbral conservador y seguro

/**
 * Calcula el tamaño físico del backing store respetando los límites de iOS.
 *
 * Si la densidad de pantalla se pasa del límite, se reduce el DPR EFECTIVO
 * (nunca por debajo de 1) para que el dibujo siga siendo correcto y nítido pero
 * siempre dentro del rango soportado. Devuelve también la escala real aplicada,
 * que debe usarse en `ctx.scale()` en lugar de asumir que es igual a `dpr`.
 */
function computeBackingStore(cssW: number, cssH: number, dpr: number) {
  const safeW = Number.isFinite(cssW) && cssW > 0 ? cssW : 1000;
  const safeH = Number.isFinite(cssH) && cssH > 0 ? cssH : 540;
  const baseDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;

  let scale = baseDpr;
  if (safeW * scale > MAX_CANVAS_SIDE) scale = MAX_CANVAS_SIDE / safeW;
  if (safeH * scale > MAX_CANVAS_SIDE) scale = Math.min(scale, MAX_CANVAS_SIDE / safeH);
  if (safeW * safeH * scale * scale > MAX_CANVAS_AREA) {
    scale = Math.sqrt(MAX_CANVAS_AREA / (safeW * safeH));
  }
  scale = Math.max(1, scale);

  const physicalW = Math.max(1, Math.round(safeW * scale));
  const physicalH = Math.max(1, Math.round(safeH * scale));

  return {
    physicalW,
    physicalH,
    scaleX: physicalW / safeW,
    scaleY: physicalH / safeH,
  };
}


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

  /**
   * Tamaño CSS real medido del lienzo, actualizado en cada `renderFrame`.
   * Es la fuente de verdad del hit-testing: sobrevive a los cambios de la barra
   * dinámica de Safari (que no siempre disparan `resize` a tiempo en iOS).
   */
  const measuredSizeRef = useRef<{ width: number; height: number }>({ width: 1000, height: 540 });

  // Motor Headless de Audio (Web Audio API limpia y desacoplada)
  const audio = useAudioEngine();

  // Cámara Virtual Interactiva (Pan, Pinch-to-Zoom y Transformación Screen-to-World)
  const cameraBoundsRef = useRef<CameraBounds | null>(null);
  const getCameraBounds = useCallback(() => cameraBoundsRef.current, []);
  const cameraEngine = useCanvasCamera(undefined, { getBounds: getCameraBounds });
  const {
    camera,
    zoomIn,
    zoomOut,
    zoomAtPoint,
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
  //
  // iOS/Safari no siempre dispara `resize` al cambiar la barra de direcciones ni
  // al rotar, y `ResizeObserver` puede entregar 0×0 durante el primer layout.
  // Se combinan varias fuentes + una re-medición diferida en el siguiente frame
  // para que el contenedor NUNCA quede con un tamaño obsoleto (causa directa de
  // que el lienzo se dibuje fuera del área visible).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId = 0;

    const measure = () => {
      const rect = container.getBoundingClientRect();
      // Fallback en cascada: contenedor → propio lienzo → (si nada mide) nada.
      const width = rect.width > 0
        ? rect.width
        : (canvasRef.current?.getBoundingClientRect().width ?? 0);
      const height = rect.height > 0
        ? rect.height
        : (canvasRef.current?.getBoundingClientRect().height ?? 0);

      if (width > 0 && height > 0) {
        setContainerSize((prev) =>
          prev.width === Math.round(width) && prev.height === Math.round(height)
            ? prev
            : { width: Math.round(width), height: Math.round(height) }
        );
      }
    };

    const scheduleMeasure = () => {
      measure();
      // Re-medición diferida: en iOS la barra dinámica cambia DESPUÉS del evento.
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        measure();
        rafId = requestAnimationFrame(measure);
      });
    };

    scheduleMeasure();

    const ro = new ResizeObserver(measure);
    ro.observe(container);

    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('orientationchange', scheduleMeasure);
    // `visualViewport` es la fuente más fiable del alto visible en Safari iOS.
    window.visualViewport?.addEventListener('resize', scheduleMeasure);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('orientationchange', scheduleMeasure);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
    };
  }, []);

  // ── Zoom con rueda del ratón / trackpad (desktop) ──────────────────────────
  // Se registra como listener NATIVO no pasivo para poder llamar a preventDefault()
  // y evitar el scroll/zoom del navegador. El punto de interés es el cursor.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Trackpad pinch llega como wheel con ctrlKey; la rueda normal también
      // acerca/aleja. Un delta negativo = acercar.
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAtPoint(factor, e.clientX, e.clientY, canvas);
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [zoomAtPoint, layoutMode]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHud, setShowHud] = useState(true);

  // Gestor de Estado Global Unificado (Zustand)
  const points = useChoreographyStore((state) => state.points);
  const selectedPointId = useChoreographyStore((state) => state.selectedPointId);
  const skaterGender = useChoreographyStore((state) => state.skaterGender);
  const phase = useChoreographyStore((state) => state.phase);
  const showControlHandles = useChoreographyStore((state) => state.showControlHandles);
  const showRinkGrid = useChoreographyStore((state) => state.showRinkGrid);
  const showReglamentaryGuides = useChoreographyStore((state) => state.showReglamentaryGuides);
  const showCompulsoryFigures = useChoreographyStore((state) => state.showCompulsoryFigures);
  const showSkaterDuringPlayback = useChoreographyStore((state) => state.showSkaterDuringPlayback);
  const paperTraceOverlay = useChoreographyStore((state) => state.paperTraceOverlay);
  const updatePaperTraceOpacity = useChoreographyStore((state) => state.updatePaperTraceOpacity);
  const togglePaperTraceVisibility = useChoreographyStore((state) => state.togglePaperTraceVisibility);
  const clearPaperTraceOverlay = useChoreographyStore((state) => state.clearPaperTraceOverlay);
  const paperImageRef = useRef<HTMLImageElement | null>(null);
  const history = useChoreographyStore((state) => state.history);
  const unplacedNodes = useChoreographyStore((state) => state.unplacedNodes);
  const activeTrayNodeIndex = useChoreographyStore((state) => state.activeTrayNodeIndex);
  const placeTrayNode = useChoreographyStore((state) => state.placeTrayNode);

  const setPoints = useChoreographyStore((state) => state.setPoints);

  /**
   * Commit de edición: al interactuar con el lienzo se elimina el estado
   * `unlinked` de los nodos digitalizados. El escáner sube puntos sueltos y el
   * usuario, al editar/conectar, vuelve a mostrar las trayectorias.
   */
  const commitPoints = useCallback(
    (arr: ChoreographyPoint[]) => {
      const hasUnlinked = arr.some((p) => p.unlinked);
      setPoints(hasUnlinked ? arr.map((p) => (p.unlinked ? { ...p, unlinked: false } : p)) : arr);
    },
    [setPoints]
  );
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
  /**
   * Desfase entre el punto de agarre y el centro del nodo. Permite que el nodo
   * siga al dedo/cursor SIN saltar al iniciar el arrastre (movimiento directo).
   */
  const dragGrabOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  /** ¿El nodo tocado ya estaba seleccionado antes de este pointerdown? */
  const wasNodeSelectedRef = useRef(false);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const [cursorStyle, setCursorStyle] = useState<'default' | 'crosshair' | 'grab' | 'grabbing' | 'pointer'>('crosshair');

  // Motor de Trazado a Mano Alzada (Freehand Pathing) y Long Press (~600ms)
  const rawStrokeRef = useRef<Point2D[]>([]);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressActiveRef = useRef<boolean>(false);
  const strokeStartNodeRef = useRef<ChoreographyPoint | null>(null);
  /** Detección de doble toque/clic sobre un nodo para editar su número. */
  const lastNodeTapRef = useRef<{ id: string; time: number } | null>(null);

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
    // Tiempo de HARDWARE (el estado de React va con retraso respecto a la música)
    const nowMs = audioEngine.getCurrentTimeMs();
    const prev = [...sorted].reverse().find(p => p.time_ms < nowMs - 350);
    const target = prev || sorted[0];
    audio.seek(target.time_ms);
    setSelectedPointId(target.id);
  }, [points, audio, setSelectedPointId]);

  // Salto al Punto Siguiente en la pista y tiempo de audio
  const handleJumpToNextPoint = useCallback(() => {
    if (points.length === 0) return;
    const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);
    const nowMs = audioEngine.getCurrentTimeMs();
    const next = sorted.find(p => p.time_ms > nowMs + 350);
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

  // ── Persistencia DIFERIDA del programa ──────────────────────────────────
  // El estado de los nodos vive en el store (memoria). Guardarlo en IndexedDB en
  // cada frame de arrastre (60/s + re-render de App) congelaba el hilo principal
  // en móvil. Ahora solo se escribe tras un periodo de inactividad.
  const onProgramUpdatedRef = useRef(onProgramUpdated);
  onProgramUpdatedRef.current = onProgramUpdated;
  const currentProgramRef = useRef(currentProgram);
  currentProgramRef.current = currentProgram;
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Caché de la CAPA ESTÁTICA (pista reglamentaria + cuadrícula + guías) ──
  // El suelo y las guías no dependen del tiempo ni del avatar: se dibujan una vez
  // en un lienzo fuera de pantalla y se reutilizan con `drawImage` en cada frame.
  // Antes se reconstruían (decenas de paths + glows) a 60 fps durante la
  // reproducción, que era el mayor coste de GPU/CPU del lienzo.
  const staticLayerRef = useRef<HTMLCanvasElement | null>(null);
  const staticLayerKeyRef = useRef<string>('');
  // Límite de memoria: por encima de ~6 Mpx no se cachea (evita duplicar el
  // backing store en pantallas grandes o de gama baja). Funcionalidad idéntica.
  const STATIC_LAYER_MAX_PX = 6_000_000;

  // Volcado al desmontar: no se pierde ninguna edición pendiente si el usuario
  // cambia de vista justo tras mover un nodo. (Definido antes que el efecto de
  // sincronización para que su cleanup corra en primer lugar.)
  useEffect(() => () => {
    const hadPending = persistTimerRef.current !== null;
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const prog = currentProgramRef.current;
    if (hadPending && prog) {
      onProgramUpdatedRef.current({
        ...prog,
        choreography_path: useChoreographyStore.getState().points,
      });
    }
  }, []);

  // Sincronizar nodos con el motor de audio (operación barata, en memoria) y
  // programar un guardado diferido con debounce de 700 ms.
  useEffect(() => {
    audio.setNodes(points);
    if (!currentProgramRef.current) return;

    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      const prog = currentProgramRef.current;
      if (!prog) return;
      onProgramUpdatedRef.current({
        ...prog,
        choreography_path: useChoreographyStore.getState().points,
      });
    }, 700);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [points]);

  // Fase se resetea a 'plot' si se eliminan todos los puntos
  useEffect(() => {
    if (points.length === 0 && phase === 'curve') {
      setPhase('plot');
    }
  }, [points.length, phase, setPhase]);

  /**
   * Contexto de reproducción: se activa al pulsar PLAY y permanece mientras la
   * reproducción esté pausada (avatar congelado). Se desactiva al DETENER
   * (el motor reinicia el tiempo a 0) o cuando no hay audio. Así el avatar sólo
   * existe en el flujo de reproducción, nunca en la edición.
   */
  const [playbackEngaged, setPlaybackEngaged] = useState(false);
  useEffect(() => {
    if (audio.isPlaying) {
      if (!playbackEngaged) setPlaybackEngaged(true);
    } else if (audio.currentTimeMs <= 0) {
      if (playbackEngaged) setPlaybackEngaged(false);
    }
  }, [audio.isPlaying, audio.currentTimeMs, playbackEngaged]);


  // Viewport Metrics con cálculo adaptativo responsivo (Margen de seguridad para evitar colisión con controles)
  const getMetrics = useCallback((): CanvasViewportMetrics => {
    // Se usa el tamaño MEDIDO del lienzo (actualizado cada frame). Así el
    // hit-testing de los punteros coincide siempre con lo dibujado, incluso si
    // el estado `containerSize` aún no refleja el tamaño real (iOS/Safari).
    const measured = measuredSizeRef.current;
    const w = measured.width || containerSize.width || 1000;
    const h = measured.height || containerSize.height || 540;
    // Padding adaptativo a la ALTURA: en landscape móvil (poca altura) se reduce
    // para que la pista gane el máximo espacio posible.
    const padding = Math.max(8, Math.min(w < 640 ? 24 : 36, Math.round(h * 0.06)));
    return RinkMath.calculateViewportMetrics(w, h, DEFAULT_RINK_DIMENSIONS, padding);
  }, [containerSize]);

  // Estado cinemático para la telemetría del HUD (sólo lectura de velocidad en
  // el modo stand-alone). La VISIBILIDAD del avatar se decide en `renderFrame`.
  const isPathGenerated = points.length >= 2;
  const skaterState = isPathGenerated ? RinkMath.interpolateSkaterPosition(points, audio.currentTimeMs) : null;

  // Render Frame Unificado de Canvas 2D con Cámara Virtual y Retina Display (devicePixelRatio)
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ── Medición DIRECTA del lienzo (iOS-safe) ──
    // El <canvas> es `h-full w-full`, así que su caja CSS coincide SIEMPRE con
    // el contenedor. Medir el propio elemento evita depender de un estado que
    // pueda quedar obsoleto por la barra dinámica de Safari y garantiza que el
    // backing store nunca se desfase respecto al tamaño real en pantalla.
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.round(rect.width) || containerSize.width || 1000;
    const cssH = Math.round(rect.height) || containerSize.height || 540;

    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const { physicalW, physicalH, scaleX, scaleY } = computeBackingStore(cssW, cssH, dpr);

    // Redimensionar el backing store REINICIA el lienzo (lo deja en negro hasta
    // el siguiente trazo), así que solo se hace cuando el tamaño cambia de verdad.
    if (canvas.width !== physicalW || canvas.height !== physicalH) {
      canvas.width = physicalW;
      canvas.height = physicalH;
    }

    // Tamaño medido como fuente de verdad para el hit-testing (pointer handlers).
    measuredSizeRef.current = { width: cssW, height: cssH };

    // Métricas derivadas del tamaño REALMENTE medido (no del estado), para que
    // el dibujo y el hit-testing coincidan siempre.
    const metrics = RinkMath.calculateViewportMetrics(
      cssW,
      cssH,
      DEFAULT_RINK_DIMENSIONS,
      Math.max(8, Math.min(cssW < 640 ? 24 : 36, Math.round(cssH * 0.06)))
    );

    // Geometría estática para acotar pan/zoom (evita perder la pista).
    cameraBoundsRef.current = {
      rectW: cssW,
      rectH: cssH,
      offsetX: metrics.offsetX,
      offsetY: metrics.offsetY,
      renderedW: metrics.renderedW,
      renderedH: metrics.renderedH,
    };
    const currentPoints = useChoreographyStore.getState().points;
    const currentSelectedId = useChoreographyStore.getState().selectedPointId;
    const currentShowHandles = useChoreographyStore.getState().showControlHandles;
    const currentShowGrid = useChoreographyStore.getState().showRinkGrid;
    const currentRegGuides = useChoreographyStore.getState().showReglamentaryGuides;
    const currentCompFigures = useChoreographyStore.getState().showCompulsoryFigures;
    const currentPaperOverlay = useChoreographyStore.getState().paperTraceOverlay;
    const currentFullTrail = useChoreographyStore.getState().showFullTrailOverride;

    const currentPlayTime = audio.isPlaying ? audioEngine.getCurrentTimeMs() : audio.currentTimeMs;

    // ¿Existe algún tramo realmente trazado por el usuario? Sin trazo no hay
    // recorrido: no se dibuja avatar (nunca se inventa una ruta entre nodos).
    const hasTracedPath = currentPoints.some(
      (p) =>
        Boolean(p.path && p.path.length >= 2) ||
        (p.curveShaped === true && p.cp1x !== undefined && p.cp2x !== undefined)
    );

    // El patinador sólo aparece durante la reproducción, si el usuario lo
    // permite y hay un trazado que seguir. En edición (o sin trazo) queda oculto.
    const showSkater = showSkaterDuringPlayback && playbackEngaged && hasTracedPath;
    const currentAvatar = showSkater
      ? RinkMath.interpolateSkaterPosition(currentPoints, currentPlayTime, { onlyTracedPaths: true })
      : null;

    // `try/finally` mantiene SIEMPRE equilibrada la pila de estados del contexto:
    // una excepción de dibujo ya no puede dejar el lienzo vacío de forma
    // permanente (que era otra vía de "pantalla en negro").
    ctx.save();
    try {
      // 1. Escala al tamaño físico real (puede diferir de `dpr` por el límite iOS)
      ctx.scale(scaleX, scaleY);
      // 2. Limpieza total del frame anterior (elimina rastros o artefactos)
      ctx.clearRect(0, 0, cssW, cssH);

      const renderOpts = {
        showRinkGrid: currentShowGrid,
        showControlHandles: currentShowHandles,
        selectedPointId: currentSelectedId,
        activeSegmentIndex: currentAvatar?.activePointIndex ?? null,
        // Nodo en arrastre activo → feedback visual reforzado en el render.
        draggingPointId:
          dragTargetRef.current?.type === 'point' ? dragTargetRef.current.targetId : null,
        isPathGenerated: currentPoints.length >= 2,
        phase,
        // Contexto de reproducción (PLAY o pausa congelada): activa el TRAZADO
        // PROGRESIVO del segmento actual. Independiente del avatar.
        isPlaying: playbackEngaged,
        showFullTrailOverride: currentFullTrail,
        currentTimeMs: currentPlayTime,
        avatar: currentAvatar,
        showReglamentaryGuides: currentRegGuides,
        showCompulsoryFigures: currentCompFigures,
        paperTraceOverlay: currentPaperOverlay,
        paperTraceImageElement: paperImageRef.current,
      };

      // ── CAPA 0 ESTÁTICA: usar caché si nada que la afecte ha cambiado ──
      // Clave de invalidación: tamaño físico, cámara y toggles/overlay visuales.
      const paperEl = paperImageRef.current;
      const paperKey = currentPaperOverlay?.visible
        ? `${currentPaperOverlay.opacity}|${paperEl ? `${paperEl.src.length}:${paperEl.naturalWidth}:${paperEl.complete ? 1 : 0}` : 'noimg'}`
        : 'off';

      let staticLayer: HTMLCanvasElement | null = null;
      if (physicalW > 0 && physicalH > 0 && physicalW * physicalH <= STATIC_LAYER_MAX_PX) {
        const key = `${cssW}x${cssH}:${physicalW}x${physicalH}:${scaleX.toFixed(4)}x${scaleY.toFixed(4)}:${camera.x.toFixed(2)},${camera.y.toFixed(2)},${camera.zoom.toFixed(4)}:${currentShowGrid ? 1 : 0}${currentRegGuides ? 1 : 0}${currentCompFigures ? 1 : 0}:${paperKey}`;

        if (staticLayerKeyRef.current !== key || !staticLayerRef.current) {
          let layer = staticLayerRef.current;
          if (!layer) {
            layer = document.createElement('canvas');
            staticLayerRef.current = layer;
          }
          if (layer.width !== physicalW || layer.height !== physicalH) {
            layer.width = physicalW;
            layer.height = physicalH;
          }
          const lctx = layer.getContext('2d');
          if (lctx) {
            lctx.setTransform(1, 0, 0, 1, 0, 0);
            lctx.clearRect(0, 0, physicalW, physicalH);
            lctx.save();
            lctx.scale(scaleX, scaleY);
            lctx.translate(camera.x, camera.y);
            lctx.scale(camera.zoom, camera.zoom);
            RinkRenderer.drawRinkFloor(lctx, metrics, DEFAULT_RINK_DIMENSIONS, renderOpts);
            lctx.restore();
            staticLayerKeyRef.current = key;
          }
        }
        staticLayer = staticLayerRef.current;
      } else if (staticLayerRef.current) {
        // Fuera de rango de caché: liberar memoria.
        staticLayerRef.current = null;
        staticLayerKeyRef.current = '';
      }

      if (staticLayer) {
        // Capa cacheada ya en espacio de pantalla (incluye la cámara).
        ctx.drawImage(staticLayer, 0, 0, physicalW, physicalH, 0, 0, cssW, cssH);
      }

      // 3. Aplicación de la Cámara Virtual (Pan & Zoom) para las capas dinámicas
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.zoom, camera.zoom);

      // Capa 0 (fallback sin caché): Pista reglamentaria y marcas World Skate
      if (!staticLayer) {
        RinkRenderer.drawRinkFloor(ctx, metrics, DEFAULT_RINK_DIMENSIONS, renderOpts);
      }

      // Capa 1: Curvas de trayectoria (Línea guía permanente en pausa, o Trazado Dinámico durante reproducción)
      RinkRenderer.drawTrajectories(ctx, metrics, currentPoints, renderOpts);

      // Capa 2: Puntos de anclaje de Nodos Principales exclusivamente (Menta Neón)
      RinkRenderer.drawAnchorPoints(
        ctx,
        metrics,
        currentPoints,
        currentSelectedId,
        renderOpts.draggingPointId ?? null
      );

      // Capa 5: Elementos técnicos RollArt
      RinkRenderer.drawTechnicalElements(ctx, metrics, currentPoints, elements);

      // Capa 6: AVATAR CINEMÁTICO DEL PATINADOR/A (CAPA SUPERIOR)
      // Se dibuja sólo si procede (reproducción + preferencia + trazado real).
      if (currentAvatar) {
        RinkRenderer.drawSkaterAvatar(ctx, metrics, currentAvatar, skaterGender);
      }

      // Capa 7: Trazado a Mano Alzada en Tiempo Real (Active Freehand Glowing Trail)
      const activeStroke = rawStrokeRef.current;
      if (activeStroke && activeStroke.length >= 2) {
        // `try/finally` propio: si falla el trazo, la pila del contexto sigue
        // equilibrada y el siguiente frame no hereda una transformación rota.
        ctx.save();
        try {
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
        } finally {
          ctx.restore();
        }
      }
    } catch (err) {
      // Un fallo de dibujo ya no deja la Pista 2D en negro de forma permanente.
      console.error('[RinkCanvas] Error al renderizar el frame:', err);
    } finally {
      ctx.restore();
    }
  }, [
    containerSize,
    getMetrics,
    camera,
    phase,
    audio.isPlaying,
    audio.currentTimeMs,
    elements,
    skaterGender,
    playbackEngaged,
    showSkaterDuringPlayback,
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

  // Carga reactiva de la imagen de fondo de calco de papel (Paper Trace Overlay)
  useEffect(() => {
    if (!paperTraceOverlay?.imageUrl) {
      paperImageRef.current = null;
      renderFrame();
      return;
    }
    const img = new Image();
    img.src = paperTraceOverlay.imageUrl;
    img.onload = () => {
      paperImageRef.current = img;
      renderFrame();
    };
  }, [paperTraceOverlay?.imageUrl, renderFrame]);

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
    showReglamentaryGuides,
    showCompulsoryFigures,
    paperTraceOverlay,
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
    wasNodeSelectedRef.current = false;
    dragGrabOffsetRef.current = null;

    // Cualquier interacción de edición sobre la pista saca del contexto de
    // reproducción: el avatar (congelado tras PAUSE) desaparece para no estorbar
    // mientras se colocan/mueven nodos o se dibuja el trazado. Se lee el estado
    // real del motor para no depender de un closure obsoleto.
    if (!audioEngine.getState().isPlaying) {
      setPlaybackEngaged(false);
    }

    // Si ya hay otro puntero activo, este es un gesto de 2 dedos (zoom/pan):
    // no se inicia ni arrastre de nodo ni trazado, la cámara toma el control.
    const isMultiPointerGesture = cameraEngine.getActivePointerCount() >= 1;

    // Radio de hit-test dinámico para Nodos Principales: 32px en pantalla
    const hitRadius = 44 / camera.zoom;
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
      // ── Doble toque/clic sobre un nodo → editar su número manualmente ──
      // (fail-safe del escáner: los nodos en naranja se numeran aquí).
      const nowTap = performance.now();
      const lastTap = lastNodeTapRef.current;
      const isDoubleTap =
        (lastTap && lastTap.id === hitNode.id && nowTap - lastTap.time < 350) || e.detail >= 2;
      if (isDoubleTap) {
        lastNodeTapRef.current = null;
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        const current = hitNode.nodeNumber != null ? String(hitNode.nodeNumber) : '';
        const input = window.prompt(
          'Escribe el número del nodo (1, 2, 3…).\nSi el número ya existe en otro nodo, se intercambian.',
          current
        );
        if (input !== null) {
          const num = Number.parseInt(input.trim(), 10);
          if (Number.isFinite(num) && num >= 1) {
            // Renumeración inteligente central: intercambia si el destino ya existe,
            // nunca duplica. La posición física del nodo no se modifica.
            useChoreographyStore.getState().swapPointNumber(hitNode.id, num);
            const updated = useChoreographyStore.getState().points;
            commitPoints(updated);
            audio.setNodes(updated);
            if (currentProgram && onProgramUpdated) {
              onProgramUpdated({ ...currentProgram, choreography_path: updated });
            }
            renderFrame();
          }
        }
        return;
      }
      lastNodeTapRef.current = { id: hitNode.id, time: nowTap };

      hitFound = true;
      wasNodeSelectedRef.current = selectedPointId === hitNode.id;
      // Selección inmediata: feedback visual al instante (sin abrir aún el sheet).
      setSelectedPointId(hitNode.id);

      if (phase === 'curve') {
        // ── MODO TRAZAR: el nodo es el ORIGEN de una nueva trayectoria ──
        // Nunca se mueve el nodo mientras se traza.
        strokeStartNodeRef.current = hitNode;
        rawStrokeRef.current = [{ x: hitNode.x, y: hitNode.y }];
        dragTargetRef.current = null;
        setCursorStyle('crosshair');
      } else {
        // ── MODO NODOS: el nodo se puede ARRASTRAR libremente ──
        dragTargetRef.current = { targetId: hitNode.id, type: 'point' };
        // Desfase de agarre: el nodo conserva su posición relativa bajo el
        // dedo/cursor y no salta al empezar a mover.
        dragGrabOffsetRef.current = { dx: hitNode.x - mX, dy: hitNode.y - mY };
        // Se marca como posible "tap" (selección) hasta superar el umbral de
        // movimiento; si no se mueve, el pointerup selecciona/abre opciones.
        strokeStartNodeRef.current = hitNode;
        rawStrokeRef.current = [];
        setCursorStyle('grab');

        // Long press (~500 ms) → abre el Inspector/opciones del nodo. Solo en
        // táctil/stylus: el movimiento del dedo cancela el temporizador.
        if (!isMultiPointerGesture && e.pointerType !== 'mouse') {
          const targetNode = hitNode;
          longPressTimerRef.current = setTimeout(() => {
            isLongPressActiveRef.current = true;
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
            // El long press abre opciones: se cancela cualquier arrastre.
            dragTargetRef.current = null;
            dragGrabOffsetRef.current = null;
            rawStrokeRef.current = [];
            strokeStartNodeRef.current = null;
            setIsDragging(false);
            onDragChange?.(false);
            setSelectedPointId(targetNode.id);
            onNodeSelect?.(targetNode.id);
            try {
              if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
            } catch (err) {}
            renderFrame();
          }, 500);
        }
      }
    }

    // 2. Manipulación Directa de Curvas (Drag-to-Curve sin tiradores visuales)
    //    Es parte de la HERRAMIENTA TRAZAR: solo activa en modo 'curve'.
    // Path Proximity Detection con tolerancia invisible (~24px en pantalla) para facilitar agarre táctil
    if (!hitFound && !isMultiPointerGesture && phase === 'curve' && !audio.isPlaying && points.length >= 2) {
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

    // 3. MODO TRAZAR: trazo a mano alzada nuevo desde espacio libre.
    //    En Modo Nodos, el arrastre en vacío es PANEO de cámara y el tap crea
    //    un nodo (nunca una trayectoria).
    if (!hitFound && !isMultiPointerGesture && phase === 'curve' && mX >= 0.2 && mX <= 49.8 && mY >= 0.2 && mY <= 24.8) {
      strokeStartNodeRef.current = null;
      rawStrokeRef.current = [{ x: mX, y: mY }];
    }

    // Notificar al motor de cámara (si tocó un nodo o control, no activa paneo de 1 dedo)
    camPointerDown(e, hitFound || isMultiPointerGesture);
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
        dragGrabOffsetRef.current = null;
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
    const dragThreshold = e.pointerType === 'touch' ? 8 : 4;
    if (dragTargetRef.current && dragTargetRef.current.type === 'point' && movedDistance >= dragThreshold) {
      if (!isDragging) {
        setIsDragging(true);
        setCursorStyle('grabbing');
        onDragChange?.(true);
      }

      // El nodo sigue al dedo/cursor conservando el desfase de agarre (sin
      // saltos) y se restringe a los límites de la pista (0.4m de seguridad).
      const grab = dragGrabOffsetRef.current;
      const rawX = mX + (grab?.dx ?? 0);
      const rawY = mY + (grab?.dy ?? 0);
      const clampedX = Math.max(0.4, Math.min(DEFAULT_RINK_DIMENSIONS.lengthMeters - 0.4, rawX));
      const clampedY = Math.max(0.4, Math.min(DEFAULT_RINK_DIMENSIONS.widthMeters - 0.4, rawY));

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
      // Filtro de distancia (2.5px en pantalla): acumula coordenadas con alta
      // resolución para reproducir fielmente círculos, bucles y trazos curvos,
      // también cuando el rink es pequeño (móvil/tablet).
      const minStepMeters = Math.max(0.03, 2.5 / (metrics.scale * (camera.zoom || 1)));
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
    const hitRadius = 44 / camera.zoom;

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

    // Feedback de cursor según la HERRAMIENTA activa: nunca una única "mano".
    // (El modo Borrador ya retorna arriba con cursor 'pointer'.)
    if (isHovering) {
      // Sobre un nodo: en Nodos se puede mover (grab); en Trazar inicia el trazo.
      setCursorStyle(phase === 'curve' ? 'pointer' : 'grab');
    } else {
      setCursorStyle('crosshair');
    }
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
      dragTargetRef.current = null;
      dragGrabOffsetRef.current = null;
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
      dragGrabOffsetRef.current = null;
      onDragChange?.(false);
      setCursorStyle('crosshair');
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

    // Detectar si el final del trazo aterrizó sobre o cerca de un Nodo Maestro existente (Snap a Nodo)
    let targetEndNode: ChoreographyPoint | null = null;
    if (touchEndM) {
      let minEndDist = Infinity;
      const snapRadiusMeters = 1.5; // Tolerancia de enganche táctil en pista (~30px)
      for (const p of points) {
        if (startNode && p.id === startNode.id) continue;
        const d = Math.hypot(touchEndM.mX - p.x, touchEndM.mY - p.y);
        if (d < snapRadiusMeters && d < minEndDist) {
          minEndDist = d;
          targetEndNode = p;
        }
      }
    }

    if (rawStroke.length > 0) {
      if (targetEndNode) {
        // Imantar el último punto del trazo directamente al centro del nodo destino existente
        rawStroke[rawStroke.length - 1] = { x: targetEndNode.x, y: targetEndNode.y };
      } else if (touchEndM) {
        const clampedEndM = {
          x: Math.max(0.2, Math.min(DEFAULT_RINK_DIMENSIONS.lengthMeters - 0.2, touchEndM.mX)),
          y: Math.max(0.2, Math.min(DEFAULT_RINK_DIMENSIONS.widthMeters - 0.2, touchEndM.mY)),
        };
        // Forzar que el último punto del trazo coincida exactamente con la coordenada donde se levantó el dedo
        rawStroke[rawStroke.length - 1] = clampedEndM;
      }
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
        const liveMs = audioEngine.getCurrentTimeMs();
        baseTime = liveMs > 0 ? liveMs : 0;
      }

      // Convertir el gesto libre preservando la huella geométrica (loops, círculos, ochos) y Nodos Maestros
      const generated = FreehandPathEngine.convertStrokeToChoreographyPoints(rawStroke, baseTime);

      if (generated.length >= 2) {
        pushHistory();
        let finalPoints: ChoreographyPoint[] = [];
        const durationMs = generated[1].time_ms - generated[0].time_ms;

        if (startNode && targetEndNode) {
          // CASO A: Conexión directa entre DOS NODOS EXISTENTES (Nodo 1 -> Trazo dibujado -> Nodo 2)
          // Cero duplicación de nodos. Actualiza el path de startNode hacia targetEndNode sin crear nodos fantasma.
          const updatedExisting: ChoreographyPoint[] = points.map((p) => {
            if (p.id === startNode.id) {
              return {
                ...p,
                cp1x: generated[0].cp1x,
                cp1y: generated[0].cp1y,
                cp2x: generated[0].cp2x,
                cp2y: generated[0].cp2y,
                controlPoint1: generated[0].controlPoint1,
                controlPoint2: generated[0].controlPoint2,
                path: generated[0].path, // Huella exacta del trazo dibujado
              };
            }
            if (p.id === targetEndNode.id && targetEndNode.time_ms <= startNode.time_ms) {
              const adjustedTime = startNode.time_ms + durationMs;
              return {
                ...p,
                time_ms: adjustedTime,
                timestamp: adjustedTime,
              };
            }
            return p;
          });

          finalPoints = [...updatedExisting].sort((a, b) => a.time_ms - b.time_ms);
          setSelectedPointId(targetEndNode.id);
        } else if (startNode) {
          // CASO B: Trazo desde nodo existente hacia espacio libre (Crea exactamente UN nuevo nodo final)
          const updatedExisting: ChoreographyPoint[] = points.map((p) => {
            if (p.id === startNode.id) {
              return {
                ...p,
                cp1x: generated[0].cp1x,
                cp1y: generated[0].cp1y,
                cp2x: generated[0].cp2x,
                cp2y: generated[0].cp2y,
                controlPoint1: generated[0].controlPoint1,
                controlPoint2: generated[0].controlPoint2,
                path: generated[0].path,
              };
            }
            return p;
          });

          const newExtensionPoint: ChoreographyPoint = {
            ...generated[1],
            id: `pt-freehand-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'Step',
            label: '',
            isMainNode: true,
          };

          finalPoints = [...updatedExisting, newExtensionPoint].sort((a, b) => a.time_ms - b.time_ms);
          setSelectedPointId(newExtensionPoint.id);
        } else if (targetEndNode) {
          // CASO C: Trazo desde espacio libre hacia un nodo existente (Crea UN nuevo nodo inicial)
          const newStartPoint: ChoreographyPoint = {
            ...generated[0],
            id: `pt-freehand-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'Step',
            label: '',
            isMainNode: true,
          };

          const updatedExisting: ChoreographyPoint[] = points.map((p) => {
            if (p.id === targetEndNode.id && targetEndNode.time_ms <= newStartPoint.time_ms) {
              const adjustedTime = newStartPoint.time_ms + durationMs;
              return {
                ...p,
                time_ms: adjustedTime,
                timestamp: adjustedTime,
              };
            }
            return p;
          });

          finalPoints = [...updatedExisting, newStartPoint].sort((a, b) => a.time_ms - b.time_ms);
          setSelectedPointId(targetEndNode.id);
        } else {
          // CASO D: Trazo nuevo independiente en espacio libre (Crea exactamente DOS nodos)
          const stamped: ChoreographyPoint[] = [
            {
              ...generated[0],
              id: `pt-freehand-${Date.now()}-0-${Math.random().toString(36).slice(2, 6)}`,
              type: 'Step',
              label: '',
              isMainNode: true,
            },
            {
              ...generated[1],
              id: `pt-freehand-${Date.now()}-1-${Math.random().toString(36).slice(2, 6)}`,
              type: 'Step',
              label: '',
              isMainNode: true,
            }
          ];

          finalPoints = [...points, ...stamped].sort((a, b) => a.time_ms - b.time_ms);
          setSelectedPointId(stamped[1].id);
        }

        commitPoints(finalPoints);
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

    // 3. CASO TOQUE RÁPIDO (TAP): seleccionar o colocar, nunca mover/trazar.
    if (movedDistance < (e.pointerType === 'touch' ? 8 : 4)) {
      if (startNode) {
        // Tap rápido en nodo existente: seleccionar. Si YA estaba seleccionado,
        // un segundo tap muestra sus opciones (abre el Inspector en móvil).
        setSelectedPointId(startNode.id);
        if (wasNodeSelectedRef.current) {
          onNodeSelect?.(startNode.id);
        }
      } else if (currentTarget && (currentTarget.type === 'curve' || currentTarget.type === 'grip')) {
        setSelectedPointId(currentTarget.targetId);
      } else if (currentTarget && currentTarget.type === 'point') {
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
          // Si hay nodos pendientes de la bandeja del Estudio de Audio:
          if (unplacedNodes.length > 0 && activeTrayNodeIndex < unplacedNodes.length) {
            const currentTrayNode = unplacedNodes[activeTrayNodeIndex];
            if (currentTrayNode) {
              const placed = placeTrayNode(currentTrayNode.id, mX, mY);
              if (placed) {
                const currentPts = useChoreographyStore.getState().points;
                audio.setNodes(currentPts);
                if (currentProgram && onProgramUpdated) {
                  onProgramUpdated({
                    ...currentProgram,
                    choreography_path: currentPts,
                  });
                }
                renderFrame();
                return;
              }
            }
          }

          if (phase === 'plot' || points.length === 0) {
            const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);
            const lastTime = sorted.length > 0 ? sorted[sorted.length - 1].time_ms : 0;
            // Colocación al instante exacto de la música (reloj de hardware)
            const liveMs = audioEngine.getCurrentTimeMs();
            const newTime = liveMs > 0 ? liveMs : (sorted.length === 0 ? 0 : lastTime + 3000);
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
    dragGrabOffsetRef.current = null;
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

            commitPoints(updatedPoints);
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
      const liveMs = audioEngine.getCurrentTimeMs();
      const newTime = liveMs > 0 ? liveMs : lastTime + 10000;
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
      commitPoints(updated);
  };

  // Limpiar pista por completo
  const handleClearAllPoints = () => {
    if (window.confirm('¿Deseas limpiar todos los puntos de la pista para trazar una nueva coreografía desde cero?')) {
      clearAllPoints();
    }
  };

  // NOTA: se eliminó `handleResetDemoPath`. La app arranca en «lienzo en blanco»
  // sin coreografía ni música de demostración.

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

        {/* Floating Paper Trace Overlay Control Panel */}
        {paperTraceOverlay && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-slate-950/90 backdrop-blur-md border border-cyan/40 px-3 py-1.5 rounded-2xl shadow-glow-cyan text-xs select-none">
            <div className="flex items-center gap-1.5 pr-2 border-r border-white/10">
              <span className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
              <span className="font-bold text-white tracking-wide text-[11px]">Calco Papel 1:1</span>
            </div>
            
            <button
              type="button"
              onClick={togglePaperTraceVisibility}
              className={`press flex h-12 w-12 min-h-touch min-w-touch shrink-0 items-center justify-center rounded-lg ${
                paperTraceOverlay.visible ? 'text-cyan bg-cyan/15' : 'text-slate-400 hover:text-white bg-slate-900'
              }`}
              title={paperTraceOverlay.visible ? "Ocultar calco de papel" : "Mostrar calco de papel"}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-1.5 px-1">
              <span className="text-[10px] text-slate-400 font-mono">{Math.round(paperTraceOverlay.opacity * 100)}%</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={paperTraceOverlay.opacity}
                onChange={(e) => updatePaperTraceOpacity(parseFloat(e.target.value))}
                className="w-16 h-1 accent-cyan bg-slate-800 rounded-full cursor-pointer"
                title="Opacidad del calco de papel"
              />
            </div>

            <button
              type="button"
              onClick={clearPaperTraceOverlay}
              className="press ml-1 flex h-12 w-12 min-h-touch min-w-touch shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-coral/10 hover:text-coral"
              title="Quitar imagen de calco"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Pista limpia sin overlays — el zoom se controla con gestos pinch-to-zoom y los botones de la barra de herramientas */}

        {/* Controles de cámara del editor (zoom + restablecer vista) —
            área táctil ≥44px para uso con dedo/stylus. */}
        <div className="absolute bottom-3 left-3 z-20 flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-slate-950/80 p-1 backdrop-blur-md">
          <button
            type="button"
            onClick={() => zoomIn(canvasRef.current)}
            title="Acercar (rueda del ratón / pinch)"
            aria-label="Acercar"
            className="press flex h-11 w-11 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={resetCamera}
            title="Restablecer vista"
            aria-label="Restablecer vista"
            className="press flex h-11 w-11 items-center justify-center rounded-xl text-[10px] font-bold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            {Math.round(camera.zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => zoomOut(canvasRef.current)}
            title="Alejar"
            aria-label="Alejar"
            className="press flex h-11 w-11 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            cursor: cursorStyle,
            touchAction: 'none'
          }}
          className="block h-full w-full touch-none select-none"
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

          {/* Floating Camera Control HUD (Safe Non-Obstructive Zone) */}
          <div className="absolute bottom-2.5 right-2.5 z-30 flex items-center gap-1 bg-slate-950/70 backdrop-blur-md border border-white/10 px-1.5 py-1 rounded-xl shadow-soft-elevation select-none pointer-events-none">
            <button
              type="button"
              onClick={() => zoomOut(canvasRef.current)}
              className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-200 active:scale-95 text-sm font-bold transition-all border border-white/5 pointer-events-auto"
              title="Alejar (Zoom Out -10%)"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetCamera}
              className="px-1.5 h-6 flex items-center justify-center rounded-lg bg-slate-900/90 hover:bg-slate-800 text-cyan active:scale-95 text-[10px] font-mono font-bold transition-all border border-white/5 pointer-events-auto"
              title="Restablecer Vista (100% y centrar)"
            >
              {Math.round(camera.zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => zoomIn(canvasRef.current)}
              className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-200 active:scale-95 text-sm font-bold transition-all border border-white/5 pointer-events-auto"
              title="Acercar (Zoom In +10%)"
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

          {/* Floating Paper Trace Overlay Control Panel */}
          {paperTraceOverlay && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-slate-950/90 backdrop-blur-md border border-cyan/40 px-3 py-1.5 rounded-2xl shadow-glow-cyan text-xs select-none">
              <div className="flex items-center gap-1.5 pr-2 border-r border-white/10">
                <span className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
                <span className="font-bold text-white tracking-wide text-[11px]">Calco Papel 1:1</span>
              </div>
              
              <button
                type="button"
                onClick={togglePaperTraceVisibility}
                className={`p-1.5 rounded-lg transition-all ${
                  paperTraceOverlay.visible ? 'text-cyan bg-cyan/15' : 'text-slate-400 hover:text-white bg-slate-900'
                }`}
                title={paperTraceOverlay.visible ? "Ocultar calco de papel" : "Mostrar calco de papel"}
              >
                <Eye className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-1.5 px-1">
                <span className="text-[10px] text-slate-400 font-mono">{Math.round(paperTraceOverlay.opacity * 100)}%</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={paperTraceOverlay.opacity}
                  onChange={(e) => updatePaperTraceOpacity(parseFloat(e.target.value))}
                  className="w-16 h-1 accent-cyan bg-slate-800 rounded-full cursor-pointer"
                  title="Opacidad del calco de papel"
                />
              </div>

              <button
                type="button"
                onClick={clearPaperTraceOverlay}
                className="p-1.5 text-slate-400 hover:text-coral rounded-lg hover:bg-coral/10 transition-colors ml-1"
                title="Quitar imagen de calco"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

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
          {collectNodeFigures(selectedPoint).length > 0 && (
            <div className="mt-3 bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-zinc-200">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-teal-400 flex-shrink-0" />
                <div>
                  <span className="font-extrabold text-teal-400 uppercase tracking-wide text-[11px] block">
                    Secuencia Vocal Sincronizada:
                  </span>
                  <p className="text-xs text-white font-semibold mt-0.5">
                    "{collectNodeFigures(selectedPoint).join(', ')}, en tres, dos, uno, ¡ya!"
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
