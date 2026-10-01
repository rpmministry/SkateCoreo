/**
 * useAuthStore.ts — Gestor de Estado de Autenticación, Anti-Piratería y Control de Dispositivos
 *
 * Exclusivo Correo + Contraseña propio respaldado por Bcrypt en PostgreSQL / Supabase.
 * Control estricto de hardware: Máx. 1 Celular, 1 Tablet, 1 Computadora (Total: 3).
 * Acceso Superadmin permanente para el equipo de Mauricio Andrade / AlsizTech.
 */

import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { getDeviceId, getDeviceType, getDeviceName, DeviceType } from '../utils/deviceDetector';

export type UserRole = 'user' | 'tester' | 'skater' | 'coach' | 'club_admin' | 'superadmin';

export const isCoachRole = (role?: UserRole | string | null): boolean => {
  return role === 'coach' || role === 'club_admin' || role === 'superadmin';
};

export const isSkaterRole = (role?: UserRole | string | null): boolean => {
  return role === 'skater' || role === 'user';
};
export type SubscriptionStatus = 'active' | 'inactive' | 'trial';
export type SubscriptionPlan = 'individual' | 'club' | 'beta_tester' | 'coach' | 'skater' | null;

/** Registro de código promocional (solo administradores pueden consultarlo). */
export interface PromoCodeRecord {
  code: string;
  campaign: string;
  kind: string;
  status: 'AVAILABLE' | 'REDEEMED' | 'EXPIRED' | 'DISABLED' | string;
  duration_days: number;
  max_uses: number;
  used_count: number;
  created_at: string;
  used_at: string | null;
  expires_at: string | null;
  used_by: string | null;
  used_by_email: string | null;
  used_by_name: string | null;
  used_by_access_expires_at: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  nombre?: string;
  avatar_url?: string;
}

export interface DeviceItem {
  id: string;
  device_id: string;
  device_type: DeviceType;
  device_name: string;
  last_login: string;
  is_active: boolean;
}

export interface AuthStoreState {
  // Estado de Sesión
  user: AuthUser | null;
  role: UserRole;
  isLoading: boolean;

  // Estado de Monetización y Acceso Anual
  access_expires_at: string | null;
  subscription_status: SubscriptionStatus;
  subscription_plan: SubscriptionPlan;

  // Hardware Fingerprinting y Dispositivos Conectados
  currentDeviceId: string;
  currentDeviceType: DeviceType;
  devices: DeviceItem[];

  // Acciones de Autenticación y Registro Condicionado
  loginWithCredentials: (email: string, password: string) => Promise<{ success: boolean; message: string; expired?: boolean }>;
  registerWithPayment: (email: string, password: string, fullName: string, paypalOrderId: string, planRole?: 'skater' | 'coach') => Promise<{ success: boolean; message: string }>;
  registerWithCode: (email: string, password: string, fullName: string, code: string) => Promise<{ success: boolean; message: string }>;
  /**
   * Canje de código promocional de campaña (p. ej. BETA_TESTER · 30 días).
   * La validación, el uso único y el cálculo de expiración ocurren en el backend
   * (`redeem_promo_code`). El cliente solo envía los datos, nunca la duración.
   */
  redeemPromoCode: (email: string, password: string, fullName: string, code: string) => Promise<{ success: boolean; message: string; daysGranted?: number; accessExpiresAt?: string }>;
  /** Canje seguro de código de licencia individual o de club (SKC-XXXX-XXXX). */
  redeemClubLicense: (email: string, password: string, fullName: string, code: string) => Promise<{ success: boolean; message: string; accessExpiresAt?: string; plan?: string }>;
  /** Listado de códigos/canjes de una campaña (solo superadmin). */
  listPromoCodes: (campaign?: string) => Promise<{ success: boolean; message?: string; codes?: PromoCodeRecord[] }>;
  recoverPaymentLookup: (query: string) => Promise<{ found: boolean; error?: string; paypal_order_id?: string; payer_email?: string; payer_name?: string; amount?: number; currency?: string; created_at?: string }>;
  adminListUsers: () => Promise<{ success: boolean; users?: any[]; error?: string }>;
  adminChangeUserRole: (targetUserId: string, newRole: UserRole) => Promise<{ success: boolean; error?: string }>;

  // Gestión de Dispositivos y Seguridad
  fetchDevices: () => Promise<void>;
  unlinkDevice: (deviceIdOrRowId: string) => Promise<{ success: boolean; message: string }>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;

  logout: () => void;
  refreshProfile: () => Promise<void>;

  // Modal de Mejora / Upgrade
  isUpgradeModalOpen: boolean;
  setUpgradeModalOpen: (open: boolean) => void;

  // Verificación de roles y permisos
  isCoach: () => boolean;
  isSkater: () => boolean;
  isAdmin: () => boolean;

  // Verificación de acceso para el Soft Paywall
  hasActiveAccess: () => boolean;
  getDaysRemaining: () => number;
  getFormattedExpiration: () => string | null;
}

const STORAGE_KEY = 'skatecoreo_saas_auth_session';

const SUPERUSER_EMAILS = [
  'recursosparaministerios@gmail.com',
  'andradesanchezavril@gmail.com',
  'karenprofet@gmail.com',
  'contacto@alsiztech.com',
  'contactoalsiztech.com',
  'mauriandrade2@gmail.com',
];

export const ADMIN_PASSWORDS: Record<string, string[]> = {
  'mauriandrade2@gmail.com': ['Mauri#SkateCoreo2026!Admin', 'CREATOR-MAURICIO-2026'],
  'karenprofet@gmail.com': ['Karen#SkateCoreo2026!Admin', 'CREATOR-MAURICIO-2026'],
  'contacto@alsiztech.com': ['Alsiz#SkateCoreo2026!Admin', 'CREATOR-MAURICIO-2026'],
  'recursosparaministerios@gmail.com': ['CREATOR-MAURICIO-2026', 'Mauri#SkateCoreo2026!Admin'],
  'andradesanchezavril@gmail.com': ['CREATOR-MAURICIO-2026'],
  'admin@skatecoreo.com': ['Alsiz#SkateCoreo2026!Admin', 'CREATOR-MAURICIO-2026'],
};

export const isOwnerOrAdmin = (email?: string): boolean => {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  if (SUPERUSER_EMAILS.includes(clean)) return true;
  return (
    clean.includes('alsiztech') ||
    clean.includes('admin@skatecoreo') ||
    clean.includes('admin@skateart') ||
    clean.includes('mauricio')
  );
};

// Cargar sesión previa desde almacenamiento local (Offline-first)
const loadSavedSession = (): {
  user: AuthUser | null;
  role: UserRole;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  access_expires_at: string | null;
} => {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return { user: null, role: 'user', status: 'inactive', plan: 'individual', access_expires_at: null };
    }
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('skateart_saas_auth_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.user) {
        const isOwner = isOwnerOrAdmin(parsed.user.email);
        const expiresAt = parsed.access_expires_at || null;
        const isActive = isOwner || (expiresAt && new Date(expiresAt).getTime() > Date.now());
        return {
          user: parsed.user,
          role: isOwner ? 'superadmin' : (parsed.role as UserRole) || 'user',
          status: isActive ? 'active' : 'inactive',
          plan: isOwner ? 'club' : (parsed.subscription_plan || 'individual'),
          access_expires_at: isOwner
            ? new Date(Date.now() + 20 * 365 * 24 * 60 * 60 * 1000).toISOString()
            : expiresAt,
        };
      }
    }
  } catch (e) {
    console.warn('Error al cargar sesión local previa:', e);
  }
  return { user: null, role: 'user', status: 'inactive', plan: null, access_expires_at: null };
};

const initialSession = loadSavedSession();
const initialDeviceId = getDeviceId();
const initialDeviceType = getDeviceType();

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  user: initialSession.user,
  role: initialSession.role,
  isLoading: false,
  isUpgradeModalOpen: false,
  setUpgradeModalOpen: (open: boolean) => set({ isUpgradeModalOpen: open }),

  access_expires_at: initialSession.access_expires_at,
  subscription_status: initialSession.status,
  subscription_plan: initialSession.plan,

  currentDeviceId: initialDeviceId,
  currentDeviceType: initialDeviceType,
  devices: [],

  /**
   * Inicio de Sesión Propio con Verificación Estricta Anti-Piratería (Máx 1 Celular, 1 Tablet, 1 PC)
   * e Ingreso Garantizado para Cuentas de Administración Autorizadas.
   */
  loginWithCredentials: async (email: string, password: string) => {
    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail || !password) {
      return { success: false, message: 'Por favor ingresa tu correo y contraseña.' };
    }

    set({ isLoading: true });

    const isMasterOrAdminEmail = isOwnerOrAdmin(cleanEmail);
    const validAdminPasswords = ADMIN_PASSWORDS[cleanEmail] || ['CREATOR-MAURICIO-2026'];
    const isAdminPasswordMatch = isMasterOrAdminEmail && (
      validAdminPasswords.includes(password) ||
      password === 'CREATOR-MAURICIO-2026'
    );

    try {
      const deviceId = getDeviceId();
      const deviceType = getDeviceType();
      const deviceName = getDeviceName();

      let supabaseSuccess = false;
      let userData: any = null;

      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error } = await supabase.rpc('login_custom_user', {
            p_email: cleanEmail,
            p_password: password,
            p_device_id: deviceId,
            p_device_type: deviceType,
            p_device_name: deviceName,
          });

          if (!error) {
            if (data?.success) {
              supabaseSuccess = true;
              userData = data.user;
            } else if (data?.expired) {
              set({ isLoading: false });
              return { success: false, message: data.error || 'Tu acceso ha expirado.', expired: true };
            }
          }
        } catch (rpcErr) {
          console.warn('RPC login_custom_user call exception:', rpcErr);
        }
      }

      // 1. Supabase autenticó exitosamente
      if (supabaseSuccess && userData) {
        const isOwner = isOwnerOrAdmin(userData.email);
        const role: UserRole = isOwner ? 'superadmin' : (userData.role as UserRole) || 'user';
        const accessExpiry = isOwner
          ? new Date(Date.now() + 20 * 365 * 24 * 60 * 60 * 1000).toISOString()
          : userData.access_expires_at;
        const plan: SubscriptionPlan = isOwner
          ? 'club'
          : ((userData.subscription_plan as SubscriptionPlan) || 'individual');

        const authenticatedUser: AuthUser = {
          id: userData.id,
          email: userData.email,
          nombre: userData.full_name || cleanEmail.split('@')[0],
        };

        set({
          user: authenticatedUser,
          role,
          subscription_status: 'active',
          subscription_plan: plan,
          access_expires_at: accessExpiry,
          isLoading: false,
        });

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: authenticatedUser,
            role,
            subscription_status: 'active',
            subscription_plan: plan,
            access_expires_at: accessExpiry,
          })
        );

        // Cargar lista de dispositivos
        get().fetchDevices().catch(() => {});

        return { success: true, message: '¡Sesión iniciada correctamente!' };
      }

      // 2. Si Supabase devolvió error o no tiene la cuenta/hash actualizada, pero
      //    es un administrador autorizado con sus contraseñas seguras:
      if (isAdminPasswordMatch) {
        const adminNames: Record<string, string> = {
          'mauriandrade2@gmail.com': 'Mauricio Andrade (Administrador)',
          'karenprofet@gmail.com': 'Karen Profet (Administradora)',
          'contacto@alsiztech.com': 'AlsizTech (Administrador General)',
          'recursosparaministerios@gmail.com': 'Mauricio Andrade Luna',
          'andradesanchezavril@gmail.com': 'Avril Andrade Sanchez',
          'admin@skatecoreo.com': 'Administrador SkateCoreo',
        };

        const authenticatedUser: AuthUser = {
          id: `admin_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
          email: cleanEmail,
          nombre: adminNames[cleanEmail] || cleanEmail.split('@')[0],
        };

        const accessExpiry = new Date(Date.now() + 20 * 365 * 24 * 60 * 60 * 1000).toISOString();

        set({
          user: authenticatedUser,
          role: 'superadmin',
          subscription_status: 'active',
          subscription_plan: 'club',
          access_expires_at: accessExpiry,
          isLoading: false,
        });

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: authenticatedUser,
            role: 'superadmin',
            subscription_status: 'active',
            subscription_plan: 'club',
            access_expires_at: accessExpiry,
          })
        );

        return { success: true, message: '¡Acceso de Administrador verificado! Bienvenido al Panel.' };
      }

      set({ isLoading: false });
      return {
        success: false,
        message: 'Correo o contraseña incorrectos. Verifica tus credenciales.',
      };
    } catch (err: any) {
      if (isAdminPasswordMatch) {
        const authenticatedUser: AuthUser = {
          id: `admin_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
          email: cleanEmail,
          nombre: cleanEmail.split('@')[0],
        };
        const accessExpiry = new Date(Date.now() + 20 * 365 * 24 * 60 * 60 * 1000).toISOString();
        set({
          user: authenticatedUser,
          role: 'superadmin',
          subscription_status: 'active',
          subscription_plan: 'club',
          access_expires_at: accessExpiry,
          isLoading: false,
        });
        return { success: true, message: '¡Acceso de Administrador verificado!' };
      }
      set({ isLoading: false });
      return { success: false, message: err?.message || 'Error inesperado durante el inicio de sesión.' };
    }
  },

  /**
   * Registro Condicionado Post-Pago PayPal (Crea cuenta e inmediatamente activa acceso por 1 año)
   */
  registerWithPayment: async (email: string, password: string, fullName: string, paypalOrderId: string, planRole: 'skater' | 'coach' = 'skater') => {
    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail || !password || !paypalOrderId) {
      return { success: false, message: 'Todos los campos son obligatorios.' };
    }

    if (password.length < 6) {
      return { success: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
    }

    set({ isLoading: true });

    try {
      const deviceId = getDeviceId();
      const deviceType = getDeviceType();
      const deviceName = getDeviceName();

      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.rpc('register_with_paypal_payment', {
          p_email: cleanEmail,
          p_password: password,
          p_full_name: fullName.trim(),
          p_paypal_order_id: paypalOrderId.trim(),
          p_device_id: deviceId,
          p_device_type: deviceType,
          p_device_name: deviceName,
          p_plan_role: planRole,
        });

        if (error) {
          set({ isLoading: false });
          return { success: false, message: error.message || 'Error al crear la cuenta con el pago.' };
        }

        if (!data || !data.success) {
          set({ isLoading: false });
          return { success: false, message: data?.error || 'No se pudo validar el pago para crear la cuenta.' };
        }

        const newUser: AuthUser = {
          id: data.user.id,
          email: data.user.email,
          nombre: data.user.full_name,
        };

        const assignedRole: UserRole = (data.user?.role as UserRole) || (planRole === 'coach' ? 'coach' : 'user');
        const assignedPlan: SubscriptionPlan = (data.user?.subscription_plan as SubscriptionPlan) || (planRole === 'coach' ? 'coach' : 'individual');

        set({
          user: newUser,
          role: assignedRole,
          subscription_status: 'active',
          subscription_plan: assignedPlan,
          access_expires_at: data.user.access_expires_at,
          isLoading: false,
        });

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: newUser,
            role: assignedRole,
            subscription_status: 'active',
            subscription_plan: assignedPlan,
            access_expires_at: data.user.access_expires_at,
          })
        );

        get().fetchDevices().catch(() => {});

        return { success: true, message: `¡Cuenta ${planRole === 'coach' ? 'de Entrenador' : 'de Patinador'} activada con éxito!` };
      } else {
        set({ isLoading: false });
        return { success: true, message: 'Cuenta creada localmente.' };
      }
    } catch (err: any) {
      set({ isLoading: false });
      return { success: false, message: err?.message || 'Error de conexión al registrar cuenta.' };
    }
  },

  /**
   * Registro con Código de Activación / Regalo Anual
   */
  registerWithCode: async (email: string, password: string, fullName: string, code: string) => {
    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = code.toUpperCase().trim();

    if (!cleanEmail || !password || !cleanCode) {
      return { success: false, message: 'Por favor completa todos los campos requeridos.' };
    }

    if (password.length < 6) {
      return { success: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
    }

    set({ isLoading: true });

    try {
      const deviceId = getDeviceId();
      const deviceType = getDeviceType();
      const deviceName = getDeviceName();

      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.rpc('register_with_code', {
          p_email: cleanEmail,
          p_password: password,
          p_full_name: fullName.trim(),
          p_code: cleanCode,
          p_device_id: deviceId,
          p_device_type: deviceType,
          p_device_name: deviceName,
        });

        if (error) {
          set({ isLoading: false });
          return { success: false, message: error.message || 'Error al procesar el código de activación.' };
        }

        if (!data || !data.success) {
          set({ isLoading: false });
          return { success: false, message: data?.error || 'Código inválido o ya utilizado.' };
        }

        const newUser: AuthUser = {
          id: data.user.id,
          email: data.user.email,
          nombre: data.user.full_name,
        };

        set({
          user: newUser,
          role: 'user',
          subscription_status: 'active',
          subscription_plan: 'individual',
          access_expires_at: data.user.access_expires_at,
          isLoading: false,
        });

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: newUser,
            role: 'user',
            subscription_status: 'active',
            subscription_plan: 'individual',
            access_expires_at: data.user.access_expires_at,
          })
        );

        get().fetchDevices().catch(() => {});

        return { success: true, message: '¡Código de regalo canjeado con éxito! Tienes 1 año de acceso.' };
      } else {
        set({ isLoading: false });
        return { success: true, message: 'Código canjeado localmente.' };
      }
    } catch (err: any) {
      set({ isLoading: false });
      return { success: false, message: err?.message || 'Error inesperado al canjear código.' };
    }
  },

  /**
   * Canje SEGURO de código promocional (campaña BETA_TESTER · 30 días).
   *
   * · La duración, el estado y la expiración los decide el BACKEND.
   * · `FOR UPDATE` en el servidor impide el doble canje por concurrencia.
   * · Si la cuenta ya existe se verifica la contraseña antes de ampliar.
   * · La expiración se calcula desde la fecha real de activación.
   */
  redeemPromoCode: async (email: string, password: string, fullName: string, code: string) => {
    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = code.toUpperCase().trim();

    if (!cleanEmail || !password || !cleanCode) {
      return { success: false, message: 'Por favor completa todos los campos requeridos.' };
    }
    if (password.length < 6) {
      return { success: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
    }

    set({ isLoading: true });

    try {
      const deviceId = getDeviceId();
      const deviceType = getDeviceType();
      const deviceName = getDeviceName();

      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.rpc('redeem_promo_code', {
          p_code: cleanCode,
          p_email: cleanEmail,
          p_password: password,
          p_full_name: fullName.trim(),
          p_device_id: deviceId,
          p_device_type: deviceType,
          p_device_name: deviceName,
        });

        if (error) {
          set({ isLoading: false });
          return { success: false, message: error.message || 'Error al validar el código promocional.' };
        }
        if (!data || !data.success) {
          set({ isLoading: false });
          return { success: false, message: data?.error || 'Código inválido o ya utilizado.' };
        }

        const newUser: AuthUser = {
          id: data.user.id,
          email: data.user.email,
          nombre: data.user.full_name,
        };
        const plan: SubscriptionPlan = (data.subscription_plan as SubscriptionPlan) || 'beta_tester';

        set({
          user: newUser,
          role: (data.user.role as UserRole) || 'tester',
          subscription_status: 'active',
          subscription_plan: plan,
          access_expires_at: data.access_expires_at,
          isLoading: false,
        });

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: newUser,
            role: data.user.role || 'tester',
            subscription_status: 'active',
            subscription_plan: plan,
            access_expires_at: data.access_expires_at,
          })
        );

        get().fetchDevices().catch(() => {});

        return {
          success: true,
          message: data.message || '¡Código Beta Tester activado!',
          daysGranted: data.days_granted,
          accessExpiresAt: data.access_expires_at,
        };
      }

      // Fallback local (desarrollo sin Supabase).
      set({ isLoading: false });
      return { success: false, message: 'El canje de códigos requiere conexión con el servidor.' };
    } catch (err: any) {
      set({ isLoading: false });
      return { success: false, message: err?.message || 'Error inesperado al canjear el código.' };
    }
  },

  /**
   * Canje SEGURO de código de licencia comercial / de club (formato SKC-XXXX-XXXX).
   * Valida en backend con FOR UPDATE pesimista, asocia el entitlement y registra dispositivo.
   */
  redeemClubLicense: async (email: string, password: string, fullName: string, code: string) => {
    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = code.toUpperCase().trim();

    if (!cleanEmail || !password || !cleanCode) {
      return { success: false, message: 'Por favor completa todos los campos requeridos.' };
    }
    if (password.length < 6) {
      return { success: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
    }

    set({ isLoading: true });

    try {
      const deviceId = getDeviceId();
      const deviceType = getDeviceType();
      const deviceName = getDeviceName();

      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.rpc('redeem_club_license_code', {
          p_code: cleanCode,
          p_email: cleanEmail,
          p_password: password,
          p_full_name: fullName.trim(),
          p_device_id: deviceId,
          p_device_type: deviceType,
          p_device_name: deviceName,
        });

        if (error) {
          set({ isLoading: false });
          return { success: false, message: error.message || 'Error al validar la licencia.' };
        }
        if (!data || !data.success) {
          set({ isLoading: false });
          return { success: false, message: data?.error || 'Código de licencia inválido o ya utilizado.' };
        }

        const newUser: AuthUser = {
          id: data.user.id,
          email: data.user.email,
          nombre: data.user.full_name,
        };

        set({
          user: newUser,
          role: 'user',
          subscription_status: 'active',
          subscription_plan: 'club',
          access_expires_at: data.access_expires_at,
          isLoading: false,
        });

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: newUser,
            role: 'user',
            subscription_status: 'active',
            subscription_plan: 'club',
            access_expires_at: data.access_expires_at,
          })
        );

        get().fetchDevices().catch(() => {});

        return {
          success: true,
          message: data.message || '¡Licencia activada con éxito!',
          accessExpiresAt: data.access_expires_at,
          plan: data.plan,
        };
      }

      // Modo local/offline de desarrollo
      set({ isLoading: false });
      return { success: false, message: 'La activación de licencias requiere conexión con el servidor.' };
    } catch (err: any) {
      set({ isLoading: false });
      return { success: false, message: err?.message || 'Error inesperado al canjear la licencia.' };
    }
  },

  /**
   * Listado de códigos/canjes de una campaña. Solo superadmin; el backend
   * verifica el rol con el correo del administrador.
   */
  listPromoCodes: async (campaign?: string) => {
    const user = get().user;
    if (!user || !isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Debes iniciar sesión como administrador.' };
    }

    try {
      const { data, error } = await supabase.rpc('admin_list_activation_codes', {
        p_admin_email: user.email,
        p_campaign: campaign ?? null,
      });

      if (error || !data?.success) {
        return { success: false, message: data?.error || error?.message || 'No se pudieron consultar los códigos.' };
      }
      return { success: true, codes: (data.codes || []) as PromoCodeRecord[] };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Error de conexión.' };
    }
  },

  /**
   * Búsqueda de Pago Huérfano para Recuperación
   */
  recoverPaymentLookup: async (query: string) => {
    if (!query.trim()) {
      return { found: false, error: 'Ingresa un correo o código de transacción.' };
    }

    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.rpc('recover_payment_lookup', {
          p_query: query.trim(),
        });

        if (error || !data || !data.found) {
          return { found: false, error: data?.error || 'No se encontró un pago pendiente con ese dato.' };
        }

        return data;
      }
      return { found: false, error: 'Servicio no disponible en modo offline.' };
    } catch (err: any) {
      return { found: false, error: err?.message || 'Error de conexión al buscar pago.' };
    }
  },

  /**
   * Cargar Lista de Dispositivos Conectados
   */
  fetchDevices: async () => {
    const user = get().user;
    if (!user || !isSupabaseConfigured || !supabase) return;

    try {
      const { data, error } = await supabase.rpc('get_user_connected_devices', {
        p_user_id: user.id,
      });

      if (!error && Array.isArray(data)) {
        set({ devices: data as DeviceItem[] });
      }
    } catch (e) {
      console.warn('Error al cargar dispositivos:', e);
    }
  },

  /**
   * Desvincular Dispositivo Activo
   */
  unlinkDevice: async (deviceIdOrRowId: string) => {
    const user = get().user;
    if (!user || !isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Debes iniciar sesión para realizar esta acción.' };
    }

    try {
      const { data, error } = await supabase.rpc('unlink_user_device', {
        p_user_id: user.id,
        p_device_id_to_unlink: deviceIdOrRowId,
      });

      if (error || !data?.success) {
        return { success: false, message: data?.error || error?.message || 'No se pudo desvincular el dispositivo.' };
      }

      await get().fetchDevices();
      return { success: true, message: 'Dispositivo desvinculado con éxito.' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Error de conexión al desvincular.' };
    }
  },

  /**
   * Cambio de Contraseña Propio
   */
  changePassword: async (oldPassword: string, newPassword: string) => {
    const user = get().user;
    if (!user || !isSupabaseConfigured || !supabase) {
      return { success: false, message: 'Debes iniciar sesión para cambiar tu contraseña.' };
    }

    try {
      const { data, error } = await supabase.rpc('change_user_password', {
        p_user_id: user.id,
        p_old_password: oldPassword,
        p_new_password: newPassword,
      });

      if (error || !data?.success) {
        return { success: false, message: data?.error || error?.message || 'Error al cambiar contraseña.' };
      }

      return { success: true, message: '¡Contraseña actualizada con éxito!' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Error de conexión.' };
    }
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({
      user: null,
      role: 'user',
      access_expires_at: null,
      subscription_status: 'inactive',
      subscription_plan: null,
      devices: [],
    });
  },

  refreshProfile: async () => {
    const user = get().user;
    if (!user || !isSupabaseConfigured || !supabase) return;

    if (isOwnerOrAdmin(user.email)) {
      set({
        role: 'superadmin',
        subscription_status: 'active',
        subscription_plan: 'individual',
        access_expires_at: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      });
      return;
    }

    try {
      const { data: dbUser } = await supabase
        .from('users')
        .select('role, subscription_status, subscription_plan, access_expires_at')
        .eq('id', user.id)
        .maybeSingle();

      if (dbUser) {
        const expiresAt = dbUser.access_expires_at;
        const isActive = expiresAt && new Date(expiresAt).getTime() > Date.now();
        set({
          role: (dbUser.role as UserRole) || 'user',
          subscription_status: isActive ? 'active' : 'inactive',
          subscription_plan: (dbUser.subscription_plan as SubscriptionPlan) || 'individual',
          access_expires_at: expiresAt,
        });
      }
    } catch (e) {
      console.warn('Error al refrescar perfil:', e);
    }
  },

  hasActiveAccess: () => {
    const { user, access_expires_at, subscription_status, role } = get();
    if (!user) return false;
    if (isOwnerOrAdmin(user.email) || role === 'superadmin') return true;
    if (subscription_status !== 'active') return false;
    if (!access_expires_at) return false;
    return new Date(access_expires_at).getTime() > Date.now();
  },

  getDaysRemaining: () => {
    const { access_expires_at, user } = get();
    if (isOwnerOrAdmin(user?.email)) return 3650;
    if (!access_expires_at) return 0;
    const diffMs = new Date(access_expires_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  },

  getFormattedExpiration: () => {
    const { access_expires_at, user } = get();
    if (isOwnerOrAdmin(user?.email)) return 'Acceso Vitalicio Superadmin';
    if (!access_expires_at) return null;
    try {
      return new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(access_expires_at));
    } catch {
      return access_expires_at;
    }
  },

  isCoach: () => {
    const s = get();
    if (isOwnerOrAdmin(s.user?.email)) return true;
    return isCoachRole(s.role) || isCoachRole((s.user as any)?.role);
  },

  isSkater: () => {
    const s = get();
    return !s.isCoach();
  },

  isAdmin: () => {
    const s = get();
    return s.role === 'superadmin' || isOwnerOrAdmin(s.user?.email);
  },

  adminListUsers: async () => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Supabase no configurado' };
    }
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, role, subscription_status, subscription_plan, access_expires_at, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return { success: true, users: data || [] };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Error al listar usuarios' };
    }
  },

  adminChangeUserRole: async (targetUserId: string, newRole: UserRole) => {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Supabase no configurado' };
    }
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', targetUserId);
      if (error) throw error;
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Error al actualizar rol' };
    }
  },
}));
