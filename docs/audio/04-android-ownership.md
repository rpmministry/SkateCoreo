# Android Chrome/Brave — versión real, ownership entre pestañas y arranque limpio

Fecha: 2026-09-28 · Base: iteración sobre `0890040`.

## 1. Diagnóstico en dos hipótesis (comprobadas por separado)

### Hipótesis A — Android ejecutaba una versión antigua (cache/PWA)

Estado del despliegue auditado:

| Elemento | Estado | Evidencia |
|---|---|---|
| `public/sw.js` | `install` → `skipWaiting()`, `activate` → borra cachés antiguas + `clients.claim()` | `sw.js` |
| Navegaciones (HTML) | **network-first** (nunca sirve HTML viejo si hay red) | `sw.js` fetch handler |
| Assets JS con hash | SWR + nombres con hash nuevo en cada build | `vite.config.ts` |
| `/sw.js` en Vercel | `Cache-Control: no-cache, no-store, must-revalidate` | `vercel.json` |
| Registro del SW | ahora `updateViaCache: 'none'` + recarga al `controllerchange` | `src/main.tsx` |
| Riesgo residual | Una pestaña Android viva en 2º plano podía seguir con el bundle en memoria al no recargar nunca | corregido: recarga única al cambiar el SW + `update()` cada 15 min y al volver a primer plano |

**Conclusión A**: la infraestructura era correcta, pero faltaba forzar la recarga tras la actualización del SW y verificar la versión **desde el propio teléfono**. Se añadió identidad de build verificable (abajo).

### Hipótesis B — la versión nueva aún permite una segunda fuente

En un solo contexto JS no existe ruta que cree un segundo metrónomo/playback (verificado por pruebas y por auditoría del bundle: 1 solo `AudioContext`, 1 solo scheduler posible). **Pero Android sí permite un escenario real de dos fuentes: dos pestañas vivas del mismo usuario**, cada una con su propio `AudioEngine` y `AudioContext`. Chromium en Android mantiene vivos los tabs en segundo plano; iOS suspende los tabs en segundo plano, y en desktop suele usarse un solo tab → explica exactamente el patrón reportado (Android sí, iOS/desktop no) y los síntomas ("el mute de una pestaña no silencia la otra", "cierre una y sigue sonando").

**Conclusión B**: se implementó **ownership de audio entre pestañas** (una sola pestaña puede sonar) + instrumentación con `TAB_ID` para distinguir duplicación intra-pestaña vs entre-pestañas.

## 2. Identidad de build verificable desde Android

- `vite.config.ts` inyecta `__BUILD_VERSION__`, `__BUILD_COMMIT__`, `__BUILD_TIMESTAMP__` (package.json + `git rev-parse --short HEAD`).
- Visible en:
  - **Configuración → “Versión vX.Y.Z+commit”** con botón **“Buscar actualización”** (fuerza `registration.update()` + `SKIP_WAITING` + recarga);
  - HUD `?audioDebug=1` (esquina inferior izquierda);
  - consola: `__SKATECOREO_BUILD__` (`{version, commit, timestamp, label, tabId}`);
  - todos los logs de audio incluyen `[tab_xxx] [vX.Y.Z+commit]`.

**Procedimiento de verificación en Android**: abrir la app → Configuración → comprobar “Versión …”. Si no coincide con el último despliegue: pulsar “Buscar actualización”; si aún no cambia, cerrar la PWA/pestañas y reabrir. Con el HUD (`?audioDebug=1`) se ve además `tab`, `owner`, `otra pestaña: play/metro`.

## 3. Ownership de audio entre pestañas (`tabAudioCoordinator.ts`)

- `tabId` por pestaña (`sessionStorage`): sobrevive recargas, muere al cerrar.
- Lease compartido en `localStorage` (`{ownerId, playing, metronomeOn, heartbeatAt, expiresAt}`) + mensajes `BroadcastChannel` (respaldo por `storage` events).
- Reglas:
  1. Una pestaña nueva **no es dueña** y no reproduce nada.
  2. Solo una pestaña puede ser dueña; el dueño renueva con heartbeat (5 s; lease 20 s).
  3. **Una pestaña que reproduce nunca es desplazada** (grace de audio 45 s): no pueden coexistir dos fuentes.
  4. Dueño inactivo → traspaso por handshake (`TAKEOVER_REQUEST`/`ACK`); dueño muerto (lease vencido sin audio) → control libre.
  5. Ocultarse inactiva libera el control; reproducir en segundo plano lo conserva y lo renueva.
  6. `pagehide` (cierre/navegación) libera siempre.
- Puertas en el motor: `play()`, `playWithPreRoll()`, `setMetronomeAudible(true)`, `beginPlaybackAt()` verifican ownership. `pause/stop/mute/OFF` funcionan **siempre** en cualquier pestaña (seguridad).
- Store: los toggles de metrónomo respetan la misma puerta (la UI nunca muestra ON sin sonido).
- UI: banner “El audio está sonando en otra pestaña de SkateCore” con botón **“Tomar control”** (explica el resultado si el otro tab está reproduciendo).
- Al perder el ownership: se destruyen todas las fuentes locales y el metrónomo vuelve a OFF (motor + store).

## 4. Arranque limpio y login sin audio

- Cada pestaña/montaje arranca con: 0 fuentes, 0 tracks, metrónomo OFF (store y motor), `playbackCore` fase `idle`, sin scheduler ni osciladores.
- El `AudioContext` solo se crea en un gesto del usuario; login/logout no crean audio (logout destruye todo y libera ownership).
- El reset **no** se dispara en render/resize/orientación: solo en el lifecycle de sesión/pestaña/ownership (`sessionLifecycle`, `visibilitychange`, `pagehide`).

## 5. Pruebas

- `androidTabOwnership.test.ts` (48 asserts): pestaña nueva sin audio; una sola dueña; B denegada mientras A suena (síncrono y `claim()`); handshake de traspaso; lease caducado; gracia de audio; heartbeat; oculto-inactivo vs background-playing; `pagehide`; avisos `STATE`; motor bloqueado sin ownership y funcional con él; apagado siempre permitido.
- Identidad de build verificada en el mismo test.
- Suite completa: 39 archivos, `npm test` exit 0; `tsc` 0 errores; `npm run build` exit 0.
- Android físico (Chrome/Brave/tablet): ejecutar la batería A–F del pedido usando el HUD:
  - A: 1 pestaña → `owner=false` inicial, `fuentes=0`, metrónomo OFF.
  - B: abrir 2ª pestaña → `owner=false`, `otra pestaña: play=false` (no hereda nada).
  - C: Play en A → en B `otra pestaña: play=true`, B en silencio.
  - D: metrónomo en A → `schedulers=1` en A; en B el toggle no enciende.
  - E: cambiar a B → sin reproducción automática.
  - F: cerrar A → en B “Tomar control” adquiere el ownership y solo entonces puede sonar.
  - Reload/logout/orientación: metrónomo OFF, sin fuentes, ownership liberado/adquirido sin duplicar.
