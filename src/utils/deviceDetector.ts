/**
 * deviceDetector.ts — Hardware Fingerprinting y Detección de Dispositivos para SkateCoreo
 *
 * Implementa la regla estricta anti-piratería:
 *  - Máx. 1 Celular ('mobile')
 *  - Máx. 1 Tablet ('tablet')
 *  - Máx. 1 Computadora ('desktop')
 * Total máximo permitido: 3 dispositivos por cuenta.
 */

import { classifyFormFactor, readDeviceCapabilities } from './deviceFormFactor';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

const DEVICE_ID_KEY = 'skatecoreo_device_id';

/**
 * Obtiene o crea un UUID único y persistente para este dispositivo en localStorage.
 */
export function getDeviceId(): string {
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY) || localStorage.getItem('skateart_device_id');
    if (!deviceId) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        deviceId = crypto.randomUUID();
      } else {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      }
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return 'dev_fallback_' + Date.now();
  }
}

/**
 * Detecta si el entorno actual es Mobile, Tablet o Desktop de forma precisa.
 *
 * Usa la MISMA clasificación de capacidades que el layout (`deviceFormFactor`):
 * táctil + tipo de puntero + espacio real + orientación, con el UA solo como
 * desempate. Así una tablet de 7" en horizontal (1024×600) se registra como
 * 'tablet' y NUNCA como 'mobile', coherente con la interfaz que ve el usuario.
 */
/**
 * Caché de la clasificación. `getDeviceType()` se invoca en rutas de render
 * (p. ej. `AuthModal`), por lo que se evita re-medir el DOM y llamar a
 * `matchMedia` en cada render. La clave usa lecturas baratas (geometría, touch,
 * UA) y se recalcula cuando cambia el tamaño, el hardware táctil o el UA.
 */
let cachedDeviceType: { key: string; type: DeviceType } | null = null;

export function getDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'desktop';

  const nav = navigator as Navigator & { platform?: string };
  const ua = (nav.userAgent || '').toLowerCase();
  const width =
    window.innerWidth ||
    document.documentElement.clientWidth ||
    (typeof screen !== 'undefined' ? screen.width : 0) ||
    0;
  const height =
    window.innerHeight ||
    document.documentElement.clientHeight ||
    (typeof screen !== 'undefined' ? screen.height : 0) ||
    0;

  const key = `${width}x${height}|${nav.maxTouchPoints || 0}|${nav.platform || ''}|${ua}`;
  if (cachedDeviceType && cachedDeviceType.key === key) return cachedDeviceType.type;

  const formFactor = classifyFormFactor(readDeviceCapabilities());
  const type: DeviceType =
    formFactor === 'tablet' ? 'tablet' : formFactor === 'phone' ? 'mobile' : 'desktop';
  cachedDeviceType = { key, type };
  return type;
}

/**
 * Genera un nombre amigable del dispositivo (ej: 'Windows PC (Chrome)', 'iPhone (Safari)')
 */
export function getDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Dispositivo Desconocido';

  const ua = navigator.userAgent;
  let os = 'Dispositivo';

  if (/iPad|iPhone|iPod/.test(ua)) {
    os = /iPad/.test(ua) ? 'iPad' : 'iPhone';
  } else if (/Macintosh|Mac OS X/.test(ua)) {
    os = navigator.maxTouchPoints > 1 ? 'iPad Pro' : 'Mac';
  } else if (/Windows/.test(ua)) {
    os = 'PC Windows';
  } else if (/Android/.test(ua)) {
    os = /mobile/i.test(ua) ? 'Teléfono Android' : 'Tablet Android';
  } else if (/Linux/.test(ua)) {
    os = 'Linux';
  }

  let browser = '';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';

  return browser ? `${os} (${browser})` : os;
}

/**
 * Traduce el tipo de dispositivo a texto amigable para la interfaz de usuario.
 */
export function getDeviceTypeLabel(type: DeviceType): string {
  switch (type) {
    case 'mobile':
      return 'Teléfono Celular';
    case 'tablet':
      return 'Tablet';
    case 'desktop':
      return 'Computadora';
    default:
      return 'Dispositivo';
  }
}

