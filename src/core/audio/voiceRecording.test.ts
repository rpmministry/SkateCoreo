/**
 * Pruebas de la grabación de voz (Fase 4).
 *
 * En Node no hay `navigator.mediaDevices`, así que se valida el contrato seguro del
 * store: existe la pista dedicada "VOZ (Grabación)", iniciar sin soporte NO lanza y
 * deja un error legible, y cancelar restablece el estado. La captura real se prueba
 * en dispositivo.
 */

import { useAudioStudioStore } from '../../store/useAudioStudioStore';

let total = 0;
function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASSED: ${msg}`);
}

async function main() {
  console.log('--- PRUEBAS DE GRABACIÓN DE VOZ (FASE 4) ---');

  const track = useAudioStudioStore.getState().tracks.recording;
  assert(!!track, 'Existe la pista dedicada de grabación');
  assert(track.id === 'track-recording', "La pista de grabación tiene id 'track-recording'");
  assert(track.clips.length === 0, 'La pista de grabación arranca sin tomas');
  assert(/VOZ/i.test(track.name), 'La pista se identifica claramente como VOZ');
  assert(track.type === 'voice', "La pista de grabación es de tipo 'voice'");

  // Iniciar sin soporte (Node) no debe lanzar ni dejar el estado colgado.
  const started = await useAudioStudioStore.getState().startVoiceRecording();
  assert(started === false, 'Sin soporte de micrófono, startVoiceRecording() devuelve false');
  assert(useAudioStudioStore.getState().isRecording === false, 'No queda en estado "grabando"');
  assert(
    typeof useAudioStudioStore.getState().recordingError === 'string' &&
      useAudioStudioStore.getState().recordingError!.length > 0,
    'Se registra un error legible para el usuario'
  );

  // Cancelar es idempotente y deja el estado limpio.
  useAudioStudioStore.getState().cancelVoiceRecording();
  assert(useAudioStudioStore.getState().isRecording === false, 'cancelVoiceRecording() deja isRecording=false');

  // Detener sin grabación activa no inventa una toma.
  const clip = await useAudioStudioStore.getState().stopVoiceRecording();
  assert(clip === null, 'stopVoiceRecording() sin toma activa devuelve null (no inventa)');
  assert(
    useAudioStudioStore.getState().tracks.recording.clips.length === 0,
    'No se añade ninguna toma fantasma'
  );

  // Monitorización de entrada: por defecto OFF y no rompe sin micrófono.
  assert(
    useAudioStudioStore.getState().recordingMonitorEnabled === false,
    'La monitorización arranca desactivada (anti-realimentación)'
  );
  useAudioStudioStore.getState().setRecordingMonitor(true);
  assert(
    typeof useAudioStudioStore.getState().recordingMonitorEnabled === 'boolean',
    'Activar la monitorización sin micrófono no lanza'
  );
  useAudioStudioStore.getState().setRecordingMonitor(false);
  assert(
    useAudioStudioStore.getState().recordingMonitorEnabled === false,
    'Desactivar la monitorización la deja en false'
  );

  // Pre-inicio de grabación: por defecto OFF, segundos acotados.
  assert(
    useAudioStudioStore.getState().recordingCountdownEnabled === false,
    'El pre-inicio arranca desactivado'
  );
  useAudioStudioStore.getState().setRecordingCountdownSec(100);
  assert(
    useAudioStudioStore.getState().recordingCountdownSec === 10,
    'Los segundos de pre-inicio se acotan al máximo (10)'
  );
  useAudioStudioStore.getState().setRecordingCountdownSec(0);
  assert(
    useAudioStudioStore.getState().recordingCountdownSec === 1,
    'Los segundos de pre-inicio se acotan al mínimo (1)'
  );
  useAudioStudioStore.getState().setRecordingCountdownEnabled(true);
  assert(
    useAudioStudioStore.getState().recordingCountdownEnabled === true,
    'El pre-inicio se puede activar'
  );

  console.log(`\nTODAS LAS PRUEBAS DE GRABACIÓN DE VOZ PASARON: ${total}/${total}`);
}

main().catch((err) => {
  console.error('Error inesperado en las pruebas de grabación:', err);
  process.exit(1);
});
