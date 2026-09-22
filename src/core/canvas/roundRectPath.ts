/**
 * roundRectPath — Rectángulos redondeados a prueba de WebKit iOS.
 *
 * `CanvasRenderingContext2D.roundRect()` se añadió en Safari 16.0. En
 * iOS/iPadOS anteriores (Safari 15 y previos) la propiedad NO existe: llamarla
 * lanza un `TypeError` que aborta el frame completo y deja el lienzo en blanco
 * (Pista 2D o waveform invisibles). Este helper usa la API nativa cuando está
 * disponible y, si no, dibuja el mismo contorno con curvas cuadráticas
 * (soportadas en todos los WebKit).
 *
 * Debe invocarse con un `ctx.beginPath()` abierto: añade el contorno a la ruta.
 */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2));

  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }

  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
