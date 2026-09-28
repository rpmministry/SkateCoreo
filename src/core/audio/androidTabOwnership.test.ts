/**
 * androidTabOwnership.test.ts — Regresión del ownership de audio entre pestañas.
 *
 * Cubre la causa más probable del "doble metrónomo" en Android Chrome/Brave:
 * varias pestañas del mismo usuario, cada una con su propio AudioEngine, sonando
 * a la vez (en iOS/desktop solo hay una activa). Reglas verificadas:
 *
 *  · una pestaña nueva NO es dueña ni reproduce nada por sí sola;
 *  · solo UNA pestaña puede ser dueña;
 *  · una pestaña que REPRODUCE nunca es desplazada (jamás dos fuentes);
 *  · un dueño inactivo libera el control por handshake (traspaso controlado);
 *  · un dueño muerto (lease caducado) deja el control libre;
 *  · pagehide/oculto-inactivo libera; reproducir en segundo plano renueva;
 *  · el motor bloquea play/metrónomo cuando esta pestaña no es dueña.
 */

import {
  createTabAudioCoordinatorForTests,
  type TabAudioEnvironment,
  type TabAudioLifecycleHooks,
  type TabAudioMessage,
  type TabAudioOwnerRecord
} from './tabAudioCoordinator';
import { audioEngine } from './AudioEngine';
import { getBuildInfo, getBuildLabel } from './buildInfo';

let total = 0;
let failures = 0;
function assert(condition: boolean, msg: string) {
  total++;
  if (condition) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

/** Mundo compartido por varias "pestañas" (localStorage + BroadcastChannel). */
class FakeWorld {
  public record: TabAudioOwnerRecord | null = null;
  public time = 1_000_000;
  private subs = new Map<string, Set<(m: TabAudioMessage) => void>>();
  private hooks = new Map<string, TabAudioLifecycleHooks>();

  public envFor(tabId: string): TabAudioEnvironment {
    return {
      now: () => this.time,
      read: () => (this.record ? { ...this.record } : null),
      write: (record) => {
        this.record = record ? { ...record } : null;
      },
      broadcast: (message) => {
        for (const [id, set] of this.subs) {
          if (id === tabId) continue;
          for (const listener of set) listener(message);
        }
      },
      subscribe: (listener) => {
        const set = this.subs.get(tabId) ?? new Set();
        set.add(listener);
        this.subs.set(tabId, set);
        return () => set.delete(listener);
      },
      attachLifecycle: (h) => {
        this.hooks.set(tabId, h);
        return () => this.hooks.delete(tabId);
      },
      sleep: () => Promise.resolve(),
      startInterval: () => () => {}
    };
  }

  public triggerHiddenIdle(tabId: string) {
    this.hooks.get(tabId)?.onHiddenIdle();
  }

  public triggerPageHide(tabId: string) {
    this.hooks.get(tabId)?.onPageHide();
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function run() {
  console.log('\n--- ANDROID: OWNERSHIP DE AUDIO ENTRE PESTAÑAS ---');

  // 1. Identidad de build (diagnóstico de versiones cacheadas).
  {
    const build = getBuildInfo();
    assert(build.version.length > 0, `BUILD_VERSION disponible (${build.version})`);
    assert(build.commit.length > 0, `BUILD_COMMIT disponible (${build.commit})`);
    assert(build.timestamp.length > 0, 'BUILD_TIMESTAMP disponible');
    assert(getBuildLabel().startsWith('v'), `Etiqueta de build legible (${getBuildLabel()})`);
  }

  // 2. Pestaña nueva: ni dueña ni sonando (TEST A/B).
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    assert(tabA.isOwner() === false, 'Una pestaña nueva NO es dueña del audio');
    assert(tabA.isOtherTabAudible() === false, 'Una pestaña nueva no oye otras fuentes');
    assert(world.record === null, 'No se escribe ningún lease al abrir la app');
    tabA.destroy();
  }

  // 3. La primera pestaña que actúa adquiere; la segunda no puede mientras suena.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    const tabB = createTabAudioCoordinatorForTests({ tabId: 'B', env: world.envFor('B') });

    assert(tabA.tryClaimNow('play') === true, 'A adquiere el control al pulsar Play');
    assert(tabA.isOwner() && !tabB.isOwner(), 'Solo A es dueña');

    tabA.setPlaying(true);
    assert(world.record?.playing === true, 'El lease de A marca "reproduciendo"');

    assert(tabB.tryClaimNow('play') === false, 'B NO puede reproducir mientras A suena');
    assert(tabB.getSnapshot().otherTabPlaying === true, 'B sabe que A está reproduciendo');
    assert(tabB.isOtherTabAudible() === true, 'B muestra "otra pestaña sonando"');
    assert(tabB.isOwner() === false, 'A conserva el ownership (sin dos fuentes)');

    const denied = await tabB.claim('play');
    assert(denied === false, 'claim() de B también es denegado mientras A suena');
    assert(tabA.isOwner() === true, 'Tras el intento de B, A sigue siendo la única fuente');
    tabA.destroy();
    tabB.destroy();
  }

  // 4. Traspaso controlado: dueño inactivo libera y B adquiere.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    const tabB = createTabAudioCoordinatorForTests({ tabId: 'B', env: world.envFor('B') });
    tabA.tryClaimNow('play');
    tabA.setPlaying(false);

    const granted = await tabB.claim('play');
    assert(granted === true, 'B adquiere el control tras el handshake');
    assert(tabA.isOwner() === false, 'El dueño inactivo liberó el control');
    assert(world.record?.ownerId === 'B', 'El lease escrito pertenece a B');
    assert(tabB.isOwner() === true, 'B es la nueva dueña');
    tabA.destroy();
    tabB.destroy();
  }

  // 5. Dueño muerto (lease caducado, sin audio): el control queda libre.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    const tabB = createTabAudioCoordinatorForTests({ tabId: 'B', env: world.envFor('B') });
    tabA.tryClaimNow('play');
    tabA.destroy(); // simula pestaña cerrada sin liberar (crash)
    world.time += 25_000; // caduca el lease (20s)

    assert(tabB.tryClaimNow('play') === true, 'B reclama un lease caducado sin dueño vivo');
    assert(tabB.isOwner() === true, 'B es dueña tras la caducidad');
    tabB.destroy();
  }

  // 6. Dueño que "suena" no se desplaza ni con lease caducado (gracia de audio).
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    const tabB = createTabAudioCoordinatorForTests({ tabId: 'B', env: world.envFor('B') });
    tabA.tryClaimNow('play');
    tabA.setPlaying(true);
    tabA.destroy(); // crash sonando (no renovará)
    world.time += 25_000; // lease vencido, pero < gracia (45s)

    assert(tabB.tryClaimNow('play') === false, 'Con audio reciente, B NO desplaza a A');

    world.time += 30_000; // supera la gracia de audio
    assert(tabB.tryClaimNow('play') === true, 'Pasada la gracia, B puede reclamar');
    tabB.destroy();
  }

  // 7. Heartbeat: el dueño renueva su lease; otro tick no roba el control.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    const tabB = createTabAudioCoordinatorForTests({ tabId: 'B', env: world.envFor('B') });
    tabA.tryClaimNow('play');
    const initialExpiry = world.record?.expiresAt ?? 0;
    world.time += 10_000;
    tabA.tick();
    assert((world.record?.expiresAt ?? 0) > initialExpiry, 'El heartbeat renueva el lease');
    tabB.tick();
    assert(tabA.isOwner() === true, 'El tick de B no roba el control a un dueño vivo');
    tabA.destroy();
    tabB.destroy();
  }

  // 8. Ocultar sin reproducir libera; reproducir en segundo plano renueva.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    tabA.tryClaimNow('play');
    tabA.setPlaying(false);
    world.triggerHiddenIdle('A');
    assert(tabA.isOwner() === false, 'Ocultar inactivo libera el control (B puede tomar el relevo)');

    tabA.tryClaimNow('play');
    tabA.setPlaying(true);
    const before = world.record?.expiresAt ?? 0;
    world.time += 5_000;
    world.triggerHiddenIdle('A');
    assert(tabA.isOwner() === true, 'Reproduciendo en segundo plano NO se libera');
    assert((world.record?.expiresAt ?? 0) > before, 'Reproduciendo en background renueva el lease');
    tabA.destroy();
  }

  // 9. pagehide (cierre/navegación) libera siempre.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    tabA.tryClaimNow('play');
    tabA.setPlaying(true);
    world.triggerPageHide('A');
    assert(tabA.isOwner() === false && world.record === null, 'pagehide libera el ownership');
    tabA.destroy();
  }

  // 10. Los avisos STATE informan a las demás pestañas del metrónomo.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    const tabB = createTabAudioCoordinatorForTests({ tabId: 'B', env: world.envFor('B') });
    tabA.tryClaimNow('play');
    tabA.setMetronomeOn(true);
    assert(tabB.getSnapshot().otherTabMetronomeOn === true, 'B percibe el metrónomo de A');
    assert(tabB.isOtherTabAudible() === true, 'Metrónomo ajeno cuenta como audio activo');
    tabA.setMetronomeOn(false);
    assert(tabB.getSnapshot().otherTabMetronomeOn === false, 'B percibe el apagado del metrónomo');
    tabA.destroy();
    tabB.destroy();
  }

  // 11. destroy() deja de escuchar (sin fugas de listeners).
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    const tabB = createTabAudioCoordinatorForTests({ tabId: 'B', env: world.envFor('B') });
    tabB.destroy();
    tabA.tryClaimNow('play');
    assert(tabA.isOwner() === true, 'A sigue funcionando tras destruir B');
    tabA.destroy();
  }

  // 12. Integración con el MOTOR: puertas de play/metrónomo con ownership ajeno.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'ENGINE_A', env: world.envFor('ENGINE_A') });
    const tabB = createTabAudioCoordinatorForTests({ tabId: 'ENGINE_B', env: world.envFor('ENGINE_B') });
    tabA.tryClaimNow('play');
    tabA.setPlaying(true);

    audioEngine.__setOwnershipForTests(tabB);
    assert(audioEngine.canControlAudio() === false, 'El motor sabe que esta pestaña no controla audio');
    assert(audioEngine.tryAcquireAudioControl('test') === false, 'El motor deniega el control si A suena');
    assert(
      audioEngine.getAudioOwnershipSnapshot().otherTabPlaying === true,
      'El estado del motor expone que otra pestaña reproduce (banner)'
    );

    audioEngine.setMetronomeAudible(true);
    assert(
      audioEngine.metronome.getConfig().enabled === false && audioEngine.isMetronomeMuted() === true,
      'El metrónomo NO se enciende en una pestaña sin ownership'
    );
    await flush();
    assert(audioEngine.isMetronomeMuted() === true, 'Ni siquiera tras el intento asíncrono se enciende');

    // A deja de sonar: B puede adquirir por handshake y entonces sí encender.
    tabA.setPlaying(false);
    const granted = await tabB.claim('metronome-on');
    assert(granted === true, 'B adquiere el control por handshake');
    assert(audioEngine.canControlAudio() === true, 'El motor reconoce a B como dueña');
    audioEngine.setMetronomeAudible(true);
    assert(audioEngine.metronome.getConfig().enabled === true, 'Con ownership, el metrónomo se enciende');
    assert(audioEngine.isMetronomeMuted() === false, 'Con ownership, el bus del metrónomo está audible');

    // Apagar funciona SIEMPRE, aunque se pierda el ownership.
    tabB.setPlaying(true); // B reproduce: no puede ser desplazada a la fuerza
    assert(
      tabA.tryClaimNow('takeover-again') === false,
      'A no desplaza a B mientras B reproduce'
    );
    tabB.setPlaying(false);
    tabA.tryClaimNow('takeover-again-2'); // handshake: B inactivo libera
    assert(
      tabA.tryClaimNow('takeover-again-3') === true,
      'Tras liberar B, A adquiere el control'
    );
    audioEngine.__setOwnershipForTests(tabA);
    assert(audioEngine.canControlAudio() === true, 'El motor reconoce al nuevo dueño');
    audioEngine.setMetronomeAudible(false);
    assert(audioEngine.isMetronomeMuted() === true, 'Apagar el metrónomo funciona siempre');
    assert(audioEngine.metronome.getConfig().enabled === false, 'Sin ownership previo, el metrónomo queda OFF');

    tabA.destroy();
    tabB.destroy();
    world.record = null;
  }

  if (failures > 0) {
    console.error(`\n[OWNERSHIP] ${failures}/${total} aserciones fallidas.`);
    process.exit(1);
  }
  console.log(`\n[OWNERSHIP] OK — ${total}/${total} aserciones correctas.`);
}

void run();
