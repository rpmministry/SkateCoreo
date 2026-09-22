import { create } from 'zustand';

/**
 * Estado global de progreso de carga de pistas.
 *
 * Es intencionadamente minúsculo (reactivo) y se alimenta por eventos: cualquier
 * parte del motor de audio puede reportar avance real sin acoplarse a la UI.
 */
export interface LoadProgressState {
  /** `true` mientras hay al menos una carga en curso. */
  active: boolean;
  /** Porcentaje real 0–100. */
  percent: number;
  /** Etiqueta corta de la fase actual (p. ej. "Decodificando audio…"). */
  label: string;
}

export const useLoadProgressStore = create<LoadProgressState>(() => ({
  active: false,
  percent: 0,
  label: '',
}));

/**
 * Contador de cargas concurrentes: si se solapan dos ingestas, el indicador no
 * debe ocultarse hasta que termine la última. Evita el "parpadeo" del 100%.
 */
let activeLoads = 0;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const HIDE_DELAY_MS = 450;

export const loadProgress = {
  /** Marca el inicio de una carga y reinicia el indicador (no retrocede si ya hay una). */
  begin(label = 'Cargando pista…') {
    activeLoads += 1;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    // Si ya había una carga activa, se conserva su porcentaje; si no, se parte de 0.
    const current = useLoadProgressStore.getState();
    useLoadProgressStore.setState({
      active: true,
      percent: current.active ? current.percent : 0,
      label,
    });
  },

  /** Reporta avance real (0–100). Nunca retrocede dentro de la misma carga. */
  report(percent: number, label?: string) {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    const current = useLoadProgressStore.getState();
    if (!current.active) return;
    useLoadProgressStore.setState({
      percent: Math.max(current.percent, clamped),
      ...(label ? { label } : {}),
    });
  },

  /** Finaliza una carga; el indicador se oculta cuando no quedan cargas activas. */
  done() {
    activeLoads = Math.max(0, activeLoads - 1);
    if (activeLoads > 0) return;

    useLoadProgressStore.setState({ percent: 100, label: 'Listo' });
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (activeLoads === 0) {
        useLoadProgressStore.setState({ active: false, percent: 0, label: '' });
      }
    }, HIDE_DELAY_MS);
  },

  /** Fuerza el ocultado inmediato (por ejemplo, ante un error irrecuperable). */
  reset() {
    activeLoads = 0;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    useLoadProgressStore.setState({ active: false, percent: 0, label: '' });
  },
};
