/**
 * ProtectedLayout.tsx — Contenedor de Protección SaaS (Soft Paywall)
 *
 * Mantiene el lienzo y los controles de la aplicación renderizados en el fondo
 * pero superpone el Soft Paywall Glassmorphism si el usuario no tiene una sesión
 * o una suscripción activa.
 */

import React from 'react';
import { AuthModal } from './AuthModal';
import { useAuthStore } from '../store/useAuthStore';

interface ProtectedLayoutProps {
  children: React.ReactNode;
}

export const ProtectedLayout: React.FC<ProtectedLayoutProps> = ({ children }) => {
  const hasAccess = useAuthStore((s) => s.hasActiveAccess());

  return (
    <div className="relative w-screen h-dvh overflow-hidden">
      {/* Aplicación principal siempre renderizada en el fondo */}
      <div className={`w-full h-full transition-all duration-500 ${!hasAccess ? 'pointer-events-none select-none' : ''}`}>
        {children}
      </div>

      {/* Overlay Soft Paywall Glassmorphism (solo visible si no tiene acceso activo) */}
      {!hasAccess && <AuthModal />}
    </div>
  );
};
