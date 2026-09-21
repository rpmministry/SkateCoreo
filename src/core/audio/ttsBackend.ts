/**
 * ttsBackend — Configuración del back-end de voz del CLIENTE.
 *
 * Modelo de seguridad (importante):
 * La credencial de Google Cloud TTS NO viaja en el bundle. La app llama a su
 * propio endpoint `POST /api/tts`, que la custodia en el servidor. El usuario
 * final no configura absolutamente nada.
 *
 * Solo para auto-hospedaje sin función serverless se admite una clave local
 * aportada por el usuario (se guarda en `localStorage` de su dispositivo).
 */

const DEFAULT_PROXY_PATH = '/api/tts';

/**
 * Ruta del proxy propio.
 *
 * IMPORTANTE: el acceso a `import.meta.env.*` debe ser literal para que Vite lo
 * sustituya en el build; asignar `import.meta.env` a una variable lo rompería.
 */
const PROXY_PATH: string = (() => {
  try {
    if (
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.VITE_TTS_PROXY_PATH
    ) {
      return String(import.meta.env.VITE_TTS_PROXY_PATH).trim() || DEFAULT_PROXY_PATH;
    }
  } catch (e) {
    /* entorno sin import.meta.env */
  }
  return DEFAULT_PROXY_PATH;
})();

/** Permite desactivar el proxy (auto-hospedaje con clave propia). */
const PROXY_DISABLED: boolean = (() => {
  try {
    if (
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.VITE_TTS_PROXY_DISABLED
    ) {
      return String(import.meta.env.VITE_TTS_PROXY_DISABLED).trim().toLowerCase() === 'true';
    }
  } catch (e) {
    /* entorno sin import.meta.env */
  }
  return false;
})();

const STORAGE_KEYS = ['skatecoreo_google_tts_key', 'skateart_google_tts_key'];

/** ¿Está habilitado el endpoint propio de síntesis? */
export function isTtsProxyEnabled(): boolean {
  return !PROXY_DISABLED;
}

/** URL del endpoint propio. */
export function getTtsProxyUrl(): string {
  return PROXY_PATH;
}

/** Clave aportada manualmente por el usuario (solo auto-hospedaje). */
export function getUserGoogleTtsApiKey(): string {
  if (typeof localStorage === 'undefined') return '';
  for (const key of STORAGE_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value && value.trim()) return value.trim();
    } catch (e) {
      /* localStorage bloqueado */
    }
  }
  return '';
}

export function hasUserGoogleTtsApiKey(): boolean {
  return getUserGoogleTtsApiKey().length > 5;
}

export function saveUserGoogleTtsApiKey(apiKey: string | null): void {
  if (typeof localStorage === 'undefined') return;
  const value = (apiKey || '').trim();
  try {
    if (value) {
      localStorage.setItem(STORAGE_KEYS[0], value);
    } else {
      STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    }
  } catch (e) {
    /* almacenamiento no disponible */
  }
}

export function clearUserGoogleTtsApiKey(): void {
  saveUserGoogleTtsApiKey(null);
}

/**
 * ¿Hay voz natural disponible en este dispositivo?
 * Con el endpoint propio siempre lo está; sin él, solo si el usuario aportó
 * su propia clave.
 */
export function hasNaturalVoiceBackend(): boolean {
  return isTtsProxyEnabled() || hasUserGoogleTtsApiKey();
}
