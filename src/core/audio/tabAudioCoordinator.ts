/**
 * tabAudioCoordinator.ts — Un único propietario de audio por navegador.
 *
 * PROBLEMA QUE RESUELVE (Android Chrome/Brave)
 * En Android, las pestañas en segundo plano siguen vivas y cada pestaña tiene su
 * propio `AudioEngine` y su propio `AudioContext`. Con dos pestañas abiertas del
 * mismo usuario, ambas podían reproducir a la vez: dos metrónomos simultáneos,
 * mutear en una no silenciaba la otra y "cerrar" no eliminaba el residuo.
 * iOS no lo mostraba porque WebKit suspende las pestañas en segundo plano.
 *
 * DISEÑO
 *  · `tabId` único por pestaña (sessionStorage: sobrevive recargas, desaparece
 *    al cerrar la pestaña).
 *  · Ownership por LEASE compartido en localStorage + mensajes por
 *    BroadcastChannel (con respaldo por `storage` events):
 *      - el dueño renueva el lease con heartbeat;
 *      - si el lease caduca (pestaña muerta/congelada sin reproducir), otra
 *        pestaña puede reclamarlo;
 *      - si el dueño está REPRODUCIENDO, el reclamo se deniega siempre
 *        (nunca pueden coexistir dos fuentes);
 *      - el traspaso desde un dueño inactivo es un handshake (TAKEOVER_REQUEST
 *        → ACK) y solo entonces se escribe el nuevo lease.
 *  · Al ocultarse sin reproducir, el dueño LIBERA el control; al cerrarse la
 *    pestaña (pagehide) también. Al reproducir, renueva de inmediato.
 *  · Lógica 100 % inyectable: tests en Node con entorno falso, sin navegador.
 */

import {
  logAudioDiagnostic,
  setAudioDiagnosticTabId,
  type AudioDiagnosticEventType
} from './audioDiagnostics';

export interface TabAudioOwnerRecord {
  ownerId: string;
  playing: boolean;
  metronomeOn: boolean;
  heartbeatAt: number;
  expiresAt: number;
}

export type TabAudioMessage =
  | { type: 'CLAIMED'; tabId: string }
  | { type: 'RELEASED'; tabId: string }
  | { type: 'TAKEOVER_REQUEST'; from: string }
  | { type: 'TAKEOVER_ACK'; from: string; granted: boolean }
  | { type: 'STATE'; tabId: string; playing: boolean; metronomeOn: boolean };

export interface TabAudioOwnershipSnapshot {
  tabId: string;
  ownerId: string | null;
  isOwner: boolean;
  /** Otra pestaña está reproduciendo audio AHORA (música/pre-roll). */
  otherTabPlaying: boolean;
  /** Otra pestaña tiene el metrónomo encendido. */
  otherTabMetronomeOn: boolean;
}

export interface TabAudioLifecycleHooks {
  /** La pestaña pasó a segundo plano sin reproducir → liberar control. */
  onHiddenIdle: () => void;
  /** La pestaña se está cerrando/navegando → liberar control. */
  onPageHide: () => void;
}

export interface TabAudioEnvironment {
  now(): number;
  read(): TabAudioOwnerRecord | null;
  write(record: TabAudioOwnerRecord | null): void;
  broadcast(message: TabAudioMessage): void;
  subscribe(listener: (message: TabAudioMessage) => void): () => void;
  /** Document listeners reales (no-op en tests/SSR). */
  attachLifecycle(hooks: TabAudioLifecycleHooks): () => void;
  sleep(ms: number): Promise<void>;
  startInterval(fn: () => void, ms: number): () => void;
}

export interface TabAudioCoordinatorOptions {
  tabId: string;
  env: TabAudioEnvironment;
  /** Frecuencia de renovación del lease del dueño. */
  heartbeatMs?: number;
  /** Vida del lease sin heartbeat (pestaña muerta/congelada). */
  leaseMs?: number;
  /** Tiempo máximo de espera del handshake de traspaso. */
  takeoverTimeoutMs?: number;
  /** Si el dueño dice "reproduciendo", reclamos se deniegan hasta este margen. */
  playingGraceMs?: number;
  /** Activa timers internos (false en tests deterministas). */
  startTimers?: boolean;
  /** Log opcional de eventos de ownership. */
  onEvent?: (event: string, details?: string) => void;
}

const STORAGE_KEY = 'skatecoreo_audio_owner_v1';
const TAB_ID_KEY = 'skatecoreo_tab_id';
const CHANNEL_NAME = 'skatecoreo-audio-owner';

export function createTabId(): string {
  try {
    const existing = sessionStorage.getItem(TAB_ID_KEY);
    if (existing) return existing;
  } catch {
    /* almacenamiento restringido */
  }
  const random = Math.random().toString(36).slice(2, 8);
  const id = `tab_${Date.now().toString(36)}_${random}`;
  try {
    sessionStorage.setItem(TAB_ID_KEY, id);
  } catch {
    /* ignorar */
  }
  return id;
}

export class TabAudioCoordinator {
  public readonly tabId: string;
  private env: TabAudioEnvironment;
  private heartbeatMs: number;
  private leaseMs: number;
  private takeoverTimeoutMs: number;
  private playingGraceMs: number;
  private startTimers: boolean;
  private onEvent?: (event: string, details?: string) => void;

  private ownerId: string | null;
  private otherTabPlaying = false;
  private otherTabMetronomeOn = false;

  private myPlaying = false;
  private myMetronomeOn = false;

  private listeners = new Set<(snapshot: TabAudioOwnershipSnapshot) => void>();
  private ackWaiters: Array<(granted: boolean) => void> = [];
  private stopHeartbeat: (() => void) | null = null;
  private detachLifecycle: (() => void) | null = null;
  private detachMessages: (() => void) | null = null;

  constructor(options: TabAudioCoordinatorOptions) {
    this.tabId = options.tabId;
    this.env = options.env;
    this.heartbeatMs = options.heartbeatMs ?? 5000;
    this.leaseMs = options.leaseMs ?? 20000;
    this.takeoverTimeoutMs = options.takeoverTimeoutMs ?? 900;
    this.playingGraceMs = options.playingGraceMs ?? 45000;
    this.startTimers = options.startTimers ?? true;
    this.onEvent = options.onEvent;

    const record = this.env.read();
    this.ownerId = record && record.expiresAt > this.env.now() ? record.ownerId : null;
    if (record && record.ownerId !== this.tabId) {
      this.otherTabPlaying = record.playing;
      this.otherTabMetronomeOn = record.metronomeOn;
    }

    this.detachMessages = this.env.subscribe((message) => this.handleMessage(message));

    // Los hooks de ciclo de vida (visibility/pagehide) se registran siempre:
    // no son timers y son la vía para liberar el control al ocultar/cerrar.
    this.detachLifecycle = this.env.attachLifecycle({
      onHiddenIdle: () => this.handleHiddenIdle(),
      onPageHide: () => this.release('pagehide')
    });
  }

  // ── Consultas ─────────────────────────────────────────────────────────────

  public isOwner(): boolean {
    return this.ownerId === this.tabId;
  }

  public getOwnerId(): string | null {
    return this.ownerId;
  }

  public getSnapshot(): TabAudioOwnershipSnapshot {
    return {
      tabId: this.tabId,
      ownerId: this.ownerId,
      isOwner: this.isOwner(),
      otherTabPlaying: !this.isOwner() && this.otherTabPlaying,
      otherTabMetronomeOn: !this.isOwner() && this.otherTabMetronomeOn
    };
  }

  /** ¿Otra pestaña está sonando (música o metrónomo)? */
  public isOtherTabAudible(): boolean {
    return !this.isOwner() && (this.otherTabPlaying || this.otherTabMetronomeOn);
  }

  public onChange(listener: (snapshot: TabAudioOwnershipSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public destroy(): void {
    this.stopHeartbeat?.();
    this.detachLifecycle?.();
    this.detachMessages?.();
    this.stopHeartbeat = null;
    this.detachLifecycle = null;
    this.detachMessages = null;
    this.listeners.clear();
  }

  // ── Adquisición ───────────────────────────────────────────────────────────

  /**
   * Intento SÍNCRONO (ruta común, una sola pestaña):
   *  · sin dueño / lease caducado / soy el dueño → adquiere y devuelve true;
   *  · otra pestaña inactiva → solicita traspaso (async) y devuelve false;
   *  · otra pestaña REPRODUCIENDO → deniega y devuelve false.
   */
  public tryClaimNow(reason: string): boolean {
    if (this.isOwner()) return true;

    const record = this.env.read();
    const now = this.env.now();
    if (record && record.ownerId !== this.tabId) {
      if (this.isForeignOwnerPlaying(record, now)) {
        this.log('TAB_OWNER_DENIED', `${reason}:playing:${record.ownerId}`);
        this.otherTabPlaying = true;
        this.emit();
        return false;
      }
      if (record.expiresAt > now) {
        // Dueño inactivo: se pide el traspaso; lo resolverá `claim()`.
        this.env.broadcast({ type: 'TAKEOVER_REQUEST', from: this.tabId });
        return false;
      }
      // Lease caducado y sin audio: la pestaña dueña está muerta → libre.
    }

    this.acquire(reason);
    return true;
  }

  /**
   * Intento ASÍNCRONO con handshake de traspaso. Nunca fuerza la salida de una
   * pestaña que está reproduciendo: en ese caso devuelve false (sin dos fuentes).
   */
  public async claim(reason: string): Promise<boolean> {
    if (this.isOwner()) return true;

    const record = this.env.read();
    const now = this.env.now();

    if (record && record.ownerId !== this.tabId) {
      if (this.isForeignOwnerPlaying(record, now)) {
        this.log('TAB_OWNER_DENIED', `${reason}:busy:${record.ownerId}`);
        this.otherTabPlaying = true;
        this.emit();
        return false;
      }
      if (record.expiresAt > now) {
        this.env.broadcast({ type: 'TAKEOVER_REQUEST', from: this.tabId });
        const granted = await this.waitForAck();
        if (!granted) {
          const after = this.env.read();
          const free = !after || after.ownerId === this.tabId || after.expiresAt <= this.env.now();
          if (!free) {
            this.log('TAB_OWNER_DENIED', `${reason}:no-ack:${after?.ownerId ?? 'none'}`);
            this.emit();
            return false;
          }
        }
      }
      // Lease caducado y sin audio: el dueño anterior está muerto → libre.
    }

    this.acquire(reason);
    return true;
  }

  /** El dueño actual (otra pestaña) permanece "vivo" reproduciendo. */
  private isForeignOwnerPlaying(record: TabAudioOwnerRecord, now: number): boolean {
    if (!record.playing) return false;
    // Si el heartbeat está reciente, aunque el lease figure vencido se respeta:
    // una pestaña que suena no se interrumpe jamás desde otra pestaña.
    return now - record.heartbeatAt <= this.playingGraceMs;
  }

  private acquire(reason: string): void {
    const now = this.env.now();
    this.ownerId = this.tabId;
    this.otherTabPlaying = false;
    this.otherTabMetronomeOn = false;
    this.writeOwnRecord(now);
    this.env.broadcast({ type: 'CLAIMED', tabId: this.tabId });
    this.startHeartbeatLoop();
    this.log('TAB_OWNER_CLAIMED', reason);
    this.emit();
  }

  /** Libera el control (si se posee). Idempotente. */
  public release(reason: string): void {
    if (!this.isOwner()) return;
    this.myPlaying = false;
    this.myMetronomeOn = false;
    this.ownerId = null;
    this.env.write(null);
    this.env.broadcast({ type: 'RELEASED', tabId: this.tabId });
    this.stopHeartbeat?.();
    this.stopHeartbeat = null;
    this.log('TAB_OWNER_RELEASED', reason);
    this.emit();
  }

  // ── Estado de reproducción del dueño ──────────────────────────────────────

  public setPlaying(playing: boolean): void {
    this.myPlaying = playing;
    if (this.isOwner()) {
      this.writeOwnRecord(this.env.now());
      this.env.broadcast({
        type: 'STATE',
        tabId: this.tabId,
        playing,
        metronomeOn: this.myMetronomeOn
      });
    }
    this.emit();
  }

  public setMetronomeOn(on: boolean): void {
    this.myMetronomeOn = on;
    if (this.isOwner()) {
      this.writeOwnRecord(this.env.now());
      this.env.broadcast({
        type: 'STATE',
        tabId: this.tabId,
        playing: this.myPlaying,
        metronomeOn: on
      });
    }
    this.emit();
  }

  public isPlayingHere(): boolean {
    return this.myPlaying;
  }

  // ── Ciclo interno ─────────────────────────────────────────────────────────

  /** Procesa expiraciones/renovaciones. Los timers reales lo llaman solo. */
  public tick(): void {
    const now = this.env.now();
    if (this.isOwner()) {
      this.writeOwnRecord(now);
      return;
    }
    const record = this.env.read();
    if (!record) {
      this.ownerId = null;
      this.otherTabPlaying = false;
      this.otherTabMetronomeOn = false;
      return;
    }
    if (record.ownerId !== this.tabId && record.expiresAt <= now && !this.isForeignOwnerPlaying(record, now)) {
      // Dueño muerto/congelado sin audio: el lease se considera libre.
      this.env.write(null);
      this.ownerId = null;
      this.otherTabPlaying = false;
      this.otherTabMetronomeOn = false;
    }
  }

  private handleHiddenIdle(): void {
    if (this.isOwner() && !this.myPlaying) {
      this.release('hidden-idle');
    } else if (this.isOwner()) {
      // Reproduciendo en segundo plano: renovar lease de inmediato.
      this.writeOwnRecord(this.env.now());
    }
  }

  private handleMessage(message: TabAudioMessage): void {
    switch (message.type) {
      case 'TAKEOVER_REQUEST': {
        if (!this.isOwner() || message.from === this.tabId) return;
        if (this.myPlaying) {
          this.env.broadcast({ type: 'TAKEOVER_ACK', from: this.tabId, granted: false });
          return;
        }
        this.release('takeover-granted');
        this.env.broadcast({ type: 'TAKEOVER_ACK', from: this.tabId, granted: true });
        break;
      }
      case 'TAKEOVER_ACK': {
        if (message.from === this.tabId) return;
        const waiters = this.ackWaiters;
        this.ackWaiters = [];
        for (const resolve of waiters) resolve(message.granted);
        break;
      }
      case 'CLAIMED': {
        if (message.tabId === this.tabId) return;
        if (this.isOwner() && this.myPlaying) {
          // Reafirma la propiedad: una pestaña que suena no puede ser desplazada.
          this.writeOwnRecord(this.env.now());
          return;
        }
        if (this.isOwner()) this.release('claimed-by-other');
        this.ownerId = message.tabId;
        this.otherTabPlaying = false;
        this.emit();
        break;
      }
      case 'RELEASED': {
        if (message.tabId === this.tabId) return;
        if (this.ownerId === message.tabId) {
          this.ownerId = null;
        }
        this.otherTabPlaying = false;
        this.otherTabMetronomeOn = false;
        this.emit();
        break;
      }
      case 'STATE': {
        if (message.tabId === this.tabId) return;
        this.otherTabPlaying = message.playing;
        this.otherTabMetronomeOn = message.metronomeOn;
        this.emit();
        break;
      }
    }
  }

  private waitForAck(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.ackWaiters.push(resolve);
      void this.env.sleep(this.takeoverTimeoutMs).then(() => {
        const index = this.ackWaiters.indexOf(resolve);
        if (index >= 0) {
          this.ackWaiters.splice(index, 1);
          resolve(false);
        }
      });
    });
  }

  private writeOwnRecord(now: number): void {
    this.env.write({
      ownerId: this.tabId,
      playing: this.myPlaying,
      metronomeOn: this.myMetronomeOn,
      heartbeatAt: now,
      expiresAt: now + this.leaseMs
    });
  }

  private startHeartbeatLoop(): void {
    if (!this.startTimers || this.stopHeartbeat) return;
    this.stopHeartbeat = this.env.startInterval(() => this.tick(), this.heartbeatMs);
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        /* un listener roto no afecta al ownership */
      }
    }
  }

  private log(event: string, details?: string): void {
    this.onEvent?.(event, details);
  }
}

// ── Entorno de navegador real ───────────────────────────────────────────────

function createBrowserEnvironment(onLog?: (event: string, details?: string) => void): TabAudioEnvironment {
  let channel: BroadcastChannel | null = null;
  try {
    channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
  } catch {
    channel = null;
  }

  const storage = (() => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null; // modo privado estricto
    }
  })();

  const read = (): TabAudioOwnerRecord | null => {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as TabAudioOwnerRecord;
      if (!parsed || typeof parsed.ownerId !== 'string') return null;
      return parsed;
    } catch {
      return null;
    }
  };

  return {
    now: () => Date.now(),
    read,
    write: (record) => {
      try {
        if (!storage) return;
        if (record) storage.setItem(STORAGE_KEY, JSON.stringify(record));
        else storage.removeItem(STORAGE_KEY);
      } catch {
        /* cuota o bloqueo */
      }
    },
    broadcast: (message) => {
      try {
        if (channel) {
          channel.postMessage(message);
          return;
        }
        // Respaldo sin BroadcastChannel: mensaje efímero en localStorage.
        if (storage) {
          storage.setItem(
            `${CHANNEL_NAME}-msg`,
            JSON.stringify({ id: `${Date.now()}_${Math.random()}`, message })
          );
        }
      } catch {
        /* ignorar */
      }
      void onLog;
    },
    subscribe: (listener) => {
      if (channel) {
        const handler = (event: MessageEvent) => listener(event.data as TabAudioMessage);
        channel.addEventListener('message', handler);
        return () => channel?.removeEventListener('message', handler);
      }
      if (typeof window === 'undefined' || !storage) return () => {};
      const handler = (event: StorageEvent) => {
        if (event.key !== `${CHANNEL_NAME}-msg` || !event.newValue) return;
        try {
          const parsed = JSON.parse(event.newValue) as { message: TabAudioMessage };
          if (parsed?.message) listener(parsed.message);
        } catch {
          /* mensaje corrupto */
        }
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
    attachLifecycle: (hooks) => {
      if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') hooks.onHiddenIdle();
      };
      const onPageHide = () => hooks.onPageHide();
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', onPageHide);
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', onPageHide);
      };
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    startInterval: (fn, ms) => {
      const id = window.setInterval(fn, ms);
      return () => window.clearInterval(id);
    }
  };
}

/** Entorno neutro (SSR/Node): sin pestañas → esta instancia siempre es dueña. */
function createNullEnvironment(): TabAudioEnvironment {
  return {
    now: () => Date.now(),
    read: () => null,
    write: () => {},
    broadcast: () => {},
    subscribe: () => () => {},
    attachLifecycle: () => () => {},
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    startInterval: (fn, ms) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    }
  };
}

/**
 * Instancia única del coordinador. En navegador usa el entorno real; en Node/SSR
 * un entorno neutro donde la instancia es dueña (un solo contexto JS).
 * Se puede sustituir en tests del motor con `__setOwnershipForTests`.
 */
export const tabAudioCoordinator: TabAudioCoordinator =
  typeof window !== 'undefined'
    ? (() => {
        const tabId = createTabId();
        // Publica la identidad de pestaña para `__SKATECOREO_BUILD__` y logs.
        (window as any).__SKATECOREO_TAB_ID__ = tabId;
        return new TabAudioCoordinator({
          tabId,
          env: createBrowserEnvironment(),
          onEvent: (event, details) => {
            setAudioDiagnosticTabId(tabId);
            logAudioDiagnostic(event as AudioDiagnosticEventType, { details });
          }
        });
      })()
    : new TabAudioCoordinator({ tabId: 'node_single', env: createNullEnvironment(), startTimers: false });

/** Fábrica para tests deterministas. */
export function createTabAudioCoordinatorForTests(
  options: Omit<TabAudioCoordinatorOptions, 'startTimers'>
): TabAudioCoordinator {
  return new TabAudioCoordinator({ ...options, startTimers: false });
}
