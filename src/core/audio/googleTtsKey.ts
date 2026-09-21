/**
 * googleTtsKey — Resolución centralizada de la credencial de Google Cloud TTS.
 *
 * La app YA INCLUYE su propia credencial inyectada en tiempo de compilación
 * (`.env` en local y variables de entorno de Vercel en producción), de modo que
 * el usuario final NUNCA tiene que introducir una API Key.
 *
 * Orden de prioridad:
 *   1. Clave de la aplicación (`VITE_GOOGLE_TTS_API_KEY`) — fuente oficial.
 *   2. Clave local opcional guardada por el usuario — solo como respaldo para
 *      auto-hospedaje o desarrollo, cuando no existe (1).
 */

const STORAGE_KEYS = ['skatecoreo_google_tts_key', 'skateart_google_tts_key'];

/**
 * Clave incrustada en el bundle al compilar.
 *
 * IMPORTANTE: la expresión debe escribirse LITERALMENTE como
 * `import.meta.env.VITE_GOOGLE_TTS_API_KEY`. Vite la sustituye de forma estática
 * durante el build; si se asigna `import.meta.env` a una variable intermedia o
 * se castea el tipo, el reemplazo NO ocurre y la clave no llega al bundle.
 * El `try/catch` permite importar este módulo también desde Node (tests).
 */
const BUILT_IN_API_KEY: string = (() => {
  try {
    if (
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.VITE_GOOGLE_TTS_API_KEY
    ) {
      return String(import.meta.env.VITE_GOOGLE_TTS_API_KEY).trim();
    }
  } catch (e) {
    /* entorno sin import.meta.env (Node/tsx) */
  }

  try {
    if (
      typeof process !== 'undefined' &&
      process.env &&
      process.env.VITE_GOOGLE_TTS_API_KEY
    ) {
      return String(process.env.VITE_GOOGLE_TTS_API_KEY).trim();
    }
  } catch (e) {
    /* entorno sin process.env */
  }

  return '';
})();

/** Clave propia de la aplicación (incluida en el build). */
export function getBuiltInGoogleTtsApiKey(): string {
  return BUILT_IN_API_KEY;
}

/** ¿La app ya trae credencial incluida? Si es así, no se pide nada al usuario. */
export function hasBuiltInGoogleTtsApiKey(): boolean {
  return BUILT_IN_API_KEY.length > 5;
}

/** Clave introducida manualmente por el usuario (solo respaldo). */
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

/**
 * Clave efectiva para llamar a Google Cloud TTS.
 * La credencial de la app siempre gana; la del usuario es el último recurso.
 */
export function resolveGoogleTtsApiKey(): string {
  return BUILT_IN_API_KEY || getUserGoogleTtsApiKey();
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
