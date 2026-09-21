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
