/**
 * workingSession.ts — Propiedad de los datos locales y limpieza entre cuentas.
 *
 * PROBLEMA QUE RESUELVE
 * Los datos de trabajo (pista cargada, coreografía en el lienzo, arreglo del
 * Estudio y la sesión offline de IndexedDB) se guardaban de forma GLOBAL en el
 * dispositivo. Al entrar con otra cuenta (p. ej. un código Beta Tester nuevo),
 * la app mostraba la sesión del usuario anterior.
 *
 * SOLUCIÓN
 * Se registra el `user id` dueño de los datos locales:
 *   · Sin dueño previo (primer uso)  → se adopta la cuenta sin borrar nada.
 *   · Misma cuenta                    → se conserva todo.
 *   · Cuenta distinta                 → se limpia la sesión de trabajo local.
 *
 * No se eliminan los catálogos del usuario (atletas/programas guardados); solo se
 * vacía la sesión de trabajo para que una cuenta nueva arranque en limpio.
 */

import { resetAbsoluteSession } from './sessionLifecycle';

const DATA_OWNER_KEY = 'skatecoreo_data_owner';

export function getDataOwnerId(): string | null {
  try {
    return localStorage.getItem(DATA_OWNER_KEY);
  } catch {
    return null;
  }
}

export function setDataOwnerId(id: string | null): void {
  try {
    if (id) localStorage.setItem(DATA_OWNER_KEY, id);
    else localStorage.removeItem(DATA_OWNER_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

/**
 * Vacía la sesión de trabajo local: audio cargado, coreografía del lienzo,
 * arreglo del Estudio y la sesión offline persistida en IndexedDB.
 */
export async function clearWorkingSession(): Promise<void> {
  await resetAbsoluteSession();
}

/**
 * Asegura que los datos locales pertenecen a la cuenta actual.
 * Devuelve `true` si se realizó una limpieza.
 */
export async function ensureDataOwnership(userId: string | null): Promise<boolean> {
  if (!userId) return false;

  const owner = getDataOwnerId();
  if (owner === userId) return false; // misma cuenta: intacto

  await resetAbsoluteSession();
  setDataOwnerId(userId);
  return true; // cuenta nueva/primera vez → limpiado
}

/** Cierra la propiedad (logout): limpia la sesión de trabajo y su dueño. */
export async function releaseWorkingSession(): Promise<void> {
  await resetAbsoluteSession();
  setDataOwnerId(null);
}
