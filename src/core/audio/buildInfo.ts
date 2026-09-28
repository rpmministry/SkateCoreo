/**
 * buildInfo.ts — Identidad de la versión que se está EJECUTANDO en el dispositivo.
 *
 * Por qué existe: en Android (Chrome/Brave) una PWA/Service Worker podía seguir
 * sirviendo un bundle anterior y cualquier corrección parecía "no reflejarse".
 * Con esta identidad se puede comprobar desde el propio teléfono qué build corre:
 *
 *   · HUD de audio con `?audioDebug=1`
 *   · consola: `__SKATECOREO_BUILD__`
 *   · cualquier evento de `audioDiagnostics` incluye `build=...`
 */

export interface BuildInfo {
  version: string;
  commit: string;
  timestamp: string;
}

function safeGlobal<T>(getter: () => T, fallback: T): T {
  try {
    return getter();
  } catch {
    return fallback;
  }
}

export function getBuildInfo(): BuildInfo {
  return {
    version: safeGlobal(() => __BUILD_VERSION__, 'dev'),
    commit: safeGlobal(() => __BUILD_COMMIT__, 'unknown'),
    timestamp: safeGlobal(() => __BUILD_TIMESTAMP__, 'unknown')
  };
}

/** Etiqueta corta y estable para logs: `v1.0.0+abc1234`. */
export function getBuildLabel(): string {
  const { version, commit } = getBuildInfo();
  return `v${version}+${commit}`;
}

if (typeof window !== 'undefined') {
  (window as any).__SKATECOREO_BUILD__ = {
    ...getBuildInfo(),
    label: getBuildLabel(),
    get tabId(): string | null {
      return (window as any).__SKATECOREO_TAB_ID__ ?? null;
    }
  };
}
