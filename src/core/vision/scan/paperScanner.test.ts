/**
 * Pruebas automáticas del pipeline Paper-to-Digital v2 (puro, sin DOM).
 *
 * Cubren el criterio de aceptación del rediseño: 1 nodo, 5 nodos, numerados,
 * rojo/azul, perspectiva (ya rectificada), nodos próximos, nodos sin número,
 * trazos de trayectoria, círculos abiertos, discos rellenos, falsos positivos
 * (plantilla impresa) y lectura de dígito restringida al interior del nodo.
 */

import { RgbaImage, DEFAULT_RINK } from './types';
import { segmentInk } from './InkSegmentation';
import { TemplateModel } from './TemplateModel';
import { subtractPrintedMask } from './TemplateSubtractor';
import { detectCandidates } from './NodeCandidateDetector';
import { scanPaper } from './PaperScanner';
import { extractDigitTensor, NullDigitClassifier, createOnnxDigitClassifier } from './DigitClassifier';

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

/* ── Utilidades de dibujo sintético ─────────────────────────────────────── */

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

function paintAt(img: RgbaImage, x: number, y: number, r: number, rgb: [number, number, number]) {
  const x0 = Math.max(0, Math.floor(x - r));
  const x1 = Math.min(img.width - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r));
  const y1 = Math.min(img.height - 1, Math.ceil(y + r));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      if ((px - x) ** 2 + (py - y) ** 2 <= r * r) {
        const i = (py * img.width + px) * 4;
        img.data[i] = rgb[0];
        img.data[i + 1] = rgb[1];
        img.data[i + 2] = rgb[2];
        img.data[i + 3] = 255;
      }
    }
  }
}

function paintRing(
  img: RgbaImage,
  cx: number,
  cy: number,
  radius: number,
  thickness: number,
  rgb: [number, number, number]
) {
  const steps = Math.max(24, Math.ceil(2 * Math.PI * radius));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    paintAt(img, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, thickness / 2, rgb);
  }
}

function paintLine(
  img: RgbaImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  rgb: [number, number, number]
) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    paintAt(img, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thickness / 2, rgb);
  }
}

const W = 1000;
const H = 500;
const PX_PER_M = W / DEFAULT_RINK.lengthMeters; // 20 px/m
const RED: [number, number, number] = [220, 30, 30];
const BLUE: [number, number, number] = [30, 60, 200];
const PAPER: [number, number, number] = [246, 247, 249];
const PRINT_GRAY: [number, number, number] = [150, 150, 150];

function metersToPx(m: number) {
  return m * PX_PER_M;
}

async function main() {
  console.log('--- PRUEBAS DEL PIPELINE DE VISIÓN v2 (PAPER-TO-DIGITAL) ---');

  /* 1. Segmentación por color en CIELab: rojo/azul sí, gris/blanco no. */
  {
    const img = makeImage(W, H, PAPER);
    TemplateModel.renderOntoImage(img, DEFAULT_RINK, PRINT_GRAY, 2);
    paintRing(img, 200, 150, 20, 5, RED);
    paintRing(img, 400, 250, 20, 5, BLUE);
    const seg = segmentInk(img);
    const redTop = seg.red[150 * W + 220];
    const blueTop = seg.blue[250 * W + 420];
    const grayLine = seg.ink[20 * W + 300];
    const white = seg.ink[10 * W + 500];
    assert(redTop === 1, 'Segmentación: la tinta ROJA se aísla');
    assert(blueTop === 1, 'Segmentación: la tinta AZUL se aísla');
    assert(grayLine === 0, 'Segmentación: la cuadrícula GRIS no se confunde con tinta');
    assert(white === 0, 'Segmentación: el papel BLANCO no se confunde con tinta');
  }

  /* 2. Modelo digital: la máscara impresa conoce la geometría y su distancia. */
  {
    const mask = TemplateModel.rasterizeMask(W, H, DEFAULT_RINK, 2);
    const onGrid = mask[100 * W + 200]; // y=5 m → py 100 (línea de 5 m)
    const empty = mask[110 * W + 210];
    assert(onGrid === 1, 'Modelo digital: rasteriza la cuadrícula en su posición exacta');
    assert(empty === 0, 'Modelo digital: deja libre el espacio entre líneas');
    assert(
      TemplateModel.distanceToPrinted(10, 12.5, DEFAULT_RINK) < 0.01,
      'Modelo digital: detecta un punto sobre la línea central'
    );
    assert(
      TemplateModel.distanceToPrinted(10.5, 12.7, DEFAULT_RINK) > 0.1,
      'Modelo digital: mide distancia a la geometría impresa'
    );
  }

  /* 3. Sustracción de plantilla: elimina el fringe junto a líneas impresas. */
  {
    const ink = new Uint8Array(W * H);
    const printed = TemplateModel.rasterizeMask(W, H, DEFAULT_RINK, 2);
    // Simula fringe: tinta de color justo encima de una línea impresa.
    for (let x = 190; x <= 230; x++) ink[100 * W + x] = 1;
    // Y una mancha lejos de cualquier línea o círculo impreso.
    paintMaskBlock(ink, 610, 350, 8);
    const res = subtractPrintedMask(ink, printed, W, H, 3);
    assert(res.removedByTemplate > 0, 'Sustracción: elimina tinta pegada a la plantilla');
    assert(res.residual[350 * W + 610] === 1, 'Sustracción: conserva la tinta lejos de la plantilla');
    assert(res.residual[100 * W + 210] === 0, 'Sustracción: borra el fringe sobre la rejilla');
  }

  /* 4. Detección de candidatos: un anillo rojo genera exactamente 1 candidato. */
  {
    const img = makeImage(W, H, PAPER);
    TemplateModel.renderOntoImage(img, DEFAULT_RINK, PRINT_GRAY, 2);
    paintRing(img, metersToPx(10.5), metersToPx(8.5), 20, 4, RED);
    const seg = segmentInk(img);
    const printed = TemplateModel.rasterizeMask(W, H, DEFAULT_RINK, 2);
    const residual = subtractPrintedMask(seg.ink, printed, W, H, 3, seg.strong).residual;
    const candidates = detectCandidates(residual, W, H, seg.red, seg.blue, {
      minRadiusPx: 10,
      maxRadiusPx: 60,
    });
    assert(candidates.length === 1, `Detección: 1 anillo → ${candidates.length} candidato(s)`);
    const c = candidates[0];
    assert(
      Math.abs(c.center.x - metersToPx(10.5)) < 3 && Math.abs(c.center.y - metersToPx(8.5)) < 3,
      'Detección: el centro del candidato coincide con el nodo dibujado'
    );
    assert(c.redFraction > 0.9, 'Detección: el candidato se clasifica como ROJO');
  }

  /* 5. Escaneo completo: 1 nodo, posición en metros correcta. */
  {
    const img = makeImage(W, H, PAPER);
    TemplateModel.renderOntoImage(img, DEFAULT_RINK, PRINT_GRAY, 2);
    paintRing(img, metersToPx(10.5), metersToPx(8.5), 20, 4, RED);
    const result = await scanPaper(img);
    assert(result.nodes.length === 1, `Escaneo 1 nodo: detectado (${result.nodes.length})`);
    assert(result.nodes[0].channel === 'red', 'Escaneo 1 nodo: canal ROJO');
    assert(
      Math.abs(result.nodes[0].xMeters - 10.5) < 0.4 &&
        Math.abs(result.nodes[0].yMeters - 8.5) < 0.4,
      `Escaneo 1 nodo: posición (${result.nodes[0].xMeters}, ${result.nodes[0].yMeters}) m ≈ (10.5, 8.5)`
    );
    assert(result.nodes[0].decision === 'accept', 'Escaneo 1 nodo: aceptado automáticamente');
  }

  /* 6. Escaneo: 5 nodos rojos y azules. */
  {
    const img = makeImage(W, H, PAPER);
    TemplateModel.renderOntoImage(img, DEFAULT_RINK, PRINT_GRAY, 2);
    const nodes: Array<[number, number, [number, number, number]]> = [
      [10.5, 8.5, RED],
      [20.5, 12.5, RED],
      [30.5, 6.5, RED],
      [40.5, 18.5, BLUE],
      [45.5, 10.5, BLUE],
    ];
    for (const [mx, my, color] of nodes) {
      paintRing(img, metersToPx(mx), metersToPx(my), 20, 4, color);
    }
    const result = await scanPaper(img);
    assert(result.nodes.length === 5, `Escaneo 5 nodos: detectados ${result.nodes.length}/5`);
    const reds = result.nodes.filter((n) => n.channel === 'red').length;
    const blues = result.nodes.filter((n) => n.channel === 'blue').length;
    assert(reds === 3 && blues === 2, `Escaneo 5 nodos: 3 rojos y 2 azules (${reds}/${blues})`);
  }

  /* 7. Nodos sin número: se aceptan igual (digit null, sin inventar). */
  {
    const img = makeImage(W, H, PAPER);
    TemplateModel.renderOntoImage(img, DEFAULT_RINK, PRINT_GRAY, 2);
    paintRing(img, metersToPx(15.5), metersToPx(10.5), 20, 4, RED);
    const result = await scanPaper(img);
    assert(result.nodes.length === 1, 'Nodo sin número: se detecta el círculo');
    assert(result.nodes[0].digit === null, 'Nodo sin número: digit permanece null (no se inventa)');
  }

  /* 8. Línea de trayectoria que une dos nodos: no genera nodos falsos. */
  {
    const img = makeImage(W, H, PAPER);
    TemplateModel.renderOntoImage(img, DEFAULT_RINK, PRINT_GRAY, 2);
    const a = { x: metersToPx(10.5), y: metersToPx(10.5) };
    const b = { x: metersToPx(25.5), y: metersToPx(14.5) };
    paintRing(img, a.x, a.y, 20, 4, RED);
    paintRing(img, b.x, b.y, 20, 4, RED);
    paintLine(img, a.x + 20, a.y, b.x - 20, b.y, 4, RED);
    const result = await scanPaper(img);
    assert(result.nodes.length === 2, `Trayectoria: 2 nodos (no la línea), obtenidos ${result.nodes.length}`);
  }

  /* 9. Círculo manuscrito ABIERTO (con hueco) también se detecta. */
  {
    const img = makeImage(W, H, PAPER);
    TemplateModel.renderOntoImage(img, DEFAULT_RINK, PRINT_GRAY, 2);
    const cx = metersToPx(18.5);
    const cy = metersToPx(9.5);
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      // Omitimos ~30° del círculo para simular un trazo sin cerrar.
      const t = i / steps;
      const a = t * Math.PI * 2 * 0.92;
      paintAt(img, cx + Math.cos(a) * 20, cy + Math.sin(a) * 20, 2, BLUE);
    }
    const result = await scanPaper(img);
    assert(result.nodes.length === 1, `Anillo abierto: detectado (${result.nodes.length})`);
    assert(result.nodes[0].channel === 'blue', 'Anillo abierto: canal AZUL');
  }

  /* 10. Disco relleno (marcador) se detecta como nodo. */
  {
    const img = makeImage(W, H, PAPER);
    TemplateModel.renderOntoImage(img, DEFAULT_RINK, PRINT_GRAY, 2);
    paintAt(img, metersToPx(12.5), metersToPx(12.5), 16, BLUE);
    const result = await scanPaper(img);
    assert(result.nodes.length === 1, `Disco relleno: detectado (${result.nodes.length})`);
  }

  /* 11. Dos nodos próximos no deben fusionarse. */
  {
    const img = makeImage(W, H, PAPER);
    TemplateModel.renderOntoImage(img, DEFAULT_RINK, PRINT_GRAY, 2);
    paintRing(img, metersToPx(10.5), metersToPx(10.5), 14, 4, RED);
    paintRing(img, metersToPx(12.1), metersToPx(10.5), 14, 4, BLUE);
    const result = await scanPaper(img);
    assert(result.nodes.length === 2, `Nodos próximos: se mantienen separados (${result.nodes.length})`);
  }

  /* 12. Falsos positivos: plantilla impresa sin tinta → 0 nodos. */
  {
    const img = makeImage(W, H, PAPER);
    TemplateModel.renderOntoImage(img, DEFAULT_RINK, PRINT_GRAY, 2);
    const result = await scanPaper(img);
    assert(result.nodes.length === 0, 'Anti-falsos-positivos: la plantilla impresa no genera nodos');
  }

  /* 13. Lectura de dígito: se extrae el tensor SOLO del interior del nodo. */
  {
    const img = makeImage(W, H, PAPER);
    TemplateModel.renderOntoImage(img, DEFAULT_RINK, PRINT_GRAY, 2);
    const cx = metersToPx(14.5);
    const cy = metersToPx(12.5);
    paintRing(img, cx, cy, 18, 4, RED);
    paintLine(img, cx - 2, cy - 6, cx - 2, cy + 6, 2, [40, 40, 40]); // dígito oscuro interior
    const tensor = extractDigitTensor(img, cx, cy, 15);
    assert(tensor.data.length === 784, 'Dígito: tensor 28×28 (784) generado');
    assert(tensor.hasInk === true, 'Dígito: detecta tinta manuscrita en el interior');
    const blankImg = makeImage(W, H, PAPER);
    const blank = extractDigitTensor(blankImg, 500, 250, 15);
    assert(blank.hasInk === false, 'Dígito: no detecta tinta donde no la hay');

    const nullClassifier = new NullDigitClassifier();
    const pred = await nullClassifier.classify(tensor);
    assert(
      pred.digit === null && pred.confidence === 0,
      'Dígito: el clasificador por defecto NO inventa (null)'
    );
  }

  /* 14. Adaptador ONNX: clasifica 0-9 con umbral de confianza. */
  {
    const classifier = createOnnxDigitClassifier(async () => {
      const logits = new Float32Array(10).fill(0);
      logits[7] = 6;
      return logits;
    });
    const tensor = {
      data: new Float32Array(784).fill(1),
      hasInk: true,
      inkFraction: 0.2,
    };
    const pred = await classifier.classify(tensor);
    assert(pred.digit === 7 && pred.confidence > 0.6, `ONNX: reconoce 7 (conf ${pred.confidence})`);

    const unsure = createOnnxDigitClassifier(async () => new Float32Array(10).fill(0));
    const unsurePred = await unsure.classify(tensor);
    assert(unsurePred.digit === null, 'ONNX: sin evidencia devuelve null (nunca inventa)');
  }

  /* 15. Trayectoria que ATRAVIESA el círculo: no debe duplicar el nodo. */
  {
    const img = makeImage(W, H, PAPER);
    TemplateModel.renderOntoImage(img, DEFAULT_RINK, PRINT_GRAY, 2);
    const cx = metersToPx(15.5);
    const cy = metersToPx(12.5);
    paintRing(img, cx, cy, 20, 4, RED);
    paintLine(img, cx - 45, cy + 12, cx + 50, cy - 10, 4, RED);
    const result = await scanPaper(img);
    assert(
      result.nodes.length === 1,
      `Círculo atravesado por línea: 1 nodo (obtenidos ${result.nodes.length})`
    );
    assert(
      Math.abs(result.nodes[0].xMeters - 15.5) < 0.5 &&
        Math.abs(result.nodes[0].yMeters - 12.5) < 0.5,
      `Círculo atravesado: posición centrada (${result.nodes[0].xMeters}, ${result.nodes[0].yMeters})`
    );
  }

  console.log(`\n🏆 PRUEBAS DEL PIPELINE v2 PASARON: ${passed}/${total}`);
}

function paintMaskBlock(mask: Uint8Array, cx: number, cy: number, r: number) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      mask[y * W + x] = 1;
    }
  }
}

main().catch((err) => {
  console.error('Error inesperado en las pruebas:', err);
  process.exit(1);
});
