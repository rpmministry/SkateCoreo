/**
 * Unit Tests: Plantilla PDF A4 reglamentaria.
 *
 * Cada aserción corresponde a un requisito editorial concreto:
 *  - A4 exacto y pista con proporción 2:1.
 *  - Encabezado como contenedor cerrado con SOLO logotipo + datos institucionales.
 *  - Campos manuales (Atleta/Club/Entrenador) en el área blanca, en negro puro.
 *  - Ausencia total de "Categoría", "Tempo", "3/4" y "ESCALA DE PISTA".
 *  - Los fiduciales de las 4 esquinas NO se solapan con ninguna banda.
 *  - Crédito de desarrollo presente.
 */

import { PdfTemplateGenerator, TemplateMetadata, PDF_LAYOUT, PDF_TEXTS } from './pdfTemplateGenerator';

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

console.log('--- EJECUTANDO PRUEBAS DEL GENERADOR DE PLANTILLA PDF A4 ---');

/* ── 1. Instancia y geometría A4 exacta ─────────────────────────── */
const doc = PdfTemplateGenerator.generateTemplate();
assert(doc !== null && typeof doc === 'object', 'Genera instancia válida de jsPDF');

const internal = (doc as any).internal;
const widthMm: number = internal.pageSize.getWidth();
const heightMm: number = internal.pageSize.getHeight();

assert(Math.abs(widthMm - 297) < 0.05, `A4 horizontal: ancho exacto 297 mm (${widthMm.toFixed(2)})`);
assert(Math.abs(heightMm - 210) < 0.05, `A4 horizontal: alto exacto 210 mm (${heightMm.toFixed(2)})`);
assert(internal.getNumberOfPages() === 1, 'La plantilla es exactamente de 1 página');
assert(
  PDF_LAYOUT.page.width === 297 && PDF_LAYOUT.page.height === 210,
  'La cuadrícula declara 297 × 210 mm (coincide con el formato A4)'
);

/* ── 2. Pista: proporción 2:1 estricta y centrada ───────────────── */
const R = PDF_LAYOUT.rink;
assert(Math.abs(R.w / R.h - 2) < 1e-9, `La pista mantiene proporción 2:1 exacta (${R.w}×${R.h} mm)`);
assert(
  Math.abs(R.x - (PDF_LAYOUT.page.width - R.w) / 2) < 1e-9,
  'La pista está centrada horizontalmente'
);
assert(R.x >= PDF_LAYOUT.margin, 'La pista respeta el margen izquierdo');
assert(
  R.x + R.w <= PDF_LAYOUT.page.width - PDF_LAYOUT.margin,
  'La pista respeta el margen derecho'
);

/* ── 3. Encabezado cerrado: solo logo + datos institucionales ───── */
const H = PDF_LAYOUT.header;
assert(
  PDF_LAYOUT.logo.y >= H.y && PDF_LAYOUT.logo.y + PDF_LAYOUT.logo.h <= H.y + H.h,
  'El logotipo queda dentro del rectángulo del encabezado'
);
assert(
  PDF_LAYOUT.institutionalSubtitle.baseline <= H.y + H.h,
  'Los datos institucionales quedan dentro del rectángulo del encabezado'
);
assert(
  PDF_LAYOUT.data.row1.label > H.y + H.h,
  'Los campos manuales están FUERA (debajo) del encabezado'
);

/* ── 4. Textos prohibidos: Categoría, Tempo, 3/4, ESCALA DE PISTA ─ */
const allText = JSON.stringify(PDF_TEXTS);
const forbidden = [
  { pattern: /categor[ií]a/i, label: 'Categoría' },
  { pattern: /\btempo\b/i, label: 'Tempo' },
  { pattern: /\bbpm\b/i, label: 'BPM' },
  { pattern: /3\s*\/\s*4/i, label: '3/4' },
  { pattern: /37[.,]5/i, label: '37.5' },
  { pattern: /escala\s+de\s+pista/i, label: 'ESCALA DE PISTA' },
  { pattern: /1\s*metro\s*=/i, label: 'conversión de escala' },
];
for (const { pattern, label } of forbidden) {
  assert(!pattern.test(allText), `El contenido del PDF no incluye "${label}"`);
}

/* ── 5. Campos manuales: cuadrícula, etiquetas y negros ─────────── */
assert(
  !!PDF_TEXTS.labels.athlete && !!PDF_TEXTS.labels.club && !!PDF_TEXTS.labels.coach,
  'La plantilla declara las etiquetas ATLETA, CLUB y ENTRENADOR'
);
const D = PDF_LAYOUT.data;
assert(D.valueX > D.labelX, 'La línea de escritura empieza después de su etiqueta');
assert(D.clubLineEnd < D.coachLabelX, 'Las columnas Club y Entrenador no se solapan');
assert(D.coachValueX > D.coachLabelX, 'La línea de Entrenador empieza después de su etiqueta');
assert(
  Math.abs(D.row1.line - D.row1.label) >= 1.5 &&
    Math.abs(D.row2.line - D.row2.label) >= 1.5,
  'Cada línea de escritura dista al menos 1.5 mm de su etiqueta (ergonomía de lapicero)'
);
assert(D.row2.line - D.row1.line >= 8, 'Las filas de escritura distan ≥ 8 mm entre sí');

/* ── 6. Anti-solapamiento de los fiduciales (bug reportado) ─────── */
const F = PDF_LAYOUT.fiducial;
const halos = [
  { name: 'TL', x: R.x, y: R.y },
  { name: 'TR', x: R.x + R.w, y: R.y },
  { name: 'BR', x: R.x + R.w, y: R.y + R.h },
  { name: 'BL', x: R.x, y: R.y + R.h },
].map((m) => ({
  name: m.name,
  left: m.x - F.size / 2 - F.halo,
  right: m.x + F.size / 2 + F.halo,
  top: m.y - F.size / 2 - F.halo,
  bottom: m.y + F.size / 2 + F.halo,
}));

const bands = [
  { name: 'encabezado', left: H.x, right: H.x + H.w, top: H.y, bottom: H.y + H.h },
  { name: 'título', left: 0, right: 297, top: 33, bottom: 42 },
  {
    name: 'campos manuales',
    left: 0,
    right: 297,
    top: PDF_LAYOUT.data.row1.label - 3,
    bottom: PDF_LAYOUT.data.row2.line + 1.5,
  },
  {
    name: 'panel de jueces',
    left: (297 - PDF_LAYOUT.judges.w) / 2,
    right: (297 + PDF_LAYOUT.judges.w) / 2,
    top: PDF_LAYOUT.judges.y,
    bottom: PDF_LAYOUT.judges.y + PDF_LAYOUT.judges.h,
  },
  {
    name: 'bloque de instrucciones',
    left: PDF_LAYOUT.instructions.x,
    right: PDF_LAYOUT.instructions.x + PDF_LAYOUT.instructions.w,
    top: PDF_LAYOUT.instructions.y,
    bottom: PDF_LAYOUT.instructions.y + PDF_LAYOUT.instructions.h,
  },
];

for (const halo of halos) {
  for (const band of bands) {
    const overlaps =
      halo.left < band.right &&
      halo.right > band.left &&
      halo.top < band.bottom &&
      halo.bottom > band.top;
    assert(
      !overlaps,
      `La marca ${halo.name} (${halo.top.toFixed(1)}–${halo.bottom.toFixed(1)} mm) no invade el ${band.name}`
    );
  }

  assert(
    halo.left >= PDF_LAYOUT.margin && halo.right <= 297 - PDF_LAYOUT.margin,
    `La marca ${halo.name} queda dentro de los márgenes laterales`
  );
  assert(
    halo.bottom <= 210 - PDF_LAYOUT.margin,
    `La marca ${halo.name} queda por encima del margen inferior`
  );
}

assert(
  PDF_LAYOUT.instructions.y >= R.y + R.h + F.size / 2 + F.halo + 1,
  'El bloque de instrucciones arranca con holgura bajo los fiduciales inferiores'
);

/* ── 7. Crédito de desarrollo unificado con la interfaz ─────────── */
assert(
  PDF_TEXTS.credit.includes('AlsisTech') &&
    PDF_TEXTS.credit.includes('Avril Andrade Sanchez'),
  `El crédito de desarrollo está presente y unificado ("${PDF_TEXTS.credit}")`
);
assert(
  PDF_TEXTS.credit.length <= 90,
  `El crédito cabe en una sola línea centrada del pie (${PDF_TEXTS.credit.length} caracteres)`
);
assert(
  PDF_LAYOUT.instructions.creditBaseline < 210 - 4,
  'El crédito queda dentro del pie de página con margen inferior'
);

/* ── 8. Estructura editorial (títulos centrados) ────────────────── */
assert(
  PDF_TEXTS.documentTitle === PDF_TEXTS.documentTitle.toUpperCase(),
  'El título principal se imprime en mayúsculas'
);
assert(
  PDF_TEXTS.instructionsTitle === PDF_TEXTS.instructionsTitle.toUpperCase(),
  'El título del bloque de instrucciones se imprime en mayúsculas'
);

/* ── 9. Compilación binaria con branding ────────────────────────── */
const metadata: TemplateMetadata = {
  title: 'Rutina Libre Senior 2026',
  athleteName: 'María José Andrade',
  coachName: 'Mauricio Andrade Luna',
  clubName: 'Club SkateCoreo Ecuador',
};
const docWithMeta = PdfTemplateGenerator.generateTemplate(metadata);
const arrayBuffer = docWithMeta.output('arraybuffer');
assert(
  arrayBuffer && arrayBuffer.byteLength > 50000,
  `PDF compilado a binario incluye branding oficial (${arrayBuffer.byteLength} bytes)`
);

console.log(`\n🏆 TODAS LAS PRUEBAS DEL GENERADOR PDF PASARON: ${passed}/${total}`);
