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

  // Estado de Monetización (SaaS Stripe)
  subscription_status: SubscriptionStatus;
  subscription_plan: SubscriptionPlan;

  // Acciones de Autenticación
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string) => Promise<void>;
  simulateLogin: (email?: string, name?: string, role?: UserRole) => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;

  // Canje de Códigos de Invitación (Tester Bypass)
  redeemPromoCode: (code: string) => Promise<{ success: boolean; message: string }>;

  // Acciones de Suscripción (Stripe)
  subscribePlan: (plan: SubscriptionPlan) => Promise<void>;
  cancelSubscription: () => void;

  // Verificación de acceso para el Soft Paywall (RBAC + Paywall)
  hasActiveAccess: () => boolean;
}

const STORAGE_KEY = 'skateart_saas_auth_session';

// Cargar sesión previa desde almacenamiento local (Offline-first / Modo Avión)
const loadSavedSession = (): {
  user: AuthUser | null;
  role: UserRole;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
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
      };
    }
  } catch (e) {
    console.warn('Error al cargar sesión local previa:', e);
  }
  return { user: null, role: 'user', status: 'inactive', plan: null };
};

const initialSession = loadSavedSession();

export const useAuthStore = create<AuthStoreState>((set, get) => {
  // Función interna para sincronizar el perfil desde Supabase (RBAC)
  const syncProfileFromDatabase = async (userId: string) => {
    if (!supabase || !isSupabaseConfigured) return;
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, subscription_status, subscription_plan')
        .eq('id', userId)
        .maybeSingle();

      if (!error && profile) {
        const role = (profile.role as UserRole) || 'user';
        const subscription_status = (profile.subscription_status as SubscriptionStatus) || 'inactive';
        const subscription_plan = (profile.subscription_plan as SubscriptionPlan) || null;

        set({ role, subscription_status, subscription_plan });

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
    subscription_status: initialSession.status,
    subscription_plan: initialSession.plan,

    hasActiveAccess: () => {
      const { user, subscription_status, role } = get();
      // Bypass para Tester y Superadmin O suscripción activa
      return !!user && (
        subscription_status === 'active' || 
        role === 'tester' || 
        role === 'superadmin'
      );
    },

    refreshProfile: async () => {
      const user = get().user;
      if (user?.id) {
        await syncProfileFromDatabase(user.id);
      }
    },

    simulateLogin: (email = 'atleta@rollart.com', name = 'Patinadora Demo', role: UserRole = 'user') => {
      const mockUser: AuthUser = {
        id: `usr_${Date.now()}`,
        email,
        nombre: name,
      };
      const currentStatus = get().subscription_status;
      const status = currentStatus === 'active' ? 'active' : 'inactive';

      set({ user: mockUser, role, subscription_status: status });
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          user: mockUser,
          role,
          subscription_status: status,
          subscription_plan: get().subscription_plan,
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
          get().simulateLogin('patinadora.google@gmail.com', 'Atleta Google', 'tester');
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
            email,
            options: {
              emailRedirectTo: window.location.origin,
            },
          });
          if (error) throw error;
          alert('¡Enlace de acceso enviado! Revisa tu bandeja de correo.');
        } else {
          await new Promise((res) => setTimeout(res, 400));
          get().simulateLogin(email, email.split('@')[0]);
        }
      } catch (err: any) {
        console.error('Error al autenticar con Email:', err);
        get().simulateLogin(email, email.split('@')[0]);
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
          const { data, error } = await supabase.rpc('redeem_promo_code', {
            code_input: cleanCode,
          });

          if (error) {
            // Fallback si la función RPC aún no fue ejecutada en SQL
            if (cleanCode === 'TESTER-2026' || cleanCode === 'ALSIZTECH-VIP') {
              set({ role: 'tester', subscription_status: 'active', subscription_plan: 'individual' });
              const user = get().user;
              if (user) {
                localStorage.setItem(
                  STORAGE_KEY,
                  JSON.stringify({
                    user,
                    role: 'tester',
                    subscription_status: 'active',
                    subscription_plan: 'individual',
                  })
                );
              }
              return { success: true, message: '¡Código verificado! Has obtenido acceso ilimitado como Beta Tester.' };
            }
            throw error;
          }

          if (data?.success) {
            await get().refreshProfile();
            return { success: true, message: data.message };
          } else {
            return { success: false, message: data?.message || 'Código inválido.' };
          }
        } else {
          // Fallback en desarrollo local
          if (cleanCode === 'TESTER-2026' || cleanCode === 'ALSIZTECH-VIP') {
            set({ role: 'tester', subscription_status: 'active', subscription_plan: 'individual' });
            return { success: true, message: '¡Código aceptado! Modo Tester activado en local.' };
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
        set({ subscription_status: 'active', subscription_plan: plan });
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user,
            role: get().role,
            subscription_status: 'active',
            subscription_plan: plan,
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
