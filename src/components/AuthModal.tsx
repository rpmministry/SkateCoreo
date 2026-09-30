/**
 * AuthModal.tsx — Pantalla de Acceso, Onboarding y Selección de Planes de SkateCoreo
 *
 * Presentación profesional y centralizada de categorías comerciales:
 *   · Plan Patinadora / Patinador: $5/mes | Anual: $48/año (20% desc., ahorras $12/año, equiv $4/mes).
 *   · Plan Entrenador: $8/mes | Anual: $67.20/año (30% desc., ahorras $28.80/año, equiv $5.60/mes).
 *
 * Dos caminos claramente diferenciados sobre el sistema de diseño de SkateCoreo:
 *   · Adquirir suscripción (PayPal con correo previo, selección de categoría y período).
 *   · Iniciar sesión (correo + contraseña, código de regalo/licencia de club).
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
  Search,
  Sparkles,
  ChevronDown,
  ArrowRight,
  X,
} from 'lucide-react';
import { PRICING_PLANS, PlanRole, PlanPeriod } from '../services/pricingService';
import { useAuthStore } from '../store/useAuthStore';
import { PayPalButton } from './PayPalButton';
import { getDeviceType, getDeviceTypeLabel } from '../utils/deviceDetector';
import { SkateCoreoBrand } from './brand/SkateCoreoBrand';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { ModalShell } from './ui/ModalShell';

type AuthTab = 'login' | 'buy';

const tabClass = (active: boolean) =>
  [
    'press flex min-h-touch items-center justify-center rounded-xl px-3 text-xs font-black transition-colors',
    active ? 'bg-cyan text-neon-canvas shadow-glow-cyan' : 'text-slate-300 hover:bg-white/[0.06]',
  ].join(' ');

/**
 * Visibilidad de los dos caminos.
 * En móviles/tablets (<lg) se visualiza la pestaña activa; en escritorio (lg+) se muestran ambos paneles.
 */
const panelClass = (tab: AuthTab, active: AuthTab) =>
  [
    'glass-panel relative flex-col rounded-3xl p-5 shadow-soft-elevation sm:p-6',
    active === tab ? 'flex' : 'hidden lg:flex',
  ].join(' ');

export const AuthModal: React.FC = () => {
  const {
    hasActiveAccess,
    loginWithCredentials,
    registerWithPayment,
    registerWithCode,
    redeemPromoCode,
    redeemClubLicense,
    recoverPaymentLookup,
    isLoading,
    isUpgradeModalOpen,
    setUpgradeModalOpen,
  } = useAuthStore();

  // ── Tarjeta 1: Plan y Email Pre-Pago PayPal ─────────────────────────
  const [selectedRole, setSelectedRole] = useState<PlanRole>(() => isUpgradeModalOpen ? 'coach' : 'skater');
  const [selectedPlan, setSelectedPlan] = useState<PlanPeriod>('annual');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [paymentFeedback, setPaymentFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── Tarjeta 2: Login con Correo y Contraseña ───────────────────────
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginFeedback, setLoginFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── Canje de Código (sección secundaria expandible) ─────────────────
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

  // ── Selector móvil (solo presentación) ──────────────────────────────
  const [authTab, setAuthTab] = useState<AuthTab>(() => isUpgradeModalOpen ? 'buy' : 'login');

  // Detección de dispositivo actual para mostrar en la tarjeta de acceso
  const detectedType = getDeviceType();
  const detectedLabel = getDeviceTypeLabel(detectedType);

  // Si el usuario ya tiene acceso activo verificado y no está en modo modal de upgrade, no mostrar paywall
  if (hasActiveAccess() && !isUpgradeModalOpen) return null;

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
    const normalizedCode = activationCode.trim().toUpperCase();

    let res;
    if (normalizedCode.startsWith('SKC-')) {
      // Código de licencia individual o de club
      res = await redeemClubLicense(codeEmail, codePassword, codeName, normalizedCode);
    } else if (normalizedCode.startsWith('SC-BETA-') || normalizedCode.startsWith('CREATOR-')) {
      // Códigos promocionales de campaña
      res = await redeemPromoCode(codeEmail, codePassword, codeName, normalizedCode);
    } else {
      // Intentar primero como licencia de club y fallback a código de regalo
      res = await redeemClubLicense(codeEmail, codePassword, codeName, normalizedCode);
      if (!res.success && (res.message?.includes('no existe') || res.message?.includes('inválido'))) {
        res = await registerWithCode(codeEmail, codePassword, codeName, normalizedCode);
      }
    }
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
      postPaymentData.orderID,
      selectedRole
    );
    setPostRegLoading(false);

    if (!res.success) {
      setPostRegFeedback({ type: 'error', message: res.message });
    } else {
      setPostPaymentData(null);
      if (isUpgradeModalOpen) {
        setUpgradeModalOpen(false);
      }
    }
  };

  // ── Handler Recuperar Pago ─────────────────────────────────────────
  const handleRecoverLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoverFeedback(null);
    setRecoverLoading(true);

    const res = await recoverPaymentLookup(recoverQuery);
    setRecoverLoading(false);

    if (!res.found) {
      setRecoverFeedback({
        type: 'error',
        message: res.error || 'No se encontró un pago de PayPal con ese dato.',
      });
      return;
    }

    setShowRecoverModal(false);
    setPostPaymentData({
      orderID: res.paypal_order_id || recoverQuery,
      payerEmail: res.payer_email || '',
      payerName: res.payer_name || '',
    });
    setPostRegName(res.payer_name || '');
  };

  const currentPlan = PRICING_PLANS[selectedRole];
  const paypalAmount = selectedPlan === 'monthly'
    ? currentPlan.monthlyPrice.toFixed(2)
    : currentPlan.annualPrice.toFixed(2);

  return (
    <>
      {/* ── Overlay Principal Glassmorphism ── */}
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-neon-canvas/85 backdrop-blur-xl animate-fade-in p-2 sm:p-4 md:p-6">
        {/* Botón de cierre cuando se abre como Modal de Upgrade/Planes */}
        {isUpgradeModalOpen && (
          <button
            type="button"
            onClick={() => setUpgradeModalOpen(false)}
            className="fixed top-4 right-4 z-50 p-2.5 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-white/15 shadow-xl"
            title="Cerrar y volver a SkateCoreo"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center px-2 py-4 sm:px-4 sm:py-6 md:px-6">
          {/* ── Marca y Encabezado ── */}
          <header className="mb-4 flex flex-col items-center text-center sm:mb-6">
            <div className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-3 py-1">
              <img
                src="/alsiztech_app_icon_dark.svg"
                alt=""
                aria-hidden="true"
                className="h-4 w-4 object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">
                AlsizTech · SkateCoreo
              </span>
            </div>
            <SkateCoreoBrand size="lg" />
            <p className="mt-2 max-w-lg text-xs leading-relaxed text-slate-400 sm:text-sm">
              Plataforma profesional de trazado coreográfico, sincronización musical, evaluaciones oficiales y gestión deportiva.
            </p>
          </header>

          {/* ── Selector Móvil / Tablet (<lg) ── */}
          <div
            role="tablist"
            aria-label="Elige un camino de acceso"
            className="mb-3 grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1 lg:hidden"
          >
            <button
              type="button"
              role="tab"
              aria-selected={authTab === 'login'}
              onClick={() => setAuthTab('login')}
              className={tabClass(authTab === 'login')}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authTab === 'buy'}
              onClick={() => setAuthTab('buy')}
              className={tabClass(authTab === 'buy')}
            >
              Planes y Registro
            </button>
          </div>

          {/* ── Dos Paneles: Planes/Registro vs Login ── */}
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2 lg:items-stretch">
            {/* ══════════ CAMINO 1: ADQUIRIR SUSCRIPCIÓN ══════════ */}
            <section
              aria-label="Planes y Suscripción"
              className={panelClass('buy', authTab)}
            >
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                <span className="font-mono text-[10px] font-black uppercase tracking-wider text-cyan">
                  {isUpgradeModalOpen ? 'Planes de Suscripción' : 'Planes y Nuevo Acceso'}
                </span>
                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase ${
                  selectedRole === 'coach'
                    ? 'border-[#FF4C79]/40 bg-[#FF4C79]/15 text-[#FF4C79]'
                    : 'border-cyan/30 bg-cyan/15 text-cyan'
                }`}>
                  {selectedPlan === 'annual'
                    ? `Ahorro ${currentPlan.annualDiscountPercent}%`
                    : 'Plan Mensual'}
                </span>
              </div>

              {/* Selector de Categoría Comercial */}
              <div className="mb-3">
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-300 mb-1.5">
                  1. Selecciona tu tipo de cuenta
                </label>
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
                  {/* Categoría Patinador/a */}
                  <button
                    type="button"
                    onClick={() => setSelectedRole('skater')}
                    className={`press flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 text-center transition-all ${
                      selectedRole === 'skater'
                        ? 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] font-semibold'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 shrink-0" />
                      <span className="text-xs uppercase tracking-wide">Patinador(a)</span>
                    </div>
                    <span className="text-[10px] opacity-85">
                      Desde $4.00/mes
                    </span>
                  </button>

                  {/* Categoría Entrenador/a */}
                  <button
                    type="button"
                    onClick={() => setSelectedRole('coach')}
                    className={`press flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 text-center transition-all ${
                      selectedRole === 'coach'
                        ? 'bg-[#FF4C79] text-white shadow-[0_0_16px_rgba(255,76,121,0.5)] font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] font-semibold'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Users className="h-4 w-4 shrink-0" />
                      <span className="text-xs uppercase tracking-wide">Entrenador(a)</span>
                    </div>
                    <span className="text-[10px] opacity-90">
                      Desde $5.60/mes
                    </span>
                  </button>
                </div>

                {/* Explicación concisa y profesional de la categoría */}
                <div className="mt-2 rounded-xl bg-white/[0.03] border border-white/5 p-2.5">
                  <p className="text-[11px] leading-relaxed text-slate-300">
                    <strong className="text-white">{currentPlan.name}:</strong>{' '}
                    {currentPlan.tagline}.
                  </p>
                </div>
              </div>

              {/* Selector de Período de Facturación (Anual vs Mensual) */}
              <div className="mb-3">
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-300 mb-1.5">
                  2. Elige el período de facturación
                </label>
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
                  {/* Opción Anual con Descuento */}
                  <button
                    type="button"
                    onClick={() => setSelectedPlan('annual')}
                    className={`press flex flex-col items-center justify-center rounded-xl py-2 px-2 transition-all ${
                      selectedPlan === 'annual'
                        ? selectedRole === 'coach'
                          ? 'bg-[#FF4C79] text-white shadow-[0_0_15px_rgba(255,76,121,0.5)] font-black'
                          : 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] font-semibold'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-xs">Plan Anual</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${
                        selectedPlan === 'annual'
                          ? 'bg-slate-950 text-white'
                          : 'bg-mint/20 text-mint'
                      }`}>
                        -{currentPlan.annualDiscountPercent}%
                      </span>
                    </div>
                    <span className="text-sm font-black mt-0.5">
                      ${currentPlan.annualPrice.toFixed(2)} USD / año
                    </span>
                    <span className="text-[10px] opacity-80">
                      (Equivale a ${currentPlan.monthlyEquivalent.toFixed(2)}/mes)
                    </span>
                  </button>

                  {/* Opción Mensual */}
                  <button
                    type="button"
                    onClick={() => setSelectedPlan('monthly')}
                    className={`press flex flex-col items-center justify-center rounded-xl py-2 px-2 transition-all ${
                      selectedPlan === 'monthly'
                        ? selectedRole === 'coach'
                          ? 'bg-[#FF4C79] text-white shadow-[0_0_15px_rgba(255,76,121,0.5)] font-black'
                          : 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
                        : 'text-slate-300 hover:bg-white/[0.06] font-semibold'
                    }`}
                  >
                    <span className="text-xs">Plan Mensual</span>
                    <span className="text-sm font-black mt-0.5">
                      ${currentPlan.monthlyPrice.toFixed(2)} USD / mes
                    </span>
                    <span className="text-[10px] opacity-80">
                      Flexibilidad mensual
                    </span>
                  </button>
                </div>
              </div>

              {/* Tarjeta de Precios Dinámica y Ahorro */}
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3.5 mb-3">
                {selectedPlan === 'annual' ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-black text-white sm:text-lg truncate">
                        {currentPlan.name} Anual
                      </h3>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Acceso integral durante 365 días con precio preferencial
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-xs text-slate-500 line-through">
                          ${currentPlan.baseAnnualPrice.toFixed(2)}
                        </span>
                        <span className="text-2xl font-black text-white sm:text-3xl">
                          ${currentPlan.annualPrice.toFixed(2)}
                        </span>
                      </div>
                      <span className="block text-[10px] font-bold text-mint">
                        Ahorras ${currentPlan.annualSavings.toFixed(2)}/año ({currentPlan.annualDiscountPercent}% descuento)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-black text-white sm:text-lg truncate">
                        {currentPlan.name} Mensual
                      </h3>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Suscripción recurrente mes a mes sin permanencia
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-2xl font-black text-white sm:text-3xl">
                        ${currentPlan.monthlyPrice.toFixed(2)}
                      </span>
                      <span className="ml-1 text-xs text-slate-400">USD / mes</span>
                    </div>
                  </div>
                )}

                {/* Lista de características del plan */}
                <ul className="mt-3 space-y-1.5 border-t border-white/10 pt-2.5 text-xs text-slate-300">
                  {currentPlan.features.map((feat: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${selectedRole === 'coach' ? 'text-[#FF4C79]' : 'text-mint'}`} />
                      <span className="leading-snug">{feat}</span>
                    </li>
                  ))}
                  <li className="flex items-start gap-2 text-slate-200">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan" />
                    <span>
                      Hasta 3 dispositivos: <strong>1 PC + 1 Tablet + 1 Celular</strong>
                    </span>
                  </li>
                </ul>

                {selectedRole === 'coach' && (
                  <div className="mt-2.5 rounded-lg bg-white/[0.04] p-2 text-[10px] text-slate-400 border border-white/5">
                    <strong>Nota de autorización:</strong> La suscripción activa el paquete comercial de entrenador. La asignación y validación de roles en la plataforma es verificada de forma segura por el backend según los registros de club o federación.
                  </div>
                )}
              </div>

              {/* Campo de Correo y Botón de Pago PayPal */}
              <div className="space-y-2 border-t border-white/10 pt-3">
                <Field
                  id="buyer-email"
                  type="email"
                  required
                  label={
                    <>
                      <span className="text-cyan">*</span> Correo para vincular tu suscripción
                    </>
                  }
                  icon={<Mail className="h-4 w-4" />}
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="tu.correo@ejemplo.com"
                  autoComplete="email"
                />

                <div className="mt-2">
                  <PayPalButton
                    amount={paypalAmount}
                    plan={selectedPlan}
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

                <p className="mt-2 text-center text-[10px] leading-tight text-slate-400">
                  Cobro seguro procesado por PayPal. Puedes cancelar tu suscripción en cualquier momento y mantendrás acceso hasta el final del ciclo pagado.
                </p>

                {paymentFeedback && (
                  <div className="mt-2.5 rounded-xl border border-coral/30 bg-coral/15 p-2.5 text-center text-xs font-bold text-coral">
                    {paymentFeedback.message}
                  </div>
                )}
              </div>
            </section>

            {/* ══════════ CAMINO 2: INICIAR SESIÓN ══════════ */}
            <section
              aria-label="Iniciar sesión"
              className={panelClass('login', authTab)}
            >
              <div className="mb-4 flex items-center justify-between gap-2 border-b border-white/5 pb-3">
                <span className="font-mono text-[10px] font-black uppercase tracking-wider text-mint">
                  Iniciar sesión
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-800 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300">
                  {detectedType === 'mobile' && <Smartphone className="h-3 w-3 text-cyan" />}
                  {detectedType === 'tablet' && <Tablet className="h-3 w-3 text-cyan" />}
                  {detectedType === 'desktop' && <Laptop className="h-3 w-3 text-cyan" />}
                  <span>{detectedLabel}</span>
                </span>
              </div>

              <div>
                <h2 className="font-display text-lg font-black text-white sm:text-xl">
                  Acceder a SkateCoreo
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Ingresa con tu correo y contraseña registrados
                </p>
              </div>

              <form onSubmit={handleLoginSubmit} className="mt-5 space-y-3">
                <Field
                  id="login-email"
                  type="email"
                  required
                  label="Correo electrónico"
                  icon={<Mail className="h-4 w-4" />}
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="tu.correo@ejemplo.com"
                  autoComplete="email"
                />

                <Field
                  id="login-password"
                  type="password"
                  required
                  label="Contraseña"
                  icon={<Lock className="h-4 w-4" />}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />

                {loginFeedback && (
                  <div className="flex items-start gap-2 rounded-xl border border-coral/30 bg-coral/15 p-3 text-xs font-medium text-coral">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="leading-relaxed">{loginFeedback.message}</span>
                  </div>
                )}

                <Button type="submit" variant="primary" size="lg" block disabled={isLoading}>
                  <span>{isLoading ? 'Comprobando dispositivo...' : 'Entrar a SkateCoreo'}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>

              {/* ── Sección secundaria expandible: código de licencia / club / promo ── */}
              <div className="mt-5 border-t border-white/5 pt-4">
                {!showCodeRegister ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowCodeRegister(true);
                      setCodeFeedback(null);
                    }}
                    className="press flex w-full items-center justify-between gap-2 rounded-2xl border border-mint/25 bg-mint/[0.06] px-3.5 py-2.5 text-left text-xs font-bold text-mint hover:bg-mint/[0.12]"
                  >
                    <span className="flex items-center gap-2">
                      <Ticket className="h-4 w-4 shrink-0" />
                      ¿Tienes un código de licencia o de club? Actívalo aquí
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  </button>
                ) : (
                  <form
                    onSubmit={handleCodeSubmit}
                    className="space-y-2.5 rounded-2xl border border-mint/30 bg-slate-950 p-4 animate-fade-in"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2 text-xs">
                      <span className="flex items-center gap-1.5 font-bold text-white">
                        <Ticket className="h-3.5 w-3.5 text-mint" />
                        Activa tu licencia de SkateCoreo
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowCodeRegister(false)}
                        className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-white"
                      >
                        Cerrar
                      </button>
                    </div>

                    <Field
                      id="code-email"
                      type="email"
                      required
                      tone="mint"
                      value={codeEmail}
                      onChange={(e) => setCodeEmail(e.target.value)}
                      placeholder="Correo electrónico"
                      autoComplete="email"
                    />
                    <Field
                      id="code-name"
                      type="text"
                      tone="mint"
                      value={codeName}
                      onChange={(e) => setCodeName(e.target.value)}
                      placeholder="Nombre completo / atleta"
                    />
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <Field
                        id="code-password"
                        type="password"
                        required
                        tone="mint"
                        value={codePassword}
                        onChange={(e) => setCodePassword(e.target.value)}
                        placeholder="Contraseña (mín 6)"
                        autoComplete="new-password"
                      />
                      <Field
                        id="code-confirm"
                        type="password"
                        required
                        tone="mint"
                        value={codeConfirmPassword}
                        onChange={(e) => setCodeConfirmPassword(e.target.value)}
                        placeholder="Confirmar clave"
                        autoComplete="new-password"
                      />
                    </div>
                    <Field
                      id="code-activation"
                      type="text"
                      required
                      tone="mint"
                      value={activationCode}
                      onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                      placeholder="SKC-XXXX-XXXX"
                      className="font-mono font-bold uppercase tracking-wider"
                    />
                    <p className="text-[10px] leading-snug text-slate-400">
                      Ingresa tu código único de activación individual o de club (ej: SKC-XXXX-XXXX o código de campaña). Se vinculará de forma segura a tu cuenta y activará tu acceso de inmediato.
                    </p>

                    {codeFeedback && (
                      <div className="rounded-lg border border-coral/30 bg-coral/15 p-2 text-[11px] font-medium text-coral">
                        {codeFeedback.message}
                      </div>
                    )}

                    <Button type="submit" variant="mint" block disabled={codeLoading}>
                      {codeLoading ? 'Activando...' : 'Activar licencia y entrar'}
                    </Button>
                  </form>
                )}
              </div>
            </section>
          </div>

          {/* ── Pie común: recuperación de pago + club + versión ── */}
          <footer className="mt-4 flex flex-col items-center gap-3 border-t border-white/5 pt-4 text-center sm:mt-6">
            <div className="flex flex-col items-center gap-2 text-xs sm:flex-row sm:gap-4">
              <button
                type="button"
                onClick={() => {
                  setShowRecoverModal(true);
                  setRecoverFeedback(null);
                }}
                className="press inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-slate-300 hover:bg-white/5 hover:text-cyan"
              >
                <Search className="h-3.5 w-3.5 text-cyan" />
                <span>¿Ya pagaste en PayPal? Recuperar pago</span>
              </button>

              <span aria-hidden="true" className="hidden h-3 w-px bg-white/10 sm:block" />

              <span className="inline-flex flex-wrap items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-slate-400">
                <Users className="h-3 w-3 text-cyan" />
                <span>¿Clubes o múltiples licencias?</span>
                <a
                  href="https://wa.me/593979376810?text=Hola%20AlsizTech,%20deseo%20información%20sobre%20la%20Licencia%20Club%20de%20SkateCoreo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-mint hover:underline"
                >
                  WhatsApp: 0979376810
                </a>
              </span>
            </div>

            <div className="flex items-center justify-center gap-3 text-[11px] text-slate-500">
              <span>SkateCoreo Pro v2.6</span>
              <span aria-hidden="true">•</span>
              <a
                href="https://alsiztech.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-slate-300"
              >
                <span>Desarrollado por AlsizTech</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </footer>
        </div>
      </div>

      {/* ══════════ MODAL POST-PAGO: COMPLETAR REGISTRO (bloqueante) ══════════ */}
      <ModalShell
        open={!!postPaymentData}
        title="Completar registro"
        icon={<CheckCircle2 className="h-5 w-5 text-mint" />}
      >
        <div className="mb-5 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-mint/40 bg-mint/20 text-mint">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="font-display text-lg font-black text-white">¡Pago verificado con éxito!</p>
          <p className="mt-1 text-xs text-slate-400">
            Completa tus datos para activar tu acceso y vincular este dispositivo ({detectedLabel}).
          </p>
        </div>

        <form onSubmit={handlePostPaymentSubmit} className="space-y-3">
          <Field
            id="post-email"
            type="email"
            disabled
            label="Correo asociado (PayPal)"
            value={postPaymentData?.payerEmail || ''}
            className="font-mono"
          />
          <Field
            id="post-name"
            type="text"
            required
            label="Nombre completo / atleta"
            value={postRegName}
            onChange={(e) => setPostRegName(e.target.value)}
            placeholder="Tu nombre"
            autoComplete="name"
          />
          <Field
            id="post-password"
            type="password"
            required
            label="Crear contraseña (mínimo 6 caracteres)"
            value={postRegPassword}
            onChange={(e) => setPostRegPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
          <Field
            id="post-confirm"
            type="password"
            required
            label="Confirmar contraseña"
            value={postRegConfirmPassword}
            onChange={(e) => setPostRegConfirmPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />

          {postRegFeedback && (
            <div className="rounded-xl border border-coral/30 bg-coral/15 p-2.5 text-xs font-medium text-coral">
              {postRegFeedback.message}
            </div>
          )}

          <Button type="submit" variant="mint" size="lg" block disabled={postRegLoading} className="mt-1">
            <span>{postRegLoading ? 'Creando cuenta...' : 'Finalizar registro y entrar'}</span>
            <Sparkles className="h-4 w-4" />
          </Button>
        </form>
      </ModalShell>

      {/* ══════════ MODAL RECUPERAR PAGO ══════════ */}
      <ModalShell
        open={showRecoverModal}
        onClose={() => setShowRecoverModal(false)}
        title="Recuperar pago de PayPal"
        icon={<Search className="h-5 w-5" />}
      >
        <p className="text-xs leading-relaxed text-slate-300">
          Si pagaste en PayPal y accidentalmente se cerró tu ventana antes de asignar tu
          contraseña, ingresa aquí tu correo de PayPal o el código de transacción para continuar
          sin volver a pagar:
        </p>

        <form onSubmit={handleRecoverLookup} className="mt-4 space-y-3">
          <Field
            id="recover-query"
            type="text"
            required
            label="Correo de PayPal o ID de orden"
            icon={<Search className="h-4 w-4" />}
            value={recoverQuery}
            onChange={(e) => setRecoverQuery(e.target.value)}
            placeholder="ej: 4XX... o correo@dominio.com"
          />

          {recoverFeedback && (
            <div className="rounded-xl border border-coral/30 bg-coral/15 p-2.5 text-xs font-medium text-coral">
              {recoverFeedback.message}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              block
              className="sm:w-auto"
              onClick={() => setShowRecoverModal(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              block
              className="sm:flex-1"
              disabled={recoverLoading || !recoverQuery.trim()}
            >
              {recoverLoading ? 'Buscando recibo...' : 'Localizar recibo'}
            </Button>
          </div>
        </form>
      </ModalShell>
    </>
  );
};

