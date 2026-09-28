/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Ruta del endpoint propio de síntesis de voz.
   * Por defecto `/api/tts`. La credencial de Google Cloud vive en el SERVIDOR
   * (variable `GOOGLE_TTS_API_KEY`), nunca en el bundle del cliente.
   */
  readonly VITE_TTS_PROXY_PATH?: string;
  /** `'true'` desactiva el endpoint propio (auto-hospedaje con clave local). */
  readonly VITE_TTS_PROXY_DISABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Identidad de BUILD inyectada por `vite.config.ts` (define). Permite comprobar
 * desde un móvil/tablet REAL qué versión exacta está ejecutando el navegador
 * (diagnóstico de cachés/PWA/Service Worker obsoletos).
 */
declare const __BUILD_VERSION__: string;
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIMESTAMP__: string;
