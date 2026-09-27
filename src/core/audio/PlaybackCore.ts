/**
 * PlaybackCore — Núcleo determinista de reproducción de SkateCoreo.
 *
 * QUÉ ES
 *  - El ÚNICO registro de fuentes de audio activas (música, pre-roll, unlock…)
 *    y de subsistemas con sonido (metrónomo, Voz Guía, TTS).
 *  - La ÚNICA ruta de parada: `stopAll()` / `disposeAll()`.
 *  - El portador de la identidad de sesión (`sessionId` + `generation`) que
 *    permite demostrar que un recurso pertenece a la sesión actual.
 *  - La máquina de estados del transporte (`idle/preroll/playing/paused`).
 *
 * QUÉ NO ES
 *  - No conoce Web Audio ni el DOM: es lógica pura y 100 % testeable en Node.
 *  - No sustituye al AudioEngine ni al Metronome: los gobierna y los audita.
 *
 * INVARIANTES
 *  1. `beginSession(id)` con id distinto SIEMPRE dispone todo lo anterior.
 *  2. `releaseSource`/`stopAll` son idempotentes y tolerantes a errores.
 *  3. `snapshot().activeCount` es la verdad operativa: 0 = silencio garantizado
 *     (metrónomo OFF, sin música, sin voces, sin pre-roll).
 */

export type PlaybackSourceKind =
  | 'music'
  | 'preroll-voice'
  | 'unlock-silent'
  | 'recording-monitor';

export type PlaybackSubsystemName = 'metronome' | 'voice-cue' | 'tts';

export type PlaybackPhase = 'idle' | 'preroll' | 'playing' | 'paused';

export interface RegisteredSourceHandle {
  /** Detiene la fuente. Debe ser idempotente. */
  stop: () => void;
  /** Desconecta nodos (opcional). Debe ser idempotente. */
  disconnect?: () => void;
}

export interface RegisteredSourceInfo {
  id: number;
  kind: PlaybackSourceKind;
  label?: string;
  sessionId: string;
  generation: number;
  createdAtMs: number;
}

interface RegisteredSource extends RegisteredSourceInfo {
  handle: RegisteredSourceHandle;
}

export interface PlaybackSubsystemInfo {
  name: PlaybackSubsystemName;
  isActive: () => boolean;
  stop: () => void;
  stoppedCount: number;
}

export interface PlaybackCoreSnapshot {
  sessionId: string;
  generation: number;
  phase: PlaybackPhase;
  active: RegisteredSourceInfo[];
  activeCount: number;
  activeByKind: Partial<Record<PlaybackSourceKind, number>>;
  subsystems: Array<{ name: PlaybackSubsystemName; active: boolean; stoppedCount: number }>;
  counters: {
    sourcesCreated: number;
    sourcesReleased: number;
    sourcesCreatedByKind: Partial<Record<PlaybackSourceKind, number>>;
    stopAllCalls: number;
    disposeAllCalls: number;
    invalidTransitions: number;
    releaseErrors: number;
    sessionsBegun: number;
    sessionsEnded: number;
  };
}

const VALID_TRANSITIONS: Record<PlaybackPhase, PlaybackPhase[]> = {
  idle: ['preroll', 'playing'],
  preroll: ['playing', 'paused', 'idle'],
  playing: ['paused', 'idle', 'preroll'],
  paused: ['playing', 'idle', 'preroll'],
};

export const INITIAL_SESSION_ID = 'none';

export class PlaybackCore {
  private sessionId: string = INITIAL_SESSION_ID;
  private generation = 0;

  private phase: PlaybackPhase = 'idle';

  private nextSourceId = 1;
  private activeSources = new Map<number, RegisteredSource>();
  private subsystems = new Map<PlaybackSubsystemName, PlaybackSubsystemInfo>();

  private counters = {
    sourcesCreated: 0,
    sourcesReleased: 0,
    sourcesCreatedByKind: {} as Partial<Record<PlaybackSourceKind, number>>,
    stopAllCalls: 0,
    disposeAllCalls: 0,
    invalidTransitions: 0,
    releaseErrors: 0,
    sessionsBegun: 0,
    sessionsEnded: 0
  };

  // ── Sesión ────────────────────────────────────────────────────────────────

  public getSessionId(): string {
    return this.sessionId;
  }

  public getGeneration(): number {
    return this.generation;
  }

  /**
   * Abre (o reafirma) la sesión. Si el id cambia, TODO recurso de la sesión
   * anterior se dispone ANTES de aceptar la nueva: es imposible heredar audio.
   * Devuelve la generación vigente.
   */
  public beginSession(sessionId: string): number {
    const normalized = sessionId && sessionId.trim() ? sessionId.trim() : INITIAL_SESSION_ID;
    if (normalized === this.sessionId) return this.generation;

    this.disposeAll(`session-change:${this.sessionId}->${normalized}`);
    this.sessionId = normalized;
    this.generation++;
    this.counters.sessionsBegun++;
    this.phase = 'idle';
    return this.generation;
  }

  /** Cierra la sesión y destruye absolutamente todo. */
  public endSession(): void {
    this.disposeAll('session-end');
    this.sessionId = INITIAL_SESSION_ID;
    this.generation++;
    this.counters.sessionsEnded++;
    this.phase = 'idle';
  }

  // ── Registro de fuentes ───────────────────────────────────────────────────

  /**
   * Registra una fuente de audio activa. El llamador DEBE liberarla cuando la
   * fuente termine (`releaseSource`) o dejar que el core la detenga.
   */
  public registerSource(
    kind: PlaybackSourceKind,
    handle: RegisteredSourceHandle,
    label?: string
  ): number {
    const id = this.nextSourceId++;
    const info: RegisteredSource = {
      id,
      kind,
      label,
      sessionId: this.sessionId,
      generation: this.generation,
      createdAtMs: Date.now(),
      handle
    };
    this.activeSources.set(id, info);
    this.counters.sourcesCreated++;
    const byKind = this.counters.sourcesCreatedByKind;
    byKind[kind] = (byKind[kind] ?? 0) + 1;
    return id;
  }

  /**
   * Libera una fuente concreta: la DETIENE (si sigue viva) y la elimina del
   * registro. Idempotente: liberar dos veces el mismo id no hace nada.
   */
  public releaseSource(id: number): boolean {
    const source = this.activeSources.get(id);
    if (!source) return false;
    this.activeSources.delete(id);
    this.stopHandle(source);
    this.counters.sourcesReleased++;
    return true;
  }

  /** ¿Sigue registrada esta fuente? (para `onended` vs parada explícita). */
  public hasSource(id: number): boolean {
    return this.activeSources.has(id);
  }

  // ── Subsistemas con sonido propio ─────────────────────────────────────────

  /**
   * Declara un subsistema (metrónomo/Voz Guía/TTS) con su estado REAL y su
   * parada. Aparece en el snapshot para auditar que no quede sonando.
   */
  public registerSubsystem(
    name: PlaybackSubsystemName,
    isActive: () => boolean,
    stop: () => void
  ): void {
    if (this.subsystems.has(name)) {
      const existing = this.subsystems.get(name)!;
      existing.isActive = isActive;
      existing.stop = stop;
      return;
    }
    this.subsystems.set(name, { name, isActive, stop, stoppedCount: 0 });
  }

  public isSubsystemActive(name: PlaybackSubsystemName): boolean {
    const subsystem = this.subsystems.get(name);
    if (!subsystem) return false;
    try {
      return subsystem.isActive();
    } catch {
      return false;
    }
  }

  // ── Parada ────────────────────────────────────────────────────────────────

  /**
   * ÚNICA RUTA DE PARADA: detiene y libera todas las fuentes registradas
   * (opcionalmente solo de ciertos tipos) y para los subsistemas activos.
   */
  public stopAll(kinds?: PlaybackSourceKind[]): void {
    this.counters.stopAllCalls++;
    const wanted = kinds && kinds.length > 0 ? new Set(kinds) : null;
    for (const [id, source] of [...this.activeSources.entries()]) {
      if (wanted && !wanted.has(source.kind)) continue;
      this.activeSources.delete(id);
      this.stopHandle(source);
      this.counters.sourcesReleased++;
    }
    if (!wanted) {
      for (const subsystem of this.subsystems.values()) {
        let active = false;
        try {
          active = subsystem.isActive();
        } catch {
          active = false;
        }
        if (!active) continue;
        try {
          subsystem.stop();
          subsystem.stoppedCount++;
        } catch {
          this.counters.releaseErrors++;
        }
      }
    }
  }

  /** Parada total + invalidación lógica: se usa al cambiar/cerrar sesión. */
  public disposeAll(reason?: string): void {
    this.counters.disposeAllCalls++;
    void reason;
    this.stopAll();
    this.phase = 'idle';
  }

  // ── Transporte ────────────────────────────────────────────────────────────

  public getPhase(): PlaybackPhase {
    return this.phase;
  }

  /**
   * Cambia de fase si la transición es válida. Nunca lanza: una transición
   * inválida se contabiliza (diagnóstico) y se ignora.
   */
  public setPhase(next: PlaybackPhase): boolean {
    if (next === this.phase) return true;
    const allowed = VALID_TRANSITIONS[this.phase];
    if (!allowed.includes(next)) {
      this.counters.invalidTransitions++;
      return false;
    }
    this.phase = next;
    return true;
  }

  // ── Diagnóstico ───────────────────────────────────────────────────────────

  public getActiveSourceCount(kind?: PlaybackSourceKind): number {
    if (!kind) return this.activeSources.size;
    let count = 0;
    for (const source of this.activeSources.values()) {
      if (source.kind === kind) count++;
    }
    return count;
  }

  public snapshot(): PlaybackCoreSnapshot {
    const active = [...this.activeSources.values()].map(
      ({ handle: _handle, ...info }): RegisteredSourceInfo => info
    );
    const activeByKind: Partial<Record<PlaybackSourceKind, number>> = {};
    for (const source of active) {
      activeByKind[source.kind] = (activeByKind[source.kind] ?? 0) + 1;
    }
    return {
      sessionId: this.sessionId,
      generation: this.generation,
      phase: this.phase,
      active,
      activeCount: active.length,
      activeByKind,
      subsystems: [...this.subsystems.values()].map((s) => ({
        name: s.name,
        active: this.isSubsystemActive(s.name),
        stoppedCount: s.stoppedCount
      })),
      counters: {
        ...this.counters,
        sourcesCreatedByKind: { ...this.counters.sourcesCreatedByKind }
      }
    };
  }

  /** ¿Hay CUALQUIER audio sonando según el registro? (música/voces/metrónomo). */
  public isAnythingAudible(): boolean {
    if (this.activeSources.size > 0) return true;
    for (const name of this.subsystems.keys()) {
      if (this.isSubsystemActive(name)) return true;
    }
    return false;
  }

  /** Solo para tests: reinicia contadores sin tocar recursos. */
  public resetCounters(): void {
    this.counters = {
      sourcesCreated: 0,
      sourcesReleased: 0,
      sourcesCreatedByKind: {},
      stopAllCalls: 0,
      disposeAllCalls: 0,
      invalidTransitions: 0,
      releaseErrors: 0,
      sessionsBegun: 0,
      sessionsEnded: 0
    };
  }

  private stopHandle(source: RegisteredSource): void {
    try {
      source.handle.stop();
    } catch {
      this.counters.releaseErrors++;
    }
    if (source.handle.disconnect) {
      try {
        source.handle.disconnect();
      } catch {
        this.counters.releaseErrors++;
      }
    }
  }
}

/** Instancia única del núcleo para el motor singleton de la app. */
export const playbackCore = new PlaybackCore();
