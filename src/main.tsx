import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { OrientationGate } from './components/system/OrientationGuard';
import { ErrorBoundary } from './components/system/ErrorBoundary';
import './index.css';
import './i18n/i18n';

/**
 * Service Worker (PWA) — SOLO en producción.
 *
 * En desarrollo (`npm run dev`) el SW anterior se registraba también en localhost
 * y cacheaba los módulos de `src/` (que NO llevan hash), sirviendo código viejo:
 * los cambios no se veían y el HMR quedaba inservible. Ahora:
 *   - producción → registra `sw.js` (con auto-actualización y recarga);
 *   - desarrollo → desregistra cualquier SW previo y limpia las cachés, de modo
 *     que siempre se ejecuta el código actual.
 */
function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  if (import.meta.env.PROD) {
    // Actualización GARANTIZADA del bundle (Android Chrome/Brave):
    //  · `updateViaCache: 'none'` → el navegador nunca sirve `sw.js` desde su
    //    caché HTTP; siempre comprueba la versión desplegada.
    //  · al activarse un SW nuevo (`controllerchange`) se recarga UNA vez: sin
    //    esto, una pestaña Android viva en segundo plano podía seguir ejecutando
    //    el bundle anterior durante días (el bug "los cambios no se reflejan").
    //  · `update()` periódico y al volver a primer plano.
    let reloading = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    });

    const register = () => {
      navigator.serviceWorker
        .register('./sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          void reg.update();
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed') {
                // Pide activación inmediata; `controllerchange` recarga la página.
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });

          // Comprobación periódica (cada 15 min) y al volver a primer plano.
          window.setInterval(() => void reg.update(), 15 * 60 * 1000);
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') void reg.update();
          });
        })
        .catch((err) => console.warn('[PWA] Error al registrar Service Worker:', err));
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
    return;
  }

  // Limpieza de desarrollo: sin Service Worker ni cachés heredadas.
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      void registration.unregister();
    });
  });
  if (typeof caches !== 'undefined') {
    caches.keys().then((keys) => keys.forEach((key) => void caches.delete(key)));
  }
}

setupServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OrientationGate>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </OrientationGate>
  </React.StrictMode>,
);

