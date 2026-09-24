/**
 * POST /api/tts — Proxy de síntesis de voz de SkateCoreo (función serverless).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ARCHIVO DELIBERADAMENTE AUTOCONTENIDO (cero `import`).
 *
 * Motivo: Vercel compila las funciones de `api/` de forma aislada y NO resuelve
 * de manera fiable importaciones a archivos TypeScript fuera de `api/`. Un
 * `import ../src/...` provocaba `500 FUNCTION_INVOCATION_FAILED` porque el módulo
 * no llegaba a cargarse. Mantener este archivo sin dependencias elimina esa
 * clase de fallo por completo.
 *
 * La misma lógica vive, ya tipada y compartida, en:
 *   - `src/core/audio/ttsProxyHandler.ts`  (usada por el dev server de Vite)
 *   - `src/core/audio/ttsProxyContract.ts` (helpers puros del cliente)
 *   - `src/core/audio/voiceCueSanitizer.ts` (filtro de la Voz Guía del cliente)
 * La prueba `src/core/audio/ttsProxyHandler.test.ts` verifica que ambas
 * implementaciones coinciden (paridad) para que no puedan divergir en silencio.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * La credencial de Google Cloud TTS vive SOLO aquí, en la variable de entorno
 * `GOOGLE_TTS_API_KEY` (Vercel → Settings → Environment Variables). Nunca se
 * empaqueta en el bundle del cliente.
 *
 * Contrato:  Body { text, voiceName?, speed? }
 *            200 → audio/mpeg · 4xx/5xx → { error }
 */

/* ── Límites ─────────────────────────────────────────────────── */
const MAX_TEXT_LEN = 64;
const MAX_BODY_BYTES = 2048;
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const MAX_SPEECH_CHARS = 46;

/* ── Voz Guía: comandos explícitos permitidos ────────────────── */
const EXPLICIT_COMMANDS = new Set([
  'tres',
  'dos',
  'uno',
  'ya',
  'three',
  'two',
  'one',
  'go',
  'cero',
  'zero',
  'ultimo',
  'ultima',
]);

/* ── Voz Guía: estructuras prohibidas (notas, metadatos, dibujo) ── */
const BLOCKED_PATTERNS: RegExp[] = [
  /\b(nodo|nodos|node|nodes|punto|puntos|point|points|marcador|marcadores|marker|markers)\b/,
  /\b(trazo|trazos|stroke|inicio|fin|final|vertice|vértice|bucle|esquina|tramo|recta|curva|curvas)\b/,
  /\b(papel|hoja|plantilla|a4|lapiz|lápiz|pluma|tinta|escaneo|escaneado|ocr|foto|imagen|escaneada)\b/,
  /\b(nota|notas|comentario|comentarios|observacion|observación|recordatorio|margen|apunte|apuntes)\b/,
  /\b(descripcion|descripción|detalle|detalles|texto|caption|descripcion del dibujo)\b/,
  /\b(plano|esquema|borrador|croquis|diagrama|referencia|guia|guía|eje|ejes|diagonal|diagonales)\b/,
  /\b(opcional|si aplica|revisar|corregir|pendiente|tarea|entrenar|practicar)\b/,
  /\b(mp3|wav|m4a|ogg|aac|flac|zip|json|pdf|mezl?a|mezcla|master|track|pista)\b/,
  /\b(bpm|tempo|compas|compás|beat|beats|metronomo|metrónomo|click|clicktrack)\b/,
  /\b(volumen|vol|mute|solo|fade|fadein|fadeout|crossfade|db|khz|hz)\b/,
  /\b(sin|ningun|ningún|ninguna|none|null|undefined|vacio|vacío|default|custom|otro|personalizado)\b/,
  /\b(selecciona|seleccionar|elegir|elige|placeholder|ejemplo|demo|test|prueba)\b/,
];

const ALLOWED_MODIFIERS = new Set([
  'simple',
  'doble',
  'triple',
  'cuadruple',
  'combinado',
  'combinada',
  'combinacion',
  'secuencia',
  'invertido',
  'invertida',
]);

const FIGURE_WITH_GROUP_PATTERN = /^figura\s+[\dA-Za-z\s,y]+?(,\s*grupo\s*\d+)?$/;

/**
 * Lista blanca oficial en forma normalizada (Reglamento 2026).
 * GENERADA desde el catálogo real; `ttsProxyHandler.test.ts` verifica que siga
 * coincidiendo con `getAllowedFigureNames()` para detectar cualquier deriva.
 */
export const ALLOWED_FIGURES: string[] = [
  '1 y 2s', '10 22 y 14', '10 y 26', '11 22 y 14', '11 y 27', '13 19 y 30',
  '18 10 y 14', '18 28 y 15', '2 y 1s', '22 11 y 14', '3 y 1s', '3 y 2s',
  '3s y 8', '4 y 8', '4 y 9', '4s y 8', '4s y 9',
  'arched lunge', 'axel', 'basica', 'biellmann', 'bryant', 'camel',
  'camel forward', 'camel lay over', 'camel sideways', 'charlotte',
  'combinacion de saltos', 'coreografia libre', 'eagle', 'fan',
  'figura 1 y 2s', 'figura 10 22 y 14', 'figura 10 y 26', 'figura 11 22 y 14',
  'figura 11 y 27', 'figura 13 19 y 30', 'figura 18 10 y 14',
  'figura 18 28 y 15', 'figura 2 y 1s', 'figura 22 11 y 14', 'figura 3 y 1s',
  'figura 3 y 2s', 'figura 3s y 8', 'figura 4 y 8', 'figura 4 y 9',
  'figura 4s y 8', 'figura 4s y 9', 'flip', 'hackenmond', 'half hackenmond',
  'half hydroblade', 'hydroblade', 'ina bauer', 'intermedia',
  'inverted camel', 'loop rittberger', 'lunge', 'lutz', 'pre promo',
  'salchow', 'secuencia de pasos', 'sit', 'sit behind tortuga',
  'sit en dos pies', 'sit forward', 'sit sideways', 'split', 'spread eagle',
  'toe loop', 'torso', 'trompo', 'trompo combinado', 'upright',
];

const ALLOWED_FIGURE_SET = new Set(ALLOWED_FIGURES);

/* ── Catálogo de voces permitidas ──────────────────────────────
   VOZ ÚNICA: solo voces FEMENINAS LATINAS (es-US) verificadas como femeninas
   en la lista oficial de Google, más su equivalente inglesa.
   ⚠️ es-US-Neural2-C y es-US-Wavenet-C son MASCULINAS y es-US-Journey-* no
   existe: incluirlas provocaba que, al fallar la principal, el respaldo fuera
   una voz masculina. Solo se permiten las variantes A (femeninas). */
interface VoiceOption {
  name: string;
  lang: string;
  gender: 'female';
}

const VOICES: VoiceOption[] = [
  { name: 'es-US-Neural2-A', lang: 'es-US', gender: 'female' },
  { name: 'es-US-Wavenet-A', lang: 'es-US', gender: 'female' },
  { name: 'es-US-Standard-A', lang: 'es-US', gender: 'female' },
  { name: 'en-US-Neural2-F', lang: 'en-US', gender: 'female' },
  { name: 'en-US-Journey-F', lang: 'en-US', gender: 'female' },
];

const DEFAULT_VOICE = 'es-US-Neural2-A';
const GOOGLE_TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

/* ══════════════════════════════════════════════════════════════
   Helpers puros (exportados también para las pruebas)
   ══════════════════════════════════════════════════════════════ */

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalize(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[.,;:!¡¿?"'`´¨()[\]{}]/g, ' ')
    .replace(/[-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatObligatoryFigureForSpeech(code: string): string {
  const trimmed = code.trim();
  if (!/^[\dA-Za-z]+(-[\dA-Za-z]+)+$/.test(trimmed)) return trimmed;

  const parts = trimmed.split('-');
  const last = parts.pop() as string;
  if (parts.length === 1) return `Figura ${parts[0]} y ${last}`;
  return `Figura ${parts.join(', ')} y ${last}`;
}

export function cleanFigureNameForSpeech(label: string): string {
  let text = (label || '').trim();
  if (!text) return '';

  text = text.replace(/\s*\((Posición Base|Variación|Elemento Artístico)\)/gi, '');
  text = text.replace(/^(\d+)-(\d+)\s*\((Grupo\s*\d+)\)/i, 'Figura $1 y $2, $3');

  if (/^[\dA-Za-z]+(-[\dA-Za-z]+)+$/.test(text)) {
    text = formatObligatoryFigureForSpeech(text);
  }

  text = text.replace(/\((.*?)\)/g, ' $1 ');
  return text.replace(/\s+/g, ' ').trim();
}

/** ¿Es el texto el nombre de una figura oficial del catálogo? */
export function isKnownFigure(text: string): boolean {
  const normalized = normalize(cleanFigureNameForSpeech(text));
  if (!normalized) return false;
  if (ALLOWED_FIGURE_SET.has(normalized)) return true;

  // "Figura 1 y 2, Grupo 1" (incluye el número de grupo)
  if (FIGURE_WITH_GROUP_PATTERN.test(normalized)) return true;

  // Códigos oficiales de elemento RollArt asignados al nodo (1A, 2Lo, 3S…)
  if (/^\d[a-z]{1,3}\d?$/.test(normalized)) return true;

  // Nombre base ± modificadores permitidos, en cualquier orden
  for (const allowed of ALLOWED_FIGURES) {
    if (allowed.length < 4) continue;

    if (normalized.startsWith(`${allowed} `)) {
      const rest = normalized.slice(allowed.length + 1).split(' ').filter(Boolean);
      if (rest.length > 0 && rest.every((word) => ALLOWED_MODIFIERS.has(word))) return true;
    }

    if (normalized.endsWith(` ${allowed}`)) {
      const head = normalized
        .slice(0, normalized.length - allowed.length - 1)
        .split(' ')
        .filter(Boolean);
      if (head.length > 0 && head.every((word) => ALLOWED_MODIFIERS.has(word))) return true;
    }
  }

  return false;
}

export function hasBlockedContent(text: string): boolean {
  const normalized = normalize(text);
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Veredicto del filtro de Voz Guía: texto vocalizable o `null`. */
export function sanitizeSpeechText(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const collapsed = String(raw).replace(/\s+/g, ' ').trim();
  if (!collapsed) return null;

  const normalized = normalize(collapsed);
  if (!normalized) return null;

  if (EXPLICIT_COMMANDS.has(normalized)) return collapsed;

  if (
    /\.(wav|mp3|m4a|ogg|aac|flac|zip|json|pdf|png|jpe?g)$/i.test(collapsed) ||
    collapsed.startsWith('/') ||
    collapsed.includes('://') ||
    collapsed.includes('\\')
  ) {
    return null;
  }

  if (collapsed.length > MAX_SPEECH_CHARS) return null;
  if (hasBlockedContent(collapsed)) return null;

  const suffixMatch = collapsed.match(/\s*,?\s*(en|in)\s*\d{0,2}\s*$/i);
  const suffix = suffixMatch ? suffixMatch[0].trim() : '';
  const candidate = (suffix ? collapsed.slice(0, suffixMatch!.index) : collapsed).trim();

  const cleaned = cleanFigureNameForSpeech(candidate);
  if (!cleaned) return null;
  if (cleaned.length > MAX_SPEECH_CHARS) return null;
  if (!isKnownFigure(cleaned)) return null;

  return suffix ? `${cleaned} ${suffix}` : cleaned;
}

/* ── Voces ───────────────────────────────────────────────────── */
export function findVoice(voiceName: string): VoiceOption | undefined {
  return VOICES.find((voice) => voice.name === voiceName);
}

export function pickWavenetFallbackVoice(voiceName: string): VoiceOption | undefined {
  const current = findVoice(voiceName);
  if (!current || current.name.includes('Wavenet')) return undefined;
  return VOICES.find(
    (v) => v.lang === current.lang && v.gender === current.gender && v.name.includes('Wavenet')
  );
}

/* ── Validación del payload ──────────────────────────────────── */
export interface TtsPayload {
  text: string;
  voiceName: string;
  languageCode: string;
  speed: number;
  fallbackVoiceName?: string;
}

export type TtsValidation =
  | { ok: true; payload: TtsPayload }
  | { ok: false; status: number; error: string };

export function validateTtsPayload(raw: unknown): TtsValidation {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, status: 400, error: 'Cuerpo JSON requerido' };
  }

  const body = raw as Record<string, unknown>;

  const safeText = sanitizeSpeechText(typeof body.text === 'string' ? body.text : '');
  if (!safeText) return { ok: false, status: 422, error: 'Texto no vocalizable' };
  if (safeText.length > MAX_TEXT_LEN) {
    return { ok: false, status: 422, error: 'Texto demasiado largo' };
  }

  const requestedVoice = typeof body.voiceName === 'string' ? body.voiceName : '';
  const voice = requestedVoice ? findVoice(requestedVoice) : findVoice(DEFAULT_VOICE);
  if (!voice) return { ok: false, status: 422, error: 'Voz no permitida' };

  const rawSpeed = typeof body.speed === 'number' ? body.speed : Number(body.speed);
  const speed = Number.isFinite(rawSpeed) ? Math.max(0.5, Math.min(2.0, rawSpeed)) : 1.05;

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

export function buildGoogleTtsPayload(payload: TtsPayload, voiceName?: string) {
  return {
    input: { text: payload.text },
    voice: {
      languageCode: payload.languageCode,
      name: voiceName ?? payload.voiceName,
      // VOZ ÚNICA: se declara el género explícitamente. Aunque el catálogo ya es
      // exclusivamente femenino, `ssmlGender` es la garantía a nivel de payload:
      // Google nunca podrá resolver la petición a una voz masculina.
      ssmlGender: 'FEMALE' as const,
    },
    audioConfig: { audioEncoding: 'MP3' as const, speakingRate: payload.speed },
  };
}

/** Solo el propio sitio puede consumir el proxy. */
export function isTtsRequestOriginAllowed(options: {
  origin?: string | null;
  referer?: string | null;
  host?: string | null;
  extraAllowedOrigins?: string[];
}): boolean {
  const { origin, referer, host, extraAllowedOrigins = [] } = options;

  const normalizeHost = (value: string): string => {
    try {
      const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
      return url.host.toLowerCase();
    } catch (e) {
      return '';
    }
  };

  const expectedHost = host ? normalizeHost(host) : '';
  const extra = extraAllowedOrigins.map(normalizeHost).filter(Boolean);

  const candidates = [origin, referer].filter((v): v is string => Boolean(v && v.trim()));
  if (candidates.length === 0) return false;

  return candidates.some((candidate) => {
    const candidateHost = normalizeHost(candidate);
    if (!candidateHost) return false;
    if (expectedHost && candidateHost === expectedHost) return true;
    return extra.includes(candidateHost);
  });
}

/** Decodifica Base64 a bytes sin depender de `Buffer` ni de `atob`. */
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

export function extractAudioContent(upstreamJson: unknown): string | null {
  if (!upstreamJson || typeof upstreamJson !== 'object') return null;
  const content = (upstreamJson as Record<string, unknown>).audioContent;
  return typeof content === 'string' && content.length > 0 ? content : null;
}

/* ══════════════════════════════════════════════════════════════
   Lectura del cuerpo HTTP a prueba de cuelgues
   ══════════════════════════════════════════════════════════════ */

export interface NodeReadableRequestLike {
  on?: (event: string, listener: (chunk?: unknown) => void) => void;
  readableEnded?: boolean;
  complete?: boolean;
  destroyed?: boolean;
}

/**
 * En Vercel la plataforma ya consumió el stream antes de invocar la función. En
 * un GET (por ejemplo abrir `/api/tts` en el navegador) añadir un listener de
 * `'end'` no dispara nunca → la promesa no resuelve → la invocación se cuelga y
 * Vercel responde `500 FUNCTION_INVOCATION_FAILED`. Tres defensas: solo se llama
 * para POST, si el stream ya terminó se devuelve vacío de inmediato y hay un
 * temporizador de seguridad.
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

/* ══════════════════════════════════════════════════════════════
   Núcleo del proxy
   ══════════════════════════════════════════════════════════════ */

export interface TtsProxyHttpRequest {
  method: string;
  headers: Record<string, string | undefined>;
  body: unknown;
  clientIp?: string;
}

export interface TtsProxyHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array | string;
}

export interface TtsProxyHandlerOptions {
  apiKey: string | null;
  extraAllowedOrigins?: string[];
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function resetTtsProxyRateLimit(): void {
  rateBuckets.clear();
}

function checkRateLimit(key: string, limit: number, windowMs: number, now: number): boolean {
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function jsonResponse(
  status: number,
  payload: Record<string, unknown>,
  extraHeaders: Record<string, string> = {}
): TtsProxyHttpResponse {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  };
}

export async function handleTtsProxyRequest(
  request: TtsProxyHttpRequest,
  options: TtsProxyHandlerOptions
): Promise<TtsProxyHttpResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ? options.now() : Date.now();

  // 1. Método
  if (request.method.toUpperCase() !== 'POST') {
    return jsonResponse(405, { error: 'Método no permitido' }, { Allow: 'POST' });
  }

  // 2. Origen: solo el propio sitio
  if (
    !isTtsRequestOriginAllowed({
      origin: request.headers.origin ?? request.headers.Origin,
      referer: request.headers.referer ?? request.headers.Referer,
      host: request.headers.host ?? request.headers.Host,
      extraAllowedOrigins: options.extraAllowedOrigins,
    })
  ) {
    return jsonResponse(403, { error: 'Origen no autorizado' });
  }

  // 3. Credencial disponible en el servidor
  if (!options.apiKey) {
    return jsonResponse(503, { error: 'Servicio de voz natural no configurado en el servidor' });
  }

  // 4. Tamaño del cuerpo
  const rawBody = request.body;
  const serialized = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody ?? null);
  if (serialized.length > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'Petición demasiado grande' });
  }

  // 5. Límite de tasa por IP
  if (!checkRateLimit(request.clientIp || 'unknown', RATE_LIMIT, RATE_WINDOW_MS, now)) {
    return jsonResponse(429, { error: 'Demasiadas peticiones' }, { 'Retry-After': '60' });
  }

  // 6. Validación por lista blanca
  let parsedBody: unknown = rawBody;
  if (typeof rawBody === 'string') {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (e) {
      return jsonResponse(400, { error: 'JSON inválido' });
    }
  }

  const validation = validateTtsPayload(parsedBody);
  if (!validation.ok) {
    return jsonResponse(validation.status, { error: validation.error });
  }
  const payload = validation.payload;

  // 7. Síntesis en Google Cloud (credencial del servidor)
  const endpoint = `${GOOGLE_TTS_ENDPOINT}?key=${encodeURIComponent(options.apiKey)}`;
  const voiceAttempts = payload.fallbackVoiceName
    ? [payload.voiceName, payload.fallbackVoiceName]
    : [payload.voiceName];

  let lastStatus = 502;
  let lastError = 'Sin respuesta de Google Cloud TTS';

  for (const attemptVoice of voiceAttempts) {
    try {
      const upstream = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildGoogleTtsPayload(payload, attemptVoice)),
      });

      if (!upstream.ok) {
        // No se propaga el detalle de Google al cliente (evita filtrar datos del
        // proyecto); sí se registra para el diagnóstico del servidor.
        lastError = `Google Cloud TTS respondió ${upstream.status}`;
        console.warn('[TTS Proxy]', lastError, 'voz:', attemptVoice);
        continue;
      }

      const data = await upstream.json();
      const audioContent = extractAudioContent(data);
      if (!audioContent) {
        lastError = 'Respuesta sin audio';
        continue;
      }

      if (attemptVoice !== payload.voiceName) {
        console.warn('[TTS Proxy] Voz primaria no disponible; se usó el respaldo Wavenet:', attemptVoice);
      }

      const bytes = base64ToBytes(audioContent);
      if (bytes.length === 0) {
        lastError = 'Audio vacío';
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
      lastError = 'Fallo de red al contactar Google Cloud TTS';
      console.warn('[TTS Proxy] Error de red:', err);
    }
  }

  return jsonResponse(lastStatus, { error: lastError });
}

/* ══════════════════════════════════════════════════════════════
   Adaptador HTTP de Vercel
   ══════════════════════════════════════════════════════════════ */

interface NodeRequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  on?: (event: string, listener: (chunk?: unknown) => void) => void;
  readableEnded?: boolean;
  complete?: boolean;
  destroyed?: boolean;
}

interface NodeResponseLike {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: Uint8Array | string) => void;
}

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

/** Vercel puede entregar el cuerpo parseado, como texto o como Buffer. */
function normalizeBody(raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') {
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) return raw.toString('utf8');
    if (raw instanceof Uint8Array) return new TextDecoder().decode(raw);
    return raw;
  }
  return String(raw);
}

function resolveServerApiKey(): string | null {
  const env =
    (typeof process !== 'undefined' && process.env) ||
    ({} as Record<string, string | undefined>);
  const key = env.GOOGLE_TTS_API_KEY || env.VITE_GOOGLE_TTS_API_KEY || '';
  return key.trim() || null;
}

function resolveExtraAllowedOrigins(): string[] {
  const env =
    (typeof process !== 'undefined' && process.env) ||
    ({} as Record<string, string | undefined>);
  return (env.TTS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export default async function handler(req: NodeRequestLike, res: NodeResponseLike) {
  try {
    const headers = normalizeHeaders(req.headers || {});
    const method = (req.method || 'POST').toUpperCase();

    let body: unknown = normalizeBody(req.body);
    if (method === 'POST' && body === undefined) {
      const raw = await readNodeRequestBody(req);
      body = raw || undefined;
    }

    const forwardedFor = headers['x-forwarded-for'];
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : undefined;

    const result = await handleTtsProxyRequest(
      { method, headers, body, clientIp },
      { apiKey: resolveServerApiKey(), extraAllowedOrigins: resolveExtraAllowedOrigins() }
    );

    res.statusCode = result.status;
    for (const [name, value] of Object.entries(result.headers)) {
      res.setHeader(name, value);
    }
    res.end(result.body);
  } catch (err) {
    // Red de seguridad: nunca devolver un 500 opaco de la plataforma.
    console.error('[TTS Proxy] Error inesperado en la invocación:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'Error interno del servicio de voz' }));
  }
}
