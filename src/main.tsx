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
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then((reg) => {
          reg.update();
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                window.location.reload();
              }
            });
          });
        })
        .catch((err) => console.warn('[PWA] Error al registrar Service Worker:', err));
    });
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

