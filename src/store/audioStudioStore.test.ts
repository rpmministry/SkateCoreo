import { useAudioStudioStore } from './useAudioStudioStore';
import { useChoreographyStore } from './useChoreographyStore';

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

console.log('Resultado AudioStudioStore & Tray: 16/16 pruebas pasadas con éxito.\n');
