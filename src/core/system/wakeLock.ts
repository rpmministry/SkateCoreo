/**
 * Gestor de Pantalla Activa (Screen Wake Lock API).
 *
 * Impide que la pantalla de teléfonos y tabletas (iOS Safari 16.4+, Android
 * Chrome) se apague automáticamente mientras la app decodifica y analiza un
 * audio pesado. Bloquear la pantalla en iOS suspende la pestaña y puede dejar la
 * carga a medias, así que el bloqueo se adquiere al empezar y se libera al
 * terminar o fallar. Si el usuario cambia de app y regresa, se vuelve a adquirir
 * al detectar `visibilitychange` con la página en estado `visible`.
 *
 * Es seguro ante navegadores sin soporte o restricciones de permisos.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wakeLockSentinel: any = null;
let procesoActivo = false;
let listenerRegistrado = false;

/** Solicita el bloqueo de apagado de pantalla al navegador. */
export async function adquirirPantallaActiva(): Promise<boolean> {
  procesoActivo = true;

  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!('wakeLock' in navigator) || typeof (navigator as any).wakeLock?.request !== 'function') {
    return false;
  }

  try {
    // Si ya hay un bloqueo activo, no duplicar.
    if (wakeLockSentinel && !wakeLockSentinel.released) {
      return true;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });

    // Re-adquisición tras minimizar y volver a la app.
    if (!listenerRegistrado && typeof document !== 'undefined') {
      listenerRegistrado = true;
      document.addEventListener('visibilitychange', async () => {
        if (procesoActivo && document.visibilityState === 'visible') {
          await adquirirPantallaActiva();
        }
      });
    }

    return true;
  } catch (err) {
    // El navegador puede rechazar el wake lock en modo de ahorro extremo.
    console.warn('[WakeLock] No se pudo activar el bloqueo de pantalla:', err);
    return false;
  }
}

/** Libera el bloqueo de pantalla al finalizar el análisis o ante un error. */
export async function liberarPantallaActiva(): Promise<void> {
  procesoActivo = false;

  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {
      /* Ignorar si ya fue liberado. */
    } finally {
      wakeLockSentinel = null;
    }
  }
}
