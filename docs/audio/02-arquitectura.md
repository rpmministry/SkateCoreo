# Arquitectura propuesta del subsistema de audio — SkateCoreo

Base: `b37120b` · Rama de seguridad: `safety/audio-subsystem-pre-rebuild`

## 1. Principios (inspirados en AudioMass, adaptados a SkateCoreo)

De AudioMass se adoptan **conceptos**, no código:

1. **Un solo `AudioContext` de aplicación**, creado una vez y reutilizado por todos los módulos
   (skatecoreo ya cumple; se blinda con test y auditoría del bundle).
2. **Grafo de buses estable** (Master → Música / Coach → Metrónomo + Voz) construido una vez
   (ya existe; es la parte más sólida del motor actual).
3. **Fuente de audio explícita y gobernada**: una reproducción = una fuente rastreada;
   parar = detener y liberar exactamente esas fuentes (nuevo `PlaybackCore`).
4. **Multitrack basado en datos** (tracks/clips en store) y **un único reproductor** que
   consume el arreglo consolidado (ya existe; no se toca el modelo de datos).
5. **Lifecycle explícito**: CREATE → REGISTER → PLAY → PAUSE/STOP → RELEASE → DESTROY,
   con `sessionId` + `generation` en cada recurso.
6. **Sin fuentes implícitas**: ningún recurso de audio se crea fuera del core (metrónomo
   solo al activarlo; nada de “dejarlo listo” con gain 0).

## 2. Arquitectura objetivo

```
                        AUDIO ENGINE (singleton, API pública intacta)
                                   │
                        PlaybackCore (nuevo núcleo)
              ┌────────────┬───────┴────────┬─────────────┐
              │            │                │             │
        SessionScope   SourceRegistry   TransportSM   Diagnostics
        (sessionId,    (música, pre-    (idle/preroll/ (snapshot,
         generation)    roll, unlock…)   playing/paused) counters)
              │
   ┌──────────┼───────────────┬──────────────────┐
   │          │               │                  │
 Metronome  VoiceCue      TTSService        Música (sourceNode)
 (existente) (existente)   (existente)       (existente)
```

### PlaybackCore (nuevo archivo `src/core/audio/PlaybackCore.ts`)

- **Puro (sin APIs de navegador)** → 100 % testeable en Node.
- `beginSession(sessionId)` / `endSession()`: incrementan generación y **disponen** todo
  recurso de la generación anterior (aislamiento de sesión real y verificable).
- `registerSource(kind, stopFn)` → devuelve handle; `releaseSource(id)`;
  `stopAllSources(kind?)`; `snapshot()` con `{ byKind, total, sessionId, generation,
  phase, counters }`.
- `registerSubsystem(name, isActive, stopFn)`: metrónomo, voz guía y TTS aparecen en el
  snapshot sin acoplarlos al core (lectura de su estado real).
- Máquina de estados del transporte: `idle → preroll → playing → paused → stopped`
  con transiciones válidas y contadores de eventos (para instrumentación y tests).

### AudioEngine (adaptado, no reescrito)

- Mantiene **toda su API pública** (play/pause/stop/seek/setAudioBuffer/setDomain/…), que
  usan Pista 2D, Estudio y Visor.
- Delega en `PlaybackCore`:
  - registro de la fuente de música, del pre-roll y del unlock silencioso;
  - **una única** `stopAllSources()` usada por `pause()`, `stop()`, `resetAudioSession()`
    y cambio de sesión;
  - `beginSession`/`endSession` conectados al ciclo de vida de sesión;
  - `snapshot()` en `getAudioHealth()` (HUD `?audioDebug=1`).
- Elimina el pre-roll legacy del `VoiceCueEngine` (segunda implementación muerta).

### Reglas de producto ya vigentes que se conservan tal cual

- Metrónomo OFF por defecto; sin scheduler y sin osciladores hasta activación explícita.
- Sin pistas demo; el usuario es la única fuente de audio inicial.
- Separación Rink / Estudio / Visor con los puentes explícitos existentes
  (“Editar mezcla” y “Enviar al visor”).
- Play deshabilitado si no hay material (UI ya existente).

## 3. Funcionalidades que se preservan (sin cambios)

- Pista 2D: carga de audio, Play/Pause/Stop, pre-roll hablado, metrónomo, Voz Guía,
  mezclador, enrutado L/R, publicación.
- Estudio: multitrack, clips, drag/move/copy/Master, split, fades, undo/redo, grabación,
  mixer, metrónomo compartido, consolidación, export, envío a visor.
- Visor: contenido y reproducción existentes.
- UI, diseño, navegación, stores, persistencia y recuperación de sesión.
- API pública de `AudioEngine`, `Metronome`, `VoiceCueEngine` (salvo la API legacy
  eliminada: `VoiceCueEngine.startPreRoll/isPreRolling`).

## 4. Componentes reemplazados / eliminados

| Elemento | Acción | Motivo |
|---|---|---|
| Limpieza manual dispersa en `pause/stop/reset` | **Reemplazada** por `PlaybackCore.stopAllSources()` | una sola ruta verificable |
| `VoiceCueEngine.startPreRoll` + `preRollTimer` (`setInterval`) | **Eliminado** | segunda implementación de pre-roll, muerta en producción |
| Contabilidad implícita de fuentes | **Sustituida** por `SourceRegistry` + snapshot | trazabilidad real por sesión |
| Sin `sessionId` en el motor | **Añadido** `beginSession/endSession` | aislamiento de sesión demostrable |
| — | **No se toca** el grafo de buses, stores, UI ni modelo de datos | preservar desktop y funcionalidad |

## 5. Estrategia de migración (por fases, validando cada una)

1. **Fase 0 (ya hecha)**: rama de seguridad `safety/audio-subsystem-pre-rebuild` + auditoría.
2. **Fase 1**: `PlaybackCore` aislado + test unitario exhaustivo. Sin tocar el motor.
3. **Fase 2**: adaptar `AudioEngine` (registro de fuentes, stop único, sesión, snapshot) y
   eliminar el pre-roll legacy. `tsc` + suite completa + build.
4. **Fase 3**: conectar `sessionLifecycle` (begin/end sesión) e instrumentar
   TRACK_CREATED/DESTROYED en el store. Tests de regresión del subsistema.
5. **Fase 4**: validación final (tests A–L automatizables + build) y push a `main`.
   El código anterior queda recuperable en la rama de seguridad durante toda la migración.

## 6. Estrategia de pruebas

- **Unitarias**: `PlaybackCore.test.ts` (lifecycle, sesiones, idempotencia, errores,
  contadores), `audioSubsystemReconstruction.test.ts` (invariantes del motor completo:
  0 fuentes en estado inicial, 1 al reproducir, 0 tras stop/pause/reset, metrónomo 0/1,
  sesión nueva limpia, sin duplicados).
- **Regresión existente**: suites de metrónomo/limpieza/separación Rink–Studio/drag–copy.
- **En dispositivo (QA)**: batería A–L del pedido; el HUD `?audioDebug=1` muestra
  `fuentes activas por tipo`, `sesión/generación`, `contextos` y `clicks` para
  demostrar “1 metrónomo, 0 fantasmas” en iPhone/iPad/Android.
