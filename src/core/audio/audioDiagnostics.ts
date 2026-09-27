/**
 * audioDiagnostics.ts — Trazabilidad y telemetría estructurada del motor de audio (Req #8 & #11).
 *
 * Emite logs con el formato unificado:
 * [EVENT] [PLATFORM:...] [VIEW:...] sid=... gen=... inst=... details
 */

export type AudioDiagnosticEventType =
  | 'METRONOME_CREATED'
  | 'METRONOME_STARTED'
  | 'METRONOME_STOPPED'
  | 'METRONOME_MUTE'
  | 'METRONOME_UNMUTE'
  | 'METRONOME_MUTED'
  | 'METRONOME_DESTROYED'
  | 'METRONOME_STATE'
  | 'SESSION_BOUND'
  | 'SESSION_DESTROYED'
  | 'AUDIO_CONTEXT_CREATED'
  | 'PLAYBACK_CREATED'
  | 'PLAYBACK_PAUSED'
  | 'PLAYBACK_STOPPED'
  | 'APP_MOUNT'
  | 'APP_UNMOUNT';

export interface AudioDiagnosticContext {
  sessionId?: string;
  generation?: number;
  instanceId?: number;
  details?: string;
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

export function detectAudioActiveView(): '2D' | 'studio' | 'home' | 'viewer' {
  if (typeof window !== 'undefined' && (window as any).__SKATECOREO_ACTIVE_VIEW__) {
    const v = (window as any).__SKATECOREO_ACTIVE_VIEW__;
    if (v === 'studio') return 'studio';
    if (v === 'home') return 'home';
    if (v === 'viewer') return 'viewer';
    return '2D';
  }
  return '2D';
}

const IS_DEV = Boolean((import.meta as { env?: { DEV?: boolean } })?.env?.DEV);

export function logAudioDiagnostic(event: AudioDiagnosticEventType, ctx?: AudioDiagnosticContext): void {
  const platform = detectAudioPlatform();
  const view = detectAudioActiveView();
  const sid = ctx?.sessionId ?? 'none';
  const gen = ctx?.generation !== undefined ? `gen=${ctx.generation}` : 'gen=0';
  const inst = ctx?.instanceId !== undefined ? `inst=${ctx.instanceId}` : '';
  const details = ctx?.details ? `(${ctx.details})` : '';

  const formatted = `[${event}] [PLATFORM:${platform.toUpperCase()}] [VIEW:${view.toUpperCase()}] sid=${sid} ${gen} ${inst} ${details}`.replace(/\s+/g, ' ').trim();

  if (IS_DEV || (typeof window !== 'undefined' && (window as any).__AUDIO_DIAGNOSTICS_ENABLED__)) {
    console.log(formatted);
  }
}
