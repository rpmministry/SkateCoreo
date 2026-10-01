/**
 * AuthModal.tsx — Pantalla de Acceso, Onboarding y Selección de Planes de SkateCoreo
 *
 * Arquitectura Visual Carbon Design System (IBM) con Jerarquía Clara de 5 Niveles:
 *   · Nivel 1: Identidad de Marca SkateCoreo (AlsizTech).
 *   · Nivel 2: Título principal claro y contextual.
 *   · Nivel 3: Formulario de autenticación protagonista (Iniciar Sesión / Activar Código).
 *   · Nivel 4: Selección y presentación transparente de Planes (Patinador vs Entrenador).
 *   · Nivel 5: Acciones secundarias y enlaces de soporte (Recuperar PayPal, WhatsApp, Versión).
 *
 * Principios Carbon aplicados:
 *   · Color: Fondo neutro dark slate (#12161f), superficies en capas (1/2/3), IBM Blue 60 (#0f62fe) para interacción.
 *   · Tipografía: Alto contraste (#f4f4f4 texto principal, #c6c6c6 secundario, #8d8d8d helper). Cero neón que fatigue la vista.
 *   · Espaciado: Escala de 8 puntos, márgenes y paddings respirables.
 *   · Responsive real: Desktop 2 columnas balanceadas, Mobile/Tablet con selector segmentado sin apiñamiento.
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
  ArrowRight,
  X,
  User,
  KeyRound,
  FlaskConical,
} from 'lucide-react';
import { PRICING_PLANS, SKATER_PLAN, COACH_PLAN, PlanRole, PlanPeriod, APP_MODE } from '../services/pricingService';
import { useAuthStore } from '../store/useAuthStore';
import { PayPalButton } from './PayPalButton';
import { getDeviceType, getDeviceTypeLabel } from '../utils/deviceDetector';
import { SkateCoreoBrand } from './brand/SkateCoreoBrand';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Field } from './ui/Field';
import { ModalShell } from './ui/ModalShell';

type AuthTab = 'login' | 'buy';
type AccessMode = 'credentials' | 'tester' | 'code';

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
  const [selectedRole, setSelectedRole] = useState<PlanRole>(() =>
    isUpgradeModalOpen ? 'coach' : 'skater'
  );
  const [selectedPlan, setSelectedPlan] = useState<PlanPeriod>('annual');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [paymentFeedback, setPaymentFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // ── Tarjeta 2: Login con Correo y Contraseña ───────────────────────
  const [accessMode, setAccessMode] = useState<AccessMode>(APP_MODE === 'TESTER' ? 'tester' : 'credentials');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginFeedback, setLoginFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    expired?: boolean;
  } | null>(null);

  // ── Canje de Código de Licencia / Club / Promo ───────────────────────
  const [codeEmail, setCodeEmail] = useState('');
  const [codeName, setCodeName] = useState('');
  const [codePassword, setCodePassword] = useState('');
  const [codeConfirmPassword, setCodeConfirmPassword] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [codeFeedback, setCodeFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
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
  const [postRegFeedback, setPostRegFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [postRegLoading, setPostRegLoading] = useState(false);

  // ── Modal Recuperar Pago (Pagos Huérfanos) ──────────────────────────
  const [showRecoverModal, setShowRecoverModal] = useState(false);
  const [recoverQuery, setRecoverQuery] = useState('');
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [recoverFeedback, setRecoverFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // ── Selector móvil/tablet (Solo vista < lg) ─────────────────────────
  const [authTab, setAuthTab] = useState<AuthTab>(() =>
    isUpgradeModalOpen ? 'buy' : 'login'
  );

  // Detección de dispositivo actual
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
      setLoginFeedback({ type: 'error', message: res.message, expired: res.expired });
    }
  };

  // ── Handler Registro con Código ───────────────────────────────────
  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeFeedback(null);

    if (codePassword.length < 6) {
      setCodeFeedback({
        type: 'error',
        message: 'La contraseña debe tener al menos 6 caracteres.',
      });
      return;
    }

    if (codePassword !== codeConfirmPassword) {
      setCodeFeedback({
        type: 'error',
        message: 'Las contraseñas no coinciden.',
      });
      return;
    }

    setCodeLoading(true);
    const normalizedCode = activationCode.trim().toUpperCase();

    let res;
    if (normalizedCode.startsWith('SKC-')) {
      res = await redeemClubLicense(codeEmail, codePassword, codeName, normalizedCode);
    } else if (normalizedCode.startsWith('SC-BETA-') || normalizedCode.startsWith('CREATOR-')) {
      res = await redeemPromoCode(codeEmail, codePassword, codeName, normalizedCode);
    } else {
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
      setPostRegFeedback({
        type: 'error',
        message: 'La contraseña debe tener al menos 6 caracteres.',
      });
      return;
    }

    if (postRegPassword !== postRegConfirmPassword) {
      setPostRegFeedback({
        type: 'error',
        message: 'Las contraseñas no coinciden.',
      });
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
  const paypalAmount =
    selectedPlan === 'monthly'
      ? currentPlan.monthlyPrice.toFixed(2)
      : currentPlan.annualPrice.toFixed(2);

  return (
    <>
      {/* ── Overlay Principal con Fondo Sólido Neutro Bear (Sin difuminado ni sombras grises) ── */}
      <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[#121417] animate-fade-in">
        {/* Botón de cierre cuando se abre como Modal de Upgrade/Planes */}
        {isUpgradeModalOpen && (
          <button
            type="button"
            onClick={() => setUpgradeModalOpen(false)}
            className="fixed top-3 right-3 sm:top-5 sm:right-5 z-50 p-2 sm:p-2.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-[#c6c6c6] hover:text-white transition-colors border border-white/10 shadow-elevation-2"
            title="Cerrar y volver a SkateCoreo"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* Contenedor flexible con altura mínima de viewport y centrado equilibrado */}
        <div className="flex min-h-full w-full items-center justify-center p-3 sm:p-4 md:p-6 lg:p-7">
          <div className="my-auto w-full max-w-6xl flex flex-col py-2 sm:py-3">
            {/* ── NIVEL 1 & 2: Encabezado e Identidad de Marca ── */}
            <header className="mb-3 sm:mb-4 lg:mb-5 flex flex-col items-center text-center">
              <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-surface-1 px-2.5 py-0.5 shadow-sm">
                <img
                  src="/alsiztech_app_icon_dark.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-3.5 w-3.5 object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#78a9ff]">
                  AlsizTech · SkateCoreo
                </span>
              </div>

              <SkateCoreoBrand size="lg" />

              <p className="mt-1 max-w-lg text-xs sm:text-sm text-[#c6c6c6] leading-relaxed">
                Plataforma profesional de trazado coreográfico, sincronización musical y evaluaciones oficiales.
              </p>
            </header>

            {/* ── Selector Móvil / Tablet (< lg): Solo 1 flujo a la vez para no apiñar ── */}
            {!isUpgradeModalOpen && (
              <div
                role="tablist"
                aria-label="Seleccionar acción"
                className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-surface-1 p-1 lg:hidden shadow-sm"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={authTab === 'login'}
                  onClick={() => setAuthTab('login')}
                  className={`flex min-h-[36px] items-center justify-center rounded-md px-3 text-xs font-semibold transition-colors ${
                    authTab === 'login'
                      ? 'bg-[#0f62fe] text-white shadow-sm'
                      : 'text-[#c6c6c6] hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                  <span>Acceso</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={authTab === 'buy'}
                  onClick={() => setAuthTab('buy')}
                  className={`flex min-h-[36px] items-center justify-center rounded-md px-3 text-xs font-semibold transition-colors ${
                    authTab === 'buy'
                      ? 'bg-[#0f62fe] text-white shadow-sm'
                      : 'text-[#c6c6c6] hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  <span>Suscripciones</span>
                </button>
              </div>
            )}

            {/* ── COMPOSICIÓN DE DOS COLUMNAS (Desktop) / UNA COLUMNA (Mobile/Tablet) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 xl:gap-8 items-start">
              {/* ══════════ COLUMNA IZQUIERDA: AUTENTICACIÓN (Nivel 3 & 5) ══════════ */}
              <section
                aria-label="Acceso a la cuenta"
                className={`lg:col-span-6 rounded-xl bg-surface-1 border border-white/[0.08] p-5 sm:p-6 shadow-elevation-2 flex-col justify-between ${
                  authTab === 'login' || isUpgradeModalOpen ? 'flex' : 'hidden lg:flex'
                }`}
              >
                <div>
                  {/* Cabecera del formulario con indicador de dispositivo */}
                  <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-4">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#78a9ff]">
                      Control de Acceso
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-surface-2 px-2.5 py-0.5 text-[10px] font-medium text-[#c6c6c6]">
                      {detectedType === 'mobile' && <Smartphone className="h-3 w-3 text-[#78a9ff]" />}
                      {detectedType === 'tablet' && <Tablet className="h-3 w-3 text-[#78a9ff]" />}
                      {detectedType === 'desktop' && <Laptop className="h-3 w-3 text-[#78a9ff]" />}
                      <span>{detectedLabel}</span>
                    </span>
                  </div>

                  {/* Selector de modo de acceso: Credenciales vs Testers vs Código de Licencia */}
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1 border border-white/[0.06] mb-4">
                    <button
                      type="button"
                      onClick={() => {
                        setAccessMode('tester');
                        setCodeFeedback(null);
                      }}
                      className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 px-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors ${
                        accessMode === 'tester'
                          ? 'bg-[#009d9a] text-white font-semibold shadow-sm'
                          : 'text-[#8d8d8d] hover:text-white'
                      }`}
                    >
                      <FlaskConical className="h-3.5 w-3.5" />
                      <span>Testers</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccessMode('credentials');
                        setLoginFeedback(null);
                      }}
                      className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 px-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors ${
                        accessMode === 'credentials'
                          ? 'bg-[#0f62fe] text-white font-semibold shadow-sm'
                          : 'text-[#8d8d8d] hover:text-white'
                      }`}
                    >
                      <User className="h-3.5 w-3.5" />
                      <span>Autorizado</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccessMode('code');
                        setCodeFeedback(null);
                      }}
                      className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 px-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors ${
                        accessMode === 'code'
                          ? 'bg-[#8a3ffc] text-white font-semibold shadow-sm'
                          : 'text-[#8d8d8d] hover:text-white'
                      }`}
                    >
                      <Ticket className="h-3.5 w-3.5" />
                      <span>Licencias</span>
                    </button>
                  </div>

                  {/* ── MODO 1: Iniciar Sesión con Correo y Contraseña ── */}
                  {accessMode === 'credentials' && (
                    <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                      <div>
                        <h2 className="font-display text-base sm:text-lg font-semibold text-[#f4f4f4]">
                          Acceso Autorizado
                        </h2>
                        <p className="text-xs text-[#c6c6c6] mt-0.5">
                          Ingresa tus credenciales para acceder a tus coreografías.
                        </p>
                      </div>

                      {loginFeedback?.expired ? (
                        <div className="rounded-lg border border-white/[0.08] bg-surface-2 p-5 text-center flex flex-col items-center">
                          <AlertCircle className="h-10 w-10 text-[#ff8389] mb-3" />
                          <h3 className="text-base font-bold text-[#f4f4f4] mb-1.5">
                            Tu período de prueba de 7 días ha finalizado.
                          </h3>
                          <p className="text-xs text-[#c6c6c6] mb-4 max-w-[260px] mx-auto leading-relaxed">
                            Esperamos que hayas disfrutado probar SkateCoreo. Puedes comunicarte con nosotros para solicitar una ampliación o enviarnos tus comentarios.
                          </p>
                          <a
                            href="https://wa.me/593979376810?text=Hola%20AlsizTech,%20mi%20per%C3%ADodo%20de%20prueba%20en%20SkateCoreo%20ha%20finalizado."
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#25D366] hover:bg-[#20bd5a] text-white px-4 py-2 text-sm font-semibold shadow-sm transition-colors"
                          >
                            <span>Contactar por WhatsApp</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              setLoginFeedback(null);
                              setLoginPassword('');
                            }}
                            className="mt-3 text-xs text-[#8d8d8d] hover:text-[#f4f4f4] transition-colors"
                          >
                            Volver al inicio de sesión
                          </button>
                        </div>
                      ) : (
                        <>
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
                            <div className="flex items-start gap-2 rounded-lg border border-[#da1e28]/40 bg-[#da1e28]/15 p-3 text-xs text-[#ff8389]">
                              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                              <span className="leading-relaxed">{loginFeedback.message}</span>
                            </div>
                          )}

                          <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            block
                            disabled={isLoading}
                            className="mt-2"
                          >
                            <span>{isLoading ? 'Comprobando dispositivo...' : 'Entrar a SkateCoreo'}</span>
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </form>
                  )}

                  {/* ── MODO 2: TESTERS ── */}
                  {accessMode === 'tester' && (
                    <form onSubmit={handleCodeSubmit} className="space-y-3">
                      <div>
                        <h2 className="font-display text-base sm:text-lg font-semibold text-[#3ddbd9]">
                          Acceso para testers
                        </h2>
                        <p className="text-xs text-[#c6c6c6] mt-0.5">
                          Ingresa tu código de prueba para activar tus 7 días de acceso completo.
                        </p>
                      </div>

                      <Field
                        id="code-email"
                        type="email"
                        required
                        label="Correo electrónico"
                        icon={<Mail className="h-4 w-4" />}
                        value={codeEmail}
                        onChange={(e) => setCodeEmail(e.target.value)}
                        placeholder="correo@ejemplo.com"
                        autoComplete="email"
                      />

                      <Field
                        id="code-name"
                        type="text"
                        required
                        label="Nombre completo / Atleta"
                        icon={<User className="h-4 w-4" />}
                        value={codeName}
                        onChange={(e) => setCodeName(e.target.value)}
                        placeholder="Nombre y apellido"
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <Field
                          id="code-password"
                          type="password"
                          required
                          label="Contraseña (Mín 6 car.)"
                          value={codePassword}
                          onChange={(e) => setCodePassword(e.target.value)}
                          placeholder="Mínimo 6 car."
                          autoComplete="new-password"
                        />
                        <Field
                          id="code-confirm"
                          type="password"
                          required
                          label="Confirmar contraseña"
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
                        label="Código de Tester"
                        icon={<FlaskConical className="h-4 w-4" />}
                        value={activationCode}
                        onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                        placeholder="SC-BETA-XXXX-XXXX"
                        className="font-mono font-bold uppercase tracking-wider text-[#3ddbd9]"
                      />

                      {codeFeedback && (
                        <div className="rounded-lg border border-[#da1e28]/40 bg-[#da1e28]/15 p-2.5 text-xs text-[#ff8389]">
                          {codeFeedback.message}
                        </div>
                      )}

                      <Button
                        type="submit"
                        variant="mint"
                        size="md"
                        block
                        disabled={codeLoading}
                        className="mt-1"
                      >
                        <span>{codeLoading ? 'Activando...' : 'Activar prueba de 7 días'}</span>
                        <Sparkles className="h-4 w-4" />
                      </Button>
                    </form>
                  )}

                  {/* ── MODO 3: LICENCIAS ── */}
                  {accessMode === 'code' && (
                    <form onSubmit={handleCodeSubmit} className="space-y-3">
                      <div>
                        <h2 className="font-display text-base sm:text-lg font-semibold text-[#f4f4f4]">
                          Licencias de Club
                        </h2>
                        <p className="text-xs text-[#c6c6c6] mt-0.5">
                          Vincula tu código único de activación (SKC-XXXX).
                        </p>
                      </div>

                      <Field
                        id="code-email"
                        type="email"
                        required
                        label="Correo electrónico"
                        icon={<Mail className="h-4 w-4" />}
                        value={codeEmail}
                        onChange={(e) => setCodeEmail(e.target.value)}
                        placeholder="correo@ejemplo.com"
                        autoComplete="email"
                      />

                      <Field
                        id="code-name"
                        type="text"
                        required
                        label="Nombre completo / Atleta"
                        icon={<User className="h-4 w-4" />}
                        value={codeName}
                        onChange={(e) => setCodeName(e.target.value)}
                        placeholder="Nombre y apellido"
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <Field
                          id="code-password"
                          type="password"
                          required
                          label="Contraseña"
                          value={codePassword}
                          onChange={(e) => setCodePassword(e.target.value)}
                          placeholder="Mínimo 6 car."
                          autoComplete="new-password"
                        />
                        <Field
                          id="code-confirm"
                          type="password"
                          required
                          label="Confirmar"
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
                        label="Código de Activación"
                        icon={<Ticket className="h-4 w-4" />}
                        value={activationCode}
                        onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                        placeholder="SKC-XXXX-XXXX"
                        className="font-mono font-bold uppercase tracking-wider"
                      />

                      {codeFeedback && (
                        <div className="rounded-lg border border-[#da1e28]/40 bg-[#da1e28]/15 p-2.5 text-xs text-[#ff8389]">
                          {codeFeedback.message}
                        </div>
                      )}

                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        block
                        disabled={codeLoading}
                        className="mt-1"
                      >
                        <span>{codeLoading ? 'Activando...' : 'Activar licencia y entrar'}</span>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </form>
                  )}
                </div>

                {/* ── NIVEL 5: Enlaces Secundarios Discretos ── */}
                <div className="mt-5 pt-3.5 border-t border-white/[0.06] flex flex-col gap-2 text-center sm:text-left">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRecoverModal(true);
                        setRecoverFeedback(null);
                      }}
                      className="inline-flex items-center gap-1.5 text-[#c6c6c6] hover:text-[#78a9ff] transition-colors"
                    >
                      <Search className="h-3.5 w-3.5 text-[#78a9ff]" />
                      <span>¿Ya pagaste en PayPal? Recuperar pago</span>
                    </button>

                    <a
                      href="https://wa.me/593979376810?text=Hola%20AlsizTech,%20deseo%20información%20sobre%20la%20Licencia%20Club%20de%20SkateCoreo"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[#c6c6c6] hover:text-[#3ddbd9] transition-colors"
                    >
                      <Users className="h-3.5 w-3.5 text-[#3ddbd9]" />
                      <span>Licencias para Clubes</span>
                    </a>
                  </div>

                  <div className="flex items-center justify-end text-[11px] text-[#8d8d8d] pt-1">
                    <a
                      href="https://alsiztech.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-[#c6c6c6] transition-colors"
                    >
                      <span>AlsizTech</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                </div>
              </section>

              {/* ══════════ COLUMNA DERECHA: PLANES Y SUSCRIPCIÓN (Nivel 4) ══════════ */}
              <section
                aria-label="Planes y Suscripción"
                className={`lg:col-span-6 rounded-xl bg-surface-1 border border-white/[0.08] p-5 sm:p-6 shadow-elevation-2 flex-col justify-between ${
                  authTab === 'buy' || isUpgradeModalOpen ? 'flex' : 'hidden lg:flex'
                }`}
              >
                <div>
                  {/* Cabecera de la sección de planes */}
                  <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-3.5">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#3ddbd9]">
                      {isUpgradeModalOpen ? 'Actualización de Cuenta' : 'Planes y Nuevo Acceso'}
                    </span>
                    <Badge variant={selectedRole === 'coach' ? 'coral' : 'cobalt'} size="xs">
                      {APP_MODE === 'COMMERCIAL' ? (
                        selectedPlan === 'annual'
                          ? `Ahorro ${currentPlan.annualDiscountPercent}%`
                          : 'Plan Mensual'
                      ) : (
                        'Próximamente'
                      )}
                    </Badge>
                  </div>

                  {/* 1. Selector de Tipo de Cuenta (Patinador vs Entrenador) */}
                  <div className="mb-3">
                    <span className="block text-[10px] font-mono font-medium uppercase tracking-wider text-[#8d8d8d] mb-1.5">
                      1. Estructura de suscripción
                    </span>

                    <div className="grid grid-cols-2 gap-2">
                      {/* Tarjeta Patinador */}
                      <button
                        type="button"
                        onClick={() => setSelectedRole('skater')}
                        className={`flex flex-col items-center text-center p-2.5 rounded-lg border transition-colors ${
                          selectedRole === 'skater'
                            ? 'bg-[#0f62fe]/15 border-[#0f62fe] text-white shadow-sm'
                            : 'bg-surface-2 border-white/[0.06] text-[#8d8d8d] hover:text-white hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-[#78a9ff]" />
                          <span className="text-xs font-semibold">Patinador(a)</span>
                        </div>
                        {APP_MODE === 'COMMERCIAL' ? (
                          <span className="text-[11px] font-mono text-[#78a9ff] font-bold mt-0.5">
                            ${SKATER_PLAN.monthlyPrice.toFixed(2)} USD / mes
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono text-[#78a9ff] font-bold mt-0.5">
                            Modalidad Patinador
                          </span>
                        )}
                      </button>

                      {/* Tarjeta Entrenador */}
                      <button
                        type="button"
                        onClick={() => setSelectedRole('coach')}
                        className={`flex flex-col items-center text-center p-2.5 rounded-lg border transition-colors ${
                          selectedRole === 'coach'
                            ? 'bg-[#ee5396]/15 border-[#ee5396] text-white shadow-sm'
                            : 'bg-surface-2 border-white/[0.06] text-[#8d8d8d] hover:text-white hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-[#ff7eb6]" />
                          <span className="text-xs font-semibold">Entrenador(a)</span>
                        </div>
                        {APP_MODE === 'COMMERCIAL' ? (
                          <span className="text-[11px] font-mono text-[#ff7eb6] font-bold mt-0.5">
                            ${COACH_PLAN.monthlyPrice.toFixed(2)} USD / mes
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono text-[#ff7eb6] font-bold mt-0.5">
                            Modalidad Entrenador
                          </span>
                        )}
                      </button>
                    </div>

                    <p className="mt-1.5 text-[11px] text-[#c6c6c6] leading-snug px-0.5">
                      {currentPlan.tagline}.
                    </p>
                  </div>

                  {/* 2. Selector de Período de Facturación (Anual con Ahorro vs Mensual) */}
                  <div className="mb-3.5">
                    <span className="block text-[10px] font-mono font-medium uppercase tracking-wider text-[#8d8d8d] mb-1.5">
                      2. Período de suscripción
                    </span>

                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-1 border border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => setSelectedPlan('annual')}
                        className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-md transition-all ${
                          selectedPlan === 'annual'
                            ? 'bg-surface-3 text-white font-bold border border-[#0f62fe] shadow-sm ring-1 ring-[#0f62fe]/40'
                            : 'text-[#8d8d8d] hover:text-white border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-semibold">Plan Anual</span>
                          {APP_MODE === 'COMMERCIAL' && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-[#009d9a]/20 text-[#3ddbd9]">
                              -{currentPlan.annualDiscountPercent}%
                            </span>
                          )}
                        </div>
                        {APP_MODE === 'COMMERCIAL' ? (
                          <span className="text-[10px] font-mono text-[#c6c6c6] mt-0.5">
                            ${currentPlan.annualPrice.toFixed(2)} USD / año
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-[#c6c6c6] mt-0.5">
                            Pago Anualizado
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedPlan('monthly')}
                        className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-md transition-all ${
                          selectedPlan === 'monthly'
                            ? 'bg-surface-3 text-white font-bold border border-[#0f62fe] shadow-sm ring-1 ring-[#0f62fe]/40'
                            : 'text-[#8d8d8d] hover:text-white border border-transparent'
                        }`}
                      >
                        <span className="text-xs font-semibold">Plan Mensual</span>
                        {APP_MODE === 'COMMERCIAL' ? (
                          <span className="text-[10px] font-mono text-[#c6c6c6] mt-0.5">
                            ${currentPlan.monthlyPrice.toFixed(2)} USD / mes
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-[#c6c6c6] mt-0.5">
                            Pago Mensual
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 3. Desglose Numérico Transparente del Plan */}
                  <div className="rounded-lg border border-white/[0.08] bg-surface-2 p-3.5 mb-3.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <h3 className="font-display text-sm sm:text-base font-semibold text-[#f4f4f4]">
                          {currentPlan.name}
                        </h3>
                        <p className="text-[11px] text-[#8d8d8d]">
                          {selectedPlan === 'annual'
                            ? 'Acceso 365 días con tarifa preferencial'
                            : 'Suscripción mes a mes cancelable en cualquier momento'}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        {APP_MODE === 'COMMERCIAL' ? (
                          selectedPlan === 'annual' ? (
                            <div>
                              <div className="flex items-baseline justify-end gap-1.5">
                                <span className="text-xs text-[#8d8d8d] line-through">
                                  ${currentPlan.baseAnnualPrice.toFixed(2)}
                                </span>
                                <span className="text-xl sm:text-2xl font-bold font-mono text-[#f4f4f4]">
                                  ${currentPlan.annualPrice.toFixed(2)}
                                </span>
                              </div>
                              <span className="text-[10px] text-[#3ddbd9] font-semibold block">
                                Ahorras ${currentPlan.annualSavings.toFixed(2)}/año ({currentPlan.annualDiscountPercent}%)
                              </span>
                              <span className="text-[10px] text-[#8d8d8d] block font-mono">
                                (Equivale a ${currentPlan.monthlyEquivalent.toFixed(2)}/mes)
                              </span>
                            </div>
                          ) : (
                            <div>
                              <span className="text-xl sm:text-2xl font-bold font-mono text-[#f4f4f4]">
                                ${currentPlan.monthlyPrice.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-[#8d8d8d] block">USD / mes</span>
                            </div>
                          )
                        ) : (
                          <div>
                             <span className="text-sm font-bold text-[#f4f4f4] block">Próximamente</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Características destacadas */}
                    <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] space-y-1 text-[11px] text-[#c6c6c6]">
                      {selectedRole === 'skater' ? (
                        <>
                          <div className="flex items-center gap-1.5">
                            <Check className="h-3 w-3 text-[#3ddbd9] shrink-0" />
                            <span>Pista 2D reglamentaria con curvas Bézier y tiempos</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Check className="h-3 w-3 text-[#3ddbd9] shrink-0" />
                            <span>Estudio de Audio con sincronización BPM y recortes</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Check className="h-3 w-3 text-[#3ddbd9] shrink-0" />
                            <span>Catálogo de elementos oficiales y cálculo de valor base (BV)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Check className="h-3 w-3 text-[#3ddbd9] shrink-0" />
                            <span>Modo 100% Offline (entrena sin conexión en la pista)</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5">
                            <Check className="h-3 w-3 text-[#ff7eb6] shrink-0" />
                            <span>Todo lo incluido en el Plan Patinador/a</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Check className="h-3 w-3 text-[#ff7eb6] shrink-0" />
                            <span>Directorio, expedientes y fichas deportivas por atleta</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Check className="h-3 w-3 text-[#ff7eb6] shrink-0" />
                            <span>Panel Técnico Oficial RollArt / FEP / White 2026</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Check className="h-3 w-3 text-[#ff7eb6] shrink-0" />
                            <span>Sincronización en 1-clic con Google Drive, OneDrive y Dropbox</span>
                          </div>
                        </>
                      )}

                      <div className="flex items-center gap-1.5 text-[#8d8d8d] pt-1">
                        <ShieldCheck className="h-3 w-3 text-[#78a9ff] shrink-0" />
                        <span>Hasta 3 dispositivos: 1 PC + 1 Tablet + 1 Celular</span>
                      </div>
                    </div>
                  </div>

                  {/* 4. Campo de Correo y Botón de Pago PayPal */}
                  <div className="space-y-2 pt-1">
                    {APP_MODE === 'COMMERCIAL' ? (
                      <>
                        <Field
                          id="buyer-email"
                          type="email"
                          required
                          label="Correo para vincular tu suscripción"
                          icon={<Mail className="h-4 w-4" />}
                          value={buyerEmail}
                          onChange={(e) => setBuyerEmail(e.target.value)}
                          placeholder="tu.correo@ejemplo.com"
                          autoComplete="email"
                        />

                        <div className="mt-2.5">
                          <PayPalButton
                            amount={paypalAmount}
                            plan={selectedPlan}
                            role={selectedRole}
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

                        <p className="text-center text-[10px] text-[#8d8d8d] mt-1 leading-snug">
                          Pago seguro encriptado procesado directamente por PayPal. Cancelación mes a mes sin permanencia.
                        </p>
                      </>
                    ) : (
                      <div className="mt-2.5 p-4 rounded-lg bg-surface-2 border border-white/[0.06] text-center">
                        <span className="text-sm text-[#c6c6c6] font-medium block mb-1">
                          Suscripciones temporalmente inactivas
                        </span>
                        <span className="text-xs text-[#8d8d8d] leading-relaxed block">
                          SkateCoreo se encuentra actualmente en fase de pruebas para Testers. La estructura de suscripciones públicas se habilitará próximamente.
                        </span>
                      </div>
                    )}

                    {paymentFeedback && (
                      <div className="rounded-lg border border-[#da1e28]/40 bg-[#da1e28]/15 p-2.5 text-center text-xs text-[#ff8389]">
                        {paymentFeedback.message}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ MODAL POST-PAGO: COMPLETAR REGISTRO TRAS PAYPAL ══════════ */}
      <ModalShell
        open={!!postPaymentData}
        title="Completar registro"
        icon={<CheckCircle2 className="h-5 w-5 text-[#24a148]" />}
      >
        <div className="mb-4 text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-[#24a148]/40 bg-[#24a148]/15 text-[#24a148]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="font-display text-base font-semibold text-[#f4f4f4]">¡Pago verificado con éxito!</p>
          <p className="mt-0.5 text-xs text-[#8d8d8d]">
            Crea tu contraseña para vincular este dispositivo ({detectedLabel}).
          </p>
        </div>

        <form onSubmit={handlePostPaymentSubmit} className="space-y-3">
          <Field
            id="post-email"
            type="email"
            disabled
            label="Correo asociado (PayPal)"
            value={postPaymentData?.payerEmail || ''}
            className="font-mono text-xs"
          />
          <Field
            id="post-name"
            type="text"
            required
            label="Nombre completo / Atleta"
            value={postRegName}
            onChange={(e) => setPostRegName(e.target.value)}
            placeholder="Tu nombre"
            autoComplete="name"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Field
              id="post-password"
              type="password"
              required
              label="Contraseña (mínimo 6)"
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
          </div>

          {postRegFeedback && (
            <div className="rounded-lg border border-[#da1e28]/40 bg-[#da1e28]/15 p-2 text-xs text-[#ff8389]">
              {postRegFeedback.message}
            </div>
          )}

          <Button
            type="submit"
            variant="mint"
            size="md"
            block
            disabled={postRegLoading}
            className="mt-1"
          >
            <span>{postRegLoading ? 'Creando cuenta...' : 'Finalizar registro y entrar'}</span>
            <Sparkles className="h-4 w-4" />
          </Button>
        </form>
      </ModalShell>

      {/* ══════════ MODAL RECUPERAR PAGO PAYPAL ══════════ */}
      <ModalShell
        open={showRecoverModal}
        onClose={() => setShowRecoverModal(false)}
        title="Recuperar pago de PayPal"
        icon={<Search className="h-5 w-5 text-[#78a9ff]" />}
      >
        <p className="text-xs text-[#c6c6c6] leading-relaxed">
          Si pagaste en PayPal y accidentalmente se cerró tu navegador antes de asignar tu
          contraseña, ingresa aquí tu correo de PayPal o el código de transacción:
        </p>

        <form onSubmit={handleRecoverLookup} className="mt-3.5 space-y-3">
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
            <div className="rounded-lg border border-[#da1e28]/40 bg-[#da1e28]/15 p-2 text-xs text-[#ff8389]">
              {recoverFeedback.message}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              type="button"
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
