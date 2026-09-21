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

import {
  handleTtsProxyRequest,
  readNodeRequestBody,
} from '../src/core/audio/ttsProxyHandler';

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

/**
 * Normaliza el cuerpo: Vercel puede entregarlo ya parseado (objeto JSON), como
 * texto o como Buffer. Todo lo que no sea un objeto JSON se convierte a texto
 * para que la validación reciba siempre algo coherente.
 */
function normalizeBody(raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') {
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
      return raw.toString('utf8');
    }
    if (raw instanceof Uint8Array) {
      return new TextDecoder().decode(raw);
    }
    return raw; // objeto JSON ya parseado
  }
  return String(raw);
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
  const method = (req.method || 'POST').toUpperCase();

  // Cuerpo: Vercel normalmente ya lo entrega parseado. Solo si falta Y el método
  // trae cuerpo se lee el stream (con guardas anti-cuelgue). Leer el stream en un
  // GET ya consumido colgaba la invocación → 500 FUNCTION_INVOCATION_FAILED.
  let body: unknown = normalizeBody(req.body);
  if (method === 'POST' && body === undefined) {
    const raw = await readNodeRequestBody(req);
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

  try {
    const result = await handleTtsProxyRequest(
      {
        method,
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
  } catch (err) {
    // Red de seguridad: cualquier fallo imprevisto se devuelve como JSON
    // controlado en lugar de un 500 FUNCTION_INVOCATION_FAILED sin diagnóstico.
    console.error('[TTS Proxy] Error inesperado en la invocación:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'Error interno del servicio de voz' }));
  }
}
