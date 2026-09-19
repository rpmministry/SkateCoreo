/**
 * AuthModal.tsx — Soft Paywall & Modal de Autenticación con Glassmorphism
 *
 * Muestra el lienzo de fondo con desenfoque (`backdrop-blur-md bg-slate-950/75`)
 * pero bloquea la interacción hasta que el usuario inicie sesión y active su suscripción
 * o canjee un código secreto de Beta Tester (RBAC).
 */

import React, { useState } from 'react';
import { 
  Check, 
  Mail, 
  Users, 
  Ticket, 
  MessageCircle, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  LogOut
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { PayPalButton } from './PayPalButton';

export const AuthModal: React.FC = () => {
  const { 
    user, 
    access_expires_at,
    hasActiveAccess,
    getFormattedExpiration,
    loginWithGoogle, 
    loginWithEmail, 
    verifyEmailOtp,
    redeemPromoCode,
    logout,
    isLoading 
  } = useAuthStore();

  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [paymentFeedback, setPaymentFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estado del Input Desplegable de Códigos
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoFeedback, setPromoFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Verificación estricta en la nube: access_expires_at > NOW
  const hasAccess = hasActiveAccess();

  if (hasAccess) return null;

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setAuthFeedback(null);
    const res = await loginWithEmail(emailInput);
    if (res.success) {
      setEmailSent(true);
      setAuthFeedback({ type: 'success', message: res.message });
    } else {
      setAuthFeedback({ type: 'error', message: res.message });
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpInput.trim()) return;
    setAuthFeedback(null);
    const res = await verifyEmailOtp(emailInput, otpInput);
    if (!res.success) {
      setAuthFeedback({ type: 'error', message: res.message });
    }
  };

  // Manejo del Canje de Código mediante Supabase RPC
  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoCode.trim()) return;

    setPromoLoading(true);
    setPromoFeedback(null);

    const result = await redeemPromoCode(promoCode);
    setPromoFeedback({
      type: result.success ? 'success' : 'error',
      message: result.message,
    });
    setPromoLoading(false);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md select-none transition-all duration-500 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-lg bg-slate-900/95 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/90 backdrop-blur-xl text-white my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Halos Neón Decorativos */}
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-cyan/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-coral/15 rounded-full blur-3xl pointer-events-none" />

        {/* ── Brand Header con Logo AlsizTech ── */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img 
              src="/alsiztech_app_icon_dark.svg" 
              alt="AlsizTech Logo" 
              className="w-7 h-7 object-contain drop-shadow-[0_0_8px_rgba(0,210,255,0.4)]"
              onError={(e) => {
                // Fallback si la imagen no carga
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <span className="text-[11px] font-mono font-bold tracking-widest text-cyan uppercase">
              ALSIZTECH · SAAS
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            SkateArt <span className="text-coral">Pro</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Plataforma Profesional de Coreografías y RollArt 2026
          </p>
        </div>

        {/* ══════════════════════════════════════════════════════
            ESTADO 1: Usuario No Autenticado (Login Gateway)
            ══════════════════════════════════════════════════════ */}
        {!user ? (
          <div className="space-y-4">
            <p className="text-xs text-slate-300 text-center leading-relaxed">
              Inicia sesión con tu cuenta de Google o Email para guardar tus rutinas, trazar figuras reglamentarias y entrenar 100% sin conexión en la pista.
            </p>

            {/* Botón 1: Continuar con Google (min 48px touch target) */}
            <button
              type="button"
              onClick={() => loginWithGoogle()}
              disabled={isLoading}
              className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-white hover:bg-slate-100 active:scale-[0.98] text-slate-950 font-bold text-xs flex items-center justify-center gap-3 shadow-lg transition-all disabled:opacity-50"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>{isLoading ? 'Conectando con Google...' : 'Continuar con Google'}</span>
            </button>

            {/* Botón 2: Acceder con Email (Passwordless / OTP / Magic Link) */}
            {!showEmailForm ? (
              <button
                type="button"
                onClick={() => { setShowEmailForm(true); setEmailSent(false); setAuthFeedback(null); }}
                className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-slate-800/90 hover:bg-slate-800 text-slate-200 hover:text-white font-bold text-xs flex items-center justify-center gap-2 border border-white/10 active:scale-[0.98] transition-all"
              >
                <Mail className="w-4 h-4 text-cyan" />
                <span>Acceder con Email (Magic Link / OTP)</span>
              </button>
            ) : !emailSent ? (
              <form onSubmit={handleSendEmail} className="space-y-2 pt-1">
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="nombre@tucorreo.com"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-white text-xs placeholder:text-slate-500 focus:border-cyan focus:outline-none"
                />
                {authFeedback && (
                  <p className={`text-[11px] ${authFeedback.type === 'success' ? 'text-mint' : 'text-coral'}`}>
                    {authFeedback.message}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 min-h-[42px] py-2 rounded-xl bg-cyan text-slate-950 font-bold text-xs hover:bg-cyan/90 transition-all disabled:opacity-50"
                  >
                    {isLoading ? 'Enviando...' : 'Enviar Código y Enlace'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowEmailForm(false); setAuthFeedback(null); }}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-2 pt-1">
                <div className="p-3 rounded-xl bg-slate-950/80 border border-cyan/30 text-[11px] text-slate-300">
                  <p className="text-cyan font-bold mb-1">¡Código de acceso enviado!</p>
                  <p>Revisa tu correo <strong>{emailInput}</strong> e introduce el código de 6 dígitos o haz clic en el enlace mágico.</p>
                </div>
                <input
                  type="text"
                  required
                  maxLength={8}
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.trim())}
                  placeholder="Código de 6 dígitos (ej. 123456)"
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-center font-mono font-bold tracking-widest text-sm text-cyan placeholder:text-slate-600 focus:border-cyan focus:outline-none"
                />
                {authFeedback && (
                  <p className={`text-[11px] ${authFeedback.type === 'success' ? 'text-mint' : 'text-coral'}`}>
                    {authFeedback.message}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 min-h-[42px] py-2 rounded-xl bg-mint text-slate-950 font-bold text-xs hover:bg-mint/90 transition-all disabled:opacity-50"
                  >
                    {isLoading ? 'Verificando...' : 'Validar Código'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEmailSent(false); setAuthFeedback(null); }}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white text-xs"
                  >
                    Volver
                  </button>
                </div>
              </form>
            )}

            {/* Botón sutil de modo demostración rápida */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => useAuthStore.getState().simulateLogin('patinadora.demo@rollart.com', 'Atleta Demo', 'user', 365)}
                className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                ¿Quieres probar primero? <span className="text-cyan underline">Iniciar modo demo (365 días)</span>
              </button>
            </div>
          </div>
        ) : (
          /* ══════════════════════════════════════════════════════
             ESTADO 2: Usuario Autenticado (Pasarela de Planes)
             ══════════════════════════════════════════════════════ */
          <div className="space-y-4">
            {/* Header de Sesión Activa */}
            <div className="flex items-center justify-between px-3.5 py-2 rounded-2xl bg-slate-950/60 border border-white/5 text-xs">
              <div className="flex items-center gap-2 truncate max-w-[220px]">
                <div className="w-6 h-6 rounded-full bg-cyan/20 border border-cyan/40 flex items-center justify-center text-[10px] font-bold text-cyan shrink-0">
                  {user.email.charAt(0).toUpperCase()}
                </div>
                <div className="truncate">
                  <span className="truncate text-slate-300 text-[11px] block" title={user.email}>
                    {user.email}
                  </span>
                  {access_expires_at ? (
                    <span className="text-[10px] text-coral block font-medium">
                      Expiró el {getFormattedExpiration()}
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-400 block font-medium">
                      Sin suscripción anual
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-1 text-[11px] text-coral hover:underline"
              >
                <LogOut className="w-3 h-3" />
                Salir
              </button>
            </div>

            {/* Tarjeta Plan Individual: $20 / año */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-slate-800/60 to-slate-900/60 border border-cyan/30 space-y-3 shadow-lg">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                    Patinadora Individual
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-cyan/20 text-cyan border border-cyan/30">
                      Popular
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Licencia personal completa para 1 atleta o entrenador
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black text-white">$20 <span className="text-xs text-slate-400 font-normal">/ año</span></div>
                  <div className="text-[10px] text-mint font-semibold">Todo un año de acceso</div>
                </div>
              </div>

              <ul className="text-[11px] text-slate-300 space-y-1.5">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-mint shrink-0" />
                  Cálculo automático y catálogo oficial RollArt 2026
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-mint shrink-0" />
                  Cámara Virtual 2D con zoom gestual de alta precisión
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-mint shrink-0" />
                  Modo Entrenamiento 100% Offline (Zero-Network)
                </li>
              </ul>

              {/* Pasarela Oficial PayPal Business */}
              <div className="pt-1">
                <PayPalButton 
                  amount="20.00"
                  onSuccess={(msg) => {
                    setPaymentFeedback({ type: 'success', message: msg });
                  }}
                  onError={(errMsg) => {
                    setPaymentFeedback({ type: 'error', message: errMsg });
                  }}
                />
              </div>

              {paymentFeedback && (
                <div className={`p-2.5 rounded-xl text-[11px] text-center font-bold ${
                  paymentFeedback.type === 'success' 
                    ? 'bg-mint/15 text-mint border border-mint/30' 
                    : 'bg-coral/15 text-coral border border-coral/30'
                }`}>
                  {paymentFeedback.message}
                </div>
              )}
            </div>

            {/* Tarjeta Licencia Club: Múltiples Licencias (Sin Precio Fijo) */}
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/10 space-y-2.5">
              <div className="flex items-center gap-2 text-white font-bold text-xs">
                <Users className="w-4 h-4 text-cyan" />
                <span>Licencia Club / Escuelas (Múltiples Licencias)</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                ¿Manejas una academia, club o asociación de patinaje? Te ofrecemos paquetes para múltiples patinadores con asesoría personalizada.
              </p>
              
              {/* Enlaces Directos con Iconos */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <a
                  href="https://wa.me/593979376810?text=Hola%20AlsizTech,%20deseo%20información%20sobre%20la%20Licencia%20Club%20de%20SkateArt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-h-[40px] px-3.5 py-2 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/30 text-[#25D366] text-[11px] font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span>WhatsApp: 0979376810</span>
                </a>
                <a
                  href="mailto:contacto@alsiztech.com?subject=Consulta%20Licencia%20Club%20SkateArt"
                  className="flex-1 min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-white/10 text-[11px] font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <Mail className="w-4 h-4 text-cyan shrink-0" />
                  <span>contacto@alsiztech.com</span>
                </a>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════
                CANJE DE CÓDIGO DE INVITACIÓN (REVELABLE)
                ══════════════════════════════════════════════════════ */}
            <div className="pt-1 text-center border-t border-white/5">
              {!showPromoInput ? (
                <button
                  type="button"
                  onClick={() => setShowPromoInput(true)}
                  className="text-[11px] text-slate-400 hover:text-cyan font-medium transition-colors inline-flex items-center gap-1.5 py-1.5"
                >
                  <Ticket className="w-3.5 h-3.5 text-slate-400" />
                  <span>¿Tienes un código de invitación?</span>
                </button>
              ) : (
                <form 
                  onSubmit={handleRedeemCode}
                  className="mt-2 p-3.5 rounded-2xl bg-slate-950/90 border border-white/10 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-300"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Ticket className="w-3.5 h-3.5 text-mint" />
                      Canjear Invitación / Beta Tester
                    </span>
                    <button
                      type="button"
                      onClick={() => { setShowPromoInput(false); setPromoFeedback(null); }}
                      className="text-slate-500 hover:text-slate-300 text-xs"
                    >
                      ✕ Cerrar
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      placeholder="Ej: TESTER-2026"
                      disabled={promoLoading}
                      className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-slate-900 border border-white/10 text-white font-mono text-xs tracking-wider uppercase placeholder:text-slate-600 focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan transition-all"
                    />
                    <button
                      type="submit"
                      disabled={promoLoading || !promoCode.trim()}
                      className="min-h-[42px] px-4 rounded-xl bg-mint text-slate-950 font-black text-xs tracking-wide hover:shadow-[0_0_15px_rgba(16,244,156,0.4)] active:scale-95 transition-all disabled:opacity-40"
                    >
                      {promoLoading ? 'Validando...' : 'Canjear'}
                    </button>
                  </div>

                  {/* Feedback de éxito o error */}
                  {promoFeedback && (
                    <div className={`flex items-center gap-1.5 text-[11px] font-medium pt-1 ${
                      promoFeedback.type === 'success' ? 'text-mint' : 'text-coral'
                    }`}>
                      {promoFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{promoFeedback.message}</span>
                    </div>
                  )}
                </form>
              )}
            </div>

            {/* Footer con Atribución AlsizTech */}
            <div className="text-center pt-1">
              <a
                href="https://alsiztech.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors inline-flex items-center gap-1"
              >
                <span>Desarrollado por AlsizTech · Agencia Digital</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
