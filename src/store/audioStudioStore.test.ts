import { useAudioStudioStore } from './useAudioStudioStore';
import { useChoreographyStore } from './useChoreographyStore';
import { audioEngine } from '../core/audio/AudioEngine';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('\n--- EJECUTANDO PRUEBAS DEL ESTUDIO DE AUDIO Y BANDEJA SECUENCIAL ---');

// 1. Nodos de Audio Temporales (Sin coordenadas espaciales x, y)
useAudioStudioStore.getState().clearTimeNodes();
assert(useAudioStudioStore.getState().audioNodes.length === 0, 'Audio Studio inicia con 0 nodos temporales');

// Agregar nodos desordenados en el tiempo
const nB = useAudioStudioStore.getState().addTimeNode(15.5, 'Salto Axel');
useAudioStudioStore.getState().addTimeNode(4.2, 'Inicio');
useAudioStudioStore.getState().addTimeNode(22.0, 'Pose Final');

const currentStudioNodes = useAudioStudioStore.getState().audioNodes;
assert(currentStudioNodes.length === 3, 'Se agregaron 3 nodos temporales con éxito');
assert(currentStudioNodes[0].timestampSec === 4.2 && currentStudioNodes[0].numeroSecuencial === 1, 'Nodo 1 está ordenado en 4.2s');
assert(currentStudioNodes[1].timestampSec === 15.5 && currentStudioNodes[1].numeroSecuencial === 2, 'Nodo 2 está ordenado en 15.5s');
assert(currentStudioNodes[2].timestampSec === 22.0 && currentStudioNodes[2].numeroSecuencial === 3, 'Nodo 3 está ordenado en 22.0s');

// 2. Controles de Pistas (Volumen, Mute, Solo)
useAudioStudioStore.getState().setTrackVolume('music', 0.65);
assert(useAudioStudioStore.getState().tracks.music.volume === 0.65, 'Volumen de música ajustado a 65%');

useAudioStudioStore.getState().toggleTrackMute('metronome');
assert(useAudioStudioStore.getState().tracks.metronome.muted === true, 'Pista de metrónomo silenciada (Mute)');

// 3. Puente sendMixToChoreo()
const mixResult = useAudioStudioStore.getState().sendMixToChoreo();
assert(mixResult.success === true, 'sendMixToChoreo() exporta con éxito');
assert(mixResult.nodes.length === 3, 'sendMixToChoreo() exporta exactamente 3 nodos');

// 4. Bandeja de Colocación en la Pista 2D y Bloqueo Secuencial Estricto
const unplaced = useChoreographyStore.getState().unplacedNodes;
const activeIndex = useChoreographyStore.getState().activeTrayNodeIndex;
assert(unplaced.length === 3, 'Pista 2D recibió los 3 nodos en la bandeja');
assert(activeIndex === 0, 'El nodo activo inicial es el índice 0 (Nodo 1)');

// INTENTO DE VIOLAR EL BLOQUEO SECUENCIAL: Colocar Nodo 2 antes de Nodo 1
const invalidPlacement = useChoreographyStore.getState().placeTrayNode(nB.id, 30, 15);
assert(invalidPlacement === null, 'Bloqueo estricto: Nodo 2 NO puede ubicarse antes de Nodo 1');
assert(useChoreographyStore.getState().activeTrayNodeIndex === 0, 'El índice activo se mantiene en 0');

// COLOCACIÓN VÁLIDA DEL NODO 1:
const node1Id = currentStudioNodes[0].id;
const placed1 = useChoreographyStore.getState().placeTrayNode(node1Id, 10, 12);
assert(placed1 !== null, 'Nodo 1 ubicado con éxito en la pista en (10, 12)');
assert(placed1?.time_ms === 4200, 'Nodo 1 preserva exactamente el timestamp de audio de 4.2s (4200ms)');
assert(useChoreographyStore.getState().activeTrayNodeIndex === 1, 'Tras ubicar Nodo 1, Nodo 2 se desbloquea (índice 1)');

// COLOCACIÓN VÁLIDA DEL NODO 2:
const node2Id = currentStudioNodes[1].id;
const placed2 = useChoreographyStore.getState().placeTrayNode(node2Id, 25, 18);
assert(placed2 !== null, 'Nodo 2 ubicado con éxito en la pista en (25, 18)');
assert(useChoreographyStore.getState().activeTrayNodeIndex === 2, 'Tras ubicar Nodo 2, Nodo 3 se desbloquea (índice 2)');

// COLOCACIÓN VÁLIDA DEL NODO 3:
const node3Id = currentStudioNodes[2].id;
const placed3 = useChoreographyStore.getState().placeTrayNode(node3Id, 45, 10);
assert(placed3 !== null, 'Nodo 3 ubicado con éxito en la pista');
assert(useChoreographyStore.getState().unplacedNodes.length === 0, 'Una vez ubicados todos los nodos, la bandeja se vacía automáticamente');
assert(useChoreographyStore.getState().phase === 'curve', 'Con todos los nodos posicionados, la fase pasa automáticamente a curve');

// REPUBLICACIÓN (reconciliación): publicar de nuevo los MISMOS marcadores NO debe
// re-ofrecer en la bandeja los ya colocados (evita duplicar el nodo), y sus
// posiciones espaciales se conservan intactas.
useChoreographyStore.getState().setUnplacedNodes(currentStudioNodes);
assert(
  useChoreographyStore.getState().unplacedNodes.length === 0,
  'Republicar no re-ofrece nodos ya colocados (sin duplicados)'
);
const placed1After = useChoreographyStore.getState().points.find((p) => p.id === node1Id);
assert(
  placed1After?.x === 10 && placed1After?.y === 12,
  'Republicar conserva la posición espacial del nodo colocado (no se sobrescribe)'
);
// Un marcador NUEVO creado después sí entra a la bandeja.
useChoreographyStore.getState().setUnplacedNodes([
  ...currentStudioNodes,
  { id: 'studio-marker-new', numeroSecuencial: 4, timestampSec: 9.5 },
]);
assert(
  useChoreographyStore.getState().unplacedNodes.length === 1 &&
    useChoreographyStore.getState().unplacedNodes[0].id === 'studio-marker-new',
  'Un marcador nuevo tras republicar sí entra a la bandeja'
);

// AUTORRECONCILIACIÓN: si el usuario NO tocó el tiempo, la nueva publicación lo
// actualiza y CONSERVA la posición espacial.
useChoreographyStore.getState().setUnplacedNodes(
  currentStudioNodes.map((n) => (n.id === node1Id ? { ...n, timestampSec: 5.0 } : n))
);
const p1Moved = useChoreographyStore.getState().points.find((p) => p.id === node1Id)!;
assert(p1Moved.time_ms === 5000, 'Republicar adopta el nuevo tiempo si el usuario no lo tocó');
assert(p1Moved.x === 10 && p1Moved.y === 12, 'Republicar conserva la posición espacial al actualizar el tiempo');

// CONFLICTO: si el usuario editó el tiempo, se conserva y se marca (sin sobrescribir).
useChoreographyStore.getState().updatePointTimestamp(node1Id, 7000);
useChoreographyStore.getState().setUnplacedNodes(currentStudioNodes);
const p1Conflict = useChoreographyStore.getState().points.find((p) => p.id === node1Id)!;
assert(p1Conflict.time_ms === 7000, 'Conflicto: se conserva el tiempo editado por el usuario');
assert(p1Conflict.studioTimeConflict === true, 'Conflicto: se marca studioTimeConflict para avisar');

// 5. Controles Globales (Metrónomo, Voces Guía, BPM)
useAudioStudioStore.getState().setGlobalBpm(136);
assert(useAudioStudioStore.getState().globalControls.bpm === 136, 'BPM global actualizado a 136');
assert(useAudioStudioStore.getState().metronomeConfig.bpm === 136, 'Metrónomo sincronizado con BPM global (136)');

useAudioStudioStore.getState().setMetronomeVolume(0.75);
assert(useAudioStudioStore.getState().globalControls.metronome.volume === 0.75, 'Volumen global del metrónomo ajustado a 75%');

// 5b. Subdivisión del metrónomo (1/1, 1/2, 1/4, 1/8) con persistencia en el estado.
assert(
  useAudioStudioStore.getState().metronomeConfig.subdivision === 1,
  'La subdivisión del metrónomo arranca en 1/1'
);
useAudioStudioStore.getState().setMetronomeConfig({ subdivision: 4 });
assert(
  useAudioStudioStore.getState().metronomeConfig.subdivision === 4,
  'La subdivisión 1/4 queda guardada en el estado del proyecto'
);
assert(
  useAudioStudioStore.getState().globalControls.metronome.subdivision === 4,
  'La subdivisión se propaga a los controles globales (manifiesto/mezcla)'
);
assert(
  audioEngine.metronome.getConfig().subdivision === 4,
  'La subdivisión llega al motor de metrónomo (reloj de audio)'
);
useAudioStudioStore.getState().setMetronomeConfig({ subdivision: 1 });

useAudioStudioStore.getState().toggleVoiceGuideMute();
assert(useAudioStudioStore.getState().globalControls.voiceGuide.muted === true, 'Voces guía silenciadas globalmente (Mute)');

// 6. Límite de Pistas: 1 Master + hasta 4 adicionales (5 pistas en total)
const t1 = useAudioStudioStore.getState().addAudioTrack('Pista 2');
useAudioStudioStore.getState().addAudioTrack('Pista 3');
useAudioStudioStore.getState().addAudioTrack('Pista 4');
useAudioStudioStore.getState().addAudioTrack('Pista 5');
assert(useAudioStudioStore.getState().additionalTracks.length === 4, 'Se crearon 4 pistas adicionales');

// Intento de exceder el límite: no debe crear una 6ta pista
useAudioStudioStore.getState().addAudioTrack('Pista 6 Prohibida');
assert(useAudioStudioStore.getState().additionalTracks.length === 4, 'Límite estricto: no permite más de 4 pistas adicionales (5 en total)');

// 7. Desplazamiento y Transferencia de Clips entre Pistas (Track Hopping)
const testClip = {
  id: 'clip-jump-1',
  name: 'Sample Vocal',
  buffer: {} as any,
  startOffsetSec: 5.0,
  trimStartSec: 0,
  trimEndSec: 3.0,
  fadeInSec: 0.2,
  fadeOutSec: 0.3,
};
useAudioStudioStore.setState((s) => ({
  tracks: {
    ...s.tracks,
    music: { ...s.tracks.music, clips: [testClip] },
  },
}));
assert(useAudioStudioStore.getState().tracks.music.clips.length === 1, 'Clip agregado a la pista de música principal');

// Mover clip desde 'music' hacia la pista adicional t1
useAudioStudioStore.getState().moveClipToTrack('music', t1.id, 'clip-jump-1', 8.5);
assert(useAudioStudioStore.getState().tracks.music.clips.length === 0, 'Clip removido con éxito de la pista principal');
const targetAdditionalTrack = useAudioStudioStore.getState().additionalTracks.find((t) => t.id === t1.id);
assert(targetAdditionalTrack?.clips.length === 1, 'Clip transferido exitosamente a la pista secundaria');
assert(targetAdditionalTrack?.clips[0].startOffsetSec === 8.5, 'Clip preserva y actualiza nuevo offset temporal (8.5s)');

// 8. Manifiesto Reactivo de Mezcla Ligero (JSON)
const manifest = useAudioStudioStore.getState().getMixManifest();
assert(manifest.bpm === 136, 'Manifiesto contiene BPM global sincronizado');
assert(manifest.masterTrack.id === 'track-music', 'Manifiesto identifica la pista master');
assert(manifest.additionalTracks.length === 4, 'Manifiesto incluye las 4 pistas adicionales');
assert(manifest.globalControls.metronome.volume === 0.75, 'Manifiesto refleja volumen del metrónomo');

// 9. Silenciadores ABSOLUTOS por GainNode (regresión)
//    La acción del store debe llegar al motor para fijar el sub-bus a 0, de modo
//    que se silencie también lo ya programado por el lookahead (metrónomo/voces)
//    sin detener ni desincronizar la pista maestra.
// Se parte de un estado conocido (las pruebas anteriores ya alternaron mutes)
audioEngine.syncBusMutes({ music: false, metronome: false, voiceGuide: false });
assert(
  audioEngine.isMusicMuted() === false &&
    audioEngine.isMetronomeMuted() === false &&
    audioEngine.isVoiceGuideMuted() === false,
  'Estado de partida sin silenciar (syncBusMutes)'
);

// Las aserciones se basan en la transición real del estado (no en un valor
// supuesto de partida), para que la prueba sea independiente del orden.
const metroBefore = useAudioStudioStore.getState().globalControls.metronome.muted;
useAudioStudioStore.getState().toggleMetronomeMute();
assert(
  audioEngine.isMetronomeMuted() === !metroBefore &&
    useAudioStudioStore.getState().globalControls.metronome.muted === !metroBefore,
  'Alternar el metrónomo sincroniza GainNode del motor y estado de la UI'
);
useAudioStudioStore.getState().toggleMetronomeMute();
assert(
  audioEngine.isMetronomeMuted() === metroBefore,
  'Volver a alternar el metrónomo restaura el sub-bus'
);

const voiceBefore = useAudioStudioStore.getState().globalControls.voiceGuide.muted;
useAudioStudioStore.getState().toggleVoiceGuideMute();
assert(
  audioEngine.isVoiceGuideMuted() === !voiceBefore &&
    useAudioStudioStore.getState().globalControls.voiceGuide.muted === !voiceBefore,
  'Alternar las voces guía sincroniza GainNode del motor y estado de la UI'
);
useAudioStudioStore.getState().toggleVoiceGuideMute();

const musicBefore = useAudioStudioStore.getState().tracks.music.muted;
useAudioStudioStore.getState().toggleTrackMute('music');
assert(
  audioEngine.isMusicMuted() === !musicBefore,
  'Alternar la pista maestra sincroniza el GainNode de música'
);
useAudioStudioStore.getState().toggleTrackMute('music');
assert(
  audioEngine.isMusicMuted() === musicBefore &&
    audioEngine.getState().isPlaying === false,
  'Reactivar la música no altera la reproducción ni desincroniza la pista'
);

// Sincronización de arranque (hidratación)
audioEngine.syncBusMutes({ music: true, metronome: true, voiceGuide: true });
assert(
  audioEngine.isMusicMuted() && audioEngine.isMetronomeMuted() && audioEngine.isVoiceGuideMuted(),
  'syncBusMutes reaplica el estado de silencio tras hidratar'
);
audioEngine.syncBusMutes({ music: false, metronome: false, voiceGuide: false });

console.log('Resultado AudioStudioStore & Tray: todas las pruebas pasaron con éxito.\n');
