/**
 * studioTrackOrdering.ts — Reordenación PURA de pistas del Estudio.
 *
 * El arreglo visual del multitrack (`arrangementTracks`) es:
 *
 *   [ Pista Master (0), Grabación (1), ...pistas adicionales (2..n) ]
 *
 * Por tanto el índice VISUAL de una pista adicional es `additionalIndex + 2`.
 * Estas funciones centralizan esa conversión y eliminan el off-by-one clásico
 * que movía la pista equivocada al usar los botones «Subir/Bajar Pista» del
 * menú de pista (regresión reportada en móvil/tablet).
 */

export const ARRANGEMENT_PREFIX_TRACKS = 2;

/**
 * Convierte un índice visual del arreglo en el índice dentro de
 * `additionalTracks`. Devuelve `null` para Master/Grabación o índices inválidos.
 */
export function additionalIndexFromArrangementIndex(
  arrangementIndex: number
): number | null {
  if (!Number.isFinite(arrangementIndex)) return null;
  const index = Math.trunc(arrangementIndex) - ARRANGEMENT_PREFIX_TRACKS;
  return index >= 0 ? index : null;
}

export type TrackMoveDirection = 'up' | 'down';

/**
 * Devuelve una COPIA con la pista adicional movida una posición. Es idempotente
 * y segura en los extremos: si el movimiento no es posible, devuelve la MISMA
 * referencia (no genera renders ni historial).
 */
export function moveAdditionalTrack<T>(
  list: readonly T[],
  arrangementIndex: number,
  direction: TrackMoveDirection
): T[] {
  const index = additionalIndexFromArrangementIndex(arrangementIndex);
  if (index === null || index >= list.length) return list as T[];

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return list as T[];

  const next = [...list];
  const temp = next[index];
  next[index] = next[target];
  next[target] = temp;
  return next;
}

/** ¿Es posible mover la pista en esa dirección? (estado de los botones). */
export function canMoveAdditionalTrack(
  list: readonly unknown[],
  arrangementIndex: number,
  direction: TrackMoveDirection
): boolean {
  const index = additionalIndexFromArrangementIndex(arrangementIndex);
  if (index === null || index >= list.length) return false;
  const target = direction === 'up' ? index - 1 : index + 1;
  return target >= 0 && target < list.length;
}
