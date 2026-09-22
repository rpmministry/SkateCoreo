import { useCallback, useEffect, useRef } from 'react';

/**
 * useIosFileCapture — Ingesta fiable de archivos en iOS/iPadOS (WebKit).
 *
 * ── EL PROBLEMA ─────────────────────────────────────────────────────────────
 * En Safari (iOS/iPadOS) y otros navegadores WebKit, cuando el usuario elige un
 * audio desde la app **Archivos**, el evento `change` del `<input type="file">`
 * puede NO dispararse (o llegar tarde), porque el sistema suspende la pestaña al
 * abrir la hoja de selección. Resultado: el archivo queda elegido pero la app
 * nunca arranca la carga.
 *
 * ── LA SOLUCIÓN (adaptada de la de TeoDoc) ──────────────────────────────────
 * Se escuchan los TRES momentos en los que el archivo ya podría estar listo:
 *  1. `change` del propio input (comportamiento estándar).
 *  2. `focus` de `window` (al volver de la hoja del sistema).
 *  3. `visibilitychange` de `document` cuando la página vuelve a `visible`.
 * Cada disparo relee con reintentos escalonados (inmediato, 300 ms y 1000 ms),
 * porque `.files` puede poblarse con retraso. La lectura es IDEMPOTENTE: se
 * deduplica por `nombre:tamaño:últimaModificación` dentro de una ventana corta,
 * de modo que los reintentos (y el `onChange` de React) no lanzan cargas
 * repetidas, pero SÍ se puede volver a elegir el mismo archivo más adelante.
 * Tras leer, el input se limpia (`value = ''`).
 */
const DEDUPE_WINDOW_MS = 1200;

export function useIosFileCapture(
  inputRef: React.MutableRefObject<HTMLInputElement | null>,
  onFile: (file: File) => void
): { handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void } {
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;

  // Último archivo procesado + instante: deduplica SOLO los reintentos de una
  // misma selección, no una nueva elección del mismo archivo.
  const lastProcessedRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const timersRef = useRef<number[]>([]);

  const clearRetryTimers = useCallback(() => {
    for (const id of timersRef.current) globalThis.clearTimeout(id);
    timersRef.current = [];
  }, []);

  const read = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;

    const key = `${file.name}:${file.size}:${file.lastModified}`;
    const now = Date.now();
    const last = lastProcessedRef.current;
    if (key === last.key && now - last.at < DEDUPE_WINDOW_MS) {
      // Reintento del mismo evento: ya procesado (o en curso).
      return;
    }
    lastProcessedRef.current = { key, at: now };

    // Se limpia SIEMPRE tras procesar para permitir volver a elegir el mismo
    // archivo; así los reintentos posteriores ven `files` vacío y no repiten.
    try {
      input.value = '';
    } catch {
      /* Algunos WebKit antiguos no permiten limpiar el valor: se ignora. */
    }

    onFileRef.current(file);
  }, [inputRef]);

  const readWithRetries = useCallback(() => {
    // Coalesce: se cancelan los reintentos anteriores antes de programar los
    // nuevos, así el array nunca acumula IDs ya disparados.
    clearRetryTimers();
    read();
    timersRef.current.push(globalThis.setTimeout(read, 300) as unknown as number);
    timersRef.current.push(globalThis.setTimeout(read, 1000) as unknown as number);
  }, [clearRetryTimers, read]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const onVisibility = () => {
      if (document.visibilityState === 'visible') readWithRetries();
    };

    window.addEventListener('focus', readWithRetries);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', readWithRetries);
      document.removeEventListener('visibilitychange', onVisibility);
      clearRetryTimers();
    };
  }, [clearRetryTimers, readWithRetries]);

  const handleChange = useCallback(() => {
    readWithRetries();
  }, [readWithRetries]);

  return { handleChange };
}
