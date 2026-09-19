import { create } from 'zustand';
import { ChoreographyPoint, ChoreographyPathPoint, ControlPoint, SkaterGender } from '../types/choreography';
import { ChoreographyPhase } from '../core/canvas/RinkRenderer';
import { CategoriaReglamento, EficienciaReglamento, getCategoriaByEdad } from '../constants/reglamento';

export interface ChoreographyStoreState {
  // Puntos Coreográficos Unificados (Fuente Única de Verdad)
  points: ChoreographyPoint[];
  selectedPointId: string | null;
  skaterGender: SkaterGender;
  phase: ChoreographyPhase;
  showControlHandles: boolean;
  showRinkGrid: boolean;
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
  setSkaterGender: (gender: SkaterGender) => void;
  setPhase: (phase: ChoreographyPhase) => void;
  setShowControlHandles: (show: boolean) => void;
  setShowRinkGrid: (show: boolean) => void;

  // Modificación y Creación Audio-First & Canvas
  addPointFromAudio: (timestampMs: number, customX?: number, customY?: number) => ChoreographyPoint;
  addPointAtCanvas: (x: number, y: number, timestampMs?: number) => ChoreographyPoint;
  updatePointPosition: (id: string, x: number, y: number) => void;
  updatePointTimestamp: (id: string, timestampMs: number) => void;
  updateControlPoint1: (id: string, x: number, y: number) => void;
  updateControlPoint2: (id: string, x: number, y: number) => void;
  updateSegmentControlPoints: (id: string, cp1: { x: number; y: number }, cp2: { x: number; y: number }) => void;
  updatePointMetadata: (id: string, label: string, type?: string, element_id?: string) => void;
  deletePoint: (id: string) => void;
  clearAllPoints: () => void;
  straightenSegment: (id: string) => void;

  // Visualización y Trazado Dinámico
  showFullTrailOverride: boolean;
  setShowFullTrailOverride: (show: boolean) => void;

  // Historial
  pushHistory: () => void;
  undo: () => void;
  loadProgramPoints: (points: ChoreographyPathPoint[]) => void;
}

// Valores de inicialización por defecto (Ruta reglamentaria World Skate RollArt)
export const DEFAULT_CHOREOGRAPHY_POINTS: ChoreographyPoint[] = [
  {
    id: 'pt-1',
    timestamp: 0,
    time_ms: 0,
    x: 5,
    y: 12.5,
    controlPoint1: { x: 10, y: 5 },
    controlPoint2: { x: 18, y: 3 },
    cp1x: 10,
    cp1y: 5,
    cp2x: 18,
    cp2y: 3,
    type: 'Step',
    label: 'Salida / Choreo Entry'
  },
  {
    id: 'pt-2',
    timestamp: 4000,
    time_ms: 4000,
    x: 23,
    y: 5,
    controlPoint1: { x: 27, y: 7 },
    controlPoint2: { x: 31, y: 11 },
    cp1x: 27,
    cp1y: 7,
    cp2x: 31,
    cp2y: 11,
    type: 'Jump',
    label: 'Preparación 3Lo'
  },
  {
    id: 'pt-3',
    timestamp: 8000,
    time_ms: 8000,
    x: 35,
    y: 15,
    controlPoint1: { x: 38, y: 18 },
    controlPoint2: { x: 42, y: 21 },
    cp1x: 38,
    cp1y: 18,
    cp2x: 42,
    cp2y: 21,
    type: 'Spin',
    label: 'Sit Spin SSp'
  },
  {
    id: 'pt-4',
    timestamp: 12000,
    time_ms: 12000,
    x: 45,
    y: 20,
    controlPoint1: { x: 40, y: 22 },
    controlPoint2: { x: 30, y: 23 },
    cp1x: 40,
    cp1y: 22,
    cp2x: 30,
    cp2y: 23,
    type: 'Step',
    label: 'Curva de Transición'
  },
  {
    id: 'pt-5',
    timestamp: 16000,
    time_ms: 16000,
    x: 25,
    y: 22,
    controlPoint1: { x: 18, y: 21 },
    controlPoint2: { x: 10, y: 17 },
    cp1x: 18,
    cp1y: 21,
    cp2x: 10,
    cp2y: 17,
    type: 'Choreo',
    label: 'Secuencia Coreográfica'
  },
  {
    id: 'pt-6',
    timestamp: 20000,
    time_ms: 20000,
    x: 8,
    y: 15,
    controlPoint1: { x: 6, y: 14 },
    controlPoint2: { x: 5, y: 13 },
    cp1x: 6,
    cp1y: 14,
    cp2x: 5,
    cp2y: 13,
    type: 'Step',
    label: 'Pose Final'
  }
];

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
    element_id: pt.element_id
  };
}

export const useChoreographyStore = create<ChoreographyStoreState>((set, get) => ({
  points: [],
  selectedPointId: null,
  skaterGender: 'female',
  phase: 'plot',
  showControlHandles: true,
  showRinkGrid: true,
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

  setSkaterGender: (gender) => set({ skaterGender: gender }),

  setPhase: (phase) => set({ phase }),

  setShowControlHandles: (show) => set({ showControlHandles: show }),

  setShowRinkGrid: (show) => set({ showRinkGrid: show }),

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
        phase: 'plot'
      });
      return;
    }
    const normalized = incomingPoints.map(p => normalizePoint(p)).sort((a, b) => a.timestamp - b.timestamp);
    set({
      points: normalized,
      selectedPointId: normalized[0].id,
      phase: 'plot'
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

    const updated = points.map(p => {
      if (p.id !== id) return p;
      const dx = clampedX - p.x;
      const dy = clampedY - p.y;

      // Desplazar tiradores garantizando que NUNCA desborden los topes perimetrales de la pista
      const rawCp1X = p.controlPoint1 ? p.controlPoint1.x + dx : clampedX;
      const rawCp1Y = p.controlPoint1 ? p.controlPoint1.y + dy : clampedY;
      const cp1: ControlPoint = {
        x: Math.round(Math.max(0.4, Math.min(49.6, rawCp1X)) * 10) / 10,
        y: Math.round(Math.max(0.4, Math.min(24.6, rawCp1Y)) * 10) / 10
      };

      const rawCp2X = p.controlPoint2 ? p.controlPoint2.x + dx : clampedX;
      const rawCp2Y = p.controlPoint2 ? p.controlPoint2.y + dy : clampedY;
      const cp2: ControlPoint = {
        x: Math.round(Math.max(0.4, Math.min(49.6, rawCp2X)) * 10) / 10,
        y: Math.round(Math.max(0.4, Math.min(24.6, rawCp2Y)) * 10) / 10
      };

      return {
        ...p,
        x: clampedX,
        y: clampedY,
        controlPoint1: cp1,
        controlPoint2: cp2,
        cp1x: cp1.x,
        cp1y: cp1.y,
        cp2x: cp2.x,
        cp2y: cp2.y
      };
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
        cp1y: clampedY
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
        cp2y: clampedY
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
        cp2y
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

  /**
   * ELIMINACIÓN SINCRONIZADA:
   * Al eliminar un punto, desaparece instantáneamente tanto del Canvas como del Waveform.
   */
  deletePoint: (id: string) => {
    const { points, selectedPointId, pushHistory } = get();
    pushHistory();

    const idx = points.findIndex(p => p.id === id);
    if (idx < 0) return;

    const updated = points.filter(p => p.id !== id);

    let nextSelectedId: string | null = null;
    if (selectedPointId === id) {
      if (updated.length > 0) {
        nextSelectedId = updated[Math.min(idx, updated.length - 1)].id;
      }
    } else {
      nextSelectedId = selectedPointId;
    }

    set({
      points: updated,
      selectedPointId: nextSelectedId
    });
  },

  clearAllPoints: () => {
    const { pushHistory } = get();
    pushHistory();
    set({
      points: [],
      selectedPointId: null,
      phase: 'plot'
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
        cp2y: cp2.y
      };
    } else {
      updatedPoint = {
        ...p0,
        controlPoint1: { x: p0.x, y: p0.y },
        controlPoint2: { x: p0.x, y: p0.y },
        cp1x: p0.x,
        cp1y: p0.y,
        cp2x: p0.x,
        cp2y: p0.y
      };
    }

    const updated = points.map(p => p.id === id ? updatedPoint : p);
    set({ points: updated });
  },

  // ── Visualización y Trazado Dinámico ───────────────────────
  showFullTrailOverride: false,
  setShowFullTrailOverride: (show: boolean) => set({ showFullTrailOverride: show })
}));

