# SkateCoreo · Rearquitectura UI/UX, Pista 2D y Audio

> Documento de consolidación y plan por fases para el prompt maestro (122 requisitos).
> Basado en una auditoría real del código (rutas y líneas verificadas). Fecha: 2026-09-23.

---

## 0. Resumen ejecutivo

La aplicación está bien construida y modular, pero tiene **una deuda estructural
central**: **no existen dos dominios de audio independientes**. Pista 2D y Audio Studio
comparten **un único `AudioEngine` singleton con un solo `AudioContext`**, el mismo
búfer maestro, el mismo metrónomo y el mismo `VoiceCueEngine`.

Todo lo demás (Pista 2D, cámara, stores, diseño) es saneable por fases y sin reescribir.
El rediseño se plantea en 5 fases; la **Fase 1 ya está implementada** en este cambio.

Hallazgo crítico (evidencia):

- `audioEngine` singleton: `src/core/audio/AudioEngine.ts:1460`; `AudioContext` único
  en `AudioEngine.initAudioContext()` (`AudioEngine.ts:179-245`).
- El Studio muta el maestro/metrónomo/voces del Rink: `src/store/useAudioStudioStore.ts:19`
  (importa `audioEngine`), escrituras en `:278`, `:454`, `:507`, `:528`, `:548`,
  `:571`, `:591-597`, `:616`, `:635`, `:1169`, `:1230-1235`, `:1258-1272`, `:1465-1469`,
  `:1531`, `:1534`, `:1566`.
- `AudioStudioView.tsx:18` importa y controla el mismo transporte (`:139`, `:288`,
  `:380`, `:559-595`, `:631`, `:915`).
- El Rink lee su mezclador del store del Studio: `RinkAudioPlayer.tsx:41-48`,
  `RinkAudioMixerDrawer.tsx:34-52`, `useAudioEngine.ts:60-73`, `InteractiveWaveform.tsx:52-55`.
- `PlaybackClock` está cableado al mismo motor (`PlaybackClock.ts:42`), por lo que hoy
  es imposible tener dos relojes independientes.

Consecuencia: se puede escuchar la voz guía de los nodos dentro del Audio Studio, y
"Enviar a Pista 2D" **reemplaza el búfer del Rink y colapsa el Master del Studio**
(`useAudioStudioStore.ts:1550-1587`), en lugar de ser una transferencia unidireccional
no destructiva. Esto contradice los requisitos 22-33, 58-70 y 107-111.

---

## 1. Mapa de la arquitectura actual (verificado)

### 1.1 Shell y navegación
- **Sin router**: `activeView: 'home' | 'rink' | 'studio'` en `App.tsx:104,110`.
- Header `App.tsx:592-594`; main `App.tsx:798`; rail lateral
  `LandscapeNavRail` (`AppNav.tsx:133-180`, visible por `.rail-landscape-only`
  `index.css:440-447`); asides desktop `App.tsx:850,909`; dock de audio
  `App.tsx:880` con `.landscape-audio-dock` (`index.css:406-428`, con `!important`).
- **No existe `OrientationGuard`** en ningún sitio (búsqueda exhaustiva).
- Manifests `public/site.webmanifest` y `public/manifest.webmanifest` **sin `orientation`**;
  `index.html:21` usa `site.webmanifest`.

### 1.2 Pista 2D y cámara
- Coordenadas y cámara: `useCanvasCamera.ts` (`screenToWorld` inverso; cámara
  `{x,y,zoom}`); render aplica `ctx.translate/scale` (`RinkCanvas.tsx:583-584`).
- **Pinch-to-zoom y pan de 1 dedo YA existen** (`useCanvasCamera.ts:103-195`), con
  anclaje al punto medio. Zoom clamp 0.5-4.0.
- **No hay zoom con rueda** para la pista; en modo IDE (`RinkCanvas.tsx:1603-1679`)
  tampoco había botones de zoom (el HUD `:1966-1991` es solo modo standalone).
- **El pan no tenía límites**: la pista podía perderse fuera del viewport.
- Proporción 2:1 garantizada por `RinkMath.calculateViewportMetrics` (escala uniforme).

### 1.3 Stores
- `useChoreographyStore`: puntos, selección, `phase`, toggles de pista, `paperTraceOverlay`,
  tray de nodos de audio (`unplacedNodes`).
- `useAudioStudioStore`: tracks/clips/nodes/transporte/mezclador del Studio, y **es la
  fuente de verdad del mezclador del Rink** (contaminación).
- `useAuthStore`, `useLoadProgressStore`.
- Tests que NO deben romperse: `choreographyStore.test.ts` (14) y
  `audioStudioStore.test.ts` (32, incluye el acoplamiento de mutes con `audioEngine`).

### 1.4 Duplicaciones de UI detectadas (requisito 6)
- "Deshacer": `LeftSidebarPanel.tsx:587-595` **y** `RightInspectorPanel.tsx:228-237`
  visibles a la vez en desktop; más `RinkContextTools.tsx:197-206,287-296` y teclado
  `RinkCanvas.tsx:1548-1551`.
- "Nodos / Trazar / Borrar": en `RinkContextTools layout="panel"` (panel izquierdo) **y**
  en `RightInspectorPanel.tsx:143-208` (inspector derecho), simultáneos en desktop.
- "Cargar audio": header `App.tsx:674-683` + Home `HomeView.tsx:362-368`.
- "Abrir Estudio": `HomeView.tsx:223-235`, `LeftSidebarPanel.tsx:249-257`,
  `NodePlacementTray.tsx:99-108`, `RinkAudioMixerDrawer.tsx:267-279` (+ gesto de borde).
- "Cerrar sesión": header `App.tsx:686-694`, menú `:774-784`, panel
  `LeftSidebarPanel.tsx:642-650` (este último **no** llama a `releaseWorkingSession()`,
  comportamiento divergente).

---

## 2. Plan por fases

### Fase 1 — Orientación y cámara de la Pista 2D · ✅ IMPLEMENTADA

Requisitos cubiertos: 2, 3, 4 (parcial), 11 (rueda/botones/reset), 12, 13, 100 (base), 104.

- **`src/utils/orientation.ts`** (puro): `shouldShowRotateScreen`, `getOrientationMode`.
  Regla: táctil + ancho < 1024 + vertical → bloquear; escritorio nunca.
- **`src/components/system/OrientationGuard.tsx`**: `OrientationGate` + hook. Se monta
  **por encima de `App`** en `src/main.tsx`, de modo que en vertical **no se montan**
  canvas, audio ni navegación. Intenta `screen.orientation.lock('landscape')` (mejor
  esfuerzo, sin romper si falla) y ofrece botón "Fijar horizontal".
- **Manifests**: `"orientation": "landscape"` añadido a `site.webmanifest` (el enlazado)
  y a `manifest.webmanifest` (precacheado por `sw.js`), eliminando la inconsistencia.
- **Cámara** (`useCanvasCamera.ts`): nueva `zoomAtPoint(factor, clientX, clientY, canvas)`
  centrada en el cursor/dedo; `clampCamera` (límites de pan/zoom, centrado si cabe) en
  todos los gestos y botones; zoom con **rueda del ratón y trackpad pinch**
  (listener nativo no pasivo en `RinkCanvas.tsx`); botones **+ / − / % (reset)** en modo
  IDE. La proporción 2:1 se mantiene (escala uniforme intacta).
- **Pruebas**: `src/utils/orientation.test.ts` (17) y
  `src/core/canvas/cameraBounds.test.ts` (9), integradas en `npm test`.

### Fase 2 — Separación de dominios de audio (Studio ⇄ Rink) · 🔶 EN CURSO (2.1 y 2.3 hechas)

Requisitos: 22-33, 58-70, 79-82, 93-94, 107-111, 121.

Objetivo: **un solo flujo permitido** `Studio Final Mix → Rink Music Source`.

**Implementado (Fase 2.1 — aislamiento audible y de dominio):**
- `AudioPlaybackDomain = 'rink' | 'studio'` en `types/audio.ts`.
- `AudioEngine.setPlaybackDomain()/getPlaybackDomain()` (`AudioEngine.ts`). En
  `beginPlaybackAt` y `setPlaybackRate`, el **metrónomo y las voces guía de nodos
  solo se agendan en dominio `'rink'`**; en `'studio'` se detienen. Al volver a
  `'rink'` se re-sincronizan.
- `AudioStudioView` fija el dominio `'studio'` al montarse y restaura `'rink'` al
  desmontarse; `RinkAudioPlayer` fija `'rink'` al reproducir.
- **Eliminada la adopción automática Rink → Studio** (el Studio ya no copia el búfer
  de la Pista 2D en su pista Master).
- Pruebas: `src/core/audio/audioDomain.test.ts` (6).

**Implementado (Fase 2.3 — transferencia única no destructiva):**
- `renderAndExportMixdown` ya **no** colapsa la pista Master del Studio: el Rink
  recibe la mezcla renderizada y el proyecto del Studio conserva sus clips,
  edición, automatización y configuración (requisito 28).
- La mezcla transferida se identifica como `Mezcla final (Audio Studio).wav`
  (identidad de origen, requisito 30).
- `AudioStudioView`: **confirmación de reemplazo** con `ConfirmDialog` si la Pista 2D
  ya tiene canción, y bloqueo de doble transferencia por doble pulsación
  (requisitos 80-81).

**Implementado (Fase 2.4-a — identidad de la fuente musical del Rink, req. 30):**
- `AudioEngineState.sourceKind: 'file' | 'studio-mix'`. Al enviar la mezcla, la música
  del Rink queda marcada como `studio-mix`; al importar un archivo o limpiar, vuelve a
  `file`. La UI de la Pista 2D muestra el distintivo **"Mezcla Studio"** en el
  transporte, y el motor expone nombre, duración y origen sin referencia viva al
  mezclador interno del Studio.

**Pendiente (Fase 2.4-b — separación física de motores):**
Separar el `AudioContext`/grafo del Studio (su propio `Master Bus` y reloj) del motor
del Rink, y mover el estado del mezclador del Rink fuera de `useAudioStudioStore`
(`RinkAudioPlayer.tsx:41-48`, `RinkAudioMixerDrawer.tsx:34-52`, `useAudioEngine.ts:60-73`,
`InteractiveWaveform.tsx:52-55`). Requiere reescribir el test
`audioStudioStore.test.ts:133-184`, hoy atado al motor compartido. Hasta entonces, el
aislamiento es **audible** (resuelve el requisito 107) y de **identidad** (2.4-a), pero
ambos dominios siguen usando el mismo `AudioContext`.

### Fase 3 — Layout responsive y de-duplicación de UI · 🔶 EN CURSO (3.1 hecha)

Requisitos: 1, 4-10, 14-21, 71, 73-74, 97-103, 117-120.

**Implementado (Fase 3.1 — espacio físico y zona sagrada):**
- **Inspector en landscape pequeño como columna en flujo** (no overlay): el
  bottom-sheet móvil queda solo para portrait (`landscape:hidden`) y se añade un
  `<aside>` en el layout que **reserva espacio** y reajusta la Pista 2D
  (`App.tsx`, requisitos 4, 8, 15). La Pista 2D nunca queda tapada por el inspector.
- **`NodePlacementTray` movida dentro del área de la Pista 2D** (`<main>` con
  `relative`), de modo que ya no se solapa con el inspector ni con los paneles
  laterales; solo flota sobre el propio editor (requisitos 1, 8).
- **Dock de audio con `clamp(105px, 22dvh, 160px)`** y mínimos/máximos explícitos,
  sustituyendo el `!important` de `24dvh/26dvh`; se elimina el bloque contradictorio
  para pantallas de <400px (`index.css`, requisito 18). Waveform, playhead y nodos
  conservan altura suficiente (19-20).
- **Cierre de sesión unificado**: `LeftSidebarPanel` acepta `onLogout` y la app le
  pasa el mismo `handleLogout` que ya libera la sesión de trabajo, eliminando el
  comportamiento divergente (requisito 6).
- Header compacto y safe areas ya estaban resueltos (`.header-compact`,
  `.pt-safe/.pb-safe`, `--safe-*`); se mantienen.

**Implementado (Fase 3.2 — de-duplicación principal):**
- Se eliminó el bloque **"Modo de Trazado"** duplicado de `LeftSidebarPanel`; los
  botones **Nodos/Trazar/Borrar** tienen ahora una única ubicación por factor de forma:
  **Inspector de Nodo** (desktop) y **barra/rail contextual `RinkContextTools`** (móvil).
- Se eliminó el **"Deshacer"** duplicado de `RightInspectorPanel`; queda en el panel de
  **Preparación** (desktop), en la barra/rail contextual (móvil) y en el teclado
  (`Ctrl/Cmd+Z`). El Inspector conserva su función propia (edición de nodo).

**Implementado (Fase 3.3 — accesibilidad del transporte):**
- `aria-label` añadido a todos los controles de solo icono que faltaban en el
  transporte del Studio (`TopTransportBar`): snap, vistas (Arreglos/Notas/Ajustes),
  cierre de modales. Se mantienen `title` y `aria-pressed` donde aplica (req. 98).
- **Revisión de puntos de entrada "Abrir Estudio"/"Cargar audio":** se conservan las
  entradas contextuales (Home, panel, bandeja, mezclador) porque cada una vive en una
  superficie distinta; no son duplicados del mismo botón en la misma vista. La
  unificación de botones *repetidos en la misma pantalla* ya se hizo en 3.2.

**Pendiente (Fase 3.4 / 5.4, requieren dispositivo):**
- Auditoría botón por botón completa y pruebas de reproducción larga (10/20/30 min),
  multitáctil y safe areas en la matriz de dispositivos (req. 103-106, 113, 115).

### Fase 4 — Grabación de voz en el Audio Studio · 🔶 EN CURSO (núcleo hecho)

Requisitos: 34-40, 56-57, 90, 112, 114.

**Implementado:**
- **`src/core/audio/VoiceRecorder.ts`**: `getUserMedia` → `MediaStream` → `MediaRecorder`
  (Opus/WebM en Chrome-Android/Edge, AAC/MP4 en Safari-iOS) → `Blob` → **una única
  decodificación** a `AudioBuffer` con el `AudioContext` del motor (`decodeAudioFile`),
  sin recodificaciones intermedias. Constraints de calidad: sin cancelación de eco,
  supresión de ruido ni AGC automáticos.
- **Pista dedicada "🎙 VOZ (Grabación)"** (`track-recording`), separada de la pista
  pseudo `voice` (controles de guías del Rink) para no crear acoplamiento.
- **Store**: `isRecording`, `recordingElapsedSec`, `recordingStartSec`, `recordingError`
  y acciones `startVoiceRecording` / `stopVoiceRecording` / `cancelVoiceRecording`.
  Cada STOP **añade una toma nueva** (tomas múltiples, nunca se sobrescribe), con el
  clip colocado exactamente en la posición del cabezal (`recordingStartSec`). La
  grabación entra en el arreglo (`arrangementOf`) y por tanto en reproducción y en la
  mezcla final. `resetStudio` cancela la grabación y libera sus buffers.
- **UI**: botón **REC** circular junto a Play/Pause (icono `Mic` de lucide, estado rojo
  pulsante con duración `m:ss`), aviso de error accesible (`role="alert"`) y fila de
  pista con clips arrastrables/recortables/reproducibles.
- Pruebas: `src/core/audio/voiceRecording.test.ts` (11, contrato seguro sin micrófono).

**Implementado (Fase 4.2 — monitorización de entrada):**
- Monitorización **opcional y por defecto OFF** (anti-realimentación): la señal del
  micrófono se enruta a la MISMA salida del usuario (`createMediaStreamSource` →
  `GainNode` → `destination` sobre el contexto del motor), nunca al audio del Rink.
- Estado en el store (`recordingMonitorEnabled`, `recordingMonitorError`,
  `setRecordingMonitor`), con preferencia que se aplica al arrancar la toma. Se limpia
  al detener/cancelar la grabación y en `resetStudio`.
- UI: botón **Headphones** en el transporte con aviso de "usar auriculares"; error
  visible si no se puede activar.

**Implementado (Fase 4.3 — pre-inicio de grabación):**
- Cuenta atrás **opcional** (por defecto OFF, configurable 3/5/10 s) antes de iniciar
  la toma. El grabador se separa en `prepare()` (adquiere micrófono y permiso) y
  `start()` (inicia captura), de modo que la cuenta atrás corre **antes** de capturar y
  la toma arranca exactamente al terminar, **sin offsets mágicos** (req. 90).
- Estado en el store (`recordingCountdownEnabled`, `recordingCountdownSec`,
  `recordingCountdown` + setters); la cuenta es **cancelable** vía `cancelVoiceRecording`.
- UI: botón **Timer** con selector de segundos y cuenta atrás a pantalla completa.
- Pruebas de grabación ampliadas a **18**.

**Pendiente (Fase 4.4):** captura PCM vía `AudioWorklet` como mejora documentada (mayor
calidad, menor compatibilidad con Safari iOS que `MediaRecorder` hoy).

### Fase 5 — Transporte, atajos y accesibilidad · 🔶 EN CURSO (5.1 hecha)

Requisitos: 21, 41-47, 52-55, 76-78, 83-85, 87-89, 91-92, 95-96, 98-99, 105-106, 113, 115-116.

**Implementado (Fase 5.1):**
- **Transporte estándar de la Pista 2D**: se añade **⏮ Retroceder al inicio** a
  `RinkAudioPlayer` (compacto y header), completando `⏮ ▶/⏸ ■` (requisito 21). Todos
  los controles llevan `aria-label` + `title`.
- **Atajos de teclado del Audio Studio** (requisito 54): además de `Espacio`
  (Play/Pausa), `Ctrl/Cmd+C/V` y `Supr`, se añaden **`R`** (Grabar/Detener) y **`Esc`**
  (Cancelar grabación o detener el transporte), con guarda para no pisar el `Esc` de
  los diálogos modales ni los atajos del sistema. Los tooltips muestran el atajo.
- La sincronización visual ya usa `requestAnimationFrame` + `AudioContext.currentTime`
  como reloj real (requisitos 41-44), no `setInterval` para la posición sonora.

**Implementado (Fase 5.2 — loop):**
- **Bucle sin clics con `AudioBufferSourceNode.loop` nativo** (precisión de muestra, sin
  reagendados manuales): `AudioEngine.setLoop(enabled, startSec, endSec)` /
  `getLoop()`, aplicado en `scheduleMusicSourceAt` y re-saneado al cambiar de buffer.
- Posición del cabezal mapeada al rango del bucle con el helper puro
  `src/core/audio/playbackLoop.ts` (`normalizeLoop`, `wrapLoopPositionSec`), de modo que
  el playhead y la evaluación de cues coinciden con el audio.
- UI: botón **Repeat** en el transporte del Studio; atajo **`L`** para alternar.
- Pruebas: `src/core/audio/playbackLoop.test.ts` (12).

**Implementado (Fase 5.3 — undo/redo del Studio):**
- Historial de edición `studioHistory`/`studioFuture` en `useAudioStudioStore`, con
  `pushStudioEdit` / `undoStudio` / `redoStudio`. Cubre las operaciones principales:
  nodos temporales (añadir/mover/borrar/limpiar), clips (cortar, mover, mover de pista,
  duplicar, borrar, pegar) y pistas adicionales (borrar); y la creación de tomas de voz.
- Atajos **`Ctrl/Cmd+Z`** (deshacer) y **`Ctrl/Cmd+Shift+Z`** (rehacer) en el Studio.
- Una nueva edición invalida el "futuro" (no se reaplica lo descartado).
- Pruebas: `src/core/audio/studioHistory.test.ts` (8).

**Pendiente (Fase 5.4):**
- Auditoría botón por botón y pruebas de desincronización en reproducción larga
  (10/20/30 min) sobre dispositivo.

---

## 3. Criterios de aceptación (resumen)

- `npm test` y `npm run build` sin errores; sin imports muertos ni TypeScript roto.
- Aislamiento verificable: con nodos + voces guía activas en Rink, abrir el Audio Studio
  **no** debe reproducir voces de Rink (requisito 107).
- Sin `Enviar a Pista 2D`, modificar el Studio **no** altera Rink, y viceversa (108, 110, 111).
- `Enviar a Pista 2D` reemplaza la música activa del Rink conservando nodos y
  trayectorias, sin borrar el proyecto del Studio (109).
- La pista nunca se deforma (2:1) ni se pierde con pan/zoom (14).

> No se declaran porcentajes de precisión ni de rendimiento sin medirlos en la matriz de
> dispositivos (requisito 103) y en las pruebas de sincronización.

---

## 4. Estado de este cambio

- ✅ **Fase 1 implementada y probada** (orientación + cámara de la Pista 2D).
- 🔶 **Fase 2.1, 2.3 y 2.4-a implementadas** (aislamiento de dominio audible,
  transferencia única no destructiva con confirmación e identidad de fuente
  `studio-mix`). Queda la **Fase 2.4-b** (segundo `AudioContext`/grafo y estado del
  mezclador del Rink fuera del store del Studio), la de mayor riesgo.
- ✅ **Fase 3.1, 3.2 y 3.3 implementadas** (inspector en flujo en landscape, Pista 2D
  como zona sagrada, dock de audio `clamp()`, cierre de sesión unificado,
  de-duplicación de modos/Deshacer y accesibilidad del transporte).
- ✅ **Fase 4 (núcleo, monitorización y pre-inicio) implementada**: grabación de voz con
  pista dedicada, tomas múltiples no destructivas, entrada en la mezcla final,
  monitorización opcional (OFF por defecto) y cuenta atrás opcional. Queda solo la captura
  PCM vía AudioWorklet como mejora futura (Fase 4.4).
- ✅ **Fase 5.1, 5.2 y 5.3 implementadas**: transporte estándar de la Pista 2D
  (⏮ ▶/⏸ ■), atajos del Studio (Espacio, R, Esc, L, Supr, Ctrl/Cmd+C/V, Ctrl/Cmd+Z,
  Ctrl/Cmd+Shift+Z), **loop nativo sin clics** y **undo/redo** del Studio. Queda la
  auditoría fina y las pruebas de reproducción larga (Fase 5.4).
- 📄 Pendientes restantes: **2.4-b** (segundo `AudioContext`/grafo del Studio) y
  **5.4** (auditoría/pruebas largas en dispositivo); **4.4** queda como mejora futura
  (AudioWorklet).
- Verificado: `npm test` en verde (dominio 7, bucle 12, grabación 18 y undo/redo 8) y
  `npm run build` OK.
