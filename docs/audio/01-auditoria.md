# Auditoría del subsistema de audio — SkateCoreo

Fecha: 2026-09-27 · Base: `b37120b` (rama de seguridad `safety/audio-subsystem-pre-rebuild`).

Esta auditoría precede a la reconstrucción del subsistema de reproducción/metrónomo.
Toda la evidencia fue extraída del código real (rutas y líneas incluidas).

---

## 1. Inventario de recursos de audio

| Recurso | Archivo | Creación | Uso | Cleanup | Plataforma | Riesgo |
|---|---|---|---|---|---|---|
| `AudioContext` vivo (único) | `src/core/audio/AudioEngine.ts` (`initAudioContext`, ~L356) | Perezosa, en el primer gesto/carga | Todo el grafo Web Audio | No se cierra (singleton de app; 1 por documento) | todas | Bajo: **verificado 1 solo sitio de creación en el bundle** |
| `AudioBufferSourceNode` de música | `AudioEngine.ts:1555` (`scheduleMusicSourceAt`) | `play()` / pre-roll | Pista del dominio activo | `stopSource()` (L~2007) + `onended` | todas | Medio: limpieza manual dispersa |
| `AudioBufferSourceNode` de voces de pre-roll | `AudioEngine.ts:1641` (`schedulePreRollVoice`) | Conteo inicial | Voz “3,2,1,¡ya!” | `cancelPreRoll()` (L~1696: stop+disconnect) | todas | Medio: arrays paralelos |
| `AudioBufferSourceNode` silencioso (unlock iOS) | `AudioEngine.ts:334` (`initIosUnlockListener`) | Primer gesto real | “Calentar” la salida (1 muestra muda) | No rastreado (termina solo) | iOS/iPadOS | Bajo (inaudible), pero **no registrado** |
| Osciladores del metrónomo | `src/core/audio/Metronome.ts:706` (`emitClick`) | `setEnabled(true)` + transporte | Clicks del metrónomo | `activeNodes` + `stopAllNodes()` + `haltScheduler()` | todas | Medio: instancia global única ya forzada (b37120b) |
| Timer del metrónomo | `Metronome.ts` (`timerId`, setTimeout 20 ms) | `runScheduler()` | Lookahead | `haltScheduler()`/`stop()` | todas | Bajo desde b37120b (registro global de scheduler único) |
| Buffers de Voz Guía (cues) | `src/core/audio/VoiceCueEngine.ts:1078`, `1372`, `1477` | Scheduler de cues / speak | Locución de figuras | `activeSources` + `stop()` + `stopCueTones()` | todas | Medio |
| Timer del scheduler de cues | `VoiceCueEngine.ts` (`schedulerTimerId`) | `startSync()` | Lookahead de cues | `stopSync()` | todas | Bajo |
| **Pre-roll LEGACY por `setInterval`** | `VoiceCueEngine.ts:1145-1211` (`startPreRoll`, `preRollTimer`) | **Sin llamadas en producción** (solo tests) | Segunda implementación de conteo | `cancelPreRoll()` | — | **ALTO: implementación paralela heredada; se elimina** |
| Reproducción TTS (voz natural) | `src/services/ttsService.ts:774` | `speak()` | Voz Guía / conteo | `stop()` | todas | Bajo desde b37120b (solo bus del Coach) |
| Contexto de decodificación TTS | `ttsService.ts` (`ensureDecodeContext`) | Bajo demanda | Decodificar MP3 | Cacheado (OfflineAudioContext) | todas | Bajo |
| `MediaElementAudioSourceNode` / `HTMLAudioElement` de reproducción | — | **No existe** | — | — | — | — |
| `<audio>` de sondeo de duración | `AudioEngine.ts` (`probeAudioDurationSec`, ~L114) | Al importar | Metadatos, **sin reproducir** | Revoca URL y libera el elemento | todas | Bajo |
| Scratch de consolidación | `src/core/audio/studioMixdown.ts:119` | Bounce del Estudio | Crear `AudioBuffer` | Cacheado (OfflineAudioContext) | todas | Bajo desde b37120b |
| Render de mixdown (export) | `studioMixdown.ts:395`, `audioMixdown.ts:60` | Exportar | Offline render | GC | todas | Bajo |
| Monitor de grabación | `useAudioStudioStore.ts` (`monitorSource`/`monitorGain`) | Botón de monitor | Auriculares | `stopRecordingMonitor()` + `resetStudio()` | todas | Bajo |
| `requestAnimationFrame` de transporte | `AudioEngine.ts:2066` (`startTracking`) | `executePlay` | Reloj visual | `stopTracking()` | todas | Bajo (idempotente) |
| `requestAnimationFrame` de pre-roll | `AudioEngine.ts:1534` (`preRollTickerId`) | Pre-roll | UI del conteo | `cancelPreRoll()` | todas | Bajo |
| Reloj visual compartido | `src/core/audio/PlaybackClock.ts` | 1er suscriptor | Playhead/waveform | `unsubscribe` | todas | Bajo (visual, no audio) |
| `setInterval` de grabación | `useAudioStudioStore.ts:1990` (`recordingTicker`) | Grabar | Duración | `resetStudio()` / stop | todas | Bajo |
| `setInterval` de cuenta atrás de grabación | `useAudioStudioStore.ts:430` (`countdownTimer`) | Grabar con countdown | UI | `cancelVoiceRecording` / `resetStudio` | todas | Bajo |
| Stores de audio | `useAudioStudioStore`, `useRinkAudioStore`, `useChoreographyStore` | App | Estado funcional | `resetStudio`/`clearAllStudioTracks`/`resetAbsoluteSession` | todas | Medio: reset por múltiples rutas |
| Persistencia | localStorage (preroll, dueño de datos, sesión), IndexedDB (blob offline, caché TTS), sessionStorage (sessionId) | App | Recuperación | `resetAbsoluteSession` | todas | Medio: recuperación manual (no reproduce sola) |

**Listeners relevantes**: `visibilitychange` en `AudioEngine` (nunca se retira; singleton), unlock iOS en captura (`pointerdown`/`touchend`/`keydown`, se retiran tras el primer gesto), MediaSession handlers. Ningún listener de audio en stores/hooks.

---

## 2. Código que podría generar audio sin acción explícita

| Candidato | Evidencia | Veredicto |
|---|---|---|
| Pistas demo / fixtures | `db.ts:293`, `useChoreographyStore.ts:106` documentan su eliminación; grep de `demo/fixture/testTrack` no encuentra producción | ✅ No existen |
| Metrónomo al arrancar | `Metronome` nace `enabled:false` + `hardMuted:true`; engine no lo arranca sin `setMetronomeAudible(true)` | ✅ OFF, con tests |
| Forzar `enabled` al inicializar el AudioContext | **Corregido en b37120b** (`initAudioContext` solo aplica mute) | ✅ |
| `syncBusMutes` arrancando el metrónomo | **Corregido en b37120b** (solo aplica mute) | ✅ |
| Pre-roll automático | `play()` inicia conteo si `introDelaySec>0` y posición 0 → **requiere gesto de usuario** (Play) | ✅ Requiere acción |
| Autoplay al abrir el Estudio | `syncRinkSnapshotIntoStudio` **carga el borrador** (audio del Rink) pero **no reproduce** ni arranca metrónomo | ⚠️ Carga automática del borrador (por diseño); se mantiene, sin reproducción |
| Unlock iOS (buffer mudo) | 1 muestra de silencio conectada a `destination` | ✅ Inaudible |
| Recuperación de sesión | `handleRecoverSession` carga audio desde IndexedDB en acción de usuario y fuerza metrónomo OFF | ✅ |
| `visibilitychange` / `resume` | Re-aplica mutes y reanuda; no crea fuentes nuevas | ✅ (cubierto por tests) |
| Segunda ruta TTS a `destination` | **Corregida en b37120b** (decodifica offline; solo bus del Coach) | ✅ |
| Scratch con `AudioContext` vivo | **Corregido en b37120b** (OfflineAudioContext) | ✅ |

---

## 3. Rutas de reproducción y de estado (riesgos reales)

1. **Responsabilidades mezcladas en `AudioEngine` (2150+ líneas)**: transporte, dos slots de dominio (`rink`/`studio`), publicación, trim/fades, pre-roll, media session, wake lock, export. El estado `isPlaying/startTime/pausedAtTime` se toca desde ~15 sitios y cada parada manual repite limpieza de distintos dueños (música, pre-roll, metrónomo, voz, TTS). **Riesgo: alto** de olvidar un dueño en una ruta nueva.
2. **Dos implementaciones de pre-roll**: la del motor (rAF, producción) y la del `VoiceCueEngine` (`setInterval`, legacy). **Riesgo: alto** de reactivar la segunda por accidente.
3. **Limpieza dispersa**: `stop()`, `pause()`, `resetAudioSession()`, `setDomain()`, `clearRinkAudio()`… cada uno para sus fuentes a mano. **Riesgo: medio-alto**.
4. **Recursos sin registro único**: no existe una lista consultable de “qué está sonando ahora”. El diagnóstico HUD lo aproxima. **Riesgo: medio**.
5. **Sesiones**: `resetAbsoluteSession` limpia todo, pero no existe un `sessionId` vivo en el motor; no se puede demostrar con instrumentación que un recurso pertenece a la sesión actual. **Riesgo: medio**.
6. **Metrónomo**: ya es una única instancia con registro global de scheduler (b37120b). **Riesgo: bajo**.
7. **AudioContext vivo**: 1 solo sitio de creación verificado en el bundle final. **Riesgo: bajo**.

---

## 4. Diferencias desktop vs mobile/tablet verificadas en código

- El motor **no tiene ramas `isMobile/isTablet`** en audio (grep). La diferencia real es *cuándo* existe el `AudioContext`: en móvil nace/reanuda en el primer gesto y tras `visibilitychange`, donde antes se ejecutaban los forzados de `enabled` (corregidos).
- El pre-roll y el TTS se activan en móvil con más frecuencia (conteo hablado, pregeneración en el primer toque), lo que multiplicaba la exposición a las rutas defectuosas.
- La PWA móvil puede servir bundle antiguo (SW). Mitigado con `v7` + `skipWaiting/clients.claim`.

---

## 5. Conclusión de la auditoría

- **No existe un segundo `AudioContext` en producción** (1 sitio verificado), **ni pistas demo**, **ni audio en login/navegación**.
- Las causas de los síntomas persistentes eran: rutas que encendían el metrónomo fuera del store (corregido), una segunda ruta de audio TTS/scratch (corregida) y **una arquitectura de limpieza/estado frágil y no verificable** (pendiente de reconstruir).
- Se decide **reconstruir el núcleo de reproducción** (`PlaybackCore`) manteniendo la API del `AudioEngine` y toda la UI/funcionalidad, eliminando el pre-roll legacy del `VoiceCueEngine` y dotando al motor de: registro único de fuentes, sesión/generación explícita y una sola ruta de parada.
