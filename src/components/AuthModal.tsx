/**
 * AuthModal.tsx — Soft Paywall & Modal de Autenticación con Glassmorphism
 *
 * Muestra el lienzo de fondo con desenfoque (`backdrop-blur-md bg-slate-950/70`)
 * pero bloquea la interacción hasta que el usuario inicie sesión y active su suscripción.
 */

import React, { useState } from 'react';
import { 
  Sparkles, 
  Check, 
  Mail, 
  ArrowRight, 
  Users, 
  Lock,
  ExternalLink,
  Crown,
  LogOut
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

export const AuthModal: React.FC = () => {
  const { 
    user, 
    subscription_status, 
    loginWithGoogle, 
    loginWithEmail, 
    subscribePlan, 
    logout,
    isLoading 
  } = useAuthStore();

  const [emailInput, setEmailInput] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);

  // Si ya está autenticado y tiene suscripción activa, no renderiza overlay
  const hasAccess = !!user && subscription_status === 'active';
  if (hasAccess) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-md select-none transition-all duration-500"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md bg-slate-900/90 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/90 backdrop-blur-xl text-white animate-in fade-in zoom-in-95 duration-200">
        
        {/* Halos Neón Decorativos */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-cyan/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-coral/20 rounded-full blur-3xl pointer-events-none" />

        {/* ── Brand Header ── */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan/10 border border-cyan/30 text-cyan text-[11px] font-mono font-bold tracking-wider mb-2.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>ALSISTECH · ECOSISTEMA SAAS</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">
            SkateArt <span className="text-coral">Pro</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Plataforma Profesional de Entrenamiento y RollArt 2026
          </p>
        </div>

        {/* ══════════════════════════════════════════════════════
            ESTADO 1: Usuario No Autenticado (Login Gateway)
            ══════════════════════════════════════════════════════ */}
        {!user ? (
          <div className="space-y-4">
            <p className="text-xs text-slate-300 text-center leading-relaxed">
              Bienvenido al Ecosistema Digital de Patinaje. Inicia sesión para guardar rutinas, trazar trayectorias reglamentarias y entrenar offline en la pista.
            </p>

            {/* Botón 1: Continuar con Google (Neutro de Alto Contraste min 48px) */}
            <button
              type="button"
              onClick={() => loginWithGoogle()}
              disabled={isLoading}
              className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-white hover:bg-slate-100 active:scale-[0.98] text-slate-950 font-bold text-xs flex items-center justify-center gap-3 shadow-lg transition-all disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>{isLoading ? 'Conectando...' : 'Continuar con Google'}</span>
            </button>

            {/* Botón 2: Acceder con Email */}
            {!showEmailForm ? (
              <button
                type="button"
                onClick={() => setShowEmailForm(true)}
                className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white font-bold text-xs flex items-center justify-center gap-2 border border-white/10 active:scale-[0.98] transition-all"
              >
                <Mail className="w-4 h-4 text-cyan" />
                <span>Acceder con Email</span>
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (emailInput.trim()) loginWithEmail(emailInput.trim());
                }}
                className="space-y-2 pt-1 animate-in fade-in duration-150"
              >
                <input
                  type="email"
                  required
                  placeholder="tu-correo@ejemplo.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-slate-950 border border-white/15 text-white placeholder:text-slate-600 font-mono text-xs focus:outline-none focus:border-cyan transition-all"
                />
                <button
                  type="submit"
                  disabled={isLoading || !emailInput.trim()}
                  className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-cyan text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-glow-cyan active:scale-[0.98] transition-all disabled:opacity-40"
                >
                  <span>{isLoading ? 'Verificando...' : 'Ingresar a la Plataforma'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        ) : (
          /* ══════════════════════════════════════════════════════
             ESTADO 2: Usuario Autenticado sin Suscripción (Soft Paywall)
             ══════════════════════════════════════════════════════ */
          <div className="space-y-4">
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-2 h-2 rounded-full bg-cyan shrink-0" />
                <span className="text-slate-300 font-medium truncate">
                  {user.email}
                </span>
              </div>
              <button
                type="button"
                onClick={() => logout()}
                className="p-1 text-slate-500 hover:text-coral transition-colors shrink-0 ml-2"
                title="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Tarjeta Plan 1: Individual */}
            <div className="relative p-4 rounded-2xl border-2 border-coral/80 bg-gradient-to-br from-coral/10 via-slate-900 to-slate-900 shadow-xl space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-block px-2 py-0.5 rounded-md bg-coral text-white text-[9px] font-black uppercase tracking-wider mb-1">
                    Pase Recomendado
                  </span>
                  <h3 className="text-sm font-black text-white">Plan Patinadora Individual</h3>
                  <p className="text-[11px] text-slate-400">Acceso offline completo y exportación WAV</p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-black text-white">$10</span>
                  <span className="text-[10px] text-slate-400 block font-mono">/ año</span>
                </div>
              </div>

              <ul className="space-y-1.5 text-[11px] text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-mint shrink-0" />
                  <span>Cámara Virtual 2D y gestos multi-touch</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-mint shrink-0" />
                  <span>Reglamento Nacional 2026 y figuras obligatorias</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-mint shrink-0" />
                  <span>Motor OfflineAudioContext (WAV ultrarrápido)</span>
                </li>
              </ul>

              {/* Botón CTA Primario Brillante (Coral Neón min 48px) */}
              <button
                type="button"
                onClick={() => subscribePlan('individual')}
                disabled={isLoading}
                className="w-full min-h-[48px] py-3 rounded-xl bg-coral hover:bg-coral-hover active:scale-[0.98] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-glow-coral transition-all disabled:opacity-50"
              >
                <Crown className="w-4 h-4" />
                <span>{isLoading ? 'Activando...' : 'Suscribirse por $10 / año'}</span>
              </button>
            </div>

            {/* Tarjeta Plan 2: Licencia Club */}
            <div className="p-3.5 rounded-2xl border border-white/10 bg-slate-900/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-cyan shrink-0" />
                <div>
                  <h4 className="font-bold text-white text-[11px]">Licencia Club o Escuela</h4>
                  <p className="text-[10px] text-slate-400">Pase multi-atleta institucional</p>
                </div>
              </div>
              <a
                href="https://alsiztech.com"
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-cyan text-[11px] font-bold flex items-center gap-1 transition-all"
              >
                <span>Contactar</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* Footer Seguro */}
        <div className="mt-5 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-slate-500" />
            Pagos cifrados vía Stripe
          </span>
          <span>AlsizTech © 2026</span>
        </div>
      </div>
    </div>
  );
};

