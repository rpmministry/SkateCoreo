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
 * Tabla de género VERIFICADA por idioma. La convención de letras de Google NO es
 * universal, por eso NO se usa paridad.
 *
 *   es-US → A=FEMALE · B/C/D = MALE            (B y C son MASCULINAS)
 *   en-US → A/B/D = MALE · C/E/F = FEMALE      (A es MASCULINA)
 *
 * Fuente: lista oficial de Google Cloud TTS (Supported voices and languages).
 */
const GOOGLE_GENDER_BY_LANG: Record<string, Partial<Record<string, VoiceGender>>> = {
  'es-us': { A: 'female', B: 'male', C: 'male', D: 'male', E: 'male' },
  'en-us': { A: 'male', B: 'male', C: 'female', D: 'male', E: 'female', F: 'female' }
};

/**
 * Género codificado en el nombre de una voz Google Cloud.
 *
 * ⚠️ Aquí estaba el fallo que introducía la voz masculina: el código previo
 * aplicaba la paridad A-B/C-D (impar femenina) a TODOS los idiomas, de modo que
 * consideraba `es-US-Neural2-C` y `es-US-Wavenet-C` femeninas cuando en realidad
 * son MASCULINAS. Ahora se usa la tabla verificada por idioma; ante cualquier
 * letra/idioma no reconocido se devuelve `null` (desconocido), que nunca se
 * acepta como femenina.
 */
export function detectGoogleVoiceGender(voiceName: string): VoiceGender | null {
  if (!voiceName) return null;

  const match = voiceName.match(/-([A-FO])$/i);
  if (!match) return detectVoiceGender(voiceName);

  const letter = match[1].toUpperCase();
  if (letter === 'O') return 'male'; // Journey O = masculina

  const lower = voiceName.toLowerCase();
  const lang = lower.startsWith('es-us-')
    ? 'es-us'
    : lower.startsWith('en-us-')
      ? 'en-us'
      : null;

  const fromTable = lang ? GOOGLE_GENDER_BY_LANG[lang][letter] : undefined;
  if (fromTable) return fromTable;
  if (letter === 'F') return 'female'; // Journey F = femenina (en-US)

  // Sin certeza: se delega a los tokens del nombre; si no, desconocido (`null`).
  return detectVoiceGender(voiceName);
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

