import { exportCoreoProject, importCoreoProject } from './coreoPackage';
import { ChoreographyPathPoint } from '../types/choreography';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('\n--- EJECUTANDO PRUEBAS DEL SISTEMA DE PAQUETES .COREO ---');

async function runTests() {
  const dummyPoints: ChoreographyPathPoint[] = [
    {
      id: 'pt-1',
      timestamp: 0,
      time_ms: 0,
      x: 5,
      y: 5,
      type: 'Marker',
      label: ''
    },
    {
      id: 'pt-2',
      timestamp: 10000,
      time_ms: 10000,
      x: 25,
      y: 12.5,
      type: 'Jump',
      label: 'Doble Axel'
    }
  ];

  const dummyAudio = new Blob(['RIFFdummyWAVEdata'], { type: 'audio/wav' });

  // 1. Exportar proyecto .coreo
  const coreoBlob = await exportCoreoProject(
    'Programa Test RollArt',
    'Senior Femenino',
    'female',
    dummyPoints,
    dummyAudio,
    'musica_prueba.wav',
    140,
    4,
    1.0
  );

  assert(coreoBlob instanceof Blob, 'Exporta un Blob binario válido');
  assert(coreoBlob.size > 100, 'El archivo .coreo generado tiene un tamaño no trivial');

  // 2. Importar proyecto .coreo
  const imported = await importCoreoProject(coreoBlob);
  assert(imported.manifest.program.title === 'Programa Test RollArt', 'Manifiesto importado preserva el título');
  assert(imported.manifest.audioMeta.bpm === 140, 'Manifiesto importado preserva el BPM (140)');
  assert(imported.points.length === 2, 'Importa la totalidad de los nodos coreográficos (2 nodos)');
  assert(imported.points[1].label === 'Doble Axel', 'Preserva etiquetas técnicas de las figuras');
  assert(imported.audioBlob !== null, 'Preserva el binario de la pista de música');

  console.log('Resultado CoreoPackage: 5/5 pruebas pasadas con éxito.\n');
}

void runTests();

