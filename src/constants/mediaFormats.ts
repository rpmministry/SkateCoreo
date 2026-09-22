/**
 * mediaFormats — Listas de formatos aceptados por los `<input type="file">`.
 *
 * Se centralizan aquí para que TODOS los puntos de carga acepten exactamente el
 * mismo conjunto, con especial atención a Safari (iOS/iPadOS), que es el motor
 * más restrictivo a la hora de mapear tipos de archivo.
 *
 * ── POR QUÉ NO BASTA `audio/*` ─────────────────────────────────────────────
 * En Safari, `audio/*` se resuelve contra las UTIs del sistema y NO incluye los
 * contenedores MPEG-4: los archivos `.m4a` y `.mp4` aparecen DESHABILITADOS en
 * el selector (o directamente ocultos), aunque WebKit los decodifique sin
 * problema. La solución es declarar explícitamente:
 *
 *   - las extensiones (`.m4a`, `.mp4`, …)  → filtrado por nombre de archivo
 *   - los tipos MIME (`audio/mp4`, `audio/x-m4a`, `video/mp4`)
 *
 * `video/mp4` es necesario porque muchos exportadores entregan el audio AAC
 * dentro de un contenedor MP4, y el sistema lo clasifica como vídeo.
 */

/** Extensiones + tipos MIME de audio aceptados en todos los cargadores. */
export const ACCEPTED_AUDIO_FORMATS = [
  // ── Extensiones (filtrado fiable en iOS/Files) ──
  '.mp3',
  '.wav',
  '.m4a',
  '.mp4',
  '.aac',
  '.ogg',
  '.oga',
  '.opus',
  '.flac',
  '.webm',
  // ── Tipos MIME (WebKit necesita los de MP4/M4A explícitos) ──
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/opus',
  'audio/flac',
  'audio/webm',
  'video/mp4',
].join(',');

/** Extensiones aceptadas por el importador/exportador de proyectos. */
export const ACCEPTED_PROJECT_FORMATS = '.coreo,.skate,.zip';
