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
    clubName: 'Club SkateArt Ecuador',
    category: 'Senior Internacional',
    bpm: 128,
    durationSec: 195,
  };

  const docWithMeta = PdfTemplateGenerator.generateTemplate(metadata);
  assert(docWithMeta !== null, 'Genera plantilla con metadatos de coreografía completos');

  // 5. Generación de buffer binario sin errores
  const arrayBuffer = docWithMeta.output('arraybuffer');
  assert(arrayBuffer && arrayBuffer.byteLength > 1000, `PDF compilado a binario tiene tamaño válido (${arrayBuffer.byteLength} bytes)`);

  console.log(`\n🎉 TODAS LAS PRUEBAS DEL GENERADOR PDF PASARON: ${passed}/${total}`);
}

runPdfTemplateTests();

