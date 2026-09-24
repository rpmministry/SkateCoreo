/**
 * voiceGender — Detección y puntuación de género en voces TTS.
 *
 * Problema que resuelve:
 * Las voces del navegador no exponen su género en la API (solo `name` y `lang`),
 * y las voces de Google Cloud sí, pero el nombre se elegía una sola vez y se
 * guardaba, de modo que al cambiar entre "Femenina" y "Masculina" seguía
 * sonando la MISMA voz. Aquí se centraliza la heurística de género para que
 * todos los motores (Google Cloud, Wavenet, navegador) puedan diferenciarlas.
 */

export type VoiceGender = 'female' | 'male';

/** Nombres de voz que suelen identificar una voz femenina. */
const FEMALE_TOKENS =
  /(female|mujer|femenin|woman|girl|monica|mónica|helena|sabina|lucia|lucía|paulina|catalina|isabela|valentina|camila|sofia|sofía|zira|aria|jenny|emma|joanna|salli|kendra|kimberly|ivy|amy|olivia|nicole|freya|mia|clara|elena|irene|maria|maría|elvira|larissa|vicki|karen|tessa|fiona|esperanza|penelope|penélope|renata|dalia)/i;

/** Nombres de voz que suelen identificar una voz masculina. */
const MALE_TOKENS =
  /(male|hombre|masculin|man|boy|jorge|pablo|david|diego|carlos|andres|andrés|juan|pedro|miguel|enrique|gonzalo|lorenzo|javier|alvaro|álvaro|luca|mateo|sebastian|sebastián|guy|davis|tony|brandon|jason|kevin|ryan|matthew|brian|eric|william|daniel|alex|fred|oliver|thomas|lucas|raul|raúl|mattia|diego)/i;

/** ¿El nombre de la voz indica explícitamente su género? */
export function detectVoiceGender(voiceName: string): VoiceGender | null {
  if (!voiceName) return null;
  // Se comprueba primero masculino/femenino explícito en el nombre
  if (FEMALE_TOKENS.test(voiceName)) return 'female';
  if (MALE_TOKENS.test(voiceName)) return 'male';
  return null;
}

/**
 * Género codificado en el nombre de una voz Google Cloud.
 *
 * Google usa una convención estable de letras finales:
 *   es-US-Neural2-A (F) · -B (M) · -C (F) · -D (M) · -E (F) · -F (M)
 *   es-US-Wavenet-A (F) · -B (M) · -C (F) · -D (M)
 *   es-US-Journey-F (F) · -O (M)
 */
export function detectGoogleVoiceGender(voiceName: string): VoiceGender | null {
  const match = voiceName.match(/-([A-FO])$/i);
  if (match) {
    const letter = match[1].toUpperCase();
    if (letter === 'O') return 'male'; // Journey O = masculina
    if (letter === 'F') return 'female'; // Journey F = femenina
    // Neural2 / Wavenet / Standard: pares A-B, C-D, E-F → impar femenina, par masculina
    const idx = letter.charCodeAt(0) - 65; // A=0
    return idx % 2 === 0 ? 'female' : 'male';
  }

  const named = detectVoiceGender(voiceName);
  return named;
}

/**
 * ¿La voz corresponde al género pedido? `null` si no se puede determinar.
 */
export function voiceMatchesGender(
  voiceName: string,
  gender: VoiceGender
): boolean | null {
  const detected = detectGoogleVoiceGender(voiceName) ?? detectVoiceGender(voiceName);
  if (!detected) return null;
  return detected === gender;
}

/** ¿El código de idioma es español latinoamericano (excluye `es-ES`)? */
export function isLatinSpanishLang(lang: string): boolean {
  const l = (lang || '').toLowerCase();
  return l.startsWith('es') && l !== 'es-es';
}

/**
 * REGLA DE VOZ ÚNICA (Voz Guía).
 *
 * Una voz del navegador solo es aceptable si:
 *   · declara EXPLÍCITAMENTE género femenino (nunca `unknown`), y
 *   · para español, es variante latinoamericana (nunca `es-ES`).
 *
 * Es el blindaje que impide que el fallback de Web Speech introduzca una voz
 * masculina o castellana cuando el TTS natural no está disponible.
 */
export function isAcceptableFemaleVoice(
  voice: { name: string; lang: string } | null | undefined,
  lang: 'es' | 'en'
): boolean {
  if (!voice) return false;
  const vLang = (voice.lang || '').toLowerCase();
  if (lang === 'es') {
    if (!isLatinSpanishLang(vLang)) return false;
  } else if (!vLang.startsWith('en')) {
    return false;
  }
  return voiceMatchesGender(voice.name, 'female') === true;
}

