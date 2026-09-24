/**
 * Pruebas del pipeline de MEJORA DE IMAGEN para visión artificial.
 *
 * Verifican los criterios del rediseño sin DOM:
 *   · no destructivo (la imagen original nunca se sobrescribe),
 *   · "Auto Mejorar" acerca la exposición a un objetivo sano,
 *   · "Optimizar para nodos" maximiza contraste/saturación dentro de límites seguros,
 *   · realce SELECTIVO: los grises de la plantilla no se colorean,
 *   · la mejora hace más separable la tinta manuscrita roja/azul,
 *   · preview por reducción (dos etapas) mantiene la relación de aspecto.
 */

import { RgbaImage } from './types';
import { segmentInk } from './InkSegmentation';
import {
  analyzeImage,
  autoEnhanceParams,
  clampParams,
  downscaleImage,
  enhanceImage,
  hsv01ToRgb,
  optimizeForNodesParams,
  paramsAreNeutral,
  rgbToHsv01,
  SAFE_LIMITS,
} from './ImageEnhance';

let total = 0;
let passed = 0;

function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
  passed++;
}

function makeImage(w: number, h: number, bg: [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    data[idx] = bg[0];
    data[idx + 1] = bg[1];
    data[idx + 2] = bg[2];
    data[idx + 3] = 255;
  }
  return { width: w, height: h, data };
}

function paintDisk(img: RgbaImage, cx: number, cy: number, r: number, rgb: [number, number, number]) {
  for (let y = Math.max(0, cy - r); y <= Math.min(img.height - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(img.width - 1, cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        const i = (y * img.width + x) * 4;
        img.data[i] = rgb[0];
        img.data[i + 1] = rgb[1];
        img.data[i + 2] = rgb[2];
        img.data[i + 3] = 255;
      }
    }
  }
}

function scaleChannels(img: RgbaImage, factor: number): RgbaImage {
  const data = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    data[i] = img.data[i] * factor;
    data[i + 1] = img.data[i + 1] * factor;
    data[i + 2] = img.data[i + 2] * factor;
    data[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data };
}

function countMask(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] === 1) n++;
  return n;
}

function meanLuma(img: RgbaImage): number {
  let sum = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    sum += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
  }
  return sum / (img.data.length / 4) / 255;
}

console.log('--- PRUEBAS DEL PIPELINE DE MEJORA DE IMAGEN (VISIÓN) ---');

/* 1. No destructivo: la imagen original no cambia. */
{
  const img = makeImage(240, 160, [80, 80, 80]);
  paintDisk(img, 60, 60, 25, [220, 40, 40]);
  paintDisk(img, 170, 100, 25, [40, 70, 220]);
  const snapshot = new Uint8ClampedArray(img.data);
  const out = enhanceImage(img, autoEnhanceParams(analyzeImage(img)), { quality: 'final' });
  let identical = img.data.length === snapshot.length;
  for (let i = 0; i < snapshot.length && identical; i++) {
    if (img.data[i] !== snapshot[i]) identical = false;
  }
  assert(identical, 'No destructivo: la imagen original permanece intacta');
  assert(out.data !== img.data, 'No destructivo: la salida es un búfer nuevo');
}

/* 2. Auto Mejorar sube la exposición de una foto oscura hacia el objetivo. */
{
  const base = makeImage(240, 160, [46, 46, 46]);
  paintDisk(base, 120, 80, 40, [120, 60, 60]);
  const dark = scaleChannels(base, 0.3);
  const stats = analyzeImage(dark);
  const params = autoEnhanceParams(stats);
  const enhanced = enhanceImage(dark, params, { quality: 'final' });
  assert(stats.meanLuma < 0.25, `Análisis: detecta poca luz (meanLuma ${stats.meanLuma.toFixed(3)})`);
  assert(params.exposure > 0, 'Auto Mejorar: expone en positivo para foto oscura');
  assert(
    meanLuma(enhanced) > meanLuma(dark) + 0.05,
    `Auto Mejorar: la imagen mejora en luminancia (${meanLuma(dark).toFixed(3)} → ${meanLuma(enhanced).toFixed(3)})`
  );
}

/* 3. Límites de seguridad: nunca "brillo 500 %". */
{
  const clamped = clampParams({ brightness: 9, contrast: -9, exposure: 99, saturation: 99, sharpness: 99 });
  assert(clamped.brightness === SAFE_LIMITS.brightness, 'Límites: brillo acotado al máximo seguro');
  assert(clamped.contrast === -SAFE_LIMITS.contrast, 'Límites: contraste acotado al mínimo seguro');
  assert(clamped.exposure === SAFE_LIMITS.exposure, 'Límites: exposición acotada');
  assert(clamped.saturation === SAFE_LIMITS.saturation, 'Límites: saturación acotada');
  assert(clamped.sharpness === SAFE_LIMITS.sharpness, 'Límites: nitidez acotada');
  assert(paramsAreNeutral({}) && paramsAreNeutral(undefined), 'Parámetros neutros detectados correctamente');
  assert(!paramsAreNeutral({ contrast: 0.5 }), 'Un ajuste real NO se considera neutro');
}

/* 4. Optimizar para nodos: más contraste/saturación que el neutro, dentro de límites. */
{
  const img = makeImage(200, 140, [200, 200, 200]);
  const stats = analyzeImage(img);
  const optimize = optimizeForNodesParams(stats);
  assert(optimize.contrast >= 0.2, 'Optimizar nodos: fuerza contraste adaptativo');
  assert(optimize.saturation >= 0.2, 'Optimizar nodos: fuerza saturación selectiva');
  assert(
    optimize.contrast <= SAFE_LIMITS.contrast && optimize.saturation <= SAFE_LIMITS.saturation,
    'Optimizar nodos: sin salirse de los límites seguros'
  );
}

/* 5. Realce selectivo: el gris de la plantilla NO se colorea. */
{
  const img = makeImage(200, 140, [150, 150, 150]); // gris puro de plantilla
  for (let y = 20; y < 40; y++) {
    for (let x = 20; x < 180; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = 90;
      img.data[i + 1] = 90;
      img.data[i + 2] = 90; // línea impresa oscura, acromática
    }
  }
  const out = enhanceImage(img, optimizeForNodesParams(analyzeImage(img)), { quality: 'final' });
  let maxSatGradient = 0;
  for (let i = 0; i < out.data.length; i += 4) {
    const { s } = rgbToHsv01(out.data[i], out.data[i + 1], out.data[i + 2]);
    if (s > maxSatGradient) maxSatGradient = s;
  }
  assert(maxSatGradient < 0.12, `Realce selectivo: los grises siguen siendo grises (sat máx ${maxSatGradient.toFixed(3)})`);
}

/* 6. La mejora hace MÁS separable la tinta tenue en poca luz. */
{
  const img = makeImage(300, 200, [230, 230, 230]);
  paintDisk(img, 80, 100, 26, [190, 35, 35]); // rojo tenue
  paintDisk(img, 220, 100, 26, [35, 60, 185]); // azul tenue
  const dark = scaleChannels(img, 0.22); // muy poca luz
  const before = segmentInk(dark);
  const after = segmentInk(enhanceImage(dark, autoEnhanceParams(analyzeImage(dark)), { quality: 'final' }));
  const beforeInk = countMask(before.ink);
  const afterInk = countMask(after.ink);
  assert(beforeInk < afterInk, `Mejora: más tinta recuperada (${beforeInk} → ${afterInk} píxeles)`);
  assert(countMask(after.red) > 0 && countMask(after.blue) > 0, 'Mejora: rojo y azul siguen separados por canal');
}

/* 7. Preview en dos etapas: reducción conservando relación de aspecto. */
{
  const img = makeImage(1400, 700, [240, 240, 240]);
  const small = downscaleImage(img, 700);
  assert(small.width === 700, 'Preview: ancho objetivo respetado');
  assert(Math.abs(small.width / small.height - 2) < 0.02, 'Preview: relación de aspecto conservada');
  const noop = downscaleImage(img, 2000);
  assert(noop.width === 1400 && noop.height === 700, 'Preview: no amplía si ya es pequeña');
}

/* 8. Conversión HSV ida y vuelta (base del realce cromático). */
{
  const [r, g, b] = hsv01ToRgb(352, 0.85, 0.9);
  const hsv = rgbToHsv01(r, g, b);
  assert(Math.abs(hsv.s - 0.85) < 0.02, 'HSV: saturación estable en la ida y vuelta');
  assert(Math.abs(hsv.v - 0.9) < 0.02, 'HSV: valor estable en la ida y vuelta');
  assert(hsv.h < 5 || hsv.h > 350, 'HSV: el rojo conserva su matiz');
}

console.log(`\n🏆 PRUEBAS DE MEJORA DE IMAGEN PASARON: ${passed}/${total}`);
