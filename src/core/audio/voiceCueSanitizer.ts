/**
 * voiceCueSanitizer — Filtro estricto de lectura para la Voz Guía.
 *
 * Problema que resuelve:
 * Al digitalizar la plantilla A4 (Paper-to-Digital) los nodos llegan con
 * etiquetas de estructura/OCR tipo "Nodo 3 (Papel)", notas al margen, nombres de
 * archivo o texto descriptivo. La voz guía los leía tal cual ("papel", "trazo",
 * "vértice"), generando ruido inútil durante la ejecución.
 *
 * Regla de oro implementada:
 * La voz SOLO puede pronunciar:
 *   (a) comandos explícitos del motor (conteos y avisos), o
 *   (b) el nombre de una figura técnica real del catálogo oficial
 *       (Reglamento 2026: figuras libres/artísticas, obligatorias y elementos
 *       estándar de la pista 2D).
 * Cualquier otro texto se descarta silenciosamente.
 */

import {
  EFICIENCIAS_DISPONIBLES,
  FIGURAS_LIBRES_Y_ARTISTICAS,
  FIGURAS_OBLIGATORIAS_MAP,
} from '../../constants/reglamento';
import { STANDARD_FIGURES } from '../../constants/figures';

/** Comandos que el motor puede pronunciar aunque no sean figuras. */
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

/**
 * Palabras/estructuras prohibidas: si aparecen en CUALQUIER posición, el texto
 * se considera metadato, nota descriptiva o etiqueta de dibujo y NO se lee.
 */
const BLOCKED_PATTERNS: RegExp[] = [
  // Estructura de nodos y dibujo
  /\b(nodo|nodos|node|nodes|punto|puntos|point|points|marcador|marcadores|marker|markers)\b/,
  // Ojo: "loop" NO se bloquea porque es la figura oficial Loop (Rittberger);
  // el equivalente estructural en español ("bucle") sí se bloquea.
  /\b(trazo|trazos|stroke|inicio|fin|final|vertice|vértice|bucle|esquina|tramo|recta|curva|curvas)\b/,
  /\b(papel|hoja|plantilla|a4|lapiz|lápiz|pluma|tinta|escaneo|escaneado|ocr|foto|imagen|escaneada)\b/,
  /\b(nota|notas|comentario|comentarios|observacion|observación|recordatorio|margen|apunte|apuntes)\b/,
  /\b(descripcion|descripción|detalle|detalles|texto|caption|descripcion del dibujo)\b/,
  /\b(plano|esquema|borrador|croquis|diagrama|referencia|guia|guía|eje|ejes|diagonal|diagonales)\b/,
  /\b(opcional|si aplica|revisar|corregir|pendiente|tarea|entrenar|practicar)\b/,
  // Metadatos de audio y archivos
  /\b(mp3|wav|m4a|ogg|aac|flac|zip|json|pdf|mezl?a|mezcla|master|track|pista)\b/,
  /\b(bpm|tempo|compas|compás|beat|beats|metronomo|metrónomo|click|clicktrack)\b/,
  /\b(volumen|vol|mute|solo|fade|fadein|fadeout|crossfade|db|khz|hz)\b/,
  // Marcas de UI / placeholders
  /\b(sin|ningun|ningún|ninguna|none|null|undefined|vacio|vacío|default|custom|otro|personalizado)\b/,
  /\b(selecciona|seleccionar|elegir|elige|placeholder|ejemplo|demo|test|prueba)\b/,
  // Placeholders numerados de estructura ("Step 3", "Paso 2", "Movimiento 4")
  /\b(paso|pasos|step|steps|movimiento|movimientos)\s*\d+\b/,
];

/** Longitud máxima razonable para el nombre de una figura. */
const MAX_SPEECH_CHARS = 46;

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

/**
 * Formatea un código de figura obligatoria a lenguaje natural.
 * '1-2S' → 'Figura 1 y 2S' · '18-10-14' → 'Figura 18, 10 y 14'
 */
export function formatObligatoryFigureForSpeech(code: string): string {
  const trimmed = code.trim();
  if (!/^[\dA-Za-z]+(-[\dA-Za-z]+)+$/.test(trimmed)) return trimmed;

  const parts = trimmed.split('-');
  const last = parts.pop() as string;
  if (parts.length === 1) return `Figura ${parts[0]} y ${last}`;
  return `Figura ${parts.join(', ')} y ${last}`;
}

/**
 * Limpia y formatea el nombre de una figura para que la voz lo pronuncie con
 * naturalidad. Elimina sufijos de UI y convierte códigos de grupo.
 */
export function cleanFigureNameForSpeech(label: string): string {
  let text = (label || '').trim();
  if (!text) return '';

  // Sufijos de categoría de la UI entre paréntesis
  text = text.replace(/\s*\((Posición Base|Variación|Elemento Artístico)\)/gi, '');

  // Grupos de figuras obligatorias: "1-2 (Grupo 1)" → "Figura 1 y 2, Grupo 1"
  text = text.replace(/^(\d+)-(\d+)\s*\((Grupo\s*\d+)\)/i, 'Figura $1 y $2, $3');

  // Códigos de figura obligatoria sin grupo
  if (/^[\dA-Za-z]+(-[\dA-Za-z]+)+$/.test(text)) {
    text = formatObligatoryFigureForSpeech(text);
  }

  // Resto de paréntesis: conservar el contenido ("(Rittberger)" → "Rittberger")
  text = text.replace(/\((.*?)\)/g, ' $1 ');

  return text.replace(/\s+/g, ' ').trim();
}

// ── Catálogo normalizado (whitelist) ────────────────────────────
let cachedAllowedFigures: Set<string> | null = null;

/** Construye (una sola vez) el conjunto de figuras oficiales en forma normalizada. */
export function getAllowedFigureNames(): Set<string> {
  if (cachedAllowedFigures) return cachedAllowedFigures;

  const names = new Set<string>();
  const register = (raw: string) => {
    const cleaned = cleanFigureNameForSpeech(raw);
    const normalized = normalize(cleaned);
    if (normalized) names.add(normalized);

    // Aceptar también el nombre sin el prefijo "figura "
    const withoutPrefix = normalize(cleaned.replace(/^figura\s+/i, ''));
    if (withoutPrefix) names.add(withoutPrefix);
  };

  FIGURAS_LIBRES_Y_ARTISTICAS.forEach((fig) => register(fig.nombre));
  STANDARD_FIGURES.forEach(register);

  Object.values(FIGURAS_OBLIGATORIAS_MAP).forEach((byCategory) => {
    Object.values(byCategory).forEach((groups) => {
      groups?.forEach((group) => group.figuras.forEach(register));
    });
  });

  // Variantes de eficiencia y descripciones cortas usadas en la UI
  EFICIENCIAS_DISPONIBLES.forEach(register);

  cachedAllowedFigures = names;
  return names;
}

const FIGURE_WITH_GROUP_PATTERN = /^figura\s+[\dA-Za-z\s,y]+?(,\s*grupo\s*\d+)?$/;

/** Modificadores admitidos tras el nombre base de una figura. */
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

/** ¿Es el texto el nombre de una figura oficial del catálogo? */
export function isKnownFigure(text: string): boolean {
  const normalized = normalize(cleanFigureNameForSpeech(text));
  if (!normalized) return false;
  if (getAllowedFigureNames().has(normalized)) return true;

  // "Figura 1 y 2, Grupo 1" (incluye el número de grupo)
  if (FIGURE_WITH_GROUP_PATTERN.test(normalized)) return true;

  // Códigos oficiales de elemento RollArt asignados al nodo (ej. 1A, 2Lo, 3S, 2S1)
  if (/^\d[a-z]{1,3}\d?$/.test(normalized)) return true;

  // Nombre base + modificadores permitidos, en cualquier orden:
  // "Salchow doble", "Trompo combinado", "Doble Axel", "Triple Lutz".
  // Deliberadamente estricto: cualquier otra palabra invalida la lectura.
  for (const allowed of getAllowedFigureNames()) {
    if (allowed.length < 4) continue;

    // base + modificadores
    if (normalized.startsWith(`${allowed} `)) {
      const rest = normalized.slice(allowed.length + 1).split(' ').filter(Boolean);
      if (rest.length > 0 && rest.every((word) => ALLOWED_MODIFIERS.has(word))) return true;
    }

    // modificadores + base
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

/** ¿Contiene alguna estructura prohibida (notas, metadatos, dibujo)? */
export function hasBlockedContent(text: string): boolean {
  const normalized = normalize(text);
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Veredicto final: devuelve el texto listo para sintetizar o `null` si debe
 * descartarse silenciosamente.
 *
 * `options.allowManual` habilita las FIGURAS MANUALES: etiquetas escritas por el
 * usuario que no pertenecen al catálogo oficial. Sin esta opción la voz solo lee
 * figuras obligatorias/conocidas (filtro estricto de la digitalización de papel).
 * Aun en modo manual se mantienen TODOS los rechazos de seguridad (estructura,
 * notas, metadatos, longitud y archivos), así que "Nodo 3 (Papel)" sigue mudos.
 */
export function sanitizeSpeechText(
  raw: string | null | undefined,
  options?: { allowManual?: boolean }
): string | null {
  if (!raw) return null;

  const collapsed = String(raw).replace(/\s+/g, ' ').trim();
  if (!collapsed) return null;

  const normalized = normalize(collapsed);
  if (!normalized) return null;

  // (a) Comandos explícitos del motor (conteos, avisos)
  if (EXPLICIT_COMMANDS.has(normalized)) return collapsed;

  // Rechazo duro: rutas, URLs y extensiones de archivo
  if (
    /\.(wav|mp3|m4a|ogg|aac|flac|zip|json|pdf|png|jpe?g)$/i.test(collapsed) ||
    collapsed.startsWith('/') ||
    collapsed.includes('://') ||
    collapsed.includes('\\')
  ) {
    return null;
  }

  // Rechazo de texto libre largo: notas al margen y descripciones
  if (collapsed.length > MAX_SPEECH_CHARS) return null;

  // Rechazo por contenido estructural/metadatos (aplica SIEMPRE, también manual)
  if (hasBlockedContent(collapsed)) return null;

  // (b) Nombre de figura oficial, con sufijo de aviso permitido
  //     ("Salchow", "Salchow, en", "Salchow en 3", "Figura 1 y 2, Grupo 1")
  const suffixMatch = collapsed.match(/\s*,?\s*(en|in)\s*\d{0,2}\s*$/i);
  const suffix = suffixMatch ? suffixMatch[0].trim() : '';
  const candidate = (suffix ? collapsed.slice(0, suffixMatch!.index) : collapsed).trim();

  const cleaned = cleanFigureNameForSpeech(candidate);
  if (!cleaned) return null;
  if (cleaned.length > MAX_SPEECH_CHARS) return null;

  // (c) FIGURA MANUAL: se acepta aunque no esté en el catálogo oficial, siempre
  // que haya superado los rechazos de estructura/metadatos anteriores.
  if (options?.allowManual) {
    return suffix ? `${cleaned} ${suffix}` : cleaned;
  }

  if (!isKnownFigure(cleaned)) return null;

  return suffix ? `${cleaned} ${suffix}` : cleaned;
}

/**
 * Divide una etiqueta en figuras individuales.
 * Admite separadores habituales: coma, punto y coma, barra y " y " / "&".
 * Así un nodo con "Salchow, Axel y Lutz" produce tres figuras legibles.
 */
export function splitFigureList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/\s*(?:,|;|\/|\||&|\by\b)\s*/gi)
    .map((part) => part.trim())
    .filter(Boolean);
}

