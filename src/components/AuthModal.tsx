/**
 * AuthModal.tsx — Pantalla de Inicio Dual (Landing & Auth) de Alto Impacto Visual en SkateArt
 *
 * Inspirada en Carbon Design System (minimalista, alto contraste, estructurada).
 * Tarjeta 1: Adquirir Acceso (Nuevos Usuarios / PayPal con email obligatorio previo).
 * Tarjeta 2: Acceder a tu Cuenta (Login Email+Password, Anti-Sharing por dispositivo, Canje de Código).
 * Modal Post-Pago: Registro condicionado seguro y prevención de pagos huérfanos con "Recuperar Pago".
 */

import React, { useState } from 'react';
import { 
  Check, 
  Mail, 
  Lock, 
  Smartphone, 
  Tablet, 
  Laptop, 
  ShieldCheck, 
  Ticket, 
  AlertCircle, 
  CheckCircle2, 
  ExternalLink, 
  Users, 
  ArrowRight,
  Search,
  Sparkles,
  X
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { PayPalButton } from './PayPalButton';
import { getDeviceType, getDeviceTypeLabel } from '../utils/deviceDetector';

export const AuthModal: React.FC = () => {
  const { 
    hasActiveAccess, 
    loginWithCredentials, 
    registerWithPayment, 
    registerWithCode, 
    recoverPaymentLookup,
    isLoading 
  } = useAuthStore();

  // ── Tarjeta 1: Email Pre-Pago PayPal ────────────────────────────────
  const [buyerEmail, setBuyerEmail] = useState('');
  const [paymentFeedback, setPaymentFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── Tarjeta 2: Login con Correo y Contraseña ───────────────────────
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginFeedback, setLoginFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── Canje de Código (Collapsible en Tarjeta 2) ──────────────────────
  const [showCodeRegister, setShowCodeRegister] = useState(false);
  const [codeEmail, setCodeEmail] = useState('');
  const [codeName, setCodeName] = useState('');
  const [codePassword, setCodePassword] = useState('');
  const [codeConfirmPassword, setCodeConfirmPassword] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [codeFeedback, setCodeFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);

  // ── Modal Post-Pago (Completar Registro tras PayPal) ───────────────
  const [postPaymentData, setPostPaymentData] = useState<{
    orderID: string;
    payerEmail: string;
    payerName?: string;
  } | null>(null);
  const [postRegName, setPostRegName] = useState('');
  const [postRegPassword, setPostRegPassword] = useState('');
  const [postRegConfirmPassword, setPostRegConfirmPassword] = useState('');
  const [postRegFeedback, setPostRegFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [postRegLoading, setPostRegLoading] = useState(false);

  // ── Modal Recuperar Pago (Pagos Huérfanos) ──────────────────────────
  const [showRecoverModal, setShowRecoverModal] = useState(false);
  const [recoverQuery, setRecoverQuery] = useState('');
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [recoverFeedback, setRecoverFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Detección de dispositivo actual para mostrar en Card 2
  const detectedType = getDeviceType();
  const detectedLabel = getDeviceTypeLabel(detectedType);

  // Si el usuario ya tiene acceso activo verificado, no mostrar paywall
  if (hasActiveAccess()) return null;

  // ── Handler Login ──────────────────────────────────────────────────
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginFeedback(null);

    const res = await loginWithCredentials(loginEmail, loginPassword);
    if (!res.success) {
      setLoginFeedback({ type: 'error', message: res.message });
    }
  };

  // ── Handler Registro con Código ───────────────────────────────────
  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeFeedback(null);

    if (codePassword.length < 6) {
      setCodeFeedback({ type: 'error', message: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    if (codePassword !== codeConfirmPassword) {
      setCodeFeedback({ type: 'error', message: 'Las contraseñas no coinciden.' });
      return;
    }

    setCodeLoading(true);
    const res = await registerWithCode(codeEmail, codePassword, codeName, activationCode);
    setCodeLoading(false);

    if (!res.success) {
      setCodeFeedback({ type: 'error', message: res.message });
    }
  };

  // ── Handler Post-Pago (Completar Registro) ─────────────────────────
  const handlePostPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postPaymentData) return;
    setPostRegFeedback(null);

    if (postRegPassword.length < 6) {
      setPostRegFeedback({ type: 'error', message: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    if (postRegPassword !== postRegConfirmPassword) {
      setPostRegFeedback({ type: 'error', message: 'Las contraseñas no coinciden.' });
      return;
    }

    setPostRegLoading(true);
    const res = await registerWithPayment(
      postPaymentData.payerEmail,
      postRegPassword,
      postRegName || postPaymentData.payerName || '',
      postPaymentData.orderID
    );
    setPostRegLoading(false);

    if (!res.success) {
      setPostRegFeedback({ type: 'error', message: res.message });
    } else {
      setPostPaymentData(null);
    }
  };

  // ── Handler Recuperar Pago ─────────────────────────────────────────
  const handleRecoverLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoverQuery.trim()) return;

    setRecoverLoading(true);
    setRecoverFeedback(null);

    const res = await recoverPaymentLookup(recoverQuery);
    setRecoverLoading(false);

    if (res.found && res.paypal_order_id && res.payer_email) {
      setShowRecoverModal(false);
      setPostPaymentData({
        orderID: res.paypal_order_id,
        payerEmail: res.payer_email,
        payerName: res.payer_name || '',
      });
      setPostRegName(res.payer_name || '');
    } else {
      setRecoverFeedback({
        type: 'error',
        message: res.error || 'No se encontró un pago pendiente con ese dato.',
      });
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-xl select-none transition-all duration-500 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      {/* Contenedor Dual-Card Principal */}
      <div className="relative w-full max-w-5xl my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Halos Neón de Fondo */}
        <div className="absolute -top-16 -left-16 w-72 h-72 bg-cyan/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-72 h-72 bg-coral/15 rounded-full blur-3xl pointer-events-none" />

        {/* ── Brand Header ── */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-white/10 mb-2 shadow-inner">
            <img 
              src="/alsiztech_app_icon_dark.svg" 
              alt="AlsizTech Logo" 
              className="w-4 h-4 object-contain"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
            <span className="text-[10px] font-mono font-bold tracking-widest text-cyan uppercase">
              ALSIZTECH · SKATEART SAAS
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
            SkateArt <span className="text-coral">Pro 2026</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl mx-auto">
            Plataforma Profesional de Trazado Coreográfico y Catálogo Oficial de Figuras
          </p>
        </div>

        {/* ── Grid Dual-Card (50/50 Desktop, Apilado Móvil) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
          
          {/* ══════════════════════════════════════════════════════
              CARD 1: ADQUIRIR ACCESO (Nuevos Usuarios / PayPal)
              ══════════════════════════════════════════════════════ */}
          <div className="relative flex flex-col justify-between p-6 sm:p-7 rounded-3xl bg-slate-900/90 border border-cyan/20 shadow-xl shadow-black/60 backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <span className="text-[10px] font-mono font-black uppercase tracking-wider text-cyan">
                  Paso 1 · Adquirir Licencia
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-cyan/15 text-cyan border border-cyan/30">
                  1 Año Completo
                </span>
              </div>

              {/* Título & Precio */}
              <div className="mt-4 flex items-baseline justify-between">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-white">
                    Patinadora Individual
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Acceso profesional para 1 atleta o entrenador
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl sm:text-3xl font-black text-white">$20</span>
                  <span className="text-xs text-slate-400 ml-1">USD / año</span>
                </div>
              </div>

              {/* Beneficios Clave */}
              <ul className="mt-4 space-y-2 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-mint shrink-0" />
                  <span>Catálogo reglamentario de figuras y cálculo de BV</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-mint shrink-0" />
                  <span>Trazado cinemático 2D y zoom gestual de precisión</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-mint shrink-0" />
                  <span>Modo Entrenamiento 100% Offline (Sin red en la pista)</span>
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan shrink-0" />
                  <span>Hasta 3 dispositivos: <strong>1 PC + 1 Tablet + 1 Celular</strong></span>
                </li>
              </ul>

              {/* ── Entrada Obligatoria de Correo Pre-Pago ── */}
              <div className="mt-5 pt-4 border-t border-white/10 space-y-2">
                <label className="block text-xs font-bold text-slate-200">
                  <span className="text-cyan">*</span> Ingresa tu correo para vincular tu licencia:
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    placeholder="tu.correo@ejemplo.com"
                    className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-white text-xs placeholder:text-slate-500 focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan transition-all"
                  />
                </div>
              </div>

              {/* ── Botón Oficial PayPal Business ── */}
              <div className="mt-3">
                <PayPalButton
                  amount="20.00"
                  buyerEmail={buyerEmail}
                  onSuccess={(data) => {
                    setPostPaymentData({
                      orderID: data.orderID,
                      payerEmail: data.payerEmail,
                      payerName: data.payerName,
                    });
                    setPostRegName(data.payerName || '');
                  }}
                  onError={(errMsg) => {
                    setPaymentFeedback({ type: 'error', message: errMsg });
                  }}
                />
              </div>

              {paymentFeedback && (
                <div className="mt-2.5 p-2.5 rounded-xl text-xs font-bold bg-coral/15 text-coral border border-coral/30 text-center">
                  {paymentFeedback.message}
                </div>
              )}
            </div>

            {/* Enlace Recuperar Pago & Licencia Club */}
            <div className="mt-6 pt-3 border-t border-white/5 space-y-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setShowRecoverModal(true);
                  setRecoverFeedback(null);
                }}
                className="text-xs text-slate-400 hover:text-cyan font-medium transition-colors inline-flex items-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5 text-cyan" />
                <span>¿Ya pagaste en PayPal y no completaste tu registro? <strong>Recuperar Pago</strong></span>
              </button>

              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3 text-cyan" />
                  ¿Clubes o múltiples licencias?
                </span>
                <a
                  href="https://wa.me/593979376810?text=Hola%20AlsizTech,%20deseo%20información%20sobre%20la%20Licencia%20Club%20de%20SkateArt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-mint hover:underline font-bold"
                >
                  WhatsApp: 0979376810 &gt;
                </a>
              </div>
            </div>
          </div>


          {/* ══════════════════════════════════════════════════════
              CARD 2: ACCEDER A TU CUENTA (Usuarios Registrados)
              ══════════════════════════════════════════════════════ */}
          <div className="relative flex flex-col justify-between p-6 sm:p-7 rounded-3xl bg-slate-900/90 border border-white/10 shadow-xl shadow-black/60 backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <span className="text-[10px] font-mono font-black uppercase tracking-wider text-mint">
                  Paso 2 · Iniciar Sesión
                </span>
                
                {/* Badge de Detección de Dispositivo */}
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-white/10">
                  {detectedType === 'mobile' && <Smartphone className="w-3 h-3 text-cyan" />}
                  {detectedType === 'tablet' && <Tablet className="w-3 h-3 text-cyan" />}
                  {detectedType === 'desktop' && <Laptop className="w-3 h-3 text-cyan" />}
                  <span>{detectedLabel}</span>
                </span>
              </div>

              <div className="mt-4">
                <h2 className="text-lg sm:text-xl font-black text-white">
                  Acceder a SkateArt
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ingresa con tu correo y contraseña registrados
                </p>
              </div>

              {/* ── Formulario de Inicio de Sesión Propio ── */}
              <form onSubmit={handleLoginSubmit} className="mt-5 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Correo Electrónico
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="tu.correo@ejemplo.com"
                      className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-white text-xs placeholder:text-slate-500 focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-white text-xs placeholder:text-slate-500 focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan transition-all"
                    />
                  </div>
                </div>

                {/* Feedback Login */}
                {loginFeedback && (
                  <div className="p-3 rounded-xl bg-coral/15 border border-coral/30 text-coral text-xs font-medium flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{loginFeedback.message}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-cyan hover:bg-cyan/90 text-slate-950 font-black text-xs tracking-wide shadow-lg shadow-cyan/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span>{isLoading ? 'Comprobando dispositivo...' : 'Entrar a SkateArt'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            {/* ── Sección Desplegable: Canje de Código de Invitación / Regalo ── */}
            <div className="mt-6 pt-3 border-t border-white/5">
              {!showCodeRegister ? (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCodeRegister(true);
                      setCodeFeedback(null);
                    }}
                    className="text-xs text-mint hover:underline font-bold transition-colors inline-flex items-center gap-1.5 py-1"
                  >
                    <Ticket className="w-3.5 h-3.5 text-mint" />
                    <span>¿Tienes un código de regalo / tester? Actívalo aquí</span>
                  </button>
                </div>
              ) : (
                <form 
                  onSubmit={handleCodeSubmit} 
                  className="p-4 rounded-2xl bg-slate-950 border border-mint/30 space-y-2.5 animate-in fade-in duration-200"
                >
                  <div className="flex items-center justify-between pb-1 border-b border-white/5 text-xs">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Ticket className="w-3.5 h-3.5 text-mint" />
                      Canjear Código &amp; Crear Cuenta
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCodeRegister(false)}
                      className="text-slate-400 hover:text-white text-xs"
                    >
                      ✕ Cerrar
                    </button>
                  </div>

                  <input
                    type="email"
                    required
                    value={codeEmail}
                    onChange={(e) => setCodeEmail(e.target.value)}
                    placeholder="Correo Electrónico"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-mint"
                  />

                  <input
                    type="text"
                    value={codeName}
                    onChange={(e) => setCodeName(e.target.value)}
                    placeholder="Nombre Completo / Atleta"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-mint"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="password"
                      required
                      value={codePassword}
                      onChange={(e) => setCodePassword(e.target.value)}
                      placeholder="Contraseña (mín 6)"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-mint"
                    />
                    <input
                      type="password"
                      required
                      value={codeConfirmPassword}
                      onChange={(e) => setCodeConfirmPassword(e.target.value)}
                      placeholder="Confirmar clave"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-mint"
                    />
                  </div>

                  <input
                    type="text"
                    required
                    value={activationCode}
                    onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                    placeholder="CÓDIGO (Ej: SKATE-2026-XXXX)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-mint/40 text-xs font-mono font-bold tracking-wider uppercase text-mint placeholder:text-slate-600 focus:outline-none focus:border-mint"
                  />

                  {codeFeedback && (
                    <div className="p-2 rounded-lg text-[11px] font-medium bg-coral/15 text-coral border border-coral/30">
                      {codeFeedback.message}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={codeLoading}
                    className="w-full py-2.5 rounded-xl bg-mint text-slate-950 font-black text-xs hover:bg-mint/90 transition-all disabled:opacity-50"
                  >
                    {codeLoading ? 'Activando...' : 'Activar Código y Entrar'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="text-center mt-5 text-[11px] text-slate-500 space-x-3">
          <span>SkateArt Pro v2.6</span>
          <span>•</span>
          <a
            href="https://alsiztech.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-300 transition-colors inline-flex items-center gap-1"
          >
            <span>Desarrollado por AlsizTech</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>


      {/* ══════════════════════════════════════════════════════
          MODAL POST-PAGO: COMPLETAR REGISTRO DE CUENTA
          ══════════════════════════════════════════════════════ */}
      {postPaymentData && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md p-6 sm:p-7 rounded-3xl bg-slate-900 border border-mint/40 shadow-2xl text-white my-auto">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-mint/20 border border-mint/40 text-mint flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-white">
                ¡Pago Verificado con Éxito!
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Completa tus datos para activar tu año de acceso y vincular este dispositivo ({detectedLabel}).
              </p>
            </div>

            <form onSubmit={handlePostPaymentSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Correo Asociado (PayPal)
                </label>
                <input
                  type="email"
                  disabled
                  value={postPaymentData.payerEmail}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-white/10 text-white font-mono text-xs opacity-80 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Nombre Completo / Atleta
                </label>
                <input
                  type="text"
                  required
                  value={postRegName}
                  onChange={(e) => setPostRegName(e.target.value)}
                  placeholder="Tu Nombre"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-white text-xs placeholder:text-slate-500 focus:border-cyan focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Crear Contraseña (Mínimo 6 caracteres)
                </label>
                <input
                  type="password"
                  required
                  value={postRegPassword}
                  onChange={(e) => setPostRegPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-white text-xs placeholder:text-slate-500 focus:border-cyan focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Confirmar Contraseña
                </label>
                <input
                  type="password"
                  required
                  value={postRegConfirmPassword}
                  onChange={(e) => setPostRegConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-white text-xs placeholder:text-slate-500 focus:border-cyan focus:outline-none"
                />
              </div>

              {postRegFeedback && (
                <div className="p-2.5 rounded-xl bg-coral/15 border border-coral/30 text-coral text-xs font-medium">
                  {postRegFeedback.message}
                </div>
              )}

              <button
                type="submit"
                disabled={postRegLoading}
                className="w-full min-h-[46px] mt-2 rounded-2xl bg-mint text-slate-950 font-black text-xs hover:bg-mint/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>{postRegLoading ? 'Creando cuenta...' : 'Finalizar Registro y Entrar a SkateArt'}</span>
                <Sparkles className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}


      {/* ══════════════════════════════════════════════════════
          MODAL RECUPERAR PAGO (PREVENCIÓN DE PAGOS HUÉRFANOS)
          ══════════════════════════════════════════════════════ */}
      {showRecoverModal && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md p-6 rounded-3xl bg-slate-900 border border-white/15 shadow-2xl text-white my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-cyan" />
                <h3 className="font-bold text-sm text-white">Recuperar Pago de PayPal</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRecoverModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-300 leading-relaxed">
              Si pagaste en PayPal y accidentalmente se cerró tu ventana antes de asignar tu contraseña, ingresa aquí tu correo de PayPal o el código de transacción para continuar sin volver a pagar:
            </p>

            <form onSubmit={handleRecoverLookup} className="mt-4 space-y-3">
              <input
                type="text"
                required
                value={recoverQuery}
                onChange={(e) => setRecoverQuery(e.target.value)}
                placeholder="Correo de PayPal o ID de orden (ej: 4XX...)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-white text-xs placeholder:text-slate-500 focus:border-cyan focus:outline-none"
              />

              {recoverFeedback && (
                <div className="p-2.5 rounded-xl bg-coral/15 border border-coral/30 text-coral text-xs font-medium">
                  {recoverFeedback.message}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={recoverLoading || !recoverQuery.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-cyan text-slate-950 font-bold text-xs hover:bg-cyan/90 transition-all disabled:opacity-50"
                >
                  {recoverLoading ? 'Buscando recibo...' : 'Localizar Recibo'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRecoverModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
