import { create } from 'zustand';
import { ChoreographyPoint, ChoreographyPathPoint, ControlPoint, SkaterGender } from '../types/choreography';
import { ChoreographyPhase } from '../core/canvas/RinkRenderer';
import { CategoriaReglamento, EficienciaReglamento, getCategoriaByEdad } from '../constants/reglamento';
import { AudioTimeNode } from '../types/audioStudio';

export interface ChoreographyStoreState {
  // Bandeja de Nodos de Audio (UI Tray recibida desde el Estudio de Audio)
  unplacedNodes: AudioTimeNode[];
  activeTrayNodeIndex: number;
  setUnplacedNodes: (nodes: AudioTimeNode[]) => void;
  placeTrayNode: (nodeId: string, x: number, y: number) => ChoreographyPoint | null;
  clearUnplacedNodes: () => void;
  // Puntos Coreográficos Unificados (Fuente Única de Verdad)
  points: ChoreographyPoint[];
  selectedPointId: string | null;
  skaterGender: SkaterGender;
  phase: ChoreographyPhase;
  showControlHandles: boolean;
  showRinkGrid: boolean;
  showReglamentaryGuides: boolean;
  showCompulsoryFigures: boolean;
  /**
   * Preferencia del usuario: mostrar la patinadora/patinador durante la
   * reproducción. `false` = reproducir sólo el trazado, sin avatar.
   * Durante la edición el avatar siempre permanece oculto.
   */
  showSkaterDuringPlayback: boolean;
  /**
   * Contador para solicitar el recentrado de la cámara de la Pista 2D desde
   * fuera del canvas (p. ej. el botón «Vista» de la barra móvil). RinkCanvas
   * observa el valor y ejecuta el reset; nunca se pinta nada sobre la pista.
   */
  cameraResetNonce: number;
  paperTraceOverlay: { imageUrl: string; opacity: number; visible: boolean } | null;
  history: ChoreographyPoint[][];

  // Motor de Reglas y Categorización 2026
  edad: number;
  categoria: CategoriaReglamento;
  eficiencia: EficienciaReglamento;
  setEdad: (edad: number) => void;
  setEficiencia: (eficiencia: EficienciaReglamento) => void;

  // Acciones
  setPoints: (points: ChoreographyPoint[]) => void;
  setSelectedPointId: (id: string | null) => void;
  /** Solicita recentrar la cámara de la Pista 2D (la pista queda limpia). */
  requestCameraReset: () => void;
  setSkaterGender: (gender: SkaterGender) => void;
  setPhase: (phase: ChoreographyPhase) => void;
  setShowControlHandles: (show: boolean) => void;
  setShowRinkGrid: (show: boolean) => void;
  setShowReglamentaryGuides: (show: boolean) => void;
  setShowCompulsoryFigures: (show: boolean) => void;
  setShowSkaterDuringPlayback: (show: boolean) => void;
  setPaperTraceOverlay: (overlay: { imageUrl: string; opacity: number; visible: boolean } | null) => void;
  updatePaperTraceOpacity: (opacity: number) => void;
  togglePaperTraceVisibility: () => void;
  clearPaperTraceOverlay: () => void;

  // Modificación y Creación Audio-First & Canvas
  addPointFromAudio: (timestampMs: number, customX?: number, customY?: number) => ChoreographyPoint;
  addPointAtCanvas: (x: number, y: number, timestampMs?: number) => ChoreographyPoint;
  updatePointPosition: (id: string, x: number, y: number) => void;
  updatePointTimestamp: (id: string, timestampMs: number) => void;
  updateControlPoint1: (id: string, x: number, y: number) => void;
  updateControlPoint2: (id: string, x: number, y: number) => void;
  updateSegmentControlPoints: (id: string, cp1: { x: number; y: number }, cp2: { x: number; y: number }) => void;
  updatePointMetadata: (id: string, label: string, type?: string, element_id?: string) => void;
  /** Asigna el número de nodo (escáner/manual). null = dejar pendiente. */
  setPointNumber: (id: string, nodeNumber: number | null) => void;
  /**
   * Renumeración inteligente: si el número destino ya existe, INTERCAMBIA los
   * números de ambos nodos (nunca duplica). Es el método central que deben usar
   * Inspector, menú contextual, waveform y escáner.
   */
  swapPointNumber: (id: string, targetNumber: number | null) => void;
  deletePoint: (id: string) => void;
  clearAllPoints: () => void;
  /** Reset absoluto de la coreografía para nueva sesión o logout (sin historial previo). */
  resetChoreographyState: () => void;
  straightenSegment: (id: string) => void;

  /**
   * Pila de IDs creados en la CONSTRUCCIÓN actual (no persistida). Permite
   * «Retroceder» el último paso del trazado sin recurrir al undo global.
   */
  buildSteps: string[];
  pushBuildSteps: (ids: string[]) => void;
  clearBuildSteps: () => void;
  /** Quita el último paso de la construcción. false si no hay nada que quitar. */
  retrocederBuildStep: () => boolean;

  // Visualización y Trazado Dinámico
  showFullTrailOverride: boolean;
  setShowFullTrailOverride: (show: boolean) => void;

  // Historial
  pushHistory: () => void;
  undo: () => void;
  loadProgramPoints: (points: ChoreographyPathPoint[]) => void;
}

// NOTA: se eliminó `DEFAULT_CHOREOGRAPHY_POINTS`. Era una coreografía de
// demostración (datos de prueba) y la aplicación debe arrancar en «lienzo en
// blanco»: `points` comienza vacío y el usuario crea sus propios nodos.

function normalizePoint(pt: Partial<ChoreographyPoint> & { id: string; x: number; y: number }): ChoreographyPoint {
  const timestamp = pt.timestamp ?? pt.time_ms ?? 0;
  const time_ms = timestamp;

  const cp1: ControlPoint = pt.controlPoint1 ?? {
    x: pt.cp1x ?? pt.x,
    y: pt.cp1y ?? pt.y
  };

  const cp2: ControlPoint = pt.controlPoint2 ?? {
    x: pt.cp2x ?? pt.x,
    y: pt.cp2y ?? pt.y
  };

  return {
    id: pt.id,
    timestamp,
    time_ms,
    x: Math.round(pt.x * 10) / 10,
    y: Math.round(pt.y * 10) / 10,
    controlPoint1: cp1,
    controlPoint2: cp2,
    cp1x: cp1.x,
    cp1y: cp1.y,
    cp2x: cp2.x,
    cp2y: cp2.y,
    type: pt.type || 'Marker',
    label: pt.label || '',
    element_id: pt.element_id,
    isMainNode: pt.isMainNode ?? true,
    // Metadatos del escáner / edición que ANTES se perdían al normalizar y hacían
    // que los nodos digitalizados perdieran número, figura o estado.
    nodeNumber: pt.nodeNumber,
    inkColor: pt.inkColor,
    unrecognized: pt.unrecognized,
    unlinked: pt.unlinked,
    curveShaped: pt.curveShaped,
    manual_figures: Array.isArray(pt.manual_figures) ? [...pt.manual_figures] : pt.manual_figures,
    figures_manuales: Array.isArray(pt.figures_manuales) ? [...pt.figures_manuales] : pt.figures_manuales,
    colorConfidence: pt.colorConfidence,
    geometryConfidence: pt.geometryConfidence,
    positionConfidence: pt.positionConfidence,
    digitConfidence: pt.digitConfidence,
    // Procedencia Studio (marcadores temporales). Deben sobrevivir a la
    // normalización: si se pierden, el puente Rink → Studio ya no reconoce el
    // nodo como marcador (`sourceStudioMarkerId`) y el marcador desaparece.
    sourceStudioMarkerId: pt.sourceStudioMarkerId,
    studioPublishedTimestampMs: pt.studioPublishedTimestampMs,
    studioTimeConflict: pt.studioTimeConflict,
    pendingStudioTimestampMs: pt.pendingStudioTimestampMs,
    path: Array.isArray(pt.path) && pt.path.length > 0 ? pt.path.map((coord) => ({ x: coord.x, y: coord.y })) : undefined
  };
}

/**
 * RENUMERACIÓN INTELIGENTE (función central, atómica).
 *
 * Reglas:
 *  · Si el número destino YA pertenece a otro nodo → se INTERCAMBIAN los números.
 *  · Si el número destino está libre → se asigna.
 *  · Si `nodeNumber` es null → el nodo queda SIN número (estado válido, muestra «?»).
 *
 * NUNCA modifica X/Y, figura, color ni ningún otro metadato: solo `nodeNumber`.
 * No puede existir un estado intermedio visible con números duplicados porque el
 * array completo se recalcula y se aplica en una sola operación de estado.
 */
export function applySmartNodeNumber(
  points: ChoreographyPoint[],
  id: string,
  nodeNumber: number | null
): ChoreographyPoint[] {
  const idx = points.findIndex((p) => p.id === id);
  if (idx < 0) return points;

  const normalizedTarget =
    nodeNumber == null || !Number.isFinite(nodeNumber) || nodeNumber < 1
      ? null
      : Math.floor(nodeNumber);

  // Sin número: se limpia de forma explícita (nodo pendiente, sigue siendo válido).
  if (normalizedTarget === null) {
    if (points[idx].nodeNumber === undefined && points[idx].unrecognized === true) return points;
    return points.map((p) =>
      p.id === id ? { ...p, nodeNumber: undefined, unrecognized: true } : p
    );
  }

  // Sin cambio real: no se reasigna ni se contamina el historial de deshacer.
  if (points[idx].nodeNumber === normalizedTarget) return points;

  const ownerIndex = points.findIndex(
    (p) => p.id !== id && p.nodeNumber === normalizedTarget
  );

  // Número ya asignado a OTRO nodo → intercambio.
  if (ownerIndex >= 0) {
    const currentNumber = points[idx].nodeNumber;
    return points.map((p) => {
      if (p.id === id) {
        return { ...p, nodeNumber: normalizedTarget, unrecognized: false, unlinked: false };
      }
      if (p.id === points[ownerIndex].id) {
        return {
          ...p,
          nodeNumber: currentNumber,
          // Si el nodo destino se queda sin número, vuelve a estado pendiente.
          unrecognized: currentNumber == null,
          unlinked: currentNumber == null ? p.unlinked : false,
        };
      }
      return p;
    });
  }

  // Número libre → asignación simple.
  return points.map((p) =>
    p.id === id
      ? { ...p, nodeNumber: normalizedTarget, unrecognized: false, unlinked: false }
      : p
  );
}

/**
 * INVALIDACIÓN DE TRAZADO — regla nodal.
 *
 * Mover o eliminar un nodo cambia la CONFIGURACIÓN ESPACIAL, así que la geometría
 * dibujada (trazo libre `path`, curva Bézier `controlPoint*`/`cp*`) deja de ser
 * válida. Se LIMPIA para que el usuario vuelva a dibujarla. NUNCA se traslada ni se
 * deforma automáticamente junto al nodo (`Mover nodo ≠ mover trazado`).
 */
function invalidatePointTrajectory<T extends ChoreographyPoint>(p: T): T {
  return {
    ...p,
    path: undefined,
    curveShaped: false,
    controlPoint1: undefined,
    controlPoint2: undefined,
    cp1x: undefined,
    cp1y: undefined,
    cp2x: undefined,
    cp2y: undefined,
  };
}

export const useChoreographyStore = create<ChoreographyStoreState>((set, get) => ({
  points: [],
  selectedPointId: null,
  buildSteps: [],
  skaterGender: 'female',
  phase: 'plot',
  showControlHandles: true,
  showRinkGrid: true,
  showReglamentaryGuides: true,
  showCompulsoryFigures: false,
  showSkaterDuringPlayback: true,
  cameraResetNonce: 0,
  paperTraceOverlay: null,
  history: [],

  // Reglamento 2026: Estado inicial y cálculo reactivo
  edad: 12,
  categoria: getCategoriaByEdad(12),
  eficiencia: 'PRE PROMO',

  setEdad: (edad) => {
    const validEdad = Math.max(3, Math.min(99, Math.round(edad)));
    const cat = getCategoriaByEdad(validEdad);
    set({ edad: validEdad, categoria: cat });
  },

  setEficiencia: (eficiencia) => set({ eficiencia }),


  setPoints: (points) => {
    const normalized = points.map(p => normalizePoint(p)).sort((a, b) => a.timestamp - b.timestamp);
    set({ points: normalized });
  },

  setSelectedPointId: (id) => set({ selectedPointId: id }),

  requestCameraReset: () => set((s) => ({ cameraResetNonce: s.cameraResetNonce + 1 })),

  setSkaterGender: (gender) => set({ skaterGender: gender }),

  setPhase: (phase) => set({ phase }),

  setShowControlHandles: (show) => set({ showControlHandles: show }),

  setShowRinkGrid: (show) => set({ showRinkGrid: show }),

  setShowReglamentaryGuides: (show) => set({ showReglamentaryGuides: show }),

  setShowCompulsoryFigures: (show) => set({ showCompulsoryFigures: show }),

  setShowSkaterDuringPlayback: (show) => set({ showSkaterDuringPlayback: show }),

  setPaperTraceOverlay: (overlay) => set({ paperTraceOverlay: overlay }),

  updatePaperTraceOpacity: (opacity) => {
    set((state) => ({
      paperTraceOverlay: state.paperTraceOverlay
        ? { ...state.paperTraceOverlay, opacity: Math.max(0.05, Math.min(1.0, opacity)) }
        : null,
    }));
  },

  togglePaperTraceVisibility: () => {
    set((state) => ({
      paperTraceOverlay: state.paperTraceOverlay
        ? { ...state.paperTraceOverlay, visible: !state.paperTraceOverlay.visible }
        : null,
    }));
  },

  clearPaperTraceOverlay: () => set({ paperTraceOverlay: null }),

  pushHistory: () => {
    const { points, history } = get();
    set({ history: [...history.slice(-30), points] });
  },

  undo: () => {
    const { history } = get();
    if (history.length === 0) return;
    const last = history[history.length - 1];
    set({
      points: last,
      history: history.slice(0, history.length - 1),
      selectedPointId: last.length > 0 ? (last.some(p => p.id === get().selectedPointId) ? get().selectedPointId : last[0].id) : null
    });
  },

  loadProgramPoints: (incomingPoints) => {
    if (!incomingPoints || incomingPoints.length === 0) {
      set({
        points: [],
        selectedPointId: null,
        phase: 'plot',
        buildSteps: []
      });
      return;
    }
    const normalized = incomingPoints.map(p => normalizePoint(p)).sort((a, b) => a.timestamp - b.timestamp);
    set({
      points: normalized,
      selectedPointId: normalized[0].id,
      phase: 'plot',
      // Cargar un programa reinicia la construcción (no hay pasos «retrocedibles»).
      buildSteps: []
    });
  },

  /**
   * DINÁMICA AUDIO-FIRST:
   * Al hacer clic en un punto exacto de la onda sonora (beat o cambio de ritmo),
   * genera automáticamente el marcador de tiempo y un nodo espacial en la pista 2D.
   */
  addPointFromAudio: (timestampMs: number, customX?: number, customY?: number) => {
    const { points, pushHistory } = get();
    pushHistory();

    const roundedTime = Math.max(0, Math.round(timestampMs));
    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);

    let x = customX;
    let y = customY;

    if (x === undefined || y === undefined) {
      if (sorted.length === 0) {
        x = 5.0;
        y = 12.5;
      } else {
        // Interpolar posición espacial según los puntos circundantes en el tiempo
        const prev = [...sorted].reverse().find(p => p.timestamp <= roundedTime);
        const next = sorted.find(p => p.timestamp > roundedTime);

        if (prev && next) {
          const ratio = (roundedTime - prev.timestamp) / Math.max(1, next.timestamp - prev.timestamp);
          x = prev.x + (next.x - prev.x) * ratio;
          y = prev.y + (next.y - prev.y) * ratio;
        } else if (prev) {
          // Si es posterior al último punto, avanzar en arco o curva armónica
          const angle = (prev.timestamp / 1000) * 0.5;
          x = Math.max(3, Math.min(47, prev.x + Math.cos(angle) * 7));
          y = Math.max(3, Math.min(22, prev.y + Math.sin(angle) * 5));
        } else if (next) {
          x = Math.max(3, Math.min(47, next.x - 5));
          y = next.y;
        } else {
          x = 25.0;
          y = 12.5;
        }
      }
    }

    x = Math.round(Math.max(1, Math.min(49, x)) * 10) / 10;
    y = Math.round(Math.max(1, Math.min(24, y)) * 10) / 10;

    const newId = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newPoint: ChoreographyPoint = normalizePoint({
      id: newId,
      timestamp: roundedTime,
      time_ms: roundedTime,
      x,
      y,
      controlPoint1: { x: Math.round((x + 2) * 10) / 10, y },
      controlPoint2: { x: Math.round((x + 4) * 10) / 10, y },
      type: 'Marker',
      label: ''
    });

    const updated = [...points, newPoint].sort((a, b) => a.timestamp - b.timestamp);

    set({
      points: updated,
      selectedPointId: newPoint.id
    });

    return newPoint;
  },

  /**
   * Creación directa desde el Canvas 2D
   */
  addPointAtCanvas: (x: number, y: number, timestampMs?: number) => {
    const { points, pushHistory } = get();
    pushHistory();

    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
    let time = timestampMs;

    if (time === undefined) {
      if (sorted.length === 0) {
        time = 0;
      } else {
        const last = sorted[sorted.length - 1];
        time = last.timestamp + 3000;
      }
    }

    const newId = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newPoint: ChoreographyPoint = normalizePoint({
      id: newId,
      timestamp: time,
      time_ms: time,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      controlPoint1: { x: Math.round((x + 2) * 10) / 10, y: Math.round(y * 10) / 10 },
      controlPoint2: { x: Math.round((x + 4) * 10) / 10, y: Math.round(y * 10) / 10 },
      type: 'Step',
      label: ''
    });

    const updated = [...points, newPoint].sort((a, b) => a.timestamp - b.timestamp);

    set({
      points: updated,
      selectedPointId: newPoint.id
    });

    return newPoint;
  },

  updatePointPosition: (id: string, x: number, y: number) => {
    const { points } = get();
    // Límite estricto de seguridad para nodos en pista reglamentaria (50x25m)
    const clampedX = Math.round(Math.max(0.8, Math.min(49.2, x)) * 10) / 10;
    const clampedY = Math.round(Math.max(0.8, Math.min(24.2, y)) * 10) / 10;

    // Configuración espacial: se invalida el trazado del nodo movido y el de sus
    // vecinos temporales (los tramos que entran/salen de él). NO se traslada la
    // geometría: el usuario vuelve a dibujar (Mover nodo ≠ mover trazado).
    const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);
    const sortedIndex = sorted.findIndex((p) => p.id === id);
    if (sortedIndex < 0) return;

    const affected = new Set<string>([id]);
    if (sortedIndex > 0) affected.add(sorted[sortedIndex - 1].id);
    if (sortedIndex < sorted.length - 1) affected.add(sorted[sortedIndex + 1].id);

    const updated = points.map(p => {
      const withPosition = p.id === id ? { ...p, x: clampedX, y: clampedY } : p;
      return affected.has(p.id) ? invalidatePointTrajectory(withPosition) : withPosition;
    });

    set({ points: updated });
  },

  updatePointTimestamp: (id: string, timestampMs: number) => {
    const { points } = get();
    const roundedTime = Math.max(0, Math.round(timestampMs));
    const updated = points
      .map(p => {
        if (p.id !== id) return p;
        return {
          ...p,
          timestamp: roundedTime,
          time_ms: roundedTime
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    set({ points: updated });
  },

  updateControlPoint1: (id: string, x: number, y: number) => {
    const { points } = get();
    // Margen amplio para que los puntos imán deformen la curva libremente
    const clampedX = Math.round(Math.max(-25, Math.min(75, x)) * 10) / 10;
    const clampedY = Math.round(Math.max(-15, Math.min(40, y)) * 10) / 10;

    const updated = points.map(p => {
      if (p.id !== id) return p;
      return {
        ...p,
        controlPoint1: { x: clampedX, y: clampedY },
        cp1x: clampedX,
        cp1y: clampedY,
        curveShaped: true,
      };
    });

    set({ points: updated });
  },

  updateControlPoint2: (id: string, x: number, y: number) => {
    const { points } = get();
    // Margen amplio para que los puntos imán deformen la curva libremente
    const clampedX = Math.round(Math.max(-25, Math.min(75, x)) * 10) / 10;
    const clampedY = Math.round(Math.max(-15, Math.min(40, y)) * 10) / 10;

    const updated = points.map(p => {
      if (p.id !== id) return p;
      return {
        ...p,
        controlPoint2: { x: clampedX, y: clampedY },
        cp2x: clampedX,
        cp2y: clampedY,
        curveShaped: true,
      };
    });

    set({ points: updated });
  },

  updateSegmentControlPoints: (id: string, cp1: { x: number; y: number }, cp2: { x: number; y: number }) => {
    const { points } = get();
    const cp1x = Math.round(Math.max(-25, Math.min(75, cp1.x)) * 10) / 10;
    const cp1y = Math.round(Math.max(-15, Math.min(40, cp1.y)) * 10) / 10;
    const cp2x = Math.round(Math.max(-25, Math.min(75, cp2.x)) * 10) / 10;
    const cp2y = Math.round(Math.max(-15, Math.min(40, cp2.y)) * 10) / 10;

    const updated = points.map(p => {
      if (p.id !== id) return p;
      return {
        ...p,
        controlPoint1: { x: cp1x, y: cp1y },
        controlPoint2: { x: cp2x, y: cp2y },
        cp1x,
        cp1y,
        cp2x,
        cp2y,
        curveShaped: true,
      };
    });

    set({ points: updated });
  },

  updatePointMetadata: (id: string, label: string, type?: string, element_id?: string) => {
    const { points, pushHistory } = get();
    pushHistory();

    const updated = points.map(p => {
      if (p.id !== id) return p;
      return {
        ...p,
        label,
        type: type ?? p.type,
        element_id: element_id !== undefined ? element_id : p.element_id
      };
    });

    set({ points: updated });
  },

  /** Asigna el número de nodo y lo marca como reconocido/conectado. */
  setPointNumber: (id: string, nodeNumber: number | null) => {
    get().swapPointNumber(id, nodeNumber);
  },

  /**
   * Renumeración inteligente (ver `applySmartNodeNumber`). Atómica: el conjunto
   * de números se actualiza en una sola operación, sin estados intermedios con
   * duplicados, y sin tocar la posición física de ningún nodo.
   */
  swapPointNumber: (id: string, targetNumber: number | null) => {
    const { points, pushHistory } = get();
    const updated = applySmartNodeNumber(points, id, targetNumber);
    if (updated === points) return;
    pushHistory();
    set({ points: updated });
  },
  deletePoint: (id: string) => {
    const { points, selectedPointId, pushHistory } = get();
    pushHistory();

    const idx = points.findIndex(p => p.id === id);
    if (idx < 0) return;

    // ELIMINAR NODO → INVALIDAR TRAZADO: se limpia la geometría de los vecinos
    // temporales para que no queden líneas/curvas/círculos huérfanos. El usuario
    // vuelve a dibujar la trayectoria.
    const sorted = [...points].sort((a, b) => a.time_ms - b.time_ms);
    const sortedIndex = sorted.findIndex(p => p.id === id);
    const affected = new Set<string>();
    if (sortedIndex > 0) affected.add(sorted[sortedIndex - 1].id);
    if (sortedIndex >= 0 && sortedIndex < sorted.length - 1) {
      affected.add(sorted[sortedIndex + 1].id);
    }

    const updated = points
      .filter(p => p.id !== id)
      .map(p => (affected.has(p.id) ? invalidatePointTrajectory(p) : p));

    set({
      points: updated,
      selectedPointId: selectedPointId === id ? null : selectedPointId
    });
  },

  pushBuildSteps: (ids) => {
    if (ids.length === 0) return;
    set((s) => ({ buildSteps: [...s.buildSteps, ...ids] }));
  },

  clearBuildSteps: () => set({ buildSteps: [] }),

  retrocederBuildStep: () => {
    const { buildSteps, points } = get();
    // No se puede retroceder por debajo del primer paso de la construcción.
    if (buildSteps.length < 2) return false;

    const lastId = buildSteps[buildSteps.length - 1];
    const existsInBuild = points.some((p) => p.id === lastId);
    // La pila puede quedar desincronizada tras un undo/redo: se descarta el paso.
    set({ buildSteps: buildSteps.slice(0, -1) });
    if (!existsInBuild) return false;

    get().deletePoint(lastId);
    return true;
  },

  clearAllPoints: () => {
    const { pushHistory } = get();
    pushHistory();
    set({
      points: [],
      selectedPointId: null,
      phase: 'plot',
      buildSteps: [],
      // Limpiar también la bandeja de nodos pendientes del escáner: si no, quedaba
      // un nodo "fantasma" pendiente que parecía no haberse borrado.
      unplacedNodes: [],
      activeTrayNodeIndex: 0,
    });
  },

  resetChoreographyState: () => {
    set({
      points: [],
      selectedPointId: null,
      phase: 'plot',
      buildSteps: [],
      unplacedNodes: [],
      activeTrayNodeIndex: 0,
      history: [],
      paperTraceOverlay: null,
    });
  },

  straightenSegment: (id: string) => {
    const { points, pushHistory } = get();
    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
    const idx = sorted.findIndex(p => p.id === id);
    if (idx < 0) return;

    pushHistory();
    const p0 = sorted[idx];
    const p1 = idx < sorted.length - 1 ? sorted[idx + 1] : (idx > 0 ? sorted[idx - 1] : null);

    let updatedPoint: ChoreographyPoint;
    if (p1) {
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const cp1: ControlPoint = {
        x: Math.round((p0.x + dx * 0.33) * 10) / 10,
        y: Math.round((p0.y + dy * 0.33) * 10) / 10
      };
      const cp2: ControlPoint = {
        x: Math.round((p0.x + dx * 0.66) * 10) / 10,
        y: Math.round((p0.y + dy * 0.66) * 10) / 10
      };
      updatedPoint = {
        ...p0,
        controlPoint1: cp1,
        controlPoint2: cp2,
        cp1x: cp1.x,
        cp1y: cp1.y,
        cp2x: cp2.x,
        cp2y: cp2.y,
        curveShaped: false
      };
    } else {
      updatedPoint = {
        ...p0,
        controlPoint1: { x: p0.x, y: p0.y },
        controlPoint2: { x: p0.x, y: p0.y },
        cp1x: p0.x,
        cp1y: p0.y,
        cp2x: p0.x,
        cp2y: p0.y,
        curveShaped: false
      };
    }

    const updated = points.map(p => p.id === id ? updatedPoint : p);
    set({ points: updated });
  },

  // ── Visualización y Trazado Dinámico ───────────────────────
  showFullTrailOverride: false,
  setShowFullTrailOverride: (show: boolean) => set({ showFullTrailOverride: show }),

  // ── Bandeja de Nodos de Audio (UI Tray) ───────────────────
  unplacedNodes: [],
  activeTrayNodeIndex: 0,

  setUnplacedNodes: (nodes: AudioTimeNode[]) => {
    const { points } = get();
    // RECONCILIACIÓN (publicación = snapshot, no «fusor» de estados):
    //  - Los marcadores ya COLOCADOS no vuelven a la bandeja (el id es la identidad
    //    estable) → nunca se duplica el nodo al republicar.
    //  - Para un nodo colocado cuyo marcador cambió de tiempo:
    //      · si el usuario NO tocó su tiempo (sigue en la línea base publicada),
    //        se adopta el nuevo tiempo del Studio y se preserva x/y;
    //      · si el usuario SÍ lo editó, se CONSERVA su trabajo y se marca conflicto
    //        (nunca se sobrescribe silenciosamente).
    //  - Un marcador eliminado en el Studio no borra un nodo ya colocado.
    //  - Los marcadores nuevos / sin ubicar entran a la bandeja con su tiempo actual.
    const incomingById = new Map(nodes.map((n) => [n.id, n]));

    let pointsChanged = false;
    const updatedPoints = points.map((p) => {
      const marker = incomingById.get(p.id);
      if (!marker) return p; // marcador eliminado en el Studio: se conserva el nodo
      const newMs = Math.round(marker.timestampSec * 1000);
      const userTouchedTime =
        p.studioPublishedTimestampMs != null &&
        Math.abs(p.time_ms - p.studioPublishedTimestampMs) > 1;

      if (!userTouchedTime) {
        if (p.time_ms === newMs && !p.studioTimeConflict) return p;
        pointsChanged = true;
        return {
          ...p,
          time_ms: newMs,
          timestamp: newMs,
          studioPublishedTimestampMs: newMs,
          studioTimeConflict: false,
        };
      }
      // Editado a mano → conservar; señalar el conflicto y guardar el valor que el
      // Studio propone para que el usuario pueda ADOPTARLO desde el inspector.
      if (p.studioTimeConflict && p.pendingStudioTimestampMs === newMs) return p;
      pointsChanged = true;
      return { ...p, studioTimeConflict: true, pendingStudioTimestampMs: newMs };
    });

    const placedIds = new Set(points.map((p) => p.id));
    const reconciled = nodes
      .filter((n) => !placedIds.has(n.id))
      .sort((a, b) => a.timestampSec - b.timestampSec);

    set({
      ...(pointsChanged
        ? { points: updatedPoints.slice().sort((a, b) => a.time_ms - b.time_ms) }
        : {}),
      unplacedNodes: reconciled,
      activeTrayNodeIndex: 0,
    });
  },

  placeTrayNode: (nodeId: string, x: number, y: number) => {
    const { unplacedNodes, activeTrayNodeIndex, points, pushHistory } = get();
    const currentNode = unplacedNodes[activeTrayNodeIndex];

    // Restricción de Orden Estricto: solo se puede ubicar el nodo activo actual
    if (!currentNode || currentNode.id !== nodeId) {
      console.warn(`[ChoreographyStore] Bloqueo de orden: No se puede ubicar ${nodeId} antes del nodo activo actual`);
      return null;
    }

    pushHistory();
    const timeMs = Math.round(currentNode.timestampSec * 1000);
    const newPointId = currentNode.id;
    const label = currentNode.label || `Nodo ${currentNode.numeroSecuencial}`;

    const newPoint: ChoreographyPoint = {
      id: newPointId,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      time_ms: timeMs,
      timestamp: timeMs,
      type: 'Step',
      label,
      isMainNode: true,
      controlPoint1: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 },
      controlPoint2: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 },
      cp1x: Math.round(x * 100) / 100,
      cp1y: Math.round(y * 100) / 100,
      cp2x: Math.round(x * 100) / 100,
      cp2y: Math.round(y * 100) / 100,
      // Procedencia: el nodo recuerda de qué marcador del Studio viene y con qué
      // tiempo se publicó (línea base para detectar ediciones manuales).
      sourceStudioMarkerId: currentNode.id,
      studioPublishedTimestampMs: timeMs,
      studioTimeConflict: false,
    };

    const newPoints = [...points, newPoint].sort((a, b) => a.time_ms - b.time_ms);
    const nextIndex = activeTrayNodeIndex + 1;

    set({
      points: newPoints,
      selectedPointId: newPointId,
      activeTrayNodeIndex: nextIndex,
      // Si ya se ubicaron todos los nodos de la bandeja, se limpia
      unplacedNodes: nextIndex >= unplacedNodes.length ? [] : unplacedNodes,
      // Separación de herramientas: mientras la bandeja siga colocando nodos se
      // PERMANECE en modo Nodos (colocar/mover). El modo Trazar solo se activa
      // cuando ya se ubicaron todos los nodos de la bandeja.
      phase: nextIndex >= unplacedNodes.length ? 'curve' : get().phase,
    });

    return newPoint;
  },

  clearUnplacedNodes: () => {
    set({ unplacedNodes: [], activeTrayNodeIndex: 0 });
  },
}));

