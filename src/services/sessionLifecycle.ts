/**
 * sessionLifecycle.ts — Gestor centralizado del ciclo de vida de sesión y reset absoluto.
 *
 * RESPONSABILIDAD:
 * 1. Garantiza que cada nueva sesión comience completamente limpia (cero residuos de sesiones anteriores).
 * 2. Previene borrados bruscos ante recargas accidentales (F5 / Ctrl+R / rotación de pantalla / cambio responsive).
 * 3. Detecta cierres accidentales previos de pestaña/navegador ofreciendo recuperación controlada (sin duplicaciones).
 * 4. Ejecuta un RESET ABSOLUTO al cerrar sesión (logout) o al iniciar una sesión limpia.
 */

import { audioEngine } from '../core/audio/AudioEngine';
import { useChoreographyStore } from '../store/useChoreographyStore';
import { useAudioStudioStore } from '../store/useAudioStudioStore';
import { useRinkAudioStore } from '../store/useRinkAudioStore';
import { dbService } from './db';

export const SESSION_STORAGE_KEY = 'skatecoreo_active_session_id';
export const SESSION_SNAPSHOT_KEY = 'skatecoreo_session_snapshot';
export const MAX_RECOVERY_AGE_MS = 24 * 60 * 60 * 1000; // 24 horas

export interface SessionSnapshot {
  sessionId: string;
  userId: string | null;
  savedAt: number;
  pointsCount: number;
  audioFileName: string | null;
  hasAudio: boolean;
  programTitle?: string;
  selectedProgramId?: string | null;
  selectedSkaterId?: string | null;
}

export type SessionLifecycleResult =
  | { type: 'existing-active'; sessionId: string }
  | { type: 'unclosed-detected'; snapshot: SessionSnapshot; sessionId: string }
  | { type: 'clean-new'; sessionId: string };

export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 9);
  return `sess_${timestamp}_${randomPart}`;
}

export function getActiveSessionId(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setActiveSessionId(sessionId: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }
  } catch {
    /* almacenamiento restringido */
  }
}

export function clearActiveSessionId(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    /* ignorar */
  }
}

export function getSessionSnapshot(): SessionSnapshot | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SESSION_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionSnapshot;
    if (!parsed || !parsed.sessionId || !parsed.savedAt) return null;
    // Caducidad de seguridad de 24h
    if (Date.now() - parsed.savedAt > MAX_RECOVERY_AGE_MS) {
      clearSessionSnapshot();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSessionSnapshot(snapshot: SessionSnapshot): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SESSION_SNAPSHOT_KEY, JSON.stringify(snapshot));
    }
  } catch {
    /* quota o almacenamiento bloqueado */
  }
}

export function clearSessionSnapshot(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_SNAPSHOT_KEY);
    }
  } catch {
    /* ignorar */
  }
}

/**
 * Guarda o actualiza periódicamente el snapshot de la sesión activa para prevención de pérdidas accidentales.
 */
export async function persistActiveSessionSnapshot(data: {
  userId: string | null;
  points: any[];
  audioFileName: string | null;
  hasAudio: boolean;
  programTitle?: string;
  selectedProgramId?: string | null;
  selectedSkaterId?: string | null;
}): Promise<void> {
  const sessionId = getActiveSessionId() || generateSessionId();
  setActiveSessionId(sessionId);

  // Si no hay datos activos (ni puntos ni audio), limpiamos el snapshot
  if ((!data.points || data.points.length === 0) && !data.hasAudio) {
    clearSessionSnapshot();
    return;
  }

  const snapshot: SessionSnapshot = {
    sessionId,
    userId: data.userId,
    savedAt: Date.now(),
    pointsCount: data.points ? data.points.length : 0,
    audioFileName: data.audioFileName,
    hasAudio: data.hasAudio,
    programTitle: data.programTitle,
    selectedProgramId: data.selectedProgramId,
    selectedSkaterId: data.selectedSkaterId,
  };
  saveSessionSnapshot(snapshot);

  try {
    const rawBlob = audioEngine.getRawAudioBlob() || new Blob([]);
    await dbService.saveOfflineSession({
      id: 'current_offline_session',
      audioBlob: rawBlob,
      audioFileName: data.audioFileName || '',
      points: data.points || [],
      programTitle: data.programTitle || 'Sesión Recuperable',
      savedAt: Date.now(),
    });
  } catch {
    /* IndexedDB fallback */
  }
}

/**
 * RESET ABSOLUTO DEL ESTADO DE TRABAJO.
 * 
 * Limpia coordinadamente:
 * 1. Motor de audio: detiene reproducción, vacía buffers Rink y Studio, resetea VoiceCueEngine y metrónomo.
 * 2. Pista 2D: resetea puntos a [], limpia historial undo/redo, selección y bandeja de escáner.
 * 3. Estudio de Audio: restablece el estado inicial del editor, elimina pistas y clips.
 * 4. Pista de Audio Publicada (Rink Store): vacía el espejo reactivo.
 * 5. Almacenamiento Offline (IndexedDB): borra registros de sesión offline.
 * 6. Snapshots y marcadores temporales de sesión.
 */
export async function resetAbsoluteSession(): Promise<void> {
  console.log('[SessionLifecycle] Ejecutando RESET ABSOLUTO de sesión de trabajo...');

  // 1. Reset real del motor de audio
  try {
    audioEngine.resetAudioSession();
  } catch (err) {
    console.warn('[SessionLifecycle] Error reseteando AudioEngine:', err);
  }

  // 2. Reset absoluto de Pista 2D y Visor
  try {
    useChoreographyStore.getState().resetChoreographyState();
  } catch (err) {
    console.warn('[SessionLifecycle] Error reseteando ChoreographyStore:', err);
  }

  // 3. Reset absoluto del Estudio de Audio
  try {
    useAudioStudioStore.getState().resetStudio();
    useAudioStudioStore.getState().clearAllStudioTracks();
  } catch (err) {
    console.warn('[SessionLifecycle] Error reseteando AudioStudioStore:', err);
  }

  // 4. Limpieza del store reactivo de publicación
  try {
    useRinkAudioStore.getState().clear();
  } catch (err) {
    console.warn('[SessionLifecycle] Error reseteando RinkAudioStore:', err);
  }

  // 5. Limpieza de sesión offline en IndexedDB
  try {
    await dbService.clearOfflineSession();
  } catch (err) {
    console.warn('[SessionLifecycle] Error limpiando IndexedDB offlineSession:', err);
  }

  // 6. Eliminar snapshot y marcador de sesión
  clearSessionSnapshot();
  clearActiveSessionId();

  console.log('[SessionLifecycle] ✅ RESET ABSOLUTO COMPLETADO. Estado 100% limpio.');
}

/**
 * Evalúa el inicio de sesión de la aplicación.
 * 
 * Distingue deterministamente:
 * - Recarga en el mismo tab (sessionStorage vivo) -> continúa sesión activa.
 * - Reingreso con sesión no guardada previa recuperable -> 'unclosed-detected'.
 * - Nueva sesión limpia (o tras logout) -> ejecuta reset absoluto e inicia limpio.
 */
export async function initSessionLifecycle(userId: string | null): Promise<SessionLifecycleResult> {
  const activeId = getActiveSessionId();

  // Caso A: Recarga en la misma pestaña (F5, Ctrl+R, orientación, layout responsive)
  if (activeId) {
    console.log(`[SessionLifecycle] Sesión activa detectada en la misma pestaña (${activeId}). Continuando trabajo.`);
    return { type: 'existing-active', sessionId: activeId };
  }

  // Caso B: Nueva ventana/pestaña o reapertura. Revisar si hay un snapshot no cerrado recuperable.
  const snapshot = getSessionSnapshot();
  if (snapshot && (snapshot.pointsCount > 0 || snapshot.hasAudio)) {
    // Si el snapshot pertenece a otro usuario registrado, no ofrecer recuperación y purgar
    if (userId && snapshot.userId && snapshot.userId !== userId) {
      console.log('[SessionLifecycle] Snapshot previo pertenece a otra cuenta. Purgando.');
      await resetAbsoluteSession();
      const newSessionId = generateSessionId();
      setActiveSessionId(newSessionId);
      return { type: 'clean-new', sessionId: newSessionId };
    }

    console.log(`[SessionLifecycle] Sesión anterior no cerrada detectada (${snapshot.sessionId}). Se ofrecerá recuperación controlada.`);
    return { type: 'unclosed-detected', snapshot, sessionId: snapshot.sessionId };
  }

  // Caso C: Arranque de nueva sesión limpia (primer uso, tras logout, o sin sesión previa)
  console.log('[SessionLifecycle] Iniciando nueva sesión de trabajo 100% limpia.');
  await resetAbsoluteSession();
  const newSessionId = generateSessionId();
  setActiveSessionId(newSessionId);
  return { type: 'clean-new', sessionId: newSessionId };
}

/**
 * Cierre explícito de sesión (Logout o Terminar Trabajo):
 * Garantiza la destrucción inmediata de todo dato temporal.
 */
export async function terminateSession(): Promise<void> {
  console.log('[SessionLifecycle] Cierre explícito de sesión solicitado (Logout/Terminar).');
  await resetAbsoluteSession();
}
