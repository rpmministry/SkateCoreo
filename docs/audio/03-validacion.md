# Validación y estado de implementación

Base de la reconstrucción: rama de seguridad `safety/audio-subsystem-pre-rebuild`
(recuperable en cualquier momento). Implementación por fases ya aplicada:

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Auditoría + rama de seguridad | ✅ `docs/audio/01-auditoria.md`, rama publicada |
| 1 | `PlaybackCore` aislado + 55 asserts | ✅ `src/core/audio/PlaybackCore.ts` + `.test.ts` |
| 2 | Integración en `AudioEngine`, pre-roll legacy eliminado, sesión begin/end | ✅ `AudioEngine.ts`, `VoiceCueEngine.ts`, `sessionLifecycle.ts` |
| 3 | Instrumentación TRACK/PLAYBACK/SESSION + HUD + regresión | ✅ `audioDiagnostics.ts`, `AudioDebugHud.tsx`, `audioSubsystemReconstruction.test.ts` |
| 4 | Validación (tsc + suite + build) y publicación | ✅ (ver abajo) |

## Mapa de pruebas A–L → verificación

| Test | Escenario | Verificación automática | Verificación en dispositivo (QA) |
|---|---|---|---|
| A | Sesión vacía: 0 tracks, Play disabled, metrónomo OFF, silencio | `audioSubsystemReconstruction` (Play sin pista no crea fuentes), `audioStudioCleanInit` | Abrir Estudio en limpio; HUD: `fuentes activas: 0`, `metr OFF` |
| B | Cargar audio → Play: suena solo la pista | `audioEngine` (118 asserts), `playbackLoop`, `mobileFixes` | Cargar archivo real y reproducir |
| C | Play con metrónomo OFF y ON (exactamente 1) | `mobileAudioRegression` (scheduler único, fuente fantasma), `metronomeSingleSource` | Activar campana; HUD `metrónomos: 1`, `schedulers: 1` |
| D | Mute silencia la fuente correcta | `audioStudioStore`, `mobileAudioRegression` | Mute de música/coach/metrónomo |
| E | Stop detiene la reproducción real | `audioSubsystemReconstruction` (stop → 0 fuentes/schedulers/nodos) | Stop y comprobar silencio |
| F | Logout destruye todas las fuentes | `sessionLifecycle`, `audioSubsystemReconstruction` (endSession) | Logout; HUD `sesión: none`, `fuentes: 0` |
| G | Nuevo login empieza limpio | `sessionLifecycle` (clean-new/purga), `workingSession` | Login con otra cuenta; sin audio heredado |
| H | Orientación no duplica fuentes | `orientation`, `deviceFormFactor`, `audioSubsystemReconstruction` | Girar en móvil/tablet; HUD sin cambios en instancias |
| I | Reload no arranca metrónomo | `mobileAudioRegression` (OFF por defecto), `audioStudioCleanInit` | Recargar; campana OFF |
| J | Batería en teléfono | `npm test` (Node) | Ejecutar A–I en Android/iOS |
| K | Batería en tablet | `npm test` (Node) | Ejecutar A–I en tablet |
| L | Desktop sin regresiones | Suites completas (38) | Flujo normal de Pista 2D/Estudio/Visor |

## Cómo verificar en un dispositivo real (sin herramientas de escritorio)

1. Abrir la app con `?audioDebug=1` (o en consola: `__SKATECOREO_AUDIO_DIAG__.enable()` y recargar).
2. El HUD inferior muestra en vivo:
   - `sesión` y `gen` (aislamiento),
   - `fuentes activas` por tipo (música/pre-roll/unlock),
   - `metrónomos`, `schedulers armados`, `duplicados destruidos`,
   - `contextos` creados,
   - últimos eventos (`PLAYBACK_CREATED`, `METRONOME_STARTED`, `SESSION_DESTROYED`…).
3. Criterio de aceptación en dispositivo:
   - reposo: `fuentes activas: 0`, `schedulers: 0`, `metrónomos: 1`, `duplicados: 0`;
   - Play: `fuentes activas: 1 [music=1]`;
   - campana ON: `schedulers: 1` (nunca 2);
   - Stop/Logout: todo a 0.
4. Botón “Copiar” del HUD para adjuntar el informe si algo no cuadra.

## Resultados de esta iteración (entorno de desarrollo)

- `npx tsc --noEmit` → 0 errores.
- `npm test` → exit 0 (38 suites, incluye PlaybackCore 55, subsistema 42,
  regresión móvil 32, orden de pistas, TTS sin segundo contexto).
- `npm run build` → exit 0.
- Auditoría del bundle: **1 solo sitio de creación de AudioContext en vivo**;
  `isPreRolling` (API legacy) ausente; eventos `PLAYBACK_*`/`SESSION_*` presentes.
