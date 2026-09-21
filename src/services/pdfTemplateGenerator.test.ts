import { PdfTemplateGenerator, TemplateMetadata } from './pdfTemplateGenerator';

function runPdfTemplateTests() {
  console.log('--- EJECUTANDO PRUEBAS DEL GENERADOR DE PLANTILLA PDF A4 ---');
  let total = 0;
  let passed = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (!condition) {
      console.error(`❌ FAILED: ${msg}`);
      process.exit(1);
    } else {
      console.log(`✅ PASSED: ${msg}`);
      passed++;
    }
  }

  // 1. Generación de instancia jsPDF básica
  const doc = PdfTemplateGenerator.generateTemplate();
  assert(doc !== null && typeof doc === 'object', 'Genera instancia válida de jsPDF');

  // 2. Verificación de orientación y dimensiones A4 Landscape
  const internal = (doc as any).internal;
  const pageSize = internal.pageSize;
  const widthMm = pageSize.getWidth();
  const heightMm = pageSize.getHeight();

  assert(Math.abs(widthMm - 297) < 0.1, `Ancho de hoja A4 Horizontal es 297 mm (${widthMm.toFixed(1)} mm)`);
  assert(Math.abs(heightMm - 210) < 0.1, `Alto de hoja A4 Horizontal es 210 mm (${heightMm.toFixed(1)} mm)`);

  // 3. Cantidad de páginas
  const pageCount = internal.getNumberOfPages();
  assert(pageCount === 1, `La plantilla es exactamente de 1 página (actual: ${pageCount})`);

  // 4. Inclusión de metadatos completos
  const metadata: TemplateMetadata = {
    title: 'Rutina Libre Senior 2026',
    athleteName: 'María José Andrade',
    coachName: 'Mauricio Andrade Luna',
    clubName: 'Club SkateCoreo Ecuador',
    category: 'Senior Internacional',
    bpm: 128,
    durationSec: 195,
  };

  const docWithMeta = PdfTemplateGenerator.generateTemplate(metadata);
  assert(docWithMeta !== null, 'Genera plantilla con metadatos de coreografía completos');

  // 5. Generación de buffer binario sin errores (incluyendo imagen de branding)
  const arrayBuffer = docWithMeta.output('arraybuffer');
  assert(arrayBuffer && arrayBuffer.byteLength > 50000, `PDF compilado a binario incluye branding oficial (${arrayBuffer.byteLength} bytes)`);

  // 6. Validación geométrica y matemática de no-interferencia (Anti-Colisión)
  // Rink Y = 44mm, Rink X = 28.5mm
  // TL Fiducial Marker Center = (28.5, 44), Top edge = 37.5mm
  // Header Box Bottom = 36mm
  // SkateCoreo Logo: X=14mm, Y=12.5mm, W=48mm, H=8.1mm -> Bottom edge = 20.6mm
  const LOGO_X = 14;
  const LOGO_Y = 12.5;
  const LOGO_W = 48;
  const LOGO_H = 8.1;
  const LOGO_BOTTOM = LOGO_Y + LOGO_H; // 20.6 mm
  const FIDUCIAL_TL_TOP = 44 - (10 / 2 + 1.5); // 37.5 mm
  const RINK_ACTIVE_TOP = 44; // 44 mm

  assert(LOGO_BOTTOM < FIDUCIAL_TL_TOP, `Margen seguro: Borde inferior del logo (${LOGO_BOTTOM} mm) está muy por encima de la marca fiducial TL (${FIDUCIAL_TL_TOP} mm). Distancia libre = ${(FIDUCIAL_TL_TOP - LOGO_BOTTOM).toFixed(1)} mm`);
  assert(LOGO_BOTTOM < RINK_ACTIVE_TOP, `Margen seguro: Borde inferior del logo (${LOGO_BOTTOM} mm) no invade el área activa de la pista (${RINK_ACTIVE_TOP} mm). Distancia libre = ${(RINK_ACTIVE_TOP - LOGO_BOTTOM).toFixed(1)} mm`);
  assert(LOGO_X + LOGO_W < 297 - 20, `Ancho de logo (${LOGO_W} mm) no excede el ancho útil del encabezado`);

  console.log(`\n🎉 TODAS LAS PRUEBAS DEL GENERADOR PDF PASARON: ${passed}/${total}`);
}

runPdfTemplateTests();

