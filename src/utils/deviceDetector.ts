/**
 * deviceDetector.ts — Hardware Fingerprinting y Detección de Dispositivos para SkateCoreo
 *
 * Implementa la regla estricta anti-piratería:
 *  - Máx. 1 Celular ('mobile')
 *  - Máx. 1 Tablet ('tablet')
 *  - Máx. 1 Computadora ('desktop')
 * Total máximo permitido: 3 dispositivos por cuenta.
 */

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
 * Combina User-Agent, capacidades táctiles (maxTouchPoints) y dimensiones de pantalla.
 */
export function getDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'desktop';

  const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || '').toLowerCase();
  const width = window.innerWidth || document.documentElement.clientWidth || screen.width;
  const height = window.innerHeight || document.documentElement.clientHeight || screen.height;
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const minDim = Math.min(width, height);
  const maxDim = Math.max(width, height);

  // 1. Detección específica de iPads (incluyendo iPad Pro con iPadOS identificándose como MacIntel con touch)
  const isIPad = /ipad/.test(ua) || (navigator.platform === 'MacIntel' && maxTouchPoints > 1);

  // 2. Detección de Tablets Android (Android sin la palabra "mobile" o con "tablet")
  const isAndroidTablet = /android/.test(ua) && (!/mobile/.test(ua) || /tablet/.test(ua));

  // 3. Otras tablets genéricas
  const isGenericTablet = /kindle|silk|playbook|nexus (7|9|10)|sm-t|tab/.test(ua);

  if (isIPad || isAndroidTablet || isGenericTablet) {
    return 'tablet';
  }

  // 4. Si tiene pantalla táctil y resolución típica de tablet (ancho entre 768px y 1024px o minDim >= 600px en móvil)
  if (maxTouchPoints > 0) {
    if (minDim >= 600 && maxDim <= 1366 && width >= 768 && width <= 1024) {
      return 'tablet';
    }
    if (width < 768 || /iphone|ipod|android.*mobile|windows phone|blackberry/.test(ua)) {
      return 'mobile';
    }
  }

  // 5. Umbrales basados en ancho de pantalla
  if (width < 768) {
    return 'mobile';
  }

  if (width >= 768 && width <= 1024) {
    return 'tablet';
  }

  return 'desktop';
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

