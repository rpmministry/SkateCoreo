/**
 * ttsVoices — Catálogo canónico de voces Google Cloud TTS.
 *
 * Vive en `constants/` (datos puros, SIN dependencias) porque lo consumen tanto
 * el cliente (selector de voz en Ajustes de Pista) como el servidor
 * (`/api/tts`, que valida la voz solicitada contra esta lista blanca).
 */

export type TtsVoiceGender = 'female' | 'male';

export interface GoogleTTSVoiceOption {
  name: string;
  lang: string;
  label: string;
  gender: TtsVoiceGender;
}

/**
 * Política de marca: se priorizan VOCES LATINAS (región es-US) en variantes
 * Neural2, Wavenet y Journey, tanto femenina como masculina. Las variantes
 * es-ES quedan como alternativa.
 */
export const GOOGLE_TTS_VOICES: GoogleTTSVoiceOption[] = [
  // ── Latinas (prioritarias) ──
  { name: 'es-US-Neural2-C', lang: 'es-US', label: 'Latino (es-US) · Neural2 C — Femenina', gender: 'female' },
  { name: 'es-US-Neural2-B', lang: 'es-US', label: 'Latino (es-US) · Neural2 B — Masculina', gender: 'male' },
  { name: 'es-US-Neural2-A', lang: 'es-US', label: 'Latino (es-US) · Neural2 A — Femenina', gender: 'female' },
  { name: 'es-US-Wavenet-C', lang: 'es-US', label: 'Latino (es-US) · Wavenet C — Femenina', gender: 'female' },
  { name: 'es-US-Wavenet-D', lang: 'es-US', label: 'Latino (es-US) · Wavenet D — Masculina', gender: 'male' },
  { name: 'es-US-Wavenet-A', lang: 'es-US', label: 'Latino (es-US) · Wavenet A — Femenina', gender: 'female' },
  { name: 'es-US-Wavenet-B', lang: 'es-US', label: 'Latino (es-US) · Wavenet B — Masculina', gender: 'male' },
  { name: 'es-US-Journey-F', lang: 'es-US', label: 'Latino (es-US) · Journey F — Ultra natural (F)', gender: 'female' },
  { name: 'es-US-Journey-O', lang: 'es-US', label: 'Latino (es-US) · Journey O — Ultra natural (M)', gender: 'male' },
  // ── Alternativas de España ──
  { name: 'es-ES-Neural2-A', lang: 'es-ES', label: 'Español (ES) · Neural2 A — Femenina', gender: 'female' },
  { name: 'es-ES-Neural2-B', lang: 'es-ES', label: 'Español (ES) · Neural2 B — Masculina', gender: 'male' },
  { name: 'es-ES-Neural2-C', lang: 'es-ES', label: 'Español (ES) · Neural2 C — Femenina', gender: 'female' },
  { name: 'es-ES-Neural2-F', lang: 'es-ES', label: 'Español (ES) · Neural2 F — Masculina', gender: 'male' },
  // ── Inglés ──
  { name: 'en-US-Neural2-F', lang: 'en-US', label: 'English (US) · Neural2 F — Female', gender: 'female' },
  { name: 'en-US-Neural2-D', lang: 'en-US', label: 'English (US) · Neural2 D — Male', gender: 'male' },
  { name: 'en-US-Journey-F', lang: 'en-US', label: 'English (US) · Journey F — Expressive', gender: 'female' },
  { name: 'en-US-Journey-O', lang: 'en-US', label: 'English (US) · Journey O — Expressive', gender: 'male' }
];

/** Voz latina femenina por defecto y su contraparte masculina. */
export const DEFAULT_LATIN_FEMALE_VOICE = 'es-US-Neural2-C';
export const DEFAULT_LATIN_MALE_VOICE = 'es-US-Neural2-B';

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

/** Voces latinas (es-US) — las que se ofrecen al usuario final. */
export function getLatinTtsVoices(): GoogleTTSVoiceOption[] {
  return GOOGLE_TTS_VOICES.filter((voice) => voice.lang === DEFAULT_LATIN_LANGUAGE_CODE);
}

/**
 * Respaldo Wavenet del mismo idioma y género.
 * Se usa cuando Neural2/Journey no están habilitadas en el proyecto de Google.
 */
export function pickWavenetFallbackVoice(voiceName: string): GoogleTTSVoiceOption | undefined {
  const current = findTtsVoice(voiceName);
  if (!current) return undefined;
  if (current.name.includes('Wavenet')) return undefined;

  const candidates = GOOGLE_TTS_VOICES.filter(
    (v) => v.lang === current.lang && v.gender === current.gender && v.name.includes('Wavenet')
  );
  return candidates[0];
}

/** Voz del catálogo para un género y familia determinados (misma región). */
export function pickVoiceByGender(
  gender: TtsVoiceGender,
  options?: { region?: string; tier?: string }
): GoogleTTSVoiceOption | undefined {
  const region = options?.region ?? DEFAULT_LATIN_LANGUAGE_CODE;
  const tier = options?.tier;

  const inRegion = GOOGLE_TTS_VOICES.filter(
    (v) => v.lang === region && v.gender === gender
  );
  if (tier) {
    const sameTier = inRegion.find((v) => v.name.toLowerCase().includes(tier));
    if (sameTier) return sameTier;
  }
  if (inRegion.length > 0) return inRegion[0];

  // Sin coincidencia en la región pedida: cualquier voz del género
  return GOOGLE_TTS_VOICES.find((v) => v.gender === gender);
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
