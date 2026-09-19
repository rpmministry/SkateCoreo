/**
 * paypalService.ts — Servicio de Integración de Pagos PayPal Business
 *
 * Envía el orderID capturado en el cliente hacia el backend en la nube
 * para verificar los fondos y acreditar el año de acceso premium.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { useAuthStore } from '../store/useAuthStore';

export interface PayPalCaptureResult {
  success: boolean;
  message?: string;
  access_expires_at?: string;
  error?: string;
}

export const paypalService = {
  /**
   * Captura y valida una orden de PayPal en el backend seguro
   */
  async captureOrder(orderID: string): Promise<PayPalCaptureResult> {
    if (!orderID) {
      return { success: false, error: 'El ID de orden de PayPal es obligatorio.' };
    }

    try {
      if (isSupabaseConfigured && supabase) {
        // Obtener token JWT del usuario activo
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;

        if (!token) {
          return { success: false, error: 'Debes iniciar sesión para completar la activación de tu cuenta.' };
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
        const captureEndpoint = `${supabaseUrl}/functions/v1/paypal-capture`;

        const response = await fetch(captureEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ orderID }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          return {
            success: false,
            error: data.error || 'La pasarela de pago no pudo verificar la transacción.',
          };
        }

        // Actualizar el estado global del usuario con la nueva fecha
        await useAuthStore.getState().refreshProfile();

        return {
          success: true,
          message: data.message,
          access_expires_at: data.access_expires_at,
        };
      } else {
        // Fallback para pruebas locales (sandbox / demo)
        const mockNewExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        useAuthStore.getState().simulateLogin(
          useAuthStore.getState().user?.email || 'atleta@rollart.com',
          useAuthStore.getState().user?.nombre || 'Patinadora Pro',
          'user',
          365
        );

        return {
          success: true,
          message: '¡Pago simulado con éxito! 1 año de acceso otorgado en modo desarrollo.',
          access_expires_at: mockNewExpiry,
        };
      }
    } catch (err: any) {
      console.error('Error al capturar orden de PayPal:', err);
      return {
        success: false,
        error: err?.message || 'Error de conexión con el servidor de pagos.',
      };
    }
  },
};

