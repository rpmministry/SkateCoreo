/**
 * AdminDashboardModal.tsx — Panel Administrativo Comercial y de Licencias de SkateCoreo
 *
 * Exclusivo para administradores / superadministradores.
 * Permite:
 *   · Visualizar paquetes de licencias de clubes y clientes corporativos.
 *   · Crear nuevos paquetes con cálculo y validación server-side de descuentos (volumen o negociados).
 *   · Generar exactamente N códigos criptográficamente seguros (SKC-XXXX-XXXX).
 *   · Consultar, copiar y revocar códigos individuales de activación.
 *   · Generar y descargar documentos PDF de calidad editorial con membrete oficial.
 *   · Renovar paquetes para extender masivamente la vigencia a todos sus atletas/entrenadores.
 *   · Consultar el historial de auditoría de operaciones administrativas.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Users,
  Building2,
  Plus,
  FileText,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Search,
  Ticket,
  X,
  History,
  Tag,
  Percent,
  CreditCard,
  Sparkles,
} from 'lucide-react';
import { useAuthStore, isOwnerOrAdmin } from '../../store/useAuthStore';
import { SKATER_PLAN, COACH_PLAN } from '../../services/pricingService';
import {
  commercialLicenseService,
  LicensePackage,
  LicenseCodeItem,
  CommercialPricing,
  CommercialAuditLog,
  DEFAULT_DISCOUNT_TIERS,
} from '../../services/commercialLicenseService';
import { LicensePdfService } from '../../services/licensePdfService';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AdminTab = 'packages' | 'new-package' | 'codes' | 'audit' | 'tiers' | 'users' | 'plans';

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({ isOpen, onClose }) => {
  const currentUser = useAuthStore((s) => s.user);
  const currentRole = useAuthStore((s) => s.role);

  const isAdmin = Boolean(
    currentUser && (currentRole === 'superadmin' || isOwnerOrAdmin(currentUser.email))
  );

  const [activeTab, setActiveTab] = useState<AdminTab>('packages');
  const [packages, setPackages] = useState<LicensePackage[]>([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Paquete seleccionado para ver códigos
  const [selectedPackage, setSelectedPackage] = useState<LicensePackage | null>(null);
  const [packageCodes, setPackageCodes] = useState<LicenseCodeItem[]>([]);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Formulario nuevo paquete
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newTotalLicenses, setNewTotalLicenses] = useState<number>(25);
  const [newPlan, setNewPlan] = useState<'annual' | 'monthly'>('annual');
  const [discountMode, setDiscountMode] = useState<'tiered' | 'negotiated'>('tiered');
  const [negotiatedDiscountPercent, setNegotiatedDiscountPercent] = useState<number>(50);
  const [newPaymentRef, setNewPaymentRef] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [previewPricing, setPreviewPricing] = useState<CommercialPricing | null>(null);
  const [isCreatingPackage, setIsCreatingPackage] = useState(false);
  const [createFeedback, setCreateFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal de renovación
  const [renewingPkg, setRenewingPkg] = useState<LicensePackage | null>(null);
  const [renewDays, setRenewDays] = useState<number>(365);
  const [renewPaymentRef, setRenewPaymentRef] = useState('');
  const [isRenewing, setIsRenewing] = useState(false);
  const [renewFeedback, setRenewFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auditoría
  const [auditLogs, setAuditLogs] = useState<CommercialAuditLog[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Gestión de Usuarios y Roles
  const [userList, setUserList] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userFeedback, setUserFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadUsersList = useCallback(async () => {
    if (!currentUser || !isAdmin) return;
    setIsLoadingUsers(true);
    const res = await useAuthStore.getState().adminListUsers();
    if (res.success && res.users) {
      setUserList(res.users);
    }
    setIsLoadingUsers(false);
  }, [currentUser, isAdmin]);

  const handleChangeRole = async (targetUserId: string, newRole: string) => {
    if (!window.confirm(`¿Confirmas cambiar el rol de este usuario a "${newRole}"?`)) return;
    setUserFeedback(null);
    const res = await useAuthStore.getState().adminChangeUserRole(targetUserId, newRole as any);
    if (res.success) {
      setUserFeedback({ type: 'success', message: 'Rol de usuario actualizado con éxito.' });
      await loadUsersList();
    } else {
      setUserFeedback({ type: 'error', message: res.error || 'No se pudo actualizar el rol.' });
    }
  };

  // Cargar paquetes
  const loadPackages = useCallback(async () => {
    if (!currentUser || !isAdmin) return;
    setIsLoadingPackages(true);
    const res = await commercialLicenseService.listPackages(currentUser.email);
    setIsLoadingPackages(false);
    if (res.success) {
      setPackages(res.packages);
    }
  }, [currentUser, isAdmin]);

  // Cargar códigos de un paquete
  const loadPackageCodes = useCallback(async (pkg: LicensePackage) => {
    if (!currentUser || !isAdmin) return;
    setSelectedPackage(pkg);
    setIsLoadingCodes(true);
    setActiveTab('codes');
    const res = await commercialLicenseService.getPackageCodes(currentUser.email, pkg.id);
    setIsLoadingCodes(false);
    if (res.success) {
      setPackageCodes(res.codes);
    }
  }, [currentUser, isAdmin]);

  // Cargar auditoría
  const loadAuditLogs = useCallback(async () => {
    if (!currentUser || !isAdmin) return;
    setIsLoadingAudit(true);
    const res = await commercialLicenseService.listAuditLogs(currentUser.email);
    setIsLoadingAudit(false);
    if (res.success) {
      setAuditLogs(res.logs);
    }
  }, [currentUser, isAdmin]);

  useEffect(() => {
    if (isOpen && isAdmin) {
      void loadPackages();
    }
  }, [isOpen, isAdmin, loadPackages]);

  // Cálculo en vivo de la cotización comercial al cambiar parámetros
  useEffect(() => {
    let cancel = false;
    const calc = async () => {
      if (newTotalLicenses <= 0) return;
      const discount = discountMode === 'negotiated' ? negotiatedDiscountPercent : undefined;
      const pricing = await commercialLicenseService.calculatePricing(newTotalLicenses, newPlan, discount);
      if (!cancel) {
        setPreviewPricing(pricing);
      }
    };
    void calc();
    return () => {
      cancel = true;
    };
  }, [newTotalLicenses, newPlan, discountMode, negotiatedDiscountPercent]);

  // Handler crear paquete
  const handleCreatePackageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setCreateFeedback(null);

    if (!newClientName.trim()) {
      setCreateFeedback({ type: 'error', message: 'Ingresa el nombre del club o cliente.' });
      return;
    }
    if (newTotalLicenses <= 0) {
      setCreateFeedback({ type: 'error', message: 'La cantidad de licencias debe ser mayor a 0.' });
      return;
    }

    setIsCreatingPackage(true);
    const res = await commercialLicenseService.createPackage({
      adminEmail: currentUser.email,
      clientName: newClientName.trim(),
      clientEmail: newClientEmail.trim(),
      totalLicenses: newTotalLicenses,
      plan: newPlan,
      negotiatedDiscount: discountMode === 'negotiated' ? negotiatedDiscountPercent : undefined,
      paymentReference: newPaymentRef.trim(),
      notes: newNotes.trim(),
    });
    setIsCreatingPackage(false);

    if (res.success) {
      setCreateFeedback({
        type: 'success',
        message: `¡Paquete creado exitosamente con ${newTotalLicenses} códigos únicos generados!`,
      });
      // Limpiar formulario
      setNewClientName('');
      setNewClientEmail('');
      setNewPaymentRef('');
      setNewNotes('');
      await loadPackages();
    } else {
      setCreateFeedback({ type: 'error', message: res.error || 'No se pudo crear el paquete.' });
    }
  };

  // Handler descargar PDF
  const handleDownloadPdf = (pkg: LicensePackage, codesToPrint?: LicenseCodeItem[]) => {
    const targetCodes = codesToPrint && codesToPrint.length > 0 ? codesToPrint : packageCodes;
    LicensePdfService.downloadDocument(
      {
        packageNumber: `PKG-${String(pkg.package_number).padStart(4, '0')}`,
        clientName: pkg.client_name,
        clientEmail: pkg.client_email,
        plan: pkg.plan,
        totalLicenses: pkg.total_licenses,
        unitBasePrice: pkg.unit_base_price,
        subtotal: pkg.subtotal,
        discountPercent: pkg.discount_percent,
        discountAmount: pkg.discount_amount,
        totalAmount: pkg.total_amount,
        startsAt: pkg.starts_at,
        expiresAt: pkg.expires_at,
        authorizedBy: pkg.authorized_by,
        paymentReference: pkg.payment_reference,
        notes: pkg.notes,
      },
      targetCodes
    );
  };

  // Handler copiar código individual
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Handler copiar todos los códigos
  const handleCopyAllCodes = () => {
    if (!selectedPackage || packageCodes.length === 0) return;
    const text = [
      `SKATECOREO · CÓDIGOS DE LICENCIA - ${selectedPackage.client_name}`,
      `Vigencia: hasta ${new Date(selectedPackage.expires_at).toLocaleDateString('es-ES')}`,
      `Activación: Ingresa en https://skate-coreo.vercel.app en "¿Tienes un código?"`,
      '',
      ...packageCodes.map((c, i) => `${String(i + 1).padStart(3, '0')}. ${c.code} [${c.status.toUpperCase()}]`),
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  // Handler revocar código
  const handleRevokeCode = async (codeItem: LicenseCodeItem) => {
    if (!currentUser) return;
    const confirm = window.confirm(
      `¿Estás seguro de revocar la licencia ${codeItem.code}? Esta acción impedirá o cancelará el acceso asociado.`
    );
    if (!confirm) return;

    const res = await commercialLicenseService.revokeCode(currentUser.email, codeItem.id, 'Revocación manual desde panel');
    if (res.success && selectedPackage) {
      await loadPackageCodes(selectedPackage);
      await loadPackages();
    } else {
      alert(res.error || 'No se pudo revocar la licencia.');
    }
  };

  // Handler renovar paquete
  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !renewingPkg) return;
    setRenewFeedback(null);

    setIsRenewing(true);
    const res = await commercialLicenseService.renewPackage({
      adminEmail: currentUser.email,
      packageId: renewingPkg.id,
      extensionDays: renewDays,
      paymentReference: renewPaymentRef.trim(),
    });
    setIsRenewing(false);

    if (res.success) {
      setRenewFeedback({
        type: 'success',
        message: `¡Paquete renovado! Se extendió el acceso a ${res.members_extended || 0} cuentas activas.`,
      });
      setTimeout(() => {
        setRenewingPkg(null);
        setRenewFeedback(null);
      }, 2000);
      await loadPackages();
    } else {
      setRenewFeedback({ type: 'error', message: res.error || 'Error al renovar paquete.' });
    }
  };

  if (!isOpen || !isAdmin) return null;

  // Filtrado de paquetes
  const filteredPackages = packages.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.client_name.toLowerCase().includes(q) ||
      (p.client_email && p.client_email.toLowerCase().includes(q)) ||
      String(p.package_number).includes(q)
    );
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl p-3 sm:p-5 animate-fade-in select-none"
    >
      <div className="glass-panel relative flex flex-col w-full max-w-6xl h-[90vh] max-h-[850px] rounded-3xl border border-white/10 bg-slate-950/95 shadow-soft-elevation overflow-hidden text-slate-200">
        {/* ── Cabecera Superior del Panel ── */}
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#0f62fe]/40 bg-[#0f62fe]/15 text-[#78a9ff]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-base font-black text-white sm:text-lg">
                  Panel Comercial y Licencias
                </h1>
                <span className="rounded-full border border-mint/30 bg-mint/15 px-2 py-0.5 text-[9px] font-black uppercase text-mint">
                  Superadmin
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Gestión oficial de clubes, paquetes corporativos, códigos únicos y documentos PDF
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="press rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* ── Pestañas de Navegación ── */}
        <div className="flex border-b border-white/10 px-5 bg-slate-900/40 overflow-x-auto gap-2 py-2">
          <button
            type="button"
            onClick={() => setActiveTab('packages')}
            className={`press flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
              activeTab === 'packages'
                ? 'bg-[#0f62fe] text-white border border-[#78a9ff]/40 shadow-sm ring-1 ring-[#0f62fe]/30'
                : 'text-slate-300 hover:bg-white/[0.08] hover:text-white border border-transparent'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Paquetes de Clubes</span>
            <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-300">
              {packages.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('new-package');
              setCreateFeedback(null);
            }}
            className={`press flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
              activeTab === 'new-package'
                ? 'bg-[#0f62fe] text-white border border-[#78a9ff]/40 shadow-sm ring-1 ring-[#0f62fe]/30'
                : 'text-slate-300 hover:bg-white/[0.08] hover:text-white border border-transparent'
            }`}
          >
            <Plus className="h-4 w-4" />
            <span>Nuevo Paquete</span>
          </button>

          {selectedPackage && (
            <button
              type="button"
              onClick={() => setActiveTab('codes')}
              className={`press flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                activeTab === 'codes'
                  ? 'bg-[#0f62fe] text-white border border-[#78a9ff]/40 shadow-sm ring-1 ring-[#0f62fe]/30'
                  : 'text-slate-300 hover:bg-white/[0.08] hover:text-white border border-transparent'
              }`}
            >
              <Ticket className="h-4 w-4" />
              <span>Códigos: {selectedPackage.client_name}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setActiveTab('tiers');
            }}
            className={`press flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
              activeTab === 'tiers'
                ? 'bg-[#0f62fe] text-white border border-[#78a9ff]/40 shadow-sm ring-1 ring-[#0f62fe]/30'
                : 'text-slate-300 hover:bg-white/[0.08] hover:text-white border border-transparent'
            }`}
          >
            <Percent className="h-4 w-4" />
            <span>Escala de Descuentos</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('users');
              void loadUsersList();
            }}
            className={`press flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
              activeTab === 'users'
                ? 'bg-[#0f62fe] text-white border border-[#78a9ff]/40 shadow-sm ring-1 ring-[#0f62fe]/30'
                : 'text-slate-300 hover:bg-white/[0.08] hover:text-white border border-transparent'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Usuarios & Roles</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('audit');
              void loadAuditLogs();
            }}
            className={`press flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
              activeTab === 'audit'
                ? 'bg-[#0f62fe] text-white border border-[#78a9ff]/40 shadow-sm ring-1 ring-[#0f62fe]/30'
                : 'text-slate-300 hover:bg-white/[0.08] hover:text-white border border-transparent'
            }`}
          >
            <History className="h-4 w-4" />
            <span>Auditoría</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('plans');
            }}
            className={`press flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
              activeTab === 'plans'
                ? 'bg-[#0f62fe] text-white border border-[#78a9ff]/40 shadow-sm ring-1 ring-[#0f62fe]/30'
                : 'text-slate-300 hover:bg-white/[0.08] hover:text-white border border-transparent'
            }`}
          >
            <CreditCard className="h-4 w-4" />
            <span>Tarifas & Planes</span>
          </button>
        </div>

        {/* ── Contenido de las Pestañas ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* ══════════ TAB 1: LISTADO DE PAQUETES ══════════ */}
          {activeTab === 'packages' && (
            <div className="space-y-4">
              {/* Barra de Búsqueda y Botón Nuevo */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:max-w-md">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar club, cliente o número de paquete..."
                    className="w-full rounded-xl border border-white/10 bg-slate-900/80 py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:border-[#0f62fe] focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setActiveTab('new-package');
                      setCreateFeedback(null);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Crear Paquete</span>
                  </Button>

                  <Button variant="ghost" size="sm" onClick={loadPackages}>
                    <RefreshCw className={`h-4 w-4 ${isLoadingPackages ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>

              {/* Tabla / Tarjetas de Paquetes */}
              {isLoadingPackages ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <RefreshCw className="h-8 w-8 animate-spin text-[#78a9ff] mb-2" />
                  <p className="text-xs">Cargando paquetes comerciales...</p>
                </div>
              ) : filteredPackages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-slate-400">
                  <Building2 className="mx-auto h-12 w-12 text-slate-600 mb-3" />
                  <h3 className="text-sm font-bold text-white mb-1">No hay paquetes registrados</h3>
                  <p className="text-xs max-w-sm mx-auto mb-4">
                    Crea un paquete comercial para emitir licencias con descuento para clubes o escuelas de patinaje.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setActiveTab('new-package')}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Crear Primer Paquete</span>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredPackages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="glass-panel flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/50 p-4 hover:border-white/20 transition-all"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-bold text-[#78a9ff]">
                            PKG-{String(pkg.package_number).padStart(4, '0')}
                          </span>
                          <h3 className="text-sm font-black text-white truncate">{pkg.client_name}</h3>
                          <span
                            className={`rounded-full px-2 py-0.2 text-[9px] font-black uppercase ${
                              pkg.status === 'active'
                                ? 'bg-mint/20 text-mint'
                                : 'bg-coral/20 text-coral'
                            }`}
                          >
                            {pkg.status === 'active' ? 'Activo' : pkg.status}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                          {pkg.client_email && <span>Contacto: {pkg.client_email}</span>}
                          <span>Plan: {pkg.plan === 'annual' ? 'Anual' : 'Mensual'}</span>
                          <span>Vence: {new Date(pkg.expires_at).toLocaleDateString('es-ES')}</span>
                          {pkg.payment_reference && <span>Ref: {pkg.payment_reference}</span>}
                        </div>
                      </div>

                      {/* Contador de Licencias */}
                      <div className="flex items-center gap-4 bg-slate-950/60 rounded-xl px-3.5 py-2 border border-white/5">
                        <div className="text-center">
                          <div className="text-sm font-black text-white">{pkg.total_licenses}</div>
                          <div className="text-[9px] uppercase font-bold text-slate-400">Total</div>
                        </div>
                        <div className="h-6 w-px bg-white/10" />
                        <div className="text-center">
                          <div className="text-sm font-black text-mint">{pkg.used_licenses}</div>
                          <div className="text-[9px] uppercase font-bold text-slate-400">Usadas</div>
                        </div>
                        <div className="h-6 w-px bg-white/10" />
                        <div className="text-center">
                          <div className="text-sm font-black text-[#78a9ff]">
                            {pkg.total_licenses - pkg.used_licenses}
                          </div>
                          <div className="text-[9px] uppercase font-bold text-slate-400">Disponibles</div>
                        </div>
                      </div>

                      {/* Resumen Financiero Snapshot */}
                      <div className="text-right">
                        <div className="text-xs text-slate-400">
                          Total: <strong className="text-white text-sm">${pkg.total_amount.toFixed(2)}</strong>
                        </div>
                        <div className="text-[10px] text-mint font-semibold">
                          {pkg.discount_percent > 0
                            ? `Descuento ${pkg.discount_percent}% (Ahorro $${pkg.discount_amount.toFixed(2)})`
                            : 'Sin descuento'}
                        </div>
                      </div>

                      {/* Botones de Acción */}
                      <div className="flex items-center gap-2 w-full lg:w-auto justify-end border-t lg:border-t-0 border-white/5 pt-3 lg:pt-0">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => loadPackageCodes(pkg)}
                          title="Ver y copiar códigos de activación"
                        >
                          <Ticket className="h-4 w-4" />
                          <span>Códigos</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            // Cargar códigos para descargar PDF
                            const res = await commercialLicenseService.getPackageCodes(currentUser!.email, pkg.id);
                            if (res.success) {
                              handleDownloadPdf(pkg, res.codes);
                            }
                          }}
                          title="Generar y descargar documento PDF oficial"
                        >
                          <FileText className="h-4 w-4 text-[#78a9ff]" />
                          <span className="hidden sm:inline">PDF</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRenewingPkg(pkg)}
                          title="Renovar paquete y extender accesos"
                        >
                          <RefreshCw className="h-4 w-4 text-mint" />
                          <span className="hidden sm:inline">Renovar</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══════════ TAB 2: NUEVO PAQUETE ══════════ */}
          {activeTab === 'new-package' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="border-b border-white/10 pb-3">
                <h2 className="text-base font-black text-white">Crear Paquete y Generar Licencias</h2>
                <p className="text-xs text-slate-400">
                  El sistema calculará el precio con descuento seguro en backend y generará códigos criptográficos únicos de un solo uso.
                </p>
              </div>

              <form onSubmit={handleCreatePackageSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    id="new-client-name"
                    type="text"
                    required
                    label="Nombre del Club / Entidad / Cliente"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Ej: Skate Club Ecuador"
                  />
                  <Field
                    id="new-client-email"
                    type="email"
                    label="Correo de Contacto"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    placeholder="contacto@club.com"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-300">
                      Plan de Cobertura
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setNewPlan('annual')}
                        className={`rounded-xl border py-2 text-xs font-bold transition-all ${
                          newPlan === 'annual'
                            ? 'border-[#0f62fe] bg-[#0f62fe]/15 text-[#78a9ff] ring-1 ring-[#0f62fe]/30'
                            : 'border-white/10 bg-slate-900 text-slate-400 hover:text-white'
                        }`}
                      >
                        Anual ($48 base)
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewPlan('monthly')}
                        className={`rounded-xl border py-2 text-xs font-bold transition-all ${
                          newPlan === 'monthly'
                            ? 'border-[#0f62fe] bg-[#0f62fe]/15 text-[#78a9ff] ring-1 ring-[#0f62fe]/30'
                            : 'border-white/10 bg-slate-900 text-slate-400 hover:text-white'
                        }`}
                      >
                        Mensual ($5 base)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-300">
                      Cantidad de Licencias a Emitir
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      required
                      value={newTotalLicenses}
                      onChange={(e) => setNewTotalLicenses(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/90 py-2.5 px-3 text-xs text-white focus:border-[#0f62fe] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Modo de Descuento */}
                <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-2">
                      <Tag className="h-4 w-4 text-[#78a9ff]" />
                      Modalidad de Descuento
                    </label>
                    <div className="flex rounded-xl bg-slate-950 p-1 border border-white/10">
                      <button
                        type="button"
                        onClick={() => setDiscountMode('tiered')}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-bold ${
                          discountMode === 'tiered' ? 'bg-[#0f62fe] text-white shadow-sm ring-1 ring-[#0f62fe]/30' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Escala por Volumen
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountMode('negotiated')}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-bold ${
                          discountMode === 'negotiated' ? 'bg-[#0f62fe] text-white shadow-sm ring-1 ring-[#0f62fe]/30' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Negociado / Manual
                      </button>
                    </div>
                  </div>

                  {discountMode === 'negotiated' ? (
                    <div>
                      <label className="text-[11px] text-slate-300 mb-1 block">
                        Porcentaje de Descuento Autorizado (%)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={negotiatedDiscountPercent}
                        onChange={(e) =>
                          setNegotiatedDiscountPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))
                        }
                        className="w-full rounded-xl border border-[#0f62fe]/40 bg-slate-950 py-2 px-3 text-xs text-white focus:border-[#0f62fe] focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Ejemplo: 50% de descuento directo para compras especiales de clubes.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Se aplicará automáticamente el tramo correspondiente a {newTotalLicenses} licencias según la escala comercial oficial.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    id="new-payment-ref"
                    type="text"
                    label="Referencia de Pago (Opcional)"
                    value={newPaymentRef}
                    onChange={(e) => setNewPaymentRef(e.target.value)}
                    placeholder="Ej: PayPal Order ID, Transferencia Banco"
                  />
                  <Field
                    id="new-notes"
                    type="text"
                    label="Observaciones Comerciales"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Acuerdo suscrito por..."
                  />
                </div>

                {/* Previsualización Financiera Oficial */}
                {previewPricing && (
                  <div className="rounded-2xl border border-[#0f62fe]/30 bg-[#0f62fe]/10 p-4 space-y-2">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Subtotal ({previewPricing.total_licenses} × ${previewPricing.unit_base_price.toFixed(2)}):</span>
                      <span>${previewPricing.subtotal.toFixed(2)} USD</span>
                    </div>
                    {previewPricing.discount_percent > 0 && (
                      <div className="flex justify-between text-xs text-mint font-semibold">
                        <span>Descuento aplicado ({previewPricing.discount_percent}%):</span>
                        <span>-${previewPricing.discount_amount.toFixed(2)} USD</span>
                      </div>
                    )}
                    <div className="border-t border-[#0f62fe]/20 pt-2 flex justify-between text-sm font-black text-white">
                      <span>Total Final del Paquete:</span>
                      <span className="text-[#78a9ff] text-base">${previewPricing.total_amount.toFixed(2)} USD</span>
                    </div>
                    <div className="text-[10px] text-slate-400 text-right">
                      Ahorro para el cliente: ${previewPricing.savings_amount.toFixed(2)} USD
                    </div>
                  </div>
                )}

                {createFeedback && (
                  <div
                    className={`rounded-xl p-3 text-xs font-semibold ${
                      createFeedback.type === 'success'
                        ? 'border border-mint/30 bg-mint/15 text-mint'
                        : 'border border-coral/30 bg-coral/15 text-coral'
                    }`}
                  >
                    {createFeedback.message}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="ghost" type="button" onClick={() => setActiveTab('packages')}>
                    Cancelar
                  </Button>
                  <Button variant="primary" type="submit" disabled={isCreatingPackage}>
                    {isCreatingPackage ? 'Generando Códigos...' : `Generar ${newTotalLicenses} Licencias`}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* ══════════ TAB 3: VER CÓDIGOS DE UN PAQUETE ══════════ */}
          {activeTab === 'codes' && selectedPackage && (
            <div className="space-y-4">
              {/* Encabezado del Paquete */}
              <div className="glass-panel flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#78a9ff]">
                      PKG-{String(selectedPackage.package_number).padStart(4, '0')}
                    </span>
                    <h2 className="text-base font-black text-white">{selectedPackage.client_name}</h2>
                  </div>
                  <p className="text-xs text-slate-400">
                    {packageCodes.length} licencias generadas · Vence:{' '}
                    {new Date(selectedPackage.expires_at).toLocaleDateString('es-ES')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={handleCopyAllCodes}>
                    {copiedAll ? <Check className="h-4 w-4 text-mint" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedAll ? '¡Copiados!' : 'Copiar Todos'}</span>
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleDownloadPdf(selectedPackage, packageCodes)}
                  >
                    <FileText className="h-4 w-4" />
                    <span>Descargar PDF Oficial</span>
                  </Button>
                </div>
              </div>

              {/* Lista de Códigos */}
              {isLoadingCodes ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <RefreshCw className="h-8 w-8 animate-spin text-[#78a9ff] mb-2" />
                  <p className="text-xs">Cargando códigos...</p>
                </div>
              ) : packageCodes.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  No se encontraron códigos generados para este paquete.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {packageCodes.map((codeItem, index) => (
                    <div
                      key={codeItem.id}
                      className="glass-panel flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/70 p-3 hover:border-[#0f62fe]/30 transition-all"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-500 font-mono">
                            #{String(index + 1).padStart(3, '0')}
                          </span>
                          <span className="font-mono text-xs font-black text-white tracking-wider">
                            {codeItem.code}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[10px] truncate text-slate-400">
                          {codeItem.status === 'assigned' ? (
                            <span className="text-[#78a9ff]">Asignado: {codeItem.assigned_email}</span>
                          ) : codeItem.status === 'revoked' ? (
                            <span className="text-coral">Revocado</span>
                          ) : (
                            <span className="text-mint">Disponible para activar</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopyCode(codeItem.code)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                          title="Copiar código"
                        >
                          {copiedCode === codeItem.code ? (
                            <Check className="h-3.5 w-3.5 text-mint" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>

                        {codeItem.status !== 'revoked' && (
                          <button
                            type="button"
                            onClick={() => handleRevokeCode(codeItem)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-coral/20 hover:text-coral"
                            title="Revocar código"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══════════ TAB 4: ESCALA DE DESCUENTOS ══════════ */}
          {activeTab === 'tiers' && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="border-b border-white/10 pb-3">
                <h2 className="text-base font-black text-white">Escala Oficial de Descuentos por Volumen</h2>
                <p className="text-xs text-slate-400">
                  Esta tabla define los descuentos automáticos aplicados en backend al crear paquetes de licencias según la cantidad.
                </p>
              </div>

              <div className="glass-panel overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 border-b border-white/10 text-slate-400 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="py-3 px-4">Rango de Licencias</th>
                      <th className="py-3 px-4">Descuento (%)</th>
                      <th className="py-3 px-4">Precio Anual Unitario</th>
                      <th className="py-3 px-4">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {DEFAULT_DISCOUNT_TIERS.map((tier) => {
                      const rangeLabel = tier.max_licenses
                        ? `${tier.min_licenses} a ${tier.max_licenses} licencias`
                        : `${tier.min_licenses} o más licencias`;
                      const unitDiscounted = 48.0 * (1 - tier.discount_percent / 100.0);

                      return (
                        <tr key={tier.id} className="hover:bg-white/[0.02]">
                          <td className="py-3 px-4 font-bold text-white">{rangeLabel}</td>
                          <td className="py-3 px-4 font-black text-mint">{tier.discount_percent}%</td>
                          <td className="py-3 px-4 text-slate-300">
                            ${unitDiscounted.toFixed(2)} USD / licencia
                          </td>
                          <td className="py-3 px-4">
                            <span className="rounded-full bg-mint/20 text-mint px-2 py-0.5 text-[9px] font-black uppercase">
                              Activo
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-slate-500">
                * Nota: Para compras con condiciones especiales, el administrador puede autorizar cualquier porcentaje de descuento negociado directo al crear el paquete.
              </p>
            </div>
          )}

                    {/* ══════════ TAB 6: GESTIÓN DE USUARIOS & ROLES ══════════ */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <h2 className="text-base font-black text-white">Gestión de Usuarios & Control de Roles (RBAC)</h2>
                  <p className="text-xs text-slate-400">
                    Supervisa cuentas registradas, planes de suscripción y asigna permisos de Patinador, Entrenador o Administrador.
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => void loadUsersList()} disabled={isLoadingUsers}>
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingUsers ? 'animate-spin' : ''}`} />
                  Actualizar Lista
                </Button>
              </div>

              {userFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold ${
                    userFeedback.type === 'success'
                      ? 'bg-mint/15 text-mint border border-mint/30'
                      : 'bg-coral/15 text-coral border border-coral/30'
                  }`}
                >
                  {userFeedback.message}
                </div>
              )}

              {/* Búsqueda */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por email, nombre o rol..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-[#0f62fe]"
                />
              </div>

              {/* Tabla de Usuarios */}
              {isLoadingUsers ? (
                <div className="p-8 text-center text-xs text-slate-400">Cargando directorio de usuarios...</div>
              ) : userList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 border border-white/5 rounded-2xl bg-white/[0.01]">
                  No se encontraron usuarios o la base de datos no tiene registros de usuarios adicionales.
                </div>
              ) : (
                <div className="glass-panel overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 border-b border-white/10 text-slate-400 uppercase text-[10px] font-bold">
                      <tr>
                        <th className="py-3 px-4">Usuario / Email</th>
                        <th className="py-3 px-4">Rol Actual</th>
                        <th className="py-3 px-4">Plan / Suscripción</th>
                        <th className="py-3 px-4">Registro</th>
                        <th className="py-3 px-4 text-right">Cambiar Rol</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {userList
                        .filter((u) => {
                          if (!userSearchQuery.trim()) return true;
                          const q = userSearchQuery.toLowerCase();
                          return (
                            (u.email || '').toLowerCase().includes(q) ||
                            (u.role || '').toLowerCase().includes(q) ||
                            (u.full_name || '').toLowerCase().includes(q)
                          );
                        })
                        .map((u) => {
                          const isCoach = u.role === 'coach';
                          const isAdminRole = u.role === 'superadmin' || u.role === 'club_admin';
                          const roleBadgeColor = isAdminRole
                            ? 'bg-mint/20 text-mint border-mint/30'
                            : isCoach
                            ? 'bg-coral/20 text-coral border-coral/30'
                            : 'bg-[#0f62fe]/20 text-[#78a9ff] border-[#0f62fe]/30';

                          return (
                            <tr key={u.id} className="hover:bg-white/[0.02]">
                              <td className="py-3 px-4">
                                <div className="font-bold text-white">{u.email}</div>
                                {u.full_name && <div className="text-[10px] text-slate-400">{u.full_name}</div>}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase border ${roleBadgeColor}`}>
                                  {u.role || 'skater'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-300">
                                <span className="capitalize">{u.subscription_plan || 'free'}</span>
                                {u.subscription_expires_at && (
                                  <div className="text-[10px] text-slate-500">
                                    Hasta {new Date(u.subscription_expires_at).toLocaleDateString('es-ES')}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 text-slate-400 text-[11px]">
                                {u.created_at ? new Date(u.created_at).toLocaleDateString('es-ES') : '—'}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <select
                                  value={u.role || 'skater'}
                                  onChange={(e) => handleChangeRole(u.id, e.target.value)}
                                  className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-[#0f62fe]"
                                >
                                  <option value="skater">Patinador (Skater)</option>
                                  <option value="coach">Entrenador (Coach)</option>
                                  <option value="club_admin">Administrador de Club</option>
                                  <option value="superadmin">Superadmin</option>
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══════════ TAB 5: HISTORIAL DE AUDITORÍA ══════════ */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h2 className="text-base font-black text-white">Historial de Auditoría Comercial</h2>
                  <p className="text-xs text-slate-400">
                    Registro inmutable de todas las acciones administrativas sobre paquetes, licencias y renovaciones.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={loadAuditLogs}>
                  <RefreshCw className={`h-4 w-4 ${isLoadingAudit ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              {isLoadingAudit ? (
                <div className="flex justify-center py-16 text-slate-400">
                  <RefreshCw className="h-8 w-8 animate-spin text-[#78a9ff]" />
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No hay registros de auditoría aún.
                </div>
              ) : (
                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="glass-panel flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/40 p-3 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#78a9ff] uppercase text-[10px] tracking-wider">
                            {log.action}
                          </span>
                          <span className="text-slate-400 text-[10px]">por {log.performed_by}</span>
                        </div>
                        <p className="text-slate-300 font-mono text-[11px]">
                          {JSON.stringify(log.details)}
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('es-ES')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══════════ TAB 6: TARIFAS & PLANES OFICIALES ══════════ */}
          {activeTab === 'plans' && (
            <div className="space-y-6 animate-fade-in">
              {/* Encabezado */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded-lg bg-[#0f62fe]/20 px-2 py-0.5 font-mono text-[10px] font-bold text-[#78a9ff] uppercase tracking-wider">
                      Fuente Única de Verdad
                    </span>
                    <span className="rounded-lg bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                      pricingService.ts
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-black text-white">
                    Planes y Precios Oficiales de SkateCoreo
                  </h2>
                  <p className="text-xs text-slate-400">
                    Tarifas vigentes certificadas, descuentos anuales y parámetros consumidos por Frontend, Backend y Pasarela PayPal.
                  </p>
                </div>
              </div>

              {/* Tarjetas comparativas de los 2 planes oficiales */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* 1. Plan Patinadora / Patinador */}
                <div className="rounded-2xl border border-blue-500/30 bg-slate-900/60 p-5 shadow-elevation-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                          <Sparkles className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">{SKATER_PLAN.name}</h3>
                          <span className="text-[10px] font-mono text-blue-400 uppercase">Rol: {SKATER_PLAN.role}</span>
                        </div>
                      </div>
                      <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-bold text-blue-300">
                        Ahorro {SKATER_PLAN.annualDiscountPercent}% Anual
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 mb-4">{SKATER_PLAN.tagline}</p>

                    {/* Desglose de Precios */}
                    <div className="grid grid-cols-2 gap-2.5 rounded-xl bg-slate-950/60 border border-white/5 p-3 mb-4">
                      <div>
                        <span className="block text-[10px] font-mono uppercase text-slate-400">Precio Mensual</span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-lg font-black font-mono text-white">
                            ${SKATER_PLAN.monthlyPrice.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400">USD/mes</span>
                        </div>
                        <span className="text-[10px] text-slate-500 block mt-0.5">Vigencia: 30 días</span>
                      </div>

                      <div className="border-l border-white/10 pl-3">
                        <span className="block text-[10px] font-mono uppercase text-[#78a9ff]">Plan Anual (-{SKATER_PLAN.annualDiscountPercent}%)</span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-lg font-black font-mono text-white">
                            ${SKATER_PLAN.annualPrice.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400">USD/año</span>
                        </div>
                        <span className="text-[10px] text-[#78a9ff] block font-semibold mt-0.5">
                          Ahorras ${SKATER_PLAN.annualSavings.toFixed(2)}/año
                        </span>
                      </div>
                    </div>

                    {/* Fórmulas matemáticas de auditoría */}
                    <div className="rounded-xl border border-white/5 bg-slate-950/40 p-2.5 mb-4 text-[11px] font-mono space-y-1 text-slate-400">
                      <div className="flex justify-between">
                        <span>Base 12 meses ({SKATER_PLAN.monthlyPrice.toFixed(2)} × 12):</span>
                        <span className="text-slate-300">${SKATER_PLAN.baseAnnualPrice.toFixed(2)} USD</span>
                      </div>
                      <div className="flex justify-between text-[#78a9ff]">
                        <span>Descuento aplicado ({SKATER_PLAN.annualDiscountPercent}%):</span>
                        <span>-${SKATER_PLAN.annualSavings.toFixed(2)} USD</span>
                      </div>
                      <div className="flex justify-between border-t border-white/10 pt-1 font-bold text-white">
                        <span>Total Anual Facturado:</span>
                        <span>${SKATER_PLAN.annualPrice.toFixed(2)} USD</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Equivalente mensual:</span>
                        <span>${SKATER_PLAN.monthlyEquivalent.toFixed(2)} USD/mes</span>
                      </div>
                    </div>

                    {/* Características */}
                    <div className="space-y-1.5 text-xs text-slate-300">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block mb-1">
                        Capacidades Incluidas
                      </span>
                      {SKATER_PLAN.features.map((feat, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Check className="h-3 w-3 text-[#78a9ff] shrink-0" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 2. Plan Entrenador */}
                <div className="rounded-2xl border border-pink-500/30 bg-slate-900/60 p-5 shadow-elevation-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500/20 text-pink-400">
                          <Users className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">{COACH_PLAN.name}</h3>
                          <span className="text-[10px] font-mono text-pink-400 uppercase">Rol: {COACH_PLAN.role}</span>
                        </div>
                      </div>
                      <span className="rounded-full bg-pink-500/20 px-2.5 py-0.5 text-[10px] font-bold text-pink-300">
                        Ahorro {COACH_PLAN.annualDiscountPercent}% Anual
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 mb-4">{COACH_PLAN.tagline}</p>

                    {/* Desglose de Precios */}
                    <div className="grid grid-cols-2 gap-2.5 rounded-xl bg-slate-950/60 border border-white/5 p-3 mb-4">
                      <div>
                        <span className="block text-[10px] font-mono uppercase text-slate-400">Precio Mensual</span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-lg font-black font-mono text-white">
                            ${COACH_PLAN.monthlyPrice.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400">USD/mes</span>
                        </div>
                        <span className="text-[10px] text-slate-500 block mt-0.5">Vigencia: 30 días</span>
                      </div>

                      <div className="border-l border-white/10 pl-3">
                        <span className="block text-[10px] font-mono uppercase text-pink-400">Plan Anual (-{COACH_PLAN.annualDiscountPercent}%)</span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-lg font-black font-mono text-white">
                            ${COACH_PLAN.annualPrice.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400">USD/año</span>
                        </div>
                        <span className="text-[10px] text-pink-400 block font-semibold mt-0.5">
                          Ahorras ${COACH_PLAN.annualSavings.toFixed(2)}/año
                        </span>
                      </div>
                    </div>

                    {/* Fórmulas matemáticas de auditoría */}
                    <div className="rounded-xl border border-white/5 bg-slate-950/40 p-2.5 mb-4 text-[11px] font-mono space-y-1 text-slate-400">
                      <div className="flex justify-between">
                        <span>Base 12 meses ({COACH_PLAN.monthlyPrice.toFixed(2)} × 12):</span>
                        <span className="text-slate-300">${COACH_PLAN.baseAnnualPrice.toFixed(2)} USD</span>
                      </div>
                      <div className="flex justify-between text-pink-400">
                        <span>Descuento aplicado ({COACH_PLAN.annualDiscountPercent}%):</span>
                        <span>-${COACH_PLAN.annualSavings.toFixed(2)} USD</span>
                      </div>
                      <div className="flex justify-between border-t border-white/10 pt-1 font-bold text-white">
                        <span>Total Anual Facturado:</span>
                        <span>${COACH_PLAN.annualPrice.toFixed(2)} USD</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Equivalente mensual:</span>
                        <span>${COACH_PLAN.monthlyEquivalent.toFixed(2)} USD/mes</span>
                      </div>
                    </div>

                    {/* Características */}
                    <div className="space-y-1.5 text-xs text-slate-300">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block mb-1">
                        Capacidades Incluidas
                      </span>
                      {COACH_PLAN.features.map((feat, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Check className="h-3 w-3 text-pink-400 shrink-0" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Matriz de Reglas Comerciales de Auditoría */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#78a9ff]" />
                  Reglas de Facturación, Separación de Roles y Pasarela PayPal
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="border-b border-white/10 text-[11px] uppercase text-slate-500">
                      <tr>
                        <th className="pb-2">Plan</th>
                        <th className="pb-2">Rol Asignado</th>
                        <th className="pb-2">Período</th>
                        <th className="pb-2">Importe Exacto</th>
                        <th className="pb-2">Días Otorgados</th>
                        <th className="pb-2">Validación Backend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                      <tr>
                        <td className="py-2 font-bold text-white">Patinador Mensual</td>
                        <td className="py-2 text-blue-400">skater</td>
                        <td className="py-2">monthly</td>
                        <td className="py-2 font-bold text-[#78a9ff]">$4.99 USD</td>
                        <td className="py-2">30 días</td>
                        <td className="py-2 text-mint">Verificado por monto PayPal</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-bold text-white">Patinador Anual</td>
                        <td className="py-2 text-blue-400">skater</td>
                        <td className="py-2">annual</td>
                        <td className="py-2 font-bold text-[#78a9ff]">$47.90 USD</td>
                        <td className="py-2">365 días</td>
                        <td className="py-2 text-mint">Verificado (-20% sobre $59.88)</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-bold text-white">Entrenador Mensual</td>
                        <td className="py-2 text-pink-400">coach</td>
                        <td className="py-2">monthly</td>
                        <td className="py-2 font-bold text-[#78a9ff]">$9.99 USD</td>
                        <td className="py-2">30 días</td>
                        <td className="py-2 text-mint">Verificado por monto PayPal</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-bold text-white">Entrenador Anual</td>
                        <td className="py-2 text-pink-400">coach</td>
                        <td className="py-2">annual</td>
                        <td className="py-2 font-bold text-[#78a9ff]">$83.92 USD</td>
                        <td className="py-2">365 días</td>
                        <td className="py-2 text-mint">Verificado (-30% sobre $119.88)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Secundario: Renovar Paquete ── */}
      {renewingPkg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="glass-panel w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="text-sm font-black text-white">Renovar Paquete de Licencias</h3>
              <button
                type="button"
                onClick={() => setRenewingPkg(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Renovar extenderá la vigencia de todas las licencias y de las cuentas de los atletas/entrenadores activos de{' '}
              <strong className="text-white">{renewingPkg.client_name}</strong> sin crear cuentas duplicadas.
            </p>

            <form onSubmit={handleRenewSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-300 mb-1 block">Días a Extender</label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={renewDays}
                  onChange={(e) => setRenewDays(parseInt(e.target.value) || 365)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 py-2 px-3 text-xs text-white"
                />
              </div>

              <Field
                id="renew-ref"
                type="text"
                label="Referencia del Nuevo Pago (Opcional)"
                value={renewPaymentRef}
                onChange={(e) => setRenewPaymentRef(e.target.value)}
                placeholder="ID de PayPal o transferencia"
              />

              {renewFeedback && (
                <div
                  className={`rounded-xl p-2.5 text-xs font-semibold ${
                    renewFeedback.type === 'success'
                      ? 'border border-mint/30 bg-mint/15 text-mint'
                      : 'border border-coral/30 bg-coral/15 text-coral'
                  }`}
                >
                  {renewFeedback.message}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" type="button" onClick={() => setRenewingPkg(null)}>
                  Cancelar
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={isRenewing}>
                  {isRenewing ? 'Renovando...' : 'Confirmar Renovación'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
