/**
 * deviceFormFactor.ts — Clasificación de factor de forma de SkateCoreo.
 *
 * OBJETIVO
 * --------
 * Decidir si la app debe usar la composición de ESCRITORIO o la de MÓVIL.
 * El error histórico era clasificar como «móvil» a cualquier dispositivo
 * táctil o a cualquier viewport estrecho, obligando a tablets de 7" o más
 * (p. ej. 1024×600 en horizontal) a una experiencia apilada de teléfono.
 *
 * PRINCIPIO
 * ---------
 *  - CELULAR   → Mobile UI (portrait-first, compacta, táctil).
 *  - TABLET ≥7" → Desktop UI (landscape-first, amplia, táctil).
 *  - DESKTOP   → Desktop UI.
 *
 * NO se detectan «pulgadas físicas»: un navegador no puede saberlo de forma
 * fiable (`screen.width` depende de resolución, DPR, zoom y escalado). En su
 * lugar se combinan CAPACIDADES + ESPACIO REAL + ORIENTACIÓN, tomando 7" como
 * objetivo de diseño:
 *
 *  - touch real (`navigator.maxTouchPoints` / `ontouchstart`);
 *  - tipo de puntero (`pointer: coarse`, `hover: none`);
 *  - espacio CSS disponible (ancho/alto reales del viewport);
 *  - orientación actual;
 *  - pistas de User-Agent SOLO como desempate (iPad, Android tablet, etc.).
 *
 * Es una función PURA para poder probarla sin DOM.
 */

export type FormFactor = 'phone' | 'tablet' | 'desktop';

/** Modo de composición visual derivado del factor de forma. */
export type LayoutMode = 'mobile' | 'desktop';

/** Lado corto mínimo (CSS px) de una pantalla de clase tablet (≈7"). */
export const TABLET_MIN_SHORT_SIDE = 600;

/** Lado largo mínimo (CSS px) para considerar espacio de tablet. */
export const TABLET_MIN_LONG_SIDE = 900;

/** Ancho de trabajo mínimo (CSS px) para ofrecer composición de escritorio. */
export const TABLET_MIN_WORKSPACE = 768;

export interface DeviceCapabilities {
  /** Ancho CSS real disponible. */
  width: number;
  /** Alto CSS real disponible. */
  height: number;
  /** Hay pantalla táctil (aunque exista además ratón/trackpad). */
  hasTouch: boolean;
  /** El puntero principal es grueso (dedo). */
  coarsePointer: boolean;
  /** El dispositivo no tiene hover (típico de tablet). */
  noHover: boolean;
  /** UA reconocido como iPad / Android tablet / tablet genérica. */
  userAgentIsTablet: boolean;
  /** UA reconocido como teléfono (iPhone, Android Mobile, etc.). */
  userAgentIsPhone: boolean;
  /** UA reconocido como ordenador (Windows/macOS/ChromeOS/Linux). */
  userAgentIsDesktop: boolean;
}

/** Espacio de trabajo mínimo garantizado por el viewport actual. */
export function hasDesktopWorkspace(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  return Math.max(width, height) >= TABLET_MIN_WORKSPACE && width >= TABLET_MIN_SHORT_SIDE;
}

/**
 * Clasifica el dispositivo. Devuelve el factor de forma SIN depender de un
 * único breakpoint: usa capacidades, espacio disponible y UA como desempate.
 */
export function classifyFormFactor(caps: DeviceCapabilities): FormFactor {
  const { width, height, hasTouch, coarsePointer, noHover } = caps;

  if (width <= 0 || height <= 0) return 'desktop';

  const minSide = Math.min(width, height);
  const maxSide = Math.max(width, height);
  // Clase tablet real: lado corto ≥ 600 y lado largo ≥ 900 (≈7"+).
  const hasTabletSurface = minSide >= TABLET_MIN_SHORT_SIDE && maxSide >= TABLET_MIN_LONG_SIDE;

  // Pistas explícitas del UA (iPad, Android tablet, Kindle...) mandan, incluso
  // si el navegador no expone bien la capacidad táctil.
  if (caps.userAgentIsTablet) return 'tablet';
  if (caps.userAgentIsPhone) return hasTabletSurface ? 'tablet' : 'phone';

  if (!hasTouch) return 'desktop';

  const touchOnly = coarsePointer && noHover;
  // Un ordenador táctil (laptop/2-en-1 con ratón) sigue siendo escritorio,
  // salvo que se comporte como tablet puro (puntero grueso y sin hover).
  if (caps.userAgentIsDesktop && !touchOnly) return 'desktop';

  if (hasTabletSurface) return 'tablet';

  // Dispositivo táctil desconocido: manda el espacio real disponible.
  if (hasDesktopWorkspace(width, height) && maxSide >= TABLET_MIN_LONG_SIDE) return 'tablet';

  return 'phone';
}

/** Traduce el factor de forma al modo de composición visual. */
export function getLayoutMode(formFactor: FormFactor): LayoutMode {
  return formFactor === 'phone' ? 'mobile' : 'desktop';
}

/** Orientación preferida por factor de forma (guía de producto). */
export function getPreferredOrientation(formFactor: FormFactor): 'portrait' | 'landscape' {
  if (formFactor === 'phone') return 'portrait';
  if (formFactor === 'tablet') return 'landscape';
  return 'landscape';
}

/** Lee las capacidades reales del entorno (seguro sin DOM). */
export function readDeviceCapabilities(): DeviceCapabilities {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      width: 0,
      height: 0,
      hasTouch: false,
      coarsePointer: false,
      noHover: false,
      userAgentIsTablet: false,
      userAgentIsPhone: false,
      userAgentIsDesktop: true,
    };
  }

  const docEl = typeof document !== 'undefined' ? document.documentElement : null;
  const width =
    window.innerWidth || docEl?.clientWidth || (typeof screen !== 'undefined' ? screen.width : 0) || 0;
  const height =
    window.innerHeight || docEl?.clientHeight || (typeof screen !== 'undefined' ? screen.height : 0) || 0;

  const nav = navigator as Navigator & { platform?: string };
  const maxTouchPoints = nav.maxTouchPoints || 0;
  const hasTouch = maxTouchPoints > 0 || 'ontouchstart' in window;

  const hasMatchMedia = typeof window.matchMedia === 'function';
  const coarsePointer = hasMatchMedia ? window.matchMedia('(pointer: coarse)').matches : hasTouch;
  const noHover = hasMatchMedia ? window.matchMedia('(hover: none)').matches : hasTouch;

  const ua = (nav.userAgent || '').toLowerCase();

  // iPadOS 13+ se identifica como MacIntel con múltiples puntos táctiles.
  const userAgentIsIPad = /ipad/.test(ua) || (nav.platform === 'MacIntel' && maxTouchPoints > 1);

  const userAgentIsTablet =
    userAgentIsIPad ||
    (/android/.test(ua) && !/mobile/.test(ua)) ||
    /tablet|kindle|silk|playbook/.test(ua);

  const userAgentIsPhone =
    !userAgentIsTablet &&
    (/iphone|ipod|windows phone|iemobile|blackberry|opera mini/.test(ua) ||
      (/android/.test(ua) && /mobile/.test(ua)));

  const userAgentIsDesktop =
    !userAgentIsIPad &&
    !userAgentIsPhone &&
    !userAgentIsTablet &&
    /windows nt|cros|mac os x|macintosh|x11|linux x86_64|linux aarch64/.test(ua);

  return {
    width,
    height,
    hasTouch,
    coarsePointer,
    noHover,
    userAgentIsTablet,
    userAgentIsPhone,
    userAgentIsDesktop,
  };
}
