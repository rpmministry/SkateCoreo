/**
 * POST /api/tts — Proxy de síntesis de voz de SkateCoreo.
 *
 * La credencial de Google Cloud TTS vive ÚNICAMENTE en el servidor
 * (`GOOGLE_TTS_API_KEY` en Vercel → Settings → Environment Variables) y nunca se
 * empaqueta en el bundle del cliente.
 *
 * Contrato:
 *   Body: { text: string, voiceName?: string, speed?: number }
 *   200  → audio/mpeg (bytes)
 *   4xx/5xx → { error: string }
 *
 * La lógica vive en `src/core/audio/ttsProxyHandler.ts` para compartirla con el
 * middleware de desarrollo de Vite (paridad total dev ↔ producción) y poder
 * probarla con tests unitarios sin red.
 */

import { handleTtsProxyRequest } from '../src/core/audio/ttsProxyHandler';

interface NodeRequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  on?: (event: string, listener: (chunk?: unknown) => void) => void;
}

interface NodeResponseLike {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: Uint8Array | string) => void;
}

/** Normaliza los headers a claves en minúscula y valores escalares. */
function normalizeHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (Array.isArray(value)) {
      normalized[key.toLowerCase()] = value[0];
    } else if (value !== undefined) {
      normalized[key.toLowerCase()] = value;
    }
  }
  return normalized;
}

/** Lee el cuerpo crudo cuando la plataforma no lo ha parseado. */
function readRawBody(req: NodeRequestLike): Promise<string> {
  return new Promise((resolve) => {
    if (typeof req.on !== 'function') {
      resolve('');
      return;
    }
    let data = '';
    req.on('data', (chunk) => {
      data += typeof chunk === 'string' ? chunk : String(chunk);
    });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

/**
 * Credencial de la app. Se acepta el nombre sin prefijo `VITE_` (recomendado,
 * nunca llega al cliente) y se mantiene el antiguo como respaldo durante la
 * migración para no romper el despliegue existente.
 */
function resolveServerApiKey(): string | null {
  const env = (typeof process !== 'undefined' && process.env) || ({} as Record<string, string | undefined>);
  const key = env.GOOGLE_TTS_API_KEY || env.VITE_GOOGLE_TTS_API_KEY || '';
  return key.trim() || null;
}

export default async function handler(req: NodeRequestLike, res: NodeResponseLike) {
  const headers = normalizeHeaders(req.headers || {});

  // Cuerpo: si la plataforma ya lo parseó se usa tal cual; si no, se lee el stream.
  let body: unknown = req.body;
  if (body === undefined || body === null || body === '') {
    const raw = await readRawBody(req);
    body = raw || undefined;
  }

  const forwardedFor = headers['x-forwarded-for'];
  const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : undefined;

  const extraAllowedOrigins = (() => {
    const env = (typeof process !== 'undefined' && process.env) || ({} as Record<string, string | undefined>);
    const raw = env.TTS_ALLOWED_ORIGINS || '';
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  })();

  const result = await handleTtsProxyRequest(
    {
      method: req.method || 'POST',
      headers,
      body,
      clientIp,
    },
    {
      apiKey: resolveServerApiKey(),
      extraAllowedOrigins,
    }
  );

  res.statusCode = result.status;
  for (const [name, value] of Object.entries(result.headers)) {
    res.setHeader(name, value);
  }
  res.end(result.body);
}
