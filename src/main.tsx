import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { OrientationGate } from './components/system/OrientationGuard';
import { ErrorBoundary } from './components/system/ErrorBoundary';
import './index.css';
import './i18n/i18n';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OrientationGate>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </OrientationGate>
  </React.StrictMode>,
);

