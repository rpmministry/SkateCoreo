/**
 * audioDiagnostics.ts — Trazabilidad y telemetría estructurada del motor de audio.
 *
 * Emite logs con el formato unificado:
 * [EVENT] [PLATFORM:...] [VIEW:...] sid=... gen=... inst=... details
 *
 * Además mantiene contadores y un buffer circular de eventos accesible desde la
 * consola (`window.__SKATECOREO_AUDIO_DIAG__.snapshot()`) y desde el HUD de
 * diagnóstico (`?audioDebug=1`). Está DESACTIVADO por defecto: en producción
 * solo se activa si el usuario abre la app con `?audioDebug=1` o define
 * `localStorage.skatecoreo_audio_debug = '1'`. Así permite comprobar en un
 * móvil/tablet real cuántas instancias/schedulers/contextos existen sin
 * afectar el rendimiento ni la experiencia normal.
 */

export type AudioDiagnosticEventType =
  | 'AUDIO_ENGINE_CREATED'
  | 'METRONOME_CREATED'
  | 'METRONOME_STARTED'
  | 'METRONOME_STOPPED'
  | 'METRONOME_MUTE'
  | 'METRONOME_UNMUTE'
  | 'METRONOME_MUTED'
  | 'METRONOME_DESTROYED'
  | 'METRONOME_STATE'
  | 'METRONOME_DUPLICATE_KILLED'
  | 'SESSION_BOUND'
  | 'SESSION_CREATED'
  | 'SESSION_DESTROYED'
  | 'AUDIO_CONTEXT_CREATED'
  | 'PLAYBACK_CREATED'
  | 'PLAYBACK_PAUSED'
  | 'PLAYBACK_STOPPED'
  | 'PLAYBACK_DESTROYED'
  | 'TRACK_CREATED'
  | 'TRACK_DESTROYED'
  | 'APP_MOUNT'
  | 'APP_UNMOUNT'
  | 'STUDIO_RESET'
  | 'TRACK_DRAG_START'
  | 'TRACK_DRAG_END'
  | 'TRACK_COPY'
  | 'TRACK_PASTE'
  | 'MASTER_DROP';

export interface AudioDiagnosticContext {
  sessionId?: string;
  generation?: number;
  instanceId?: number;
  details?: string;
}

export interface AudioDiagnosticCounters {
  audioContextsCreated: number;
  metronomeCreates: number;
  metronomeDuplicateKills: number;
  clicksCreated: number;
  activeView: string;
  platform: string;
}

const IS_DEV = Boolean((import.meta as { env?: { DEV?: boolean } })?.env?.DEV);

let activeViewOverride: string | null = null;

/**
 * ¿Debe emitirse telemetría de audio? DEV siempre; en producción solo con
 * activación explícita (query `audioDebug=1` o flag en localStorage).
 */
export function audioDebugEnabled(): boolean {
  if (IS_DEV) return true;
  if (typeof window === 'undefined') return false;
  try {
    if ((window as any).__AUDIO_DIAGNOSTICS_ENABLED__) return true;
    if (new URLSearchParams(window.location.search).get('audioDebug') === '1') return true;
    return window.localStorage?.getItem('skatecoreo_audio_debug') === '1';
  } catch {
    return false;
  }
}

/** Vista activa publicada por App (misma fuente para logs y HUD). */
export function setAudioDiagnosticView(view: string): void {
  activeViewOverride = view;
  if (typeof window !== 'undefined') {
    (window as any).__SKATECOREO_ACTIVE_VIEW__ = view;
  }
}

export function detectAudioPlatform(): 'desktop' | 'mobile' | 'tablet' {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-form-factor');
    if (attr === 'mobile' || attr === 'tablet' || attr === 'desktop') return attr;
  }
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
    const ua = navigator.userAgent;
    if (/iPad|Tablet/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) return 'tablet';
    if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
  }
  return 'desktop';
}

export function detectAudioActiveView(): string {
  if (activeViewOverride) return activeViewOverride;
  if (typeof window !== 'undefined' && (window as any).__SKATECOREO_ACTIVE_VIEW__) {
    return String((window as any).__SKATECOREO_ACTIVE_VIEW__);
  }
  return '2D';
}

// ── Contadores y buffer circular (diagnóstico de fuente única) ─────────────

const counters = {
  audioContextsCreated: 0,
  metronomeCreates: 0,
  metronomeDuplicateKills: 0,
  clicksCreated: 0
};

const MAX_EVENTS = 120;
const eventBuffer: Array<{ t: number; event: string; platform: string; view: string; details?: string }> = [];

export function recordAudioCounter(
  name: 'audioContextsCreated' | 'metronomeCreates' | 'metronomeDuplicateKills' | 'clicksCreated',
  delta: number = 1
): void {
  counters[name] += delta;
}

export function logAudioDiagnostic(event: AudioDiagnosticEventType, ctx?: AudioDiagnosticContext): void {
  const platform = detectAudioPlatform();
  const view = detectAudioActiveView();
  const sid = ctx?.sessionId ?? 'none';
  const gen = ctx?.generation !== undefined ? `gen=${ctx.generation}` : 'gen=0';
  const inst = ctx?.instanceId !== undefined ? `inst=${ctx.instanceId}` : '';
  const details = ctx?.details ? `(${ctx.details})` : '';

  const formatted = `[${event}] [PLATFORM:${platform.toUpperCase()}] [VIEW:${view.toUpperCase()}] sid=${sid} ${gen} ${inst} ${details}`.replace(/\s+/g, ' ').trim();

  if (audioDebugEnabled()) {
    eventBuffer.push({ t: Date.now(), event, platform, view, details: ctx?.details });
    if (eventBuffer.length > MAX_EVENTS) eventBuffer.shift();
    console.log(formatted);
  }
}

/** Snapshot legible del estado de diagnóstico (HUD y consola). */
export function getAudioDiagnosticSnapshot(): AudioDiagnosticCounters & {
  events: Array<{ t: number; event: string; platform: string; view: string; details?: string }>;
} {
  return {
    ...counters,
    activeView: detectAudioActiveView(),
    platform: detectAudioPlatform(),
    events: [...eventBuffer]
  };
}

if (typeof window !== 'undefined') {
  (window as any).__SKATECOREO_AUDIO_DIAG__ = {
    snapshot: getAudioDiagnosticSnapshot,
    events: () => [...eventBuffer],
    enable: () => {
      try {
        window.localStorage?.setItem('skatecoreo_audio_debug', '1');
      } catch {
        /* modo privado */
      }
    }
  };
}
