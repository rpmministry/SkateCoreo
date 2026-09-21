/**
 * zeroCrossing — Corte milimétrico sin clics (click-free editing).
 *
 * Un corte arbitrario en medio de una muestra deja un salto brusco de amplitud
 * que se percibe como un "clic" audible. Ajustando el punto de corte al cruce
 * por cero más cercano (dentro de una ventana de pocos milisegundos) el corte
 * es imperceptible y milimétrico.
 */

/**
 * Devuelve el tiempo (segundos) del cruce por cero más cercano al tiempo pedido.
 * Si no hay ningún cruce en la ventana, devuelve el tiempo original redondeado
 * a la muestra exacta.
 *
 * @param buffer    AudioBuffer de origen
 * @param timeSec   Punto de corte deseado en segundos
 * @param maxWindowMs Ventana máxima de búsqueda en milisegundos (por lado)
 */
export function snapToZeroCrossing(
  buffer: AudioBuffer,
  timeSec: number,
  maxWindowMs: number = 4
): number {
  const sampleRate = buffer.sampleRate;
  if (!sampleRate || buffer.length === 0) return timeSec;

  const data = buffer.getChannelData(0);
  const lastIndex = data.length - 1;
  const center = Math.max(0, Math.min(lastIndex, Math.round(timeSec * sampleRate)));

  if (center === 0 || center === lastIndex) {
    return center / sampleRate;
  }

  const windowSamples = Math.max(1, Math.round((maxWindowMs / 1000) * sampleRate));
  const from = Math.max(1, center - windowSamples);
  const to = Math.min(lastIndex, center + windowSamples);

  let bestIndex = center;
  let bestDistance = Number.POSITIVE_INFINITY;

  // Preferimos un cruce ascendente (negativo -> positivo) para una fase neutra.
  let fallbackIndex = -1;
  let fallbackDistance = Number.POSITIVE_INFINITY;

  for (let i = from; i <= to; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    const ascending = prev <= 0 && curr >= 0;
    const descending = prev >= 0 && curr <= 0;

    if (ascending || descending) {
      const distance = Math.abs(i - center);
      if (ascending && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
      if (distance < fallbackDistance) {
        fallbackDistance = distance;
        fallbackIndex = i;
      }
    }
  }

  if (bestDistance === Number.POSITIVE_INFINITY && fallbackIndex >= 0) {
    bestIndex = fallbackIndex;
  }

  return bestIndex / sampleRate;
}

/**
 * Convierte un tiempo en segundos al índice de muestra exacto del buffer.
 * Útil para depuración y para mostrar precisión en milisegundos.
 */
export function timeToSampleIndex(buffer: AudioBuffer, timeSec: number): number {
  return Math.max(0, Math.min(buffer.length - 1, Math.round(timeSec * buffer.sampleRate)));
}
