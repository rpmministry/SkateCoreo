/**
 * androidTabOwnership.test.ts — Regresión del ownership de audio entre pestañas.
 *
 * Cubre la causa más probable del "doble metrónomo" y el "falso aviso de otra pestaña"
 * en Android Chrome/Brave y dispositivos móviles:
 *  · una pestaña nueva NO es dueña ni reproduce nada por sí sola (aviso no visible);
 *  · solo UNA pestaña puede ser dueña de audio a la vez;
 *  · si una pestaña REPRODUCE, la otra pestaña no reproduce directamente (aviso visible);
 *  · al pulsar "Tomar control", el traspaso se resuelve de forma inmediata y limpia;
 *  · si la dueña está congelada o muerta en segundo plano (sin responder al handshake),
 *    la pestaña activa asume el control forzado y JAMÁS bloquea al usuario;
 *  · un dueño inactivo libera el control de forma inmediata y síncrona;
 *  · un dueño muerto (lease caducado o sin heartbeat) deja el control libre al instante;
 *  · al abrir una pestaña con un lease viejo de una sesión previa, este se purga de inmediato;
 *  · pagehide / oculto-inactivo libera el ownership.
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

/** Mundo compartido por varias "pestañas" (localStorage + BroadcastChannel simulados). */
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
      sleep: (ms) => {
        this.time += ms;
        return Promise.resolve();
      },
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

  // 2. Pestaña nueva: ni dueña ni sonando (NO muestra aviso).
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    assert(tabA.isOwner() === false, 'Una pestaña nueva NO es dueña del audio');
    assert(tabA.isOtherTabAudible() === false, 'Una pestaña nueva no oye otras fuentes');
    assert(world.record === null, 'No se escribe ningún lease al abrir la app');
    tabA.destroy();
  }

  // 3. Purga inmediata de residuo muerto en localStorage al iniciar pestaña nueva.
  {
    const world = new FakeWorld();
    // Simula que una sesión previa dejó un registro hace 10 segundos
    world.record = {
      ownerId: 'OLD_DEAD_TAB',
      playing: true,
      metronomeOn: false,
      heartbeatAt: world.time - 10_000,
      expiresAt: world.time - 7_000
    };

    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    assert(tabA.isOwner() === false, 'Pestaña nueva con residuo no es dueña');
    assert(tabA.isOtherTabAudible() === false, 'Residuo viejo expirado NO produce aviso de otra pestaña');
    assert(world.record === null, 'Constructor purga de inmediato el lease viejo');
    assert(tabA.tryClaimNow('play') === true, 'Pestaña puede reproducir inmediatamente sin bloqueo');
    tabA.destroy();
    world.record = null;
  }

  // 4. Intento síncrono mientras otra pestaña suena: se deniega y se activa aviso.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    const tabB = createTabAudioCoordinatorForTests({ tabId: 'B', env: world.envFor('B') });

    assert(tabA.tryClaimNow('play') === true, 'A adquiere el control al pulsar Play');
    assert(tabA.isOwner() && !tabB.isOwner(), 'Solo A es dueña');

    tabA.setPlaying(true);
    assert(world.record?.playing === true, 'El lease de A marca "reproduciendo"');

    assert(tabB.tryClaimNow('play') === false, 'B NO puede reproducir directamente mientras A suena');
    assert(tabB.getSnapshot().otherTabPlaying === true, 'B sabe que A está reproduciendo');
    assert(tabB.isOtherTabAudible() === true, 'B activa el aviso "El audio está sonando en otra pestaña"');
    assert(tabB.isOwner() === false, 'A conserva el ownership (sin dos fuentes)');

    tabA.destroy();
    tabB.destroy();
    world.record = null;
  }

  // 5. Traspaso controlado con "Tomar control": A cede limpiamente y B adquiere.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    const tabB = createTabAudioCoordinatorForTests({ tabId: 'B', env: world.envFor('B') });

    tabA.tryClaimNow('play');
    tabA.setPlaying(true);

    // B pulsa "Tomar control" desde el banner
    const granted = await tabB.claim('banner-takeover');
    assert(granted === true, 'claim() de B tiene éxito al pulsar Tomar control');
    assert(tabA.isOwner() === false, 'A cedió el control y dejó de ser dueña');
    assert(tabA.isPlayingHere() === false, 'A detuvo su reproducción local');
    assert(tabB.isOwner() === true, 'B es la nueva dueña');
    assert(world.record?.ownerId === 'B', 'El nuevo lease en storage pertenece a B');

    tabA.destroy();
    tabB.destroy();
    world.record = null;
  }

  // 6. Traspaso forzado si la otra pestaña está congelada/muerta en segundo plano (Android).
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    const tabB = createTabAudioCoordinatorForTests({ tabId: 'B', env: world.envFor('B') });

    tabA.tryClaimNow('play');
    tabA.setPlaying(true);

    // Simula que Android congela el proceso de Tab A (no puede responder al handshake)
    tabA.destroy(); // A ya no escucha mensajes BroadcastChannel

    const granted = await tabB.claim('banner-takeover');
    assert(granted === true, 'B toma el control de forma forzada si A no responde');
    assert(tabB.isOwner() === true, 'B se convierte en dueña sin bloquear al usuario');
    assert(tabB.isOtherTabAudible() === false, 'El aviso se apaga inmediatamente en B');

    tabB.destroy();
    world.record = null;
  }

  // 7. Dueño inactivo: si A no está sonando, B adquiere de forma INMEDIATA y SÍNCRONA.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    const tabB = createTabAudioCoordinatorForTests({ tabId: 'B', env: world.envFor('B') });

    tabA.tryClaimNow('play');
    tabA.setPlaying(false); // A está inactiva (sin audio)

    assert(tabB.tryClaimNow('play') === true, 'B adquiere síncronamente si A está inactiva');
    assert(tabB.isOwner() === true, 'B es dueña de inmediato (cero espera)');
    assert(world.record?.ownerId === 'B', 'Storage actualizado a B');

    tabA.destroy();
    tabB.destroy();
    world.record = null;
  }

  // 8. Dueño muerto (lease caducado sin heartbeat): B reclama sin demoras.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    const tabB = createTabAudioCoordinatorForTests({ tabId: 'B', env: world.envFor('B') });
    tabA.tryClaimNow('play');
    tabA.destroy(); // simula crash/cierre sin evento
    world.time += 4_000; // caduca el lease (3s)

    assert(tabB.tryClaimNow('play') === true, 'B reclama un lease caducado sin dueño vivo');
    assert(tabB.isOwner() === true, 'B es dueña tras la caducidad');
    tabB.destroy();
    world.record = null;
  }

  // 9. Dueño que sonaba pero crasheó: tras el margen de gracia (3s), se libera.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    const tabB = createTabAudioCoordinatorForTests({ tabId: 'B', env: world.envFor('B') });
    tabA.tryClaimNow('play');
    tabA.setPlaying(true);
    tabA.destroy(); // crash mientras sonaba
    world.time += 1_000;

    assert(tabB.tryClaimNow('play') === false, 'Con audio muy reciente (<3s), B no desplaza a ciegas');

    world.time += 3_500; // supera la gracia de audio sin heartbeat
    assert(tabB.tryClaimNow('play') === true, 'Pasada la gracia sin heartbeat, B adquiere el control');
    tabB.destroy();
    world.record = null;
  }

  // 10. Heartbeat: el dueño renueva su lease periódicamente.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    const tabB = createTabAudioCoordinatorForTests({ tabId: 'B', env: world.envFor('B') });
    tabA.tryClaimNow('play');
    const initialExpiry = world.record?.expiresAt ?? 0;
    world.time += 2_000;
    tabA.tick();
    assert((world.record?.expiresAt ?? 0) > initialExpiry, 'El heartbeat renueva el lease');
    tabB.tick();
    assert(tabA.isOwner() === true, 'El tick de B no roba el control a un dueño vivo');
    tabA.destroy();
    tabB.destroy();
    world.record = null;
  }

  // 11. Ocultar inactivo libera; reproducir en segundo plano renueva.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    tabA.tryClaimNow('play');
    tabA.setPlaying(false);
    world.triggerHiddenIdle('A');
    assert(tabA.isOwner() === false, 'Ocultar inactivo libera el control (otra pestaña puede tomar el relevo)');

    tabA.tryClaimNow('play');
    tabA.setPlaying(true);
    const before = world.record?.expiresAt ?? 0;
    world.time += 1_000;
    world.triggerHiddenIdle('A');
    assert(tabA.isOwner() === true, 'Reproduciendo en segundo plano NO se libera');
    assert((world.record?.expiresAt ?? 0) > before, 'Reproduciendo en background renueva el lease');
    tabA.destroy();
    world.record = null;
  }

  // 12. pagehide (cierre/navegación) libera siempre.
  {
    const world = new FakeWorld();
    const tabA = createTabAudioCoordinatorForTests({ tabId: 'A', env: world.envFor('A') });
    tabA.tryClaimNow('play');
    tabA.setPlaying(true);
    world.triggerPageHide('A');
    assert(tabA.isOwner() === false && world.record === null, 'pagehide libera el ownership');
    tabA.destroy();
    world.record = null;
  }

  // 13. Los avisos STATE informan a las demás pestañas del metrónomo.
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
    world.record = null;
  }

  // 14. Integración con el MOTOR: puertas de play/metrónomo y recuperación.
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
      'El estado del motor expone que otra pestaña reproduce'
    );

    audioEngine.setMetronomeAudible(true);
    assert(
      audioEngine.metronome.getConfig().enabled === false && audioEngine.isMetronomeMuted() === true,
      'El metrónomo NO se enciende en una pestaña sin ownership'
    );
    await flush();
    assert(audioEngine.isMetronomeMuted() === true, 'El bus permanece silenciado');

    // B toma el control con claim()
    const granted = await tabB.claim('banner-takeover');
    assert(granted === true, 'B adquiere el control');
    assert(audioEngine.canControlAudio() === true, 'El motor reconoce a B como dueña');

    audioEngine.setMetronomeAudible(true);
    assert(audioEngine.metronome.getConfig().enabled === true, 'Con ownership, el metrónomo se enciende');
    assert(audioEngine.isMetronomeMuted() === false, 'Con ownership, el bus del metrónomo está audible');

    // Apagar funciona SIEMPRE
    audioEngine.setMetronomeAudible(false);
    assert(audioEngine.isMetronomeMuted() === true, 'Apagar el metrónomo funciona siempre');
    assert(audioEngine.metronome.getConfig().enabled === false, 'El metrónomo queda OFF');

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
