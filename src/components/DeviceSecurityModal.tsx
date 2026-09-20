/**
 * DeviceSecurityModal.tsx — Gestión de Dispositivos Conectados (Anti-Sharing) y Cambio de Contraseña
 *
 * Muestra los 3 slots de hardware autorizados (1 Celular, 1 Tablet, 1 Computadora)
 * y permite desvincular equipos para liberar cupos o actualizar la contraseña de la cuenta.
 */

import React, { useEffect, useState } from 'react';
import { 
  Smartphone, 
  Tablet, 
  Laptop, 
  ShieldCheck, 
  X, 
  KeyRound, 
  Trash2, 
  AlertCircle, 
  CheckCircle2,
  Calendar,
  Lock
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { getDeviceId } from '../utils/deviceDetector';

interface DeviceSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeviceSecurityModal: React.FC<DeviceSecurityModalProps> = ({ isOpen, onClose }) => {
  const { 
    user, 
    devices, 
    fetchDevices, 
    unlinkDevice, 
    changePassword,
    getFormattedExpiration 
  } = useAuthStore();

  const [currentDeviceId] = useState(() => getDeviceId());
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [unlinkFeedback, setUnlinkFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Formulario Cambio de Clave
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchDevices();
      setUnlinkFeedback(null);
      setPasswordFeedback(null);
    }
  }, [isOpen, fetchDevices]);

  if (!isOpen) return null;

  const mobileDevice = devices.find((d) => d.device_type === 'mobile' && d.is_active);
  const tabletDevice = devices.find((d) => d.device_type === 'tablet' && d.is_active);
  const desktopDevice = devices.find((d) => d.device_type === 'desktop' && d.is_active);

  const handleUnlink = async (deviceIdToUnlink: string, label: string) => {
    if (!window.confirm(`¿Seguro que deseas desvincular este ${label}? Deberá volver a iniciar sesión para usar SkateCoreo.`)) {
      return;
    }

    setUnlinkingId(deviceIdToUnlink);
    setUnlinkFeedback(null);

    const res = await unlinkDevice(deviceIdToUnlink);
    setUnlinkingId(null);

    if (res.success) {
      setUnlinkFeedback({ type: 'success', message: `${label} desvinculado con éxito.` });
    } else {
      setUnlinkFeedback({ type: 'error', message: res.message });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);

    if (newPassword.length < 6) {
      setPasswordFeedback({ type: 'error', message: 'La nueva contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: 'error', message: 'Las contraseñas no coinciden.' });
      return;
    }

    setPasswordLoading(true);
    const res = await changePassword(oldPassword, newPassword);
    setPasswordLoading(false);

    if (res.success) {
      setPasswordFeedback({ type: 'success', message: '¡Contraseña actualizada con éxito!' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setShowPasswordForm(false), 2000);
    } else {
      setPasswordFeedback({ type: 'error', message: res.message });
    }
  };

  const renderSlot = (
    title: string,
    _type: 'mobile' | 'tablet' | 'desktop',
    device: typeof mobileDevice,
    Icon: any
  ) => {
    const isThisDevice = device && device.device_id === currentDeviceId;

    return (
      <div className={`p-3.5 rounded-2xl border transition-all ${
        device 
          ? 'bg-slate-900/80 border-cyan/30' 
          : 'bg-slate-950/40 border-dashed border-white/10'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              device ? 'bg-cyan/15 text-cyan' : 'bg-slate-800 text-slate-500'
            }`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-bold text-white">{title}</h4>
                {device && isThisDevice && (
                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-mint/20 text-mint border border-mint/30">
                    Este Equipo
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {device ? (device.device_name || 'Conectado') : 'Slot libre (Sin equipo vinculado)'}
              </p>
            </div>
          </div>

          <div>
            {device ? (
              <button
                type="button"
                disabled={unlinkingId === (device.id || device.device_id)}
                onClick={() => handleUnlink(device.id || device.device_id, title)}
                className="px-2.5 py-1.5 rounded-xl bg-coral/15 hover:bg-coral text-coral hover:text-white border border-coral/30 text-[10px] font-bold flex items-center gap-1 transition-all disabled:opacity-40"
              >
                <Trash2 className="w-3 h-3" />
                <span>{unlinkingId === (device.id || device.device_id) ? 'Liberando...' : 'Desvincular'}</span>
              </button>
            ) : (
              <span className="text-[10px] font-medium text-slate-500 bg-white/5 px-2.5 py-1 rounded-lg">
                Disponible
              </span>
            )}
          </div>
        </div>

        {device && (
          <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
            <span>Última actividad:</span>
            <span className="font-mono text-slate-300">
              {new Date(device.last_login).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl text-white my-auto max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan/15 text-cyan flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Mis Dispositivos &amp; Seguridad</h3>
              <p className="text-[10px] text-slate-400">Control estricto anti-piratería (Máx. 3 equipos)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Resumen de Cuenta */}
        <div className="mt-4 p-3 rounded-2xl bg-slate-950/60 border border-white/5 flex items-center justify-between text-xs">
          <div>
            <div className="text-[10px] text-slate-400">Cuenta Activa:</div>
            <div className="font-bold text-white truncate max-w-[200px]" title={user?.email}>
              {user?.email}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1">
              <Calendar className="w-3 h-3 text-cyan" />
              <span>Vencimiento:</span>
            </div>
            <div className="font-mono text-[11px] font-bold text-mint">
              {getFormattedExpiration() || 'Activo'}
            </div>
          </div>
        </div>

        {/* Feedback de Desvinculación */}
        {unlinkFeedback && (
          <div className={`mt-3 p-2.5 rounded-xl text-[11px] font-medium flex items-center gap-2 ${
            unlinkFeedback.type === 'success' 
              ? 'bg-mint/15 text-mint border border-mint/30' 
              : 'bg-coral/15 text-coral border border-coral/30'
          }`}>
            {unlinkFeedback.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            <span>{unlinkFeedback.message}</span>
          </div>
        )}

        {/* 3 Slots de Hardware */}
        <div className="mt-4 space-y-2.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Dispositivos Autorizados (1 por categoría)
          </div>

          {renderSlot('1. Teléfono Celular', 'mobile', mobileDevice, Smartphone)}
          {renderSlot('2. Tablet', 'tablet', tabletDevice, Tablet)}
          {renderSlot('3. Computadora / PC', 'desktop', desktopDevice, Laptop)}
        </div>

        <p className="mt-3 text-[10px] text-slate-400 leading-relaxed text-center">
          ℹ️ La regla de hardware es estricta: solo se permite 1 celular, 1 tablet y 1 computadora por cuenta. Si compras un teléfono nuevo, desvincula el anterior aquí para liberar el slot.
        </p>

        {/* Sección Cambio de Contraseña */}
        <div className="mt-5 pt-4 border-t border-white/10">
          {!showPasswordForm ? (
            <button
              type="button"
              onClick={() => setShowPasswordForm(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 border border-white/10 text-xs font-bold text-slate-200 hover:text-white flex items-center justify-center gap-2 transition-all"
            >
              <KeyRound className="w-3.5 h-3.5 text-cyan" />
              <span>Cambiar Mi Contraseña</span>
            </button>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-2.5 bg-slate-950/80 p-3.5 rounded-2xl border border-white/10">
              <div className="flex items-center justify-between text-xs pb-1 border-b border-white/5">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-cyan" />
                  Actualizar Contraseña
                </span>
                <button
                  type="button"
                  onClick={() => setShowPasswordForm(false)}
                  className="text-[10px] text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
              </div>

              <div>
                <input
                  type="password"
                  required
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Contraseña actual"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan"
                />
              </div>

              <div>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nueva contraseña (mínimo 6 caracteres)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan"
                />
              </div>

              <div>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmar nueva contraseña"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan"
                />
              </div>

              {passwordFeedback && (
                <div className={`p-2 rounded-lg text-[10px] font-medium flex items-center gap-1.5 ${
                  passwordFeedback.type === 'success' ? 'bg-mint/15 text-mint' : 'bg-coral/15 text-coral'
                }`}>
                  {passwordFeedback.type === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  <span>{passwordFeedback.message}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={passwordLoading}
                className="w-full py-2 rounded-xl bg-cyan text-slate-950 font-bold text-xs hover:bg-cyan/90 transition-all disabled:opacity-50"
              >
                {passwordLoading ? 'Guardando...' : 'Guardar Nueva Contraseña'}
              </button>
            </form>
          )}
        </div>

        {/* Botón Cerrar */}
        <div className="mt-4 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
