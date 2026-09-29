/**
 * coach.test.ts — Pruebas Unitarias del Panel de Entrenadores
 *
 * Valida:
 *  1. Cálculo de edad y categoría oficial (reutilizando reglamento.ts)
 *  2. Base de datos local-first (coachDb)
 *  3. Versionado de coreografías y archivos .coreo
 *  4. Generación y restauración de paquetes de respaldo (.zip)
 *  5. Arquitectura desacoplada de almacenamiento (StorageManager)
 */

import {
  calculateExactAge,
  calculateSportsAge,
  calculateCategoryDetails,
  getCategoriaByEdad,
} from './services/categoryService';
import { coachDb } from './services/coachDb';
import { storageManager } from './services/storage/StorageManager';
import { coachBackupService } from './services/coachBackupService';
import { CoachAthlete, CoachChoreography } from './types';

// Mock de alert y window.confirm si no existen en entorno Node
if (typeof (globalThis as any).alert === 'undefined') {
  (globalThis as any).alert = (msg: string) => console.log('[Alert Mock]:', msg);
}
if (typeof (globalThis as any).confirm === 'undefined') {
  (globalThis as any).confirm = () => true;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ✅ PASSED: ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${desc}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== TEST SUITE: PANEL DE ENTRENADORES ===\n');

  // ── 1. CÁLCULO DE EDAD Y CATEGORÍA OFICIAL ───────────────
  console.log('--- 1. Pruebas de Categoría Oficial y Edad ---');

  // Patinador de 8 años -> TOT
  const catTot = getCategoriaByEdad(8);
  assert(catTot === 'TOT', 'Edad 8 años corresponde a TOT (<= 9 años)');

  // Patinador de 11 años -> MINI
  const catMini = getCategoriaByEdad(11);
  assert(catMini === 'MINI', 'Edad 11 años corresponde a MINI (10-11 años)');

  // Patinador de 12 años -> ESPOIR
  const catEspoir = getCategoriaByEdad(12);
  assert(catEspoir === 'ESPOIR', 'Edad 12 años corresponde a ESPOIR (12-13 años)');

  // Patinador de 15 años -> CADET
  const catCadet = getCategoriaByEdad(15);
  assert(catCadet === 'CADET', 'Edad 15 años corresponde a CADET (14-15 años)');

  // Patinador de 17 años -> MAYOR
  const catMayor = getCategoriaByEdad(17);
  assert(catMayor === 'MAYOR', 'Edad 17 años corresponde a MAYOR (>= 16 años)');

  // Cálculo a partir de fecha de nacimiento
  const refDate = new Date('2026-06-15T12:00:00Z');
  const exactAge = calculateExactAge('2014-06-10', refDate);
  assert(exactAge === 12, 'Nacido el 2014-06-10 tiene 12 años cumplidos al 2026-06-15');

  const sportsAge = calculateSportsAge('2014-11-20', 2026);
  assert(sportsAge === 12, 'Edad deportiva en 2026 para nacido en 2014 es 12 años');

  const details = calculateCategoryDetails('2014-06-10', refDate);
  assert(details.category === 'ESPOIR', 'Calcula categoría ESPOIR para 12 años');
  assert(details.nextCategory === 'CADET', 'Próxima categoría tras ESPOIR es CADET (a los 14 años)');
  assert(Boolean(details.nextCategoryChangeDate), 'Calcula fecha del próximo cambio de categoría');

  // ── 2. BASE DE DATOS LOCAL-FIRST (coachDb) ───────────────
  console.log('\n--- 2. Pruebas de Base de Datos Local-First (coachDb) ---');

  const testAthlete: CoachAthlete = {
    id: 'ath_test_01',
    firstName: 'María',
    lastName: 'Andrade',
    name: 'María Andrade',
    birthDate: '2014-05-14',
    age: 12,
    category: 'ESPOIR',
    categoryAuto: true,
    club: 'CPA Barcelona',
    trainerName: 'Mauricio Andrade',
    eficiencia: 'BÁSICA',
    specialty: 'Libre',
    level: 'Federado',
    technicalNotes: 'Excelente rotación en Axel y Biellmann.',
    contactInfo: {
      guardianName: 'Avril Andrade',
      phone: '+34 600 123 456',
      email: 'contacto@familia.com',
    },
    created_at: Date.now(),
    updated_at: Date.now(),
    syncState: 'local',
  };

  await coachDb.saveAthlete(testAthlete);
  const fetchedAthlete = await coachDb.getAthleteById('ath_test_01');
  assert(fetchedAthlete !== null, 'Atleta guardado exitosamente en coachDb');
  assert(fetchedAthlete?.name === 'María Andrade', 'Recupera el nombre completo correctamente');
  assert(fetchedAthlete?.club === 'CPA Barcelona', 'Recupera el club correctamente');

  const allAthletes = await coachDb.getAllAthletes();
  assert(allAthletes.some((a) => a.id === 'ath_test_01'), 'getAllAthletes contiene al atleta creado');

  // ── 3. VERSIONADO DE COREOGRAFÍAS Y ARCHIVOS .COREO ──────
  console.log('\n--- 3. Pruebas de Coreografías y Versionado ---');

  // Guardar archivo binario simulado (.coreo)
  const dummyCoreoBlob = new Blob(['SKATECOREO_BUNDLE_DUMMY_BINARY'], { type: 'application/octet-stream' });
  const blobId = 'blob_coreo_test_v1';

  await coachDb.saveBinaryFile({
    id: blobId,
    name: 'Maria_Andrade_Programa_Libre_2026_v01.coreo',
    mimeType: 'application/octet-stream',
    blob: dummyCoreoBlob,
    size: dummyCoreoBlob.size,
    savedAt: Date.now(),
    athleteId: testAthlete.id,
    choreographyId: 'choreo_test_01',
    versionNumber: 1,
  });

  const fetchedBlob = await coachDb.getBinaryFile(blobId);
  assert(fetchedBlob !== null, 'Archivo binario .coreo guardado y recuperado');
  assert(fetchedBlob?.size === dummyCoreoBlob.size, 'Tamaño del archivo binario consistente');

  const testChoreo: CoachChoreography = {
    id: 'choreo_test_01',
    athleteId: testAthlete.id,
    title: 'Programa Libre 2026',
    programType: 'Libre',
    year: 2026,
    suggestedFileName: 'Maria_Andrade_Programa_Libre_2026.coreo',
    category: 'ESPOIR',
    durationMs: 180000,
    pointsCount: 14,
    hasAudio: true,
    audioFileName: 'musica_libre.wav',
    currentVersion: 1,
    versions: [
      {
        versionNumber: 1,
        versionLabel: 'v1',
        fileName: 'Maria_Andrade_Programa_Libre_2026_v01.coreo',
        coreoBlobId: blobId,
        coreoBlobSize: dummyCoreoBlob.size,
        savedAt: Date.now(),
        syncState: 'local',
      },
    ],
    created_at: Date.now(),
    updated_at: Date.now(),
    syncState: 'local',
  };

  await coachDb.saveChoreography(testChoreo);
  const athleteChoreos = await coachDb.getChoreographiesByAthlete(testAthlete.id);
  assert(athleteChoreos.length === 1, 'Coreografía asociada correctamente al atleta');
  assert(athleteChoreos[0].versions.length === 1, 'Versión 1 registrada en el expediente');

  // Agregar versión 2 (v2)
  const dummyCoreoV2 = new Blob(['SKATECOREO_BUNDLE_V2'], { type: 'application/octet-stream' });
  const blobIdV2 = 'blob_coreo_test_v2';
  await coachDb.saveBinaryFile({
    id: blobIdV2,
    name: 'Maria_Andrade_Programa_Libre_2026_v02.coreo',
    mimeType: 'application/octet-stream',
    blob: dummyCoreoV2,
    size: dummyCoreoV2.size,
    savedAt: Date.now(),
    athleteId: testAthlete.id,
    choreographyId: 'choreo_test_01',
    versionNumber: 2,
  });

  const updatedChoreo: CoachChoreography = {
    ...testChoreo,
    currentVersion: 2,
    versions: [
      ...testChoreo.versions,
      {
        versionNumber: 2,
        versionLabel: 'v2',
        fileName: 'Maria_Andrade_Programa_Libre_2026_v02.coreo',
        coreoBlobId: blobIdV2,
        coreoBlobSize: dummyCoreoV2.size,
        savedAt: Date.now(),
        syncState: 'local',
      },
    ],
    updated_at: Date.now(),
  };

  await coachDb.saveChoreography(updatedChoreo);
  const choreoV2 = await coachDb.getChoreographyById('choreo_test_01');
  assert(choreoV2?.currentVersion === 2, 'Coreografía actualizada a versión 2');
  assert(choreoV2?.versions.length === 2, 'Conserva ambas versiones (v1 y v2) sin sobrescritura destructiva');

  // ── 4. ARQUITECTURA DE ALMACENAMIENTO Y SINCRONIZACIÓN ─────
  console.log('\n--- 4. Pruebas de StorageManager y Proveedores ---');

  const localProvider = storageManager.getProvider('local');
  assert(localProvider.id === 'local', 'Proveedor local registrado');
  assert(localProvider.isConnected() === true, 'Proveedor local siempre conectado');

  const gdriveProvider = storageManager.getProvider('google_drive');
  assert(gdriveProvider.id === 'google_drive', 'Proveedor Google Drive registrado');

  const onedriveProvider = storageManager.getProvider('onedrive');
  assert(onedriveProvider.id === 'onedrive', 'Proveedor OneDrive registrado');

  const dropboxProvider = storageManager.getProvider('dropbox');
  assert(dropboxProvider.id === 'dropbox', 'Proveedor Dropbox registrado');

  const summary = await storageManager.getSummary();
  assert(summary.totalAthletes >= 1, 'StorageManager reporta atletas correctamente');
  assert(summary.totalFiles >= 2, 'StorageManager reporta archivos locales correctamente');

  // ── 5. RESPALDO Y RESTAURACIÓN UNIVERSAL (ZIP) ───────────
  console.log('\n--- 5. Pruebas de Copia de Seguridad y Restauración (ZIP) ---');

  const backupResult = await coachBackupService.createFullBackup();
  assert(backupResult.blob.size > 0, 'Backup ZIP generado con contenido binario');
  assert(backupResult.fileName.startsWith('SkateCoreo_Backup_'), 'Nombre del backup con fecha estándar');
  assert(backupResult.athletesCount >= 1, 'El backup contiene atletas empaquetados');

  // Prueba de restauración
  const restoreResult = await coachBackupService.restoreBackup(backupResult.blob);
  assert(restoreResult.success === true, 'Restauración del backup ZIP ejecutada con éxito');
  assert(restoreResult.athletesRestored >= 1, 'Restauró al menos 1 atleta del paquete');

  console.log('\n=========================================');
  console.log(`TOTAL PRUEBAS: ${passed + failed} | PASADAS: ${passed} | FALLIDAS: ${failed}`);
  console.log('=========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

void runTests();
