/**
 * ttsProxyContract — Validación pura del endpoint propio `/api/tts`.
 *
 * Este módulo NO hace E/S ni usa APIs de entorno: lo comparten el servidor
 * (función de Vercel), el middleware de desarrollo de Vite y las pruebas.
 *
 * Objetivo de seguridad: el proxy custodia la credencial de Google Cloud, así
 * que se comporta como una lista blanca estricta. Solo acepta exactamente lo
 * que la app necesita:
 *   - texto que pase el filtro de la Voz Guía (figuras/comandos oficiales),
 *   - una voz del catálogo,
 *   - una velocidad dentro de rango,
 *   - y un `Origin`/`Referer` del propio dominio.
 */

import { sanitizeSpeechText } from './voiceCueSanitizer';
import {
  DEFAULT_LATIN_LANGUAGE_CODE,
  findTtsVoice,
  pickWavenetFallbackVoice,
} from '../../constants/ttsVoices';

/** Longitud máxima del texto a sintetizar (un nombre de figura o un conteo). */
export const TTS_PROXY_MAX_TEXT_LEN = 64;

/** Tamaño máximo del cuerpo JSON aceptado (bytes). */
export const TTS_PROXY_MAX_BODY_BYTES = 2048;

/** Límite de peticiones por IP y ventana (best-effort en serverless). */
export const TTS_PROXY_RATE_LIMIT = 60;
export const TTS_PROXY_RATE_WINDOW_MS = 60_000;

export interface TtsProxyPayload {
  text: string;
  voiceName: string;
  /** Derivado SIEMPRE de la voz del catálogo, nunca del cliente. */
  languageCode: string;
  speed: number;
  /** Respaldo Wavenet si la voz principal no está habilitada en el proyecto. */
  fallbackVoiceName?: string;
}

export type TtsProxyValidationResult =
  | { ok: true; payload: TtsProxyPayload }
  | { ok: false; status: number; error: string };

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Valida el cuerpo de la petición contra el catálogo y el filtro de voz.
 */
export function validateTtsProxyBody(raw: unknown): TtsProxyValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, status: 400, error: 'Cuerpo JSON requerido' };
  }

  const body = raw as Record<string, unknown>;

  // 1. Filtro de Voz Guía: solo figuras/comandos oficiales.
  //    Este es el control anti-abuso más importante: hace imposible usar el
  //    proxy como un TTS de propósito general.
  const safeText = sanitizeSpeechText(asString(body.text));
  if (!safeText) {
    return { ok: false, status: 422, error: 'Texto no vocalizable' };
  }
  if (safeText.length > TTS_PROXY_MAX_TEXT_LEN) {
    return { ok: false, status: 422, error: 'Texto demasiado largo' };
  }

  // 2. Lista blanca de voces.
  const requestedVoice = asString(body.voiceName);
  const voice = requestedVoice
    ? findTtsVoice(requestedVoice)
    : findTtsVoice(DEFAULT_LATIN_LANGUAGE_CODE + '-Neural2-C');

  if (!voice) {
    return { ok: false, status: 422, error: 'Voz no permitida' };
  }

  // 3. Velocidad dentro de rango.
  const rawSpeed = typeof body.speed === 'number' ? body.speed : Number(body.speed);
  const speed = Number.isFinite(rawSpeed)
    ? Math.max(0.5, Math.min(2.0, rawSpeed))
    : 1.05;

  const fallback = pickWavenetFallbackVoice(voice.name);

  return {
    ok: true,
    payload: {
      text: safeText,
      voiceName: voice.name,
      // La región se deriva del catálogo: el cliente no puede inyectar idiomas.
      languageCode: voice.lang,
      speed,
      fallbackVoiceName: fallback?.name,
    },
  };
}

/** Cuerpo que se envía a la API de Google Cloud TTS. */
export function buildGoogleTtsPayload(payload: TtsProxyPayload, voiceName?: string) {
  return {
    input: { text: payload.text },
    voice: {
      languageCode: payload.languageCode,
      name: voiceName ?? payload.voiceName,
    },
    audioConfig: {
      audioEncoding: 'MP3' as const,
      speakingRate: payload.speed,
    },
  };
}

/**
 * Comprueba que la petición provenga del propio sitio.
 * Se compara contra el `Host` de la petición (cubre dominio de producción,
 * dominios personalizados y previews de Vercel) y, opcionalmente, contra una
 * lista extra configurada por entorno.
 */
export function isTtsProxyOriginAllowed(options: {
  origin?: string | null;
  referer?: string | null;
  host?: string | null;
  extraAllowedOrigins?: string[];
}): boolean {
  const { origin, referer, host, extraAllowedOrigins = [] } = options;

  const normalizeHost = (value: string): string => {
    try {
      // Acepta tanto "https://dominio" como "dominio"
      const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
      return url.host.toLowerCase();
    } catch (e) {
      return '';
    }
  };

  const expectedHost = host ? normalizeHost(host) : '';
  const extra = extraAllowedOrigins.map(normalizeHost).filter(Boolean);

  const candidates = [origin, referer].filter((v): v is string => Boolean(v && v.trim()));
  if (candidates.length === 0) {
    // Sin Origin ni Referer: cliente no navegador. Se rechaza.
    return false;
  }

  return candidates.some((candidate) => {
    const candidateHost = normalizeHost(candidate);
    if (!candidateHost) return false;
    if (expectedHost && candidateHost === expectedHost) return true;
    return extra.includes(candidateHost);
  });
}

/**
 * Decodifica Base64 a bytes sin depender de `Buffer` ni de `atob`,
 * para que el mismo código funcione en Node y en el navegador.
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
