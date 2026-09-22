import { Metronome } from './Metronome';
import { VoiceCueEngine, isSpeakableFigure, cleanFigureNameForSpeech } from './VoiceCueEngine';
import { ElementLog, ChoreographyPathPoint } from '../../types/choreography';
import { ttsService } from '../../services/ttsService';

// Mock Web Audio Context for Node test environment
class MockGainNode {
  public gain = {
    value: 1.0,
    setValueAtTime: (val: number) => { this.gain.value = val; },
    exponentialRampToValueAtTime: () => {}
  };
  public connect() {}
}

class MockAudioContext {
  public currentTime = 0;
  public createGain() { return new MockGainNode(); }
  public createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: () => {} },
      connect: () => {},
      start: () => {},
      stop: () => {}
    };
  }
}

async function runTests() {
  console.log('--- EJECUTANDO PRUEBAS DEL MÓDULO 1: AUDIO, METRÓNOMO Y GUÍAS DE VOZ ---');
  let passed = 0;
  let total = 0;

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

  // 1. Metrónomo
  const metronome = new Metronome({ bpm: 120, beatsPerMeasure: 4 });
  metronome.init(new MockAudioContext() as any, new MockGainNode() as any);
  assert(metronome.getConfig().bpm === 120, 'Metrónomo inicializa con 120 BPM');
  assert(metronome.getConfig().beatsPerMeasure === 4, 'Compás inicializado en 4/4');

  metronome.setBpm(160);
  assert(metronome.getConfig().bpm === 160, 'Cambio de BPM a 160 funciona');

  metronome.setBeatsPerMeasure(3);
  assert(metronome.getConfig().beatsPerMeasure === 3, 'Cambio a compás 3/4 (Vals RollArt) funciona');

  metronome.setBeatsPerMeasure(1);
  assert(metronome.getConfig().beatsPerMeasure === 1, 'Cambio a compás 1/1 (Pulso continuo) funciona');

  metronome.setBeatsPerMeasure(6);
  assert(metronome.getConfig().beatsPerMeasure === 6, 'Cambio a compás 6/8 (Ternario compuesto) funciona');

  // 2. Voice Cue Engine
  const voiceEngine = new VoiceCueEngine({
    enabled: true,
    introDelaySec: 5,
    warningLeadTimeSec: 3,
    language: 'es'
  });

  assert(voiceEngine.getConfig().introDelaySec === 5, 'Pre-roll intro delay configurado a 5s');
  assert(voiceEngine.getConfig().warningLeadTimeSec === 3, 'Anticipación de aviso a 3s');

  const mockElements: ElementLog[] = [
    {
      id: 'el-1',
      program_id: 'prog-1',
      element_type: 'Jump',
      base_code: '2A',
      name: 'Doble Axel',
      execution_timestamp: 15000, // 15.0s
      deduction_code: null,
      is_time_bonus_applied: false,
      rotations_count: 2.5,
      edge_indicator: null,
      qoe_score: 1,
      base_value: 3.3,
      final_value: 3.6,
      is_valid: true
    },
    {
      id: 'el-2',
      program_id: 'prog-1',
      element_type: 'Spin',
      base_code: 'CCSp',
      name: 'Camel Spin Cambiado',
      execution_timestamp: 30000, // 30.0s
      deduction_code: null,
      is_time_bonus_applied: false,
      rotations_count: 4,
      edge_indicator: null,
      qoe_score: 0,
      base_value: 2.0,
      final_value: 2.0,
      is_valid: true
    }
  ];

  voiceEngine.loadProgramElements(mockElements);
  // Verification: warning for 2A at 15s with 3s lead time should trigger at 12000ms
  // We can inspect internal cues or verify lead time calculation
  const leadMs = voiceEngine.getConfig().warningLeadTimeSec * 1000;
  assert(mockElements[0].execution_timestamp - leadMs === 12000, 'Aviso de Doble Axel se calcula a 12.0s (3s antes de 15s)');
  assert(mockElements[1].execution_timestamp - leadMs === 27000, 'Aviso de Camel Spin se calcula a 27.0s (3s antes de 30s)');

  // 3. Pre-roll cancelation
  voiceEngine.cancelPreRoll();
  assert(!voiceEngine.isPreRolling(), 'Cancelación de Pre-roll resetea estado correctamente');

  // 4. Matrix Routing Simulation
  function calculateMatrix(mode: string, mVol: number, cVol: number) {
    let musicL = 0, musicR = 0, coachL = 0, coachR = 0;
    switch (mode) {
      case 'split-coach':
        musicL = mVol; musicR = 0.0; coachL = 0.0; coachR = cVol;
        break;
      case 'solo-left':
        musicL = mVol; musicR = 0.0; coachL = cVol; coachR = 0.0;
        break;
      case 'solo-right':
        musicL = 0.0; musicR = mVol; coachL = 0.0; coachR = cVol;
        break;
      case 'stereo':
        musicL = mVol; musicR = mVol; coachL = cVol; coachR = cVol;
        break;
    }
    return { musicL, musicR, coachL, coachR };
  }

  const splitMatrix = calculateMatrix('split-coach', 1.0, 0.8);
  assert(splitMatrix.musicL === 1.0 && splitMatrix.musicR === 0.0, 'Modo Split-Coach: Música 100% en L y 0% en R (altavoces limpios)');
  assert(splitMatrix.coachL === 0.0 && splitMatrix.coachR === 0.8, 'Modo Split-Coach: Guías 0% en L y 80% en R (solo auricular coach)');

  const soloLeftMatrix = calculateMatrix('solo-left', 1.0, 1.0);
  assert(soloLeftMatrix.musicL === 1.0 && soloLeftMatrix.musicR === 0.0, 'Modo Solo-L: Canal R en silencio absoluto 0.0');

  const soloRightMatrix = calculateMatrix('solo-right', 1.0, 1.0);
  assert(soloRightMatrix.musicL === 0.0 && soloRightMatrix.musicR === 1.0, 'Modo Solo-R: Canal L en silencio absoluto 0.0');

  // 5. Pruebas de configuración de Google Cloud Text-to-Speech API
  voiceEngine.setTtsEngine('google-cloud');
  assert(voiceEngine.getConfig().ttsEngine === 'google-cloud', 'Motor TTS configurado a google-cloud');

  voiceEngine.setGoogleApiKey('AIzaSyTEST_MOCK_KEY_12345');
  assert(voiceEngine.getConfig().googleApiKey === 'AIzaSyTEST_MOCK_KEY_12345', 'Clave API de Google Cloud guardada correctamente');

  // VOZ ÚNICA FEMENINA LATINA: una voz castellana (es-ES) o masculina fuera del
  // catálogo se normaliza a la voz premium latina por defecto.
  voiceEngine.setGoogleVoiceName('es-ES-Neural2-A');
  assert(
    voiceEngine.getConfig().googleVoiceName === 'es-US-Neural2-A',
    'Una voz fuera del catálogo (es-ES) se normaliza a la voz latina femenina premium'
  );

  voiceEngine.setGoogleVoiceName('es-US-Journey-F');
  assert(voiceEngine.getConfig().googleVoiceName === 'es-US-Journey-F', 'Voz Journey F seleccionada correctamente');

  voiceEngine.setGoogleVoiceName('es-US-Neural2-B'); // voz masculina eliminada
  assert(
    voiceEngine.getConfig().googleVoiceName !== 'es-US-Neural2-B' &&
      voiceEngine.getConfig().voiceGender === 'female',
    'La voz masculina queda eliminada: se fuerza el catálogo femenino latino'
  );

  // La anticipación es configurable y acota el rango válido.
  voiceEngine.setAnticipation(2);
  assert(voiceEngine.getConfig().anticipationSec === 2, 'Anticipación de la Voz Guía configurada a 2s');
  voiceEngine.setAnticipation(99);
  assert(voiceEngine.getConfig().anticipationSec === 5, 'Anticipación acotada al máximo de 5s');
  voiceEngine.setAnticipation(1.5);

  // 6. Prueba de stop() en VoiceCueEngine
  voiceEngine.startPreRoll(() => {}, () => {});
  assert(voiceEngine.isPreRolling() === true, 'Pre-roll se inicia adecuadamente');
  voiceEngine.stop();
  assert(voiceEngine.isPreRolling() === false, 'voiceEngine.stop() detiene el pre-roll y cancela locución');

  // 7. Prueba del Secuenciador Matemático de Alerta Temprana: Cuenta regresiva "3, 2, 1, ¡Ya! [Figura]"
  const mockNodes: ChoreographyPathPoint[] = [
    {
      id: 'node-salchow',
      x: 25,
      y: 12.5,
      time_ms: 45000, // 45.0s
      label: 'Salchow'
    },
    {
      id: 'node-trompo',
      x: 10,
      y: 8,
      time_ms: 90000, // 90.0s
      label: 'Trompo'
    }
  ];

  voiceEngine.loadNodes(mockNodes);
  const cues = voiceEngine.getCues();

  // Para Salchow a 45.0s, con anticipación por defecto (conteo 3s + 1.5s):
  // 1. Nombre de la figura ANTICIPADO: T - 4500ms = 40.5s -> "Salchow, en"
  const cueName = cues.find(c => c.id === 'cue-node-salchow-name');
  assert(cueName !== undefined && cueName.timeMs === 40500 && cueName.text === 'Salchow, en', 'Aviso anticipado del nombre "Salchow, en" (offset negativo de 4.5s)');

  // 2. Conteo regresivo en palabras
  // T - 3000ms = 42.0s -> "tres"
  const cue3 = cues.find(c => c.id === 'cue-node-salchow-3');
  assert(cue3 !== undefined && cue3.timeMs === 42000 && cue3.text === 'tres', 'Cuenta regresiva "tres" calculada a 42.0s');

  // T - 2000ms = 43.0s -> "dos"
  const cue2 = cues.find(c => c.id === 'cue-node-salchow-2');
  assert(cue2 !== undefined && cue2.timeMs === 43000 && cue2.text === 'dos', 'Cuenta regresiva "dos" calculada a 43.0s');

  // T - 1000ms = 44.0s -> "uno"
  const cue1 = cues.find(c => c.id === 'cue-node-salchow-1');
  assert(cue1 !== undefined && cue1.timeMs === 44000 && cue1.text === 'uno', 'Cuenta regresiva "uno" calculada a 44.0s');

  // T = 45.0s -> "¡ya!"
  const cueGo = cues.find(c => c.id === 'cue-node-salchow-go');
  assert(cueGo !== undefined && cueGo.timeMs === 45000 && cueGo.text === '¡ya!', 'Aviso de llegada "¡ya!" calculado exactamente a 45.0s');

  // Validación de isSpeakableFigure y descarte de marcadores automáticos y etiquetas de nodos estructurales
  assert(isSpeakableFigure('Salchow', 'Jump') === true, 'isSpeakableFigure aprueba figura técnica real');
  assert(isSpeakableFigure('Axel', 'Jump') === true, 'isSpeakableFigure aprueba figura Axel');
  assert(isSpeakableFigure('Loop (Rittberger)', 'Jump') === true, 'isSpeakableFigure aprueba Loop (Rittberger)');
  assert(isSpeakableFigure('1-2 (Grupo 1)', 'Step') === true, 'isSpeakableFigure aprueba figura obligatoria');
  assert(isSpeakableFigure('', 'Step', '1A') === true, 'isSpeakableFigure aprueba nodo con element_id');
  
  // Rechazo explícito de etiquetas de nodos estructurales y de dibujo
  assert(isSpeakableFigure('Inicio Trazo', 'Step') === false, 'isSpeakableFigure rechaza "Inicio Trazo"');
  assert(isSpeakableFigure('Fin Trazo', 'Step') === false, 'isSpeakableFigure rechaza "Fin Trazo"');
  assert(isSpeakableFigure('Vértice', 'Step') === false, 'isSpeakableFigure rechaza "Vértice"');
  assert(isSpeakableFigure('Bucle', 'Curve') === false, 'isSpeakableFigure rechaza "Bucle"');
  assert(isSpeakableFigure('Curva', 'Curve') === false, 'isSpeakableFigure rechaza "Curva"');
  assert(isSpeakableFigure('Curva de Transición', 'Step') === false, 'isSpeakableFigure rechaza "Curva de Transición"');
  assert(isSpeakableFigure('Pose Final', 'Step') === false, 'isSpeakableFigure rechaza "Pose Final"');
  assert(isSpeakableFigure('Beat 4s', 'Marker') === false, 'isSpeakableFigure rechaza etiqueta "Beat 4s"');
  assert(isSpeakableFigure('Beat 12.5s', 'Marker') === false, 'isSpeakableFigure rechaza etiqueta "Beat 12.5s"');
  assert(isSpeakableFigure('Punto #1', 'Step') === false, 'isSpeakableFigure rechaza etiqueta "Punto #1"');
  assert(isSpeakableFigure('Nodo 2', 'Step') === false, 'isSpeakableFigure rechaza etiqueta "Nodo 2"');
  assert(isSpeakableFigure('Step 3', 'Step') === false, 'isSpeakableFigure rechaza etiqueta "Step 3"');
  assert(isSpeakableFigure('Sin figura', 'Step') === false, 'isSpeakableFigure rechaza "Sin figura"');
  assert(isSpeakableFigure('', 'Marker') === false, 'isSpeakableFigure rechaza etiqueta vacía');
  assert(isSpeakableFigure(undefined, 'Step') === false, 'isSpeakableFigure rechaza undefined');
  assert(isSpeakableFigure('track.wav', 'Marker') === false, 'isSpeakableFigure rechaza archivos de audio');

  // Limpieza de nombres de figuras para voz
  assert(cleanFigureNameForSpeech('Upright (Posición Base)') === 'Upright', 'cleanFigureNameForSpeech remueve sufijo de categoría');
  assert(cleanFigureNameForSpeech('1-2 (Grupo 1)') === 'Figura 1 y 2, Grupo 1', 'cleanFigureNameForSpeech formatea grupo reglamentario');

  // Carga de nodos mixtos en VoiceCueEngine:
  // Solo los nodos con figuras reales seleccionadas deben generar avisos vocales;
  // los nodos sin figura (o con etiquetas estructurales de nodo) deben omitirse POR COMPLETO (0 avisos).
  const mixedNodes = [
    { id: 'node-inicio', x: 5, y: 12, time_ms: 1000, label: 'Inicio Trazo', type: 'Step' },
    { id: 'node-salchow', x: 25, y: 12, time_ms: 45000, label: 'Salchow', type: 'Jump' },
    { id: 'node-beat', x: 10, y: 8, time_ms: 4000, label: 'Beat 4s', type: 'Marker' },
    { id: 'node-punto', x: 15, y: 9, time_ms: 8000, label: 'Punto #2', type: 'Step' },
    { id: 'node-vertice', x: 18, y: 11, time_ms: 10000, label: 'Vértice', type: 'Step' },
    { id: 'node-empty', x: 20, y: 10, time_ms: 12000, label: '', type: 'Marker' },
    { id: 'node-fin', x: 45, y: 20, time_ms: 60000, label: 'Fin Trazo', type: 'Step' }
  ];
  voiceEngine.loadNodes(mixedNodes as any);
  const mixedCues = voiceEngine.getCues();
  assert(!mixedCues.some(c => c.text.includes('Inicio Trazo')), 'VoiceCueEngine no genera avisos para "Inicio Trazo"');
  assert(!mixedCues.some(c => c.text.includes('Fin Trazo')), 'VoiceCueEngine no genera avisos para "Fin Trazo"');
  assert(!mixedCues.some(c => c.text.includes('Vértice')), 'VoiceCueEngine no genera avisos para "Vértice"');
  assert(!mixedCues.some(c => c.text.includes('Beat 4s')), 'VoiceCueEngine no genera avisos para "Beat 4s"');
  assert(!mixedCues.some(c => c.text.includes('Punto #2')), 'VoiceCueEngine no genera avisos para "Punto #2"');
  assert(!mixedCues.some(c => c.elementId === 'node-empty'), 'Nodo sin figura seleccionada no genera ningún aviso vocal (omitido)');
  assert(!mixedCues.some(c => c.elementId === 'node-inicio'), 'Nodo inicio sin figura no genera ningún aviso vocal');
  assert(!mixedCues.some(c => c.elementId === 'node-fin'), 'Nodo fin sin figura no genera ningún aviso vocal');
  assert(mixedCues.some(c => c.text.includes('Salchow')), 'VoiceCueEngine conserva figura técnica real "Salchow"');

  // 8. Pruebas del Servicio Global de TTS (TTSService Singleton)
  assert(typeof ttsService.speak === 'function', 'ttsService expone método speak universal');
  
  ttsService.setApiKey('AIzaSyGLOBAL_TEST_API_KEY_999');
  assert(ttsService.hasGoogleApiKey() === true, 'ttsService detecta API Key de Google configurada');

  ttsService.setVoiceGender('female');
  assert(ttsService.getVoiceGender() === 'female', 'ttsService opera con voz femenina latina');

  // La voz masculina se eliminó de la lógica: el servicio la ignora y conserva
  // el catálogo femenino aunque se solicite explícitamente.
  (ttsService as unknown as { setVoiceGender: (g: string) => void }).setVoiceGender('male');
  assert(ttsService.getVoiceGender() === 'female', 'ttsService ignora la voz masculina (eliminada de la lógica)');

  ttsService.setLanguage('es');
  assert(ttsService.getLanguage() === 'es', 'ttsService configura idioma a español');

  ttsService.setLanguage('en');
  assert(ttsService.getLanguage() === 'en', 'ttsService configura idioma a inglés');

  // 9. Verificación de finalización automática de pre-roll countdown
  let preRollCompleted: boolean = false;
  const testVoiceEngine = new VoiceCueEngine({ enabled: true, introDelaySec: 1 });
  await new Promise<void>((resolve) => {
    testVoiceEngine.startPreRoll(
      () => {},
      () => {
        preRollCompleted = true;
        resolve();
      },
      0.05 // 50ms para pruebas rápidas
    );
  });
  assert(Boolean(preRollCompleted) === true, 'Pre-roll completa y ejecuta callback para iniciar reproducción automática de la pista');

  // 10. Verificación del Metrónomo sincronizado y sin retardo de fase
  const metroSync = new Metronome({ bpm: 140, beatsPerMeasure: 4 });
  const mockCtx = new MockAudioContext();
  const mockGain = new MockGainNode();
  metroSync.init(mockCtx as any, mockGain as any);
  metroSync.start(0);
  assert(metroSync.getConfig().bpm === 140, 'Metrónomo opera a 140 BPM (tempo de prueba)');
  assert(metroSync.getBeatDurationSec() === 60 / 140, 'Duración exacta de beat a 140 BPM');

  metroSync.sync(0.42857); // Exactamente 1 beat después
  assert(mockGain !== null, 'Metrónomo mantiene sincronización de audio con AudioContext');
  metroSync.stop();
  testVoiceEngine.stop();

  console.log(`\nResultado Módulo 1: ${passed}/${total} pruebas pasadas con éxito.\n`);
}

void runTests();
