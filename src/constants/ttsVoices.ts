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
 * ⚠️ GÉNEROS VERIFICADOS contra la lista oficial de Google Cloud TTS
 * (https://cloud.google.com/text-to-speech/docs/voices). La convención de
 * letras NO es la misma en todos los idiomas:
 *
 *   es-US-Neural2-A  → FEMALE   ✅ (voz oficial por defecto)
 *   es-US-Neural2-B  → MALE     ❌
 *   es-US-Neural2-C  → MALE     ❌  (estaba mal catalogada como femenina)
 *   es-US-Wavenet-A  → FEMALE   ✅
 *   es-US-Wavenet-C  → MALE     ❌  (estaba mal catalogada como femenina)
 *   es-US-Standard-A → FEMALE   ✅
 *   es-US-Journey-*  → NO EXISTE para es-US (su solicitud provocaba que el
 *                      servidor cayera a Wavenet-C, que es MASCULINA).
 *
 * Esta corrección es la causa raíz de la "voz masculina": el catálogo anterior
 * ofrecía C/Journey-F como femeninas, y al fallar A Google resolvía a Wavenet-C
 * (masculina). Solo se admiten ahora las voces A verificadas como femeninas.
 *
 * Orden: Neural2 (premium) → Wavenet → Standard (respaldo).
 */
export const GOOGLE_TTS_VOICES: GoogleTTSVoiceOption[] = [
  { name: 'es-US-Neural2-A', lang: 'es-US', label: 'Latino · Neural2 A — Premium', gender: 'female' },
  { name: 'es-US-Wavenet-A', lang: 'es-US', label: 'Latino · Wavenet A — Respaldo', gender: 'female' },
  { name: 'es-US-Standard-A', lang: 'es-US', label: 'Latino · Standard A — Compatibilidad', gender: 'female' }
];

/**
 * Voces de máxima naturalidad. En es-US la única Neural2 femenina es la A; no
 * existe Journey para este idioma. El respaldo es Wavenet-A (también femenina).
 */
export const PREMIUM_LATIN_FEMALE_VOICES: string[] = ['es-US-Neural2-A'];

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
