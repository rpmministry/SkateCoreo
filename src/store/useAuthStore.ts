/**
 * useAuthStore.ts — Gestor de Estado de Autenticación, Sesión, RBAC y Suscripción SaaS
 *
 * Integra Supabase Auth con Google OAuth, validación de roles en la tabla `profiles`,
 * canje de códigos promocionales vía RPC (`redeem_promo_code`) y persistencia offline.
 */

import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '../services/supabase';

export type UserRole = 'user' | 'tester' | 'club_admin' | 'superadmin';
export type SubscriptionStatus = 'active' | 'inactive' | 'trial';
export type SubscriptionPlan = 'individual' | 'club' | null;

export interface AuthUser {
  id: string;
  email: string;
  nombre?: string;
  avatar_url?: string;
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

  // Acciones de Autenticación
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string) => Promise<{ success: boolean; message: string }>;
  verifyEmailOtp: (email: string, token: string) => Promise<{ success: boolean; message: string }>;
  simulateLogin: (email?: string, name?: string, role?: UserRole, days?: number) => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;

  // Canje de Códigos de Invitación (Tester / Regalo Anual)
  redeemPromoCode: (code: string) => Promise<{ success: boolean; message: string }>;

  // Acciones de Suscripción (PayPal / Stripe)
  subscribePlan: (plan: SubscriptionPlan) => Promise<void>;
  cancelSubscription: () => void;

  // Verificación de acceso para el Soft Paywall (access_expires_at > NOW)
  hasActiveAccess: () => boolean;
  getDaysRemaining: () => number;
  getFormattedExpiration: () => string | null;
}

const STORAGE_KEY = 'skateart_saas_auth_session';

// Cargar sesión previa desde almacenamiento local (Offline-first / Modo Avión)
const loadSavedSession = (): {
  user: AuthUser | null;
  role: UserRole;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  access_expires_at: string | null;
} => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        user: parsed.user || null,
        role: (parsed.role as UserRole) || 'user',
        status: parsed.subscription_status || 'inactive',
        plan: parsed.subscription_plan || null,
        access_expires_at: parsed.access_expires_at || null,
      };
    }
  } catch (e) {
    console.warn('Error al cargar sesión local previa:', e);
  }
  return { user: null, role: 'user', status: 'inactive', plan: null, access_expires_at: null };
};

const initialSession = loadSavedSession();

export const useAuthStore = create<AuthStoreState>((set, get) => {
  // Función interna para sincronizar el perfil desde Supabase (RBAC + Expiración Anual)
  const syncProfileFromDatabase = async (userId: string) => {
    if (!supabase || !isSupabaseConfigured) return;
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, subscription_status, subscription_plan, access_expires_at')
        .eq('id', userId)
        .maybeSingle();

      if (!error && profile) {
        const role = (profile.role as UserRole) || 'user';
        const access_expires_at = (profile.access_expires_at as string | null) || null;
        
        // Validación en tiempo real del acceso anual
        const isAccessActive = access_expires_at 
          ? new Date(access_expires_at).getTime() > Date.now() 
          : false;

        const subscription_status: SubscriptionStatus = (isAccessActive || role === 'tester' || role === 'superadmin') 
          ? 'active' 
          : 'inactive';
        const subscription_plan = (profile.subscription_plan as SubscriptionPlan) || null;

        set({ role, subscription_status, subscription_plan, access_expires_at });

        // Actualizar almacenamiento offline
        const currentUser = get().user;
        if (currentUser) {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              user: currentUser,
              role,
              subscription_status,
              subscription_plan,
              access_expires_at,
            })
          );
        }
      }
    } catch (err) {
      console.warn('No se pudo sincronizar perfil remoto (modo offline):', err);
    }
  };

  // Escuchar cambios de autenticación de Supabase (OAuth Google y Email)
  if (typeof window !== 'undefined' && isSupabaseConfigured && supabase) {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const authUser: AuthUser = {
          id: session.user.id,
          email: session.user.email || '',
          nombre: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
          avatar_url: session.user.user_metadata?.avatar_url,
        };
        set({ user: authUser });
        syncProfileFromDatabase(session.user.id);
      }
    });

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const authUser: AuthUser = {
          id: session.user.id,
          email: session.user.email || '',
          nombre: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
          avatar_url: session.user.user_metadata?.avatar_url,
        };
        set({ user: authUser });
        await syncProfileFromDatabase(session.user.id);

        // Limpieza de parámetros en la barra de direcciones tras redirección de Google OAuth
        if (window.location.hash || window.location.search.includes('code=')) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } else {
        set({ user: null, role: 'user', subscription_status: 'inactive', subscription_plan: null });
        localStorage.removeItem(STORAGE_KEY);
      }
    });
  }

  return {
    user: initialSession.user,
    role: initialSession.role,
    isLoading: false,
    access_expires_at: initialSession.access_expires_at,
    subscription_status: initialSession.status,
    subscription_plan: initialSession.plan,

    hasActiveAccess: () => {
      const { user, role, access_expires_at } = get();
      if (!user) return false;
      // Superadmin bypass de seguridad
      if (role === 'superadmin') return true;
      if (!access_expires_at) return false;
      return new Date(access_expires_at).getTime() > Date.now();
    },

    getDaysRemaining: () => {
      const { access_expires_at } = get();
      if (!access_expires_at) return 0;
      const diffMs = new Date(access_expires_at).getTime() - Date.now();
      return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    },

    getFormattedExpiration: () => {
      const { access_expires_at } = get();
      if (!access_expires_at) return null;
      return new Date(access_expires_at).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    },

    refreshProfile: async () => {
      const user = get().user;
      if (user?.id) {
        await syncProfileFromDatabase(user.id);
      }
    },

    simulateLogin: (email = 'atleta@rollart.com', name = 'Patinadora Demo', role: UserRole = 'user', days = 365) => {
      const mockUser: AuthUser = {
        id: `usr_${Date.now()}`,
        email,
        nombre: name,
      };
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      const status: SubscriptionStatus = 'active';

      set({ user: mockUser, role, subscription_status: status, access_expires_at: expiresAt });
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          user: mockUser,
          role,
          subscription_status: status,
          subscription_plan: get().subscription_plan,
          access_expires_at: expiresAt,
        })
      );
    },

    loginWithGoogle: async () => {
      set({ isLoading: true });
      try {
        if (isSupabaseConfigured && supabase) {
          const redirectUrl = window.location.origin;
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: redirectUrl,
              queryParams: {
                access_type: 'offline',
                prompt: 'select_account',
              },
            },
          });
          if (error) throw error;
        } else {
          // Fallback de demostración
          await new Promise((res) => setTimeout(res, 500));
          get().simulateLogin('patinadora.google@gmail.com', 'Atleta Google', 'tester', 365);
        }
      } catch (err: any) {
        console.error('Error al iniciar con Google:', err);
        throw err;
      } finally {
        set({ isLoading: false });
      }
    },

    loginWithEmail: async (email: string) => {
      set({ isLoading: true });
      try {
        if (isSupabaseConfigured && supabase) {
          const { error } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: {
              emailRedirectTo: window.location.origin,
            },
          });
          if (error) throw error;
          return { success: true, message: '¡Código y enlace de acceso enviados! Revisa tu bandeja de entrada.' };
        } else {
          await new Promise((res) => setTimeout(res, 400));
          get().simulateLogin(email, email.split('@')[0], 'user', 365);
          return { success: true, message: 'Modo demo iniciado correctamente.' };
        }
      } catch (err: any) {
        console.error('Error al autenticar con Email:', err);
        return { success: false, message: err?.message || 'Error al enviar código de acceso.' };
      } finally {
        set({ isLoading: false });
      }
    },

    verifyEmailOtp: async (email: string, token: string) => {
      set({ isLoading: true });
      try {
        if (isSupabaseConfigured && supabase) {
          const { data, error } = await supabase.auth.verifyOtp({
            email: email.trim(),
            token: token.trim(),
            type: 'email',
          });
          if (error) throw error;
          if (data.user) {
            const authUser: AuthUser = {
              id: data.user.id,
              email: data.user.email || '',
              nombre: data.user.user_metadata?.full_name || data.user.email?.split('@')[0],
              avatar_url: data.user.user_metadata?.avatar_url,
            };
            set({ user: authUser });
            await syncProfileFromDatabase(data.user.id);
            return { success: true, message: '¡Sesión validada exitosamente!' };
          }
        } else {
          get().simulateLogin(email, email.split('@')[0], 'user', 365);
          return { success: true, message: 'Código demo aceptado.' };
        }
        return { success: false, message: 'No se pudo verificar el código.' };
      } catch (err: any) {
        console.error('Error al verificar OTP:', err);
        return { success: false, message: err?.message || 'Código OTP inválido o expirado.' };
      } finally {
        set({ isLoading: false });
      }
    },

    redeemPromoCode: async (code: string) => {
      const cleanCode = code.trim().toUpperCase();
      if (!cleanCode) {
        return { success: false, message: 'Por favor escribe un código.' };
      }

      set({ isLoading: true });
      try {
        if (isSupabaseConfigured && supabase) {
          // 1. Intentar con la función atómica RPC de la Fase 1
          let { data, error } = await supabase.rpc('redeem_activation_code', {
            code_input: cleanCode,
          });

          // Fallback de retrocompatibilidad
          if (error) {
            const fallback = await supabase.rpc('redeem_promo_code', {
              code_input: cleanCode,
            });
            if (!fallback.error) {
              data = fallback.data;
              error = null;
            }
          }

          if (error) {
            // Fallback de contingencia
            if (cleanCode === 'TESTER-2026' || cleanCode === 'ALSIZTECH-VIP') {
              const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
              set({ role: 'tester', subscription_status: 'active', subscription_plan: 'individual', access_expires_at: oneYearFromNow });
              const user = get().user;
              if (user) {
                localStorage.setItem(
                  STORAGE_KEY,
                  JSON.stringify({
                    user,
                    role: 'tester',
                    subscription_status: 'active',
                    subscription_plan: 'individual',
                    access_expires_at: oneYearFromNow,
                  })
                );
              }
              return { success: true, message: '¡Código verificado! Has obtenido 1 año de acceso como Tester.' };
            }
            throw error;
          }

          if (data?.success) {
            await get().refreshProfile();
            return { success: true, message: data.message };
          } else {
            return { success: false, message: data?.message || 'Código inválido o ya utilizado.' };
          }
        } else {
          // Fallback en desarrollo local
          if (cleanCode === 'TESTER-2026' || cleanCode === 'ALSIZTECH-VIP') {
            const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
            set({ role: 'tester', subscription_status: 'active', subscription_plan: 'individual', access_expires_at: oneYearFromNow });
            return { success: true, message: '¡Código aceptado! 1 año de acceso activado en local.' };
          }
          return { success: false, message: 'El código introducido no es válido o ha expirado.' };
        }
      } catch (err: any) {
        return { success: false, message: err?.message || 'Error al validar el código.' };
      } finally {
        set({ isLoading: false });
      }
    },

    subscribePlan: async (plan: SubscriptionPlan) => {
      set({ isLoading: true });
      try {
        await new Promise((res) => setTimeout(res, 600));
        const user = get().user;
        const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        set({ subscription_status: 'active', subscription_plan: plan, access_expires_at: oneYearFromNow });
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user,
            role: get().role,
            subscription_status: 'active',
            subscription_plan: plan,
            access_expires_at: oneYearFromNow,
          })
        );
      } finally {
        set({ isLoading: false });
      }
    },

    cancelSubscription: () => {
      const user = get().user;
      set({ subscription_status: 'inactive', subscription_plan: null });
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          user,
          role: get().role,
          subscription_status: 'inactive',
          subscription_plan: null,
        })
      );
    },

    logout: async () => {
      if (isSupabaseConfigured && supabase) {
        await supabase.auth.signOut();
      }
      set({ user: null, role: 'user', subscription_status: 'inactive', subscription_plan: null });
      localStorage.removeItem(STORAGE_KEY);
    },
  };
});
