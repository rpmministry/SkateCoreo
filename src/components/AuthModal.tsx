/**
 * AuthModal.tsx — Pantalla de Acceso / Onboarding de SkateCoreo
 *
 * Dos caminos claramente diferenciados sobre un mismo lenguaje visual
 * (glass-panel, cyan/mint, 48px touch, safe areas):
 *   · Adquirir licencia (PayPal con correo obligatorio previo).
 *   · Iniciar sesión (correo+contraseña, código de regalo/Beta Tester).
 *
 * En móvil/tablet (< lg) los dos caminos se presentan con un selector
 * segmentado para no apilar dos tarjetas gigantes; en escritorio se muestran
 * lado a lado. La lógica de autenticación, PayPal, códigos y recuperación de
 * pagos NO se modifica: sólo cambia la presentación.
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
} from 'lucide-react';
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
 * Visibilidad de los dos caminos. Una sola fuente de verdad para el mapeo
 * tab→panel y el breakpoint: en <lg sólo se ve el panel activo; en lg+ ambos.
 * (El selector superior usa `lg:hidden`, emparejado con `lg:flex` de aquí.)
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
    recoverPaymentLookup,
    isLoading,
  } = useAuthStore();

  // ── Tarjeta 1: Email Pre-Pago PayPal ────────────────────────────────
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
  const [authTab, setAuthTab] = useState<AuthTab>('login');

  // Detección de dispositivo actual para mostrar en la tarjeta de acceso
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
    // Los códigos de campaña (SC-BETA-… / CREATOR-…) los valida el backend y
    // conceden su propia duración/plan; el resto usa el registro de regalo anual.
    const normalizedCode = activationCode.trim().toUpperCase();
    const isCampaignCode = normalizedCode.startsWith('SC-BETA-') || normalizedCode.startsWith('CREATOR-');
    const res = isCampaignCode
      ? await redeemPromoCode(codeEmail, codePassword, codeName, activationCode)
      : await registerWithCode(codeEmail, codePassword, codeName, activationCode);
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
    <>
      <div
        className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-slate-950/90 backdrop-blur-xl select-none animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-label="Acceso a SkateCoreo"
      >
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center px-3 py-5 sm:px-6 sm:py-8">
          {/* ── Marca ── */}
          <header className="mb-4 flex flex-col items-center text-center sm:mb-6">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-3 py-1">
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
                AlsizTech · SkateCoreo SaaS
              </span>
            </div>
            <SkateCoreoBrand size="lg" />
            <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-400 sm:text-sm">
              Plataforma profesional de trazado coreográfico, mezcla de audio y catálogo oficial
              de figuras.
            </p>
          </header>

          {/* ── Selector compacto (móvil/tablet) ── */}
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
              Crear acceso
            </button>
          </div>

          {/* ── Dos caminos ── */}
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2 lg:items-stretch">
            {/* ══════════ CAMINO 1: ADQUIRIR LICENCIA ══════════ */}
            <section
              aria-label="Adquirir licencia"
              className={panelClass('buy', authTab)}
            >
              <div className="mb-4 flex items-center justify-between gap-2 border-b border-white/5 pb-3">
                <span className="font-mono text-[10px] font-black uppercase tracking-wider text-cyan">
                  Adquirir licencia
                </span>
                <span className="rounded-full border border-cyan/30 bg-cyan/15 px-2.5 py-0.5 text-[10px] font-black uppercase text-cyan">
                  1 año completo
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-black text-white sm:text-xl">
                    Patinadora Individual
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Acceso profesional para 1 atleta o entrenador
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-2xl font-black text-white sm:text-3xl">$20</span>
                  <span className="ml-1 text-xs text-slate-400">USD / año</span>
                </div>
              </div>

              <ul className="mt-4 space-y-2 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
                  <span>Catálogo reglamentario de figuras y cálculo de BV</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
                  <span>Trazado cinemático 2D y zoom gestual de precisión</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
                  <span>Modo Entrenamiento 100% Offline (sin red en la pista)</span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
                  <span>
                    Hasta 3 dispositivos: <strong>1 PC + 1 Tablet + 1 Celular</strong>
                  </span>
                </li>
              </ul>

              <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
                <Field
                  id="buyer-email"
                  type="email"
                  required
                  label={
                    <>
                      <span className="text-cyan">*</span> Correo para vincular tu licencia
                    </>
                  }
                  icon={<Mail className="h-4 w-4" />}
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="tu.correo@ejemplo.com"
                  autoComplete="email"
                />
              </div>

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
                <div className="mt-2.5 rounded-xl border border-coral/30 bg-coral/15 p-2.5 text-center text-xs font-bold text-coral">
                  {paymentFeedback.message}
                </div>
              )}
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

              {/* ── Sección secundaria expandible: código de regalo/Beta ── */}
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
                      ¿Tienes un código? Actívalo aquí
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
                        Canjear código y crear cuenta
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
                      placeholder="SC-BETA-XXXX-XXXX-XXXX"
                      className="font-mono font-bold uppercase tracking-wider"
                    />
                    <p className="text-[10px] leading-snug text-slate-500">
                      Código Beta Tester: activa 30 días de acceso gratuito (un solo uso). Si tu
                      correo ya existe, se verificará tu contraseña y se ampliará tu acceso.
                    </p>

                    {codeFeedback && (
                      <div className="rounded-lg border border-coral/30 bg-coral/15 p-2 text-[11px] font-medium text-coral">
                        {codeFeedback.message}
                      </div>
                    )}

                    <Button type="submit" variant="mint" block disabled={codeLoading}>
                      {codeLoading ? 'Activando...' : 'Activar código y entrar'}
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
            Completa tus datos para activar tu año de acceso y vincular este dispositivo (
            {detectedLabel}).
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
