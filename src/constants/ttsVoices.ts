/**
 * ttsVoices — Catálogo canónico de voces Google Cloud TTS.
 *
 * Vive en `constants/` (datos puros, SIN dependencias) porque lo consumen tanto
 * el cliente (selector de voz en Ajustes de Pista) como el servidor
 * (`/api/tts`, que valida la voz solicitada contra esta lista blanca).
 *
 * ── DECISIÓN DE PRODUCTO (voz única) ────────────────────────────────────────
 * La Voz Guía es SIEMPRE femenina, con acento latinoamericano nativo. Se
 * eliminó por completo la selección de voz masculina (UI y lógica) porque
 * sonaba como una variación artificial de la femenina y añadía ruido de
 * configuración. Solo se ofrecen modelos premium (Neural2 / Journey) con
 * respaldo Wavenet para proyectos donde Neural2 no esté habilitada.
 */

export type TtsVoiceGender = 'female';

export interface GoogleTTSVoiceOption {
  name: string;
  lang: string;
  label: string;
  gender: TtsVoiceGender;
}

/**
 * Catálogo OFICIAL — exclusivamente voces femeninas latinas (región es-US).
 *
 * Orden: premium primero. `Neural2-A` es la voz por defecto por su dicción
 * neutra latinoamericana; `Journey-F` ofrece la máxima expresividad.
 */
export const GOOGLE_TTS_VOICES: GoogleTTSVoiceOption[] = [
  { name: 'es-US-Neural2-A', lang: 'es-US', label: 'Latino · Neural2 A — Premium', gender: 'female' },
  { name: 'es-US-Neural2-C', lang: 'es-US', label: 'Latino · Neural2 C — Natural', gender: 'female' },
  { name: 'es-US-Journey-F', lang: 'es-US', label: 'Latino · Journey F — Ultra natural', gender: 'female' },
  { name: 'es-US-Wavenet-C', lang: 'es-US', label: 'Latino · Wavenet C — Compatibilidad', gender: 'female' }
];

/**
 * Voces de máxima naturalidad (Neural2 / Journey). La app prioriza estas y solo
 * cae a Wavenet si el proyecto de Google no tiene habilitadas las premium.
 */
export const PREMIUM_LATIN_FEMALE_VOICES: string[] = [
  'es-US-Neural2-A',
  'es-US-Neural2-C',
  'es-US-Journey-F'
];

/** Voz femenina latina por defecto (premium). */
export const DEFAULT_LATIN_FEMALE_VOICE = 'es-US-Neural2-A';

/** Región latina por defecto para el español. */
export const DEFAULT_LATIN_LANGUAGE_CODE = 'es-US';

/** ¿La voz está en el catálogo oficial? (validación de lista blanca) */
export function findTtsVoice(voiceName: string): GoogleTTSVoiceOption | undefined {
  return GOOGLE_TTS_VOICES.find((voice) => voice.name === voiceName);
}

/** ¿Es una voz permitida? Evita que un cliente pida voces arbitrarias. */
export function isAllowedTtsVoice(voiceName: unknown): voiceName is string {
  return typeof voiceName === 'string' && GOOGLE_TTS_VOICES.some((v) => v.name === voiceName);
}

/** Voces latinas (es-US) — el único conjunto ofrecido al usuario final. */
export function getLatinTtsVoices(): GoogleTTSVoiceOption[] {
  return GOOGLE_TTS_VOICES.filter((voice) => voice.lang === DEFAULT_LATIN_LANGUAGE_CODE);
}

/**
 * Normaliza cualquier nombre de voz al catálogo oficial femenino.
 *
 * Es la garantía de que la Voz Guía nunca sintetice con una voz masculina,
 * castellana o fuera de catálogo, aunque provenga de una preferencia guardada
 * por una versión anterior de la app.
 */
export function resolveLatinFemaleVoice(voiceName?: string | null): string {
  if (voiceName && findTtsVoice(voiceName)) return voiceName;
  return DEFAULT_LATIN_FEMALE_VOICE;
}

/**
 * Respaldo Wavenet del mismo idioma.
 * Se usa cuando Neural2/Journey no están habilitadas en el proyecto de Google.
 */
export function pickWavenetFallbackVoice(voiceName: string): GoogleTTSVoiceOption | undefined {
  const current = findTtsVoice(voiceName);
  if (!current) return undefined;
  if (current.name.includes('Wavenet')) return undefined;

  const candidates = GOOGLE_TTS_VOICES.filter(
    (v) => v.lang === current.lang && v.name.includes('Wavenet')
  );
  return candidates[0];
}

/** Familia (tier) de una voz del catálogo: neural2 | wavenet | journey | standard. */
export function getVoiceTier(voiceName: string): string {
  const lower = voiceName.toLowerCase();
  if (lower.includes('wavenet')) return 'wavenet';
  if (lower.includes('journey')) return 'journey';
  if (lower.includes('neural2')) return 'neural2';
  if (lower.includes('standard')) return 'standard';
  return 'neural2';
}
