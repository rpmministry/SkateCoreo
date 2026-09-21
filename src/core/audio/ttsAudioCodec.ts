/**
 * ttsAudioCodec — Helpers de codificación de audio del CLIENTE.
 *
 * El cliente ya no valida ni sintetiza: solo consume los bytes MP3 que devuelve
 * el endpoint propio `POST /api/tts`. Aquí viven las dos funciones puras que
 * necesita para el respaldo directo (auto-hospedaje con clave propia).
 */

/**
 * Decodifica Base64 a bytes sin depender de `Buffer` ni de `atob`, para que el
 * mismo código funcione en navegador y en Node (pruebas).
 */
export function base64ToBytes(base64: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const padIndex = clean.indexOf('=');
  const effective = padIndex >= 0 ? clean.slice(0, padIndex) : clean;

  const output = new Uint8Array(Math.floor((effective.length * 3) / 4));
  let byteIndex = 0;
  let buffer = 0;
  let bitsCollected = 0;

  for (let i = 0; i < effective.length; i++) {
    const value = alphabet.indexOf(effective[i]);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      output[byteIndex++] = (buffer >> bitsCollected) & 0xff;
    }
  }

  return byteIndex === output.length ? output : output.slice(0, byteIndex);
}

/** Extrae `audioContent` (Base64) de la respuesta de Google con seguridad de tipos. */
export function extractAudioContent(upstreamJson: unknown): string | null {
  if (!upstreamJson || typeof upstreamJson !== 'object') return null;
  const content = (upstreamJson as Record<string, unknown>).audioContent;
  return typeof content === 'string' && content.length > 0 ? content : null;
}
