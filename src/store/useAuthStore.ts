/**
 * useAuthStore.ts — Gestor de Estado de Autenticación, Sesión y Suscripción SaaS
 *
 * Integra Supabase Auth con fallback resiliente offline (localStorage)
 * y preparación para Stripe Checkout.
 */

import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '../services/supabase';

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
  isLoading: boolean;

  // Estado de Monetización (SaaS Stripe)
  subscription_status: SubscriptionStatus;
  subscription_plan: SubscriptionPlan;

  // Acciones de Autenticación
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string) => Promise<void>;
  simulateLogin: (email?: string, name?: string) => void;
  logout: () => Promise<void>;

  // Acciones de Suscripción (Stripe)
  subscribePlan: (plan: SubscriptionPlan) => Promise<void>;
  cancelSubscription: () => void;

  // Verificación de acceso para el Soft Paywall
  hasActiveAccess: () => boolean;
}

const STORAGE_KEY = 'skateart_saas_auth_session';

// Cargar sesión previa desde almacenamiento local (Offline-first / Modo Avión)
const loadSavedSession = (): {
  user: AuthUser | null;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
} => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        user: parsed.user || null,
        status: parsed.subscription_status || 'inactive',
        plan: parsed.subscription_plan || null,
      };
    }
  } catch (e) {
    console.warn('Error al cargar sesión local previa:', e);
  }
  return { user: null, status: 'inactive', plan: null };
};

const initialSession = loadSavedSession();

export const useAuthStore = create<AuthStoreState>((set, get) => {
  // Escuchar cambios de autenticación de Supabase si está configurado
  if (typeof window !== 'undefined' && isSupabaseConfigured && supabase) {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const authUser: AuthUser = {
          id: session.user.id,
          email: session.user.email || '',
          nombre: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
          avatar_url: session.user.user_metadata?.avatar_url,
        };
        const currentStatus = get().subscription_status;
        set({ user: authUser });
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: authUser,
            subscription_status: currentStatus,
            subscription_plan: get().subscription_plan,
          })
        );
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const authUser: AuthUser = {
          id: session.user.id,
          email: session.user.email || '',
          nombre: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
          avatar_url: session.user.user_metadata?.avatar_url,
        };
        set({ user: authUser });
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: authUser,
            subscription_status: get().subscription_status,
            subscription_plan: get().subscription_plan,
          })
        );
      } else {
        set({ user: null, subscription_status: 'inactive', subscription_plan: null });
        localStorage.removeItem(STORAGE_KEY);
      }
    });
  }

  return {
    user: initialSession.user,
    isLoading: false,
    subscription_status: initialSession.status,
    subscription_plan: initialSession.plan,

    hasActiveAccess: () => {
      const { user, subscription_status } = get();
      return !!user && subscription_status === 'active';
    },

    simulateLogin: (email = 'atleta@rollart.com', name = 'Patinadora Demo') => {
      const mockUser: AuthUser = {
        id: `usr_${Date.now()}`,
        email,
        nombre: name,
      };
      // Por defecto entra inactivo para permitir visualizar la pasarela de planes de AlsizTech
      const currentStatus = get().subscription_status;
      const status = currentStatus === 'active' ? 'active' : 'inactive';

      set({ user: mockUser, subscription_status: status });
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          user: mockUser,
          subscription_status: status,
          subscription_plan: get().subscription_plan,
        })
      );
    },

    loginWithGoogle: async () => {
      set({ isLoading: true });
      try {
        if (isSupabaseConfigured && supabase) {
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: window.location.origin,
            },
          });
          if (error) throw error;
        } else {
          // Fallback de demostración instantánea
          await new Promise((res) => setTimeout(res, 500));
          get().simulateLogin('patinadora.google@gmail.com', 'Atleta Google');
        }
      } catch (err: any) {
        console.error('Error al autenticar con Google:', err);
        // Respaldo de simulación
        get().simulateLogin('patinadora.google@gmail.com', 'Atleta Google');
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
          // Fallback de demostración
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

    subscribePlan: async (plan: SubscriptionPlan) => {
      set({ isLoading: true });
      try {
        // En producción aquí se invoca a la Cloud Function de Stripe Checkout:
        // window.location.href = checkoutUrl;
        await new Promise((res) => setTimeout(res, 600));
        const user = get().user;
        set({ subscription_status: 'active', subscription_plan: plan });
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user,
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
          subscription_status: 'inactive',
          subscription_plan: null,
        })
      );
    },

    logout: async () => {
      if (isSupabaseConfigured && supabase) {
        await supabase.auth.signOut();
      }
      set({ user: null, subscription_status: 'inactive', subscription_plan: null });
      localStorage.removeItem(STORAGE_KEY);
    },
  };
});

