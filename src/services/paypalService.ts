/**
 * paypalService.ts — Servicio de Integración de Pagos PayPal Business
 *
 * Envía el orderID capturado en el cliente hacia el backend en la nube (Edge Function)
 * para verificar los fondos con PayPal Server-to-Server y registrar el recibo
 * en la base de datos (pending_payments / payments).
 * Soporta checkout como invitado (pre-registro) y renovación de usuarios existentes.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { useAuthStore } from '../store/useAuthStore';

export interface PayPalCaptureResult {
  success: boolean;
  message?: string;
  orderID?: string;
  payer_email?: string;
  payer_name?: string;
  amount?: number;
  currency?: string;
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
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
        const captureEndpoint = `${supabaseUrl}/functions/v1/paypal-capture`;

        // Si el usuario ya está autenticado, enviamos su token para renovación directa
        const currentUser = useAuthStore.getState().user;
        let authHeader = `Bearer ${anonKey}`;
        if (currentUser) {
          // Intentar obtener token si existiera
          const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: null }));
          if (sessionData?.session?.access_token) {
            authHeader = `Bearer ${sessionData.session.access_token}`;
          }
        }

        const response = await fetch(captureEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey,
            'Authorization': authHeader,
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

        // Si ya era un usuario registrado, refrescar su perfil
        if (currentUser) {
          await useAuthStore.getState().refreshProfile().catch(() => {});
        }

        return {
          success: true,
          message: data.message || '¡Pago completado con éxito!',
          orderID: data.orderID || orderID,
          payer_email: data.payer_email,
          payer_name: data.payer_name,
          amount: data.amount,
          currency: data.currency,
          access_expires_at: data.access_expires_at,
        };
      } else {
        // Fallback para pruebas locales (sandbox / demo)
        const mockNewExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        return {
          success: true,
          message: '¡Pago verificado con éxito en modo local!',
          orderID,
          payer_email: 'demo@skatecoreo.app',
          payer_name: 'Patinador Demo',
          amount: 20.00,
          currency: 'USD',
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
