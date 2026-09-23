# SkateCoreo · Plan de corrección de incidencias (pruebas móvil)

> Basado en diagnóstico con evidencia `archivo:línea`. Fecha: 2026-09-23.
> Orden por impacto/bloqueo. Cada ítem: causa raíz → arreglo → verificación.

---

## P0 · Bloqueantes de prueba

### 1. La foto "bugea" y vuelve a Inicio
**Causa raíz (principal):** `OrientationGate` (`src/main.tsx:8-14`, `src/components/system/OrientationGuard.tsx:78-81`) **desmonta `<App/>`** cuando detecta portrait. Al abrir la cámara (`capture="environment"`, `PaperToDigitalModal.tsx:472`) el sistema pasa a portrait; al volver, `pageshow/resize` (`OrientationGuard.tsx:48-50`) marca bloqueado y **se pierde `activeView`** (por defecto `'home'`, `App.tsx:110`, sin persistencia).
**Causas secundarias:** `getImageData` a resolución completa sin límite (`HomographyWarp.ts:77-83`, ~49 MB en 4032×3024) → OOM/reload; `FiducialDetector.detectMarkers` sin `try/catch` (`PaperToDigitalModal.tsx:128`); sin `FileReader.onerror`; **no existe ErrorBoundary**.

**Arreglo:**
- `OrientationGuard`: **no desmontar la app**. Renderizar siempre `children` y superponer el aviso como capa `fixed` (con `inert`/`pointer-events-none` sobre el contenido) para **conservar el estado**.
- Añadir `ErrorBoundary` en `main.tsx` (recuperación elegante, sin perder la vista).
- Limitar la imagen antes de procesar (downscale a máx. ~2000 px de lado con canvas/`createImageBitmap`) y envolver detección en `try/catch` + mensaje de error.
- `FileReader.onerror` y validación de tipo/tamaño.

### 2. Rink diminuta y nodos gigantes en landscape móvil
**Causa raíz:** el rink se limita por **altura** (`RinkMath.ts:32-35`) y en landscape pequeño el cromo consume ~180-240 px (header 40 + dock 105-160 + footer ~33 + padding 36×2), dejando ~150-210 px → `scale ≈ 3-6 px/m`. Los nodos se dibujan a **píxeles fijos** (`RinkRenderer.ts:595,607,618,632`) dentro del transform de cámara, así que a ~5 px/m un nodo de 22-40 px equivale a 4-8 m. El hitbox es fijo 32 px (`RinkCanvas.tsx:776`), inconsistente con el dibujo.
**Arreglo:**
- **Nodos/avatar en unidades de mundo** (p. ej. radio 0.6-0.8 m) o `clamp` proporcional a `metrics.scale`, para que escalen con el rink.
- Unificar hitbox con el radio dibujado.
- **Priorizar la pista**: reducir cromo en landscape <1024 (ocultar `attribution-bar`, permitir dock más bajo, padding proporcional a la altura) y **auto-ajustar zoom inicial** para que el rink llene el ancho.
- Escala: aplicar un `dpr` efectivo mínimo y submuestreo si el `scale` es muy bajo (nitidez percibida).

### 3. Al entrar al Audio Studio sigue sonando la Pista (y las voces guía)
**Causa raíz:** `setPlaybackDomain('studio')` (`AudioEngine.ts:1369-1383`) solo para metrónomo + voces **ya agendadas**; **no** detiene la música (`stopSource`), no pone `isPlaying=false`, y el tracking sigue llamando `checkPlaybackTime` (`AudioEngine.ts:1476`) que **no tiene guarda de dominio** (`VoiceCueEngine.ts:1015-1034`). Por eso la música sigue y las voces se re-disparan; el metrónomo sí se detiene.
**Arreglo:**
- `handoffToStudio()` en el motor: `pause()`/`stop()` del transporte del Rink + `cancelPreRoll()` + `setPlaybackDomain('studio')`.
- Llamarlo **antes** de `setActiveView('studio')` (`App.tsx:526-549, 279`) y en el montaje del Studio.
- Guarda de dominio: `startTracking` solo evalúa cues si `playbackDomain === 'rink'`.

---

## P1 · Edición de audio

### 4. "Cortar" no funciona al primer clic
**Causa raíz:** `FloatingClipContextMenu.tsx:20,105` pasa `currentTimeSec` del store, que **no se actualiza durante la reproducción** (el playhead se mueve por DOM, `usePlayheadSync.ts:15-27`); el guard de 20 ms (`useAudioStudioStore.ts:824,827`) rechaza en silencio. El patrón correcto ya existe en `AudioStudioView.tsx:436-439` (`audioEngine.getCurrentTimeMs()/1000`).
**Arreglo:** usar el reloj de hardware en el menú y avisar cuando el split no se aplica.

### 5. Arrastrar un clip a la pista de VOZ lo pierde
**Causa raíz:** `track.id='track-recording'` pero la clave del store es `recording`; `moveClipToTrack` (`useAudioStudioStore.ts:949-986`) extrae del origen pero **no inserta** (destino `undefined`) y **no hay guarda de tipo**. `AudioClipItem.tsx:205-214` asume `[music, ...additional]` (índice desfasado por la pista de grabación).
**Arreglo:**
- `resolveTrackKey(trackId → clave)` y usarlo en todas las acciones.
- **Regla:** la pista `recording` (tipo `voice`) **rechaza** clips de otras pistas (drop/duplicar) con aviso.
- Corregir el cálculo de pista destino en el indicador de drop.

### 6. Voz grabada muy baja; 2 tomas se solapan; no se dividen ni mueven
**Causa raíz:** AGC off + **sin makeup gain/normalización** en ninguna etapa (`VoiceRecorder.ts:85-91,122-143`; `studioMixdown.ts:251,302-304`). Tomas se colocan en el mismo `recordingStartSec` (`useAudioStudioStore.ts:1808,1842-1873`) → solape exacto. Split/move no-op por el desajuste id↔clave (ítem 5). Además `runStudioConsolidation` **excluye** `recording` (`:419`) mientras `arrangementOf` lo incluye (`:402-406`) → la toma recién grabada no se oye hasta Play.
**Arreglo:**
- **Normalización de pico** (o makeup + limitador suave) al crear la toma.
- Colocar la nueva toma sin solape exacto (offset mínimo al final de la toma previa si coincide).
- Unificar `arrangementOf`/`runStudioConsolidation` para incluir `recording`.
- Split/move funcionan al resolver id↔clave.

### 7. Metrónomo del envío no sincroniza
**Causa raíz:** el envío **hornea** el metrónomo (`studioMixdown.ts:454-486`) **y** el Rink arranca su metrónomo en vivo (`AudioEngine.ts:1176`): dos clics desfasados (offline fase 0 vs vivo `phaseOffsetSec`; distinto timbre y posible distinto BPM).
**Arreglo:** **no hornear** metrónomo en la mezcla transferida (es ayuda de estudio, no música). El Rink usa su metrónomo en vivo. Dejar el horneado solo para un "export con clic" explícito.

---

## P2 · Paper-to-Digital (usabilidad móvil)

### 8. Modal gigante/desbordado en landscape y no se puede editar la foto
**Causa raíz:** dos columnas solo en `lg` (`PaperToDigitalModal.tsx:437`), foto con `min-h-[42-48dvh]` (`:440,:489`) dentro de `sm:h-[90dvh]` (`:406`), panel `shrink-0` (`:506`) y footer que se va fuera; sin variantes `landscape:`/`md:`.
**Arreglo:** layout compacto en **landscape <1024** (dos columnas con panel colapsable, foto flexible, footer visible),editor de esquinas a pantalla completa si hace falta.

### 9. Entrada a "Plantilla A4 / Digitalizar" escondida
**Causa raíz:** única entrada en `LeftSidebarPanel.tsx:538-560`, dentro del drawer de Ajustes, tras 4 secciones.
**Arreglo:** accesos directos en **Home**, en el **rail/landscape** y en el **header**; etiqueta clara ("Plantilla A4 / Digitalizar").

---

## Orden de implementación y verificación

**Re-prueba:** repetir el guion de pruebas (orientación, cámara/zoom/nodos, edición de audio, transferencia, grabación, Paper-to-Digital) más:
- Enviar mezcla y verificar **un solo** metrónomo (el vivo) perfectamente alineado.
- Cortar al primer clic sobre una porción.
- Intentar soltar un clip en la pista de VOZ → debe **rechazarse** con aviso.
- Grabar 2 tomas → nivel audible, separables, movibles, divisibles.
- Entrar al Studio con la Pista sonando → **silencio total** (música, metrónomo y voces).
- Tomar foto en el celular → **no** vuelve a Inicio; se puede ajustar esquinas y digitalizar.
- Abrir "Plantilla A4 / Digitalizar" en 1-2 toques desde la pantalla principal/rail.

---

## Estado de implementación (este ciclo)

| # | Incidencia | Estado | Cambios clave |
|---|---|---|---|
| 1 | Foto "bugea" → Inicio | ✅ causa raíz | `OrientationGate` ya **no desmonta** la app (conserva estado); `ErrorBoundary` nuevo; `HomographyWarp` limita la imagen a 2600 px (anti-OOM y reescala esquinas); `try/catch` en detección y `FileReader.onerror`. |
| 2 | Rink diminuta / nodos gigantes | 🔶 parcial | Padding adaptativo a la altura; `.attribution-bar` oculto en landscape bajo (<501 px). Falta: radio de nodo en unidades de mundo y auto-fit fino (segunda pasada). |
| 3 | Studio: seguía sonando la Pista | ✅ | `AudioEngine.handoffToStudio()` (pause + dominio studio) llamado desde `App` al entrar; tracking de cues **solo en dominio rink**. |
| 4 | "Cortar" a la segunda | ✅ | El menú usa `audioEngine.getCurrentTimeMs()` (reloj de hardware) y acota el corte al rango del clip. |
| 5 | Clip perdido al soltar en VOZ | ✅ | `resolveCoreKey` (id↔clave) + **guarda de exclusividad** en `moveClipToTrack`/`duplicateClipToTrack`; UI bloquea el drop. |
| 6 | Voz baja; tomas solapadas/sin dividir/mover | ✅ | **Normalización de pico** (+hasta 20 dB) al crear la toma; resolución id↔clave (split/move reales); se evita el solape exacto; consolidación unificada con `recording`. |
| 7 | Metrónomo del envío desincronizado | ✅ | La mezcla transferida **no hornea** metrónomo; el Rink usa su metrónomo en vivo (un solo clic). |
| 8 | Modal gigante en landscape | 🔶 parcial | Variantes `landscape:` (dos columnas, altura completa, sin bordes) en `PaperToDigitalModal`. Re-test en dispositivo. |
| 9 | A4/Digitalizar escondido | ✅ | Botón **"Plantilla A4 · Digitalizar"** en **Home** y en el **rail/barra de la Pista**; modal controlado desde `App`. |

**Verificación automatizada:** `tsc` limpio, `npm run build` OK y `npm test` completo en verde (nueva suite `mobileFixes.test.ts` 7/7).

**Pendiente de segunda pasada:** radio de nodos en metros + auto-fit del rink; procesado de visión en Web Worker; afinado fino del modal y del dock en alturas muy pequeñas.

---

## Segunda intervención — maximizar la Pista 2D + fixes del modal A4

### Fixes del modal Paper-to-Digital
- **Ya no se sale a Inicio al digitalizar**: las previsualizaciones de depuración y de
  máscara se generan ahora **escaladas a 1000 px** (`canvasToScaledDataUrl`), evitando
  dos dataURLs PNG de 2000×1000 en estado (causa probable de OOM/reload en móvil). La
  navegación a la Pista ya existía vía evento `skatecoreo:goto-rink`.
- **Ya no se solapa con la barra inferior**: el contenedor usa `h-full` (respecto al
  overlay `fixed inset-0`) en vez de `100dvh`, el `overflow` en landscape vuelve a
  permitir scroll, el panel lateral hace su propio scroll y header/footer se compactan
  (`landscape:h-11` / `landscape:p-2`). El botón "Digitalizar" siempre es alcanzable.

### Optimización de espacio (footer eliminado y compactación)
- **Barra de atribución ELIMINADA** del layout (JSX y CSS): su altura pasa a la Pista.
- **Dock de audio**: `clamp(88px, 20dvh, 132px)` (antes 105-160) — waveform sigue legible.
- **Header** en landscape móvil: 36 px (antes 40).
- **Rail** lateral: 60 px (antes ~72).
- **Padding** del canvas adaptativo a la altura (ya en la primera pasada).
- **Nodos**: visual reducido (halo 20→16, radio 14/11→11/9, tipografía 12/11→11/10)
  con **área táctil desacoplada de 44 px** (`44/camera.zoom`); avatar 54→40 px.
  Números siguen legibles.

**Verificación:** `tsc` limpio, `npm run build` OK, `npm test` completo en verde.

---

## Tercera intervención — dock, borrado de nodos y fidelidad del trazado

### 1) Dock de audio (Pista 2D)
- `pb-safe` en el dock y fondo propio: ya no queda bajo el home indicator.
- Altura `clamp(96px, 22dvh, 140px)` (mínimo subido para poder editar la waveform).
- Transporte compacto más estrecho en landscape (`clamp(128px,22vw,200px)`) → más
  ancho para la waveform.
- El visor siempre se renderiza (usa una onda base si no hay audio), así que aparece
  aunque todavía no se haya cargado música.

### 2) Borrado de nodos (incluido el 1)
- Añadido un botón **"Eliminar nodo #N"** al **principio** del Inspector, siempre
  visible: en móvil el panel es corto y el botón de borrado quedaba fuera de pantalla
  (por eso el long-press parecía abrir una "vista vacía").
- El modo Borrador ya eliminaba cualquier nodo principal (incluido el índice 0) al
  tocarlo; ahora además hay una vía clara desde el Inspector.

### 3) Fidelidad del trazado (causa raíz)
- **Causa:** al crear nodos se generaban puntos de control automáticos (`cp1 = x+2`,
  `cp2 = x+3`), y el renderizador dibujaba una **Bézier con esos valores**, inventando
  curvas; las uniones sin datos aparecían como líneas rectas no dibujadas.
- **Arreglo:** el renderizador solo dibuja Bézier si el usuario **esculpió** la curva
  (nuevo flag `curveShaped`, activado por el arrastre de curva) o si existe la huella
  exacta `path` del trazo a mano alzada. En cualquier otro caso dibuja **línea recta**.
  Los nodos del escáner siguen **desconectados** (`unlinked`), sin trazos inventados.
- Trazado a mano alzada: se sigue renderizando la huella exacta (`traceSplinePath`),
  por lo que la línea refleja lo dibujado.

**Verificación:** `tsc` limpio, `npm run build` OK, `npm test` completo en verde.

---

## Fix crítico — tocar los selectores de esquina cerraba la app

**Causa raíz:** en `CornerPinAdjuster`, si el contenedor de la imagen tiene altura 0
(frecuente en landscape móvil con la columna colapsada), `scaleY = altura / altoNatural
= 0` → `newNatY = clickY / 0 = Infinity`. Al mover el puntero se llamaba
`drawImage(img, Infinity, …)`, que **lanza una excepción no capturable por un
ErrorBoundary** (ocurre en un handler de puntero) → el proceso de contenido se recarga
y la app vuelve a Inicio sin generar nada.

**Arreglo:**
- `getScales()` valida contenedor medible y `naturalSize > 0`; devuelve `null` si no.
- `handlePointerDown/Move` comprueban `Number.isFinite` de todas las coordenadas.
- `updateMagnifier` envuelto en `try/catch` y con validación de `cropX/cropY/cropW/cropH`.
- `render()` no dibuja si las medidas no son válidas.
- `setPointerCapture`/`releasePointerCapture` sobre `e.currentTarget` y con `try/catch`.
- Radio de captura táctil 36 → **44 px**.
- Nuevo modo **inline** de `ErrorBoundary` envolviendo `<CornerPinAdjuster>`: cualquier
  error residual muestra un aviso dentro del modal en lugar de tumbar la app.

**Verificación:** `tsc` limpio, `npm run build` OK, `npm test` completo en verde.

---

## Cuarta intervención — digitalizado, nodos y waveform en móvil

### 1) Digitalizar vuelve a Inicio
- **Navegación garantizada por callback**: nuevo prop `onDigitalized` que la app usa
  para `setActiveView('rink')` en el mismo instante en que se generan los nodos,
  además del evento global `skatecoreo:goto-rink`.
- **Detección más ligera**: el warp de la Etapa 2 pasa de 2000×1000 a **1400×700**
  (el motor deriva los metros del tamaño del canvas: correcto) y baja ~2.7× la
  memoria/CPU, causa probable del cierre por OOM en móvil.

### 2) Nodos al final de la ruta en pantallas pequeñas
- **Muestreo del trazo más fino**: 3.5 px → **2.5 px** (suelo 0.06 → 0.03 m) para no
  perder los tramos finales cuando el rink es pequeño.

### 3) Visor de audio "perdido" en pantallas pequeñas
- **Cabecera del waveform compacta en landscape** (`landscape:h-6`, identidad oculta)
  y **altura del dock garantizada** (`clamp(96px,22dvh,140px)`); a zoom 1 el ancho del
  contenido = ancho del contenedor, así que la onda se re-escala y queda visible.

**Pendiente si persiste el cierre al digitalizar:** sería un crash del navegador
(memoria), no un error de React; la solución definitiva es mover la visión a un
**Web Worker**. Requiere confirmación en dispositivo.
