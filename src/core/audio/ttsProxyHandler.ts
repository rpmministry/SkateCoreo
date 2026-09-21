/**
 * ttsProxyHandler — Núcleo del endpoint propio de síntesis de voz.
 *
 * La credencial de Google Cloud TTS vive SOLO aquí (servidor): nunca se
 * empaqueta en el bundle del cliente. Este módulo es agnóstico del entorno y lo
 * reutilizan:
 *   - `api/tts.ts`            → función serverless de Vercel (producción)
 *   - `vite.config.ts`        → middleware de desarrollo (paridad con producción)
 *
 * Incluye validación de lista blanca, control de origen y límite de tasa.
 */

import {
  TTS_PROXY_MAX_BODY_BYTES,
  TTS_PROXY_RATE_LIMIT,
  TTS_PROXY_RATE_WINDOW_MS,
  base64ToBytes,
  buildGoogleTtsPayload,
  extractAudioContent,
  isTtsProxyOriginAllowed,
  validateTtsProxyBody,
} from './ttsProxyContract';

export interface TtsProxyHttpRequest {
  method: string;
  headers: Record<string, string | undefined>;
  /** Cuerpo ya parseado (objeto JSON) o su texto crudo. */
  body: unknown;
  /** IP del cliente para el límite de tasa (best-effort). */
  clientIp?: string;
}

export interface TtsProxyHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array | string;
}

export interface TtsProxyHandlerOptions {
  /** Credencial de la app (solo servidor). Si falta, responde 503. */
  apiKey: string | null;
  /** Orígenes adicionales permitidos (opcional). */
  extraAllowedOrigins?: string[];
  /** Inyectable en pruebas. */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const GOOGLE_TTS_ENDPOINT =
  'https://texttospeech.googleapis.com/v1/text:synthesize';

/** Request de Node/Connect con lo mínimo que necesitamos para leer el cuerpo. */
export interface NodeReadableRequestLike {
  on?: (event: string, listener: (chunk?: unknown) => void) => void;
  readableEnded?: boolean;
  complete?: boolean;
  destroyed?: boolean;
}

/**
 * Lee el cuerpo crudo de un request de Node de forma que NUNCA cuelgue.
 *
 * Por qué existe (bug de producción real):
 * En Vercel la plataforma ya ha consumido el stream antes de invocar la función.
 * Si el request no trae cuerpo (por ejemplo abrir `GET /api/tts` en el
 * navegador), añadir un listener de `'end'` no dispara jamás → la promesa nunca
 * resuelve → la invocación se cuelga y Vercel responde
 * `500 FUNCTION_INVOCATION_FAILED`.
 *
 * Tres defensas: (1) solo se llama para POST, (2) si el stream ya terminó se
 * devuelve vacío de inmediato y (3) un temporizador de seguridad cierra la
 * lectura pase lo que pase.
 */
export function readNodeRequestBody(
  req: NodeReadableRequestLike,
  timeoutMs: number = 1500
): Promise<string> {
  if (!req || typeof req.on !== 'function') return Promise.resolve('');
  if (req.readableEnded || req.complete || req.destroyed) return Promise.resolve('');

  return new Promise<string>((resolve) => {
    let settled = false;
    let data = '';
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolve(value);
    };

    timer = setTimeout(() => finish(data), timeoutMs);

    req.on?.('data', (chunk) => {
      data += typeof chunk === 'string' ? chunk : String(chunk);
    });
    req.on?.('end', () => finish(data));
    req.on?.('error', () => finish(data));
  });
}

/* ── Límite de tasa en memoria (best-effort) ─────────────────────
   Las instancias serverless son efímeras, así que esto solo frena ráfagas
   desde una misma instancia. Es una capa defensiva, no un WAF. */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number
): boolean {
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function jsonError(
  status: number,
  error: string,
  extraHeaders: Record<string, string> = {}
): TtsProxyHttpResponse {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify({ error }),
  };
}

export async function handleTtsProxyRequest(
  request: TtsProxyHttpRequest,
  options: TtsProxyHandlerOptions
): Promise<TtsProxyHttpResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ? options.now() : Date.now();

  // ── 1. Método ──
  if (request.method.toUpperCase() !== 'POST') {
    return jsonError(405, 'Método no permitido', { Allow: 'POST' });
  }

  // ── 2. Origen: solo el propio sitio ──
  if (
    !isTtsProxyOriginAllowed({
      origin: request.headers.origin ?? request.headers.Origin,
      referer: request.headers.referer ?? request.headers.Referer,
      host: request.headers.host ?? request.headers.Host,
      extraAllowedOrigins: options.extraAllowedOrigins,
    })
  ) {
    return jsonError(403, 'Origen no autorizado');
  }

  // ── 3. Credencial disponible en el servidor ──
  if (!options.apiKey) {
    return jsonError(
      503,
      'Servicio de voz natural no configurado en el servidor'
    );
  }

  // ── 4. Tamaño del cuerpo ──
  const rawBody = request.body;
  const serialized = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody ?? null);
  if (serialized.length > TTS_PROXY_MAX_BODY_BYTES) {
    return jsonError(413, 'Petición demasiado grande');
  }

  // ── 5. Límite de tasa por IP ──
  const rateKey = request.clientIp || 'unknown';
  if (!checkRateLimit(rateKey, TTS_PROXY_RATE_LIMIT, TTS_PROXY_RATE_WINDOW_MS, now)) {
    return jsonError(429, 'Demasiadas peticiones', { 'Retry-After': '60' });
  }

  // ── 6. Validación por lista blanca (texto, voz, velocidad) ──
  let parsedBody: unknown = rawBody;
  if (typeof rawBody === 'string') {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (e) {
      return jsonError(400, 'JSON inválido');
    }
  }

  const validation = validateTtsProxyBody(parsedBody);
  if (!validation.ok) {
    return jsonError(validation.status, validation.error);
  }
  const payload = validation.payload;

  // ── 7. Síntesis en Google Cloud (credencial del servidor) ──
  const endpoint = `${GOOGLE_TTS_ENDPOINT}?key=${encodeURIComponent(options.apiKey)}`;
  const voiceAttempts = payload.fallbackVoiceName
    ? [payload.voiceName, payload.fallbackVoiceName]
    : [payload.voiceName];

  let lastStatus = 502;
  let lastDetail = 'Sin respuesta de Google Cloud TTS';

  for (const attemptVoice of voiceAttempts) {
    try {
      const upstream = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildGoogleTtsPayload(payload, attemptVoice)),
      });

      if (!upstream.ok) {
        lastStatus = upstream.status === 400 ? 502 : 502;
        // No se propaga el detalle de Google al cliente (evita filtrar información
        // del proyecto); sí se registra para diagnóstico del servidor.
        lastDetail = `Google Cloud TTS respondió ${upstream.status}`;
        console.warn('[TTS Proxy]', lastDetail, 'voz:', attemptVoice);
        continue;
      }

      const data = await upstream.json();
      const audioContent = extractAudioContent(data);
      if (!audioContent) {
        lastStatus = 502;
        lastDetail = 'Respuesta sin audio';
        continue;
      }

      if (attemptVoice !== payload.voiceName) {
        console.warn(
          '[TTS Proxy] Voz primaria no disponible; se usó el respaldo Wavenet:',
          attemptVoice
        );
      }

      const bytes = base64ToBytes(audioContent);
      if (bytes.length === 0) {
        lastStatus = 502;
        lastDetail = 'Audio vacío';
        continue;
      }

      return {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': String(bytes.length),
          'Cache-Control': 'no-store',
        },
        body: bytes,
      };
    } catch (err) {
      lastStatus = 502;
      lastDetail = 'Fallo de red al contactar Google Cloud TTS';
      console.warn('[TTS Proxy] Error de red:', err);
    }
  }

  return jsonError(lastStatus, lastDetail);
}

/** Utilidad para pruebas: limpia los cubos de rate limit. */
export function resetTtsProxyRateLimit(): void {
  rateBuckets.clear();
}
