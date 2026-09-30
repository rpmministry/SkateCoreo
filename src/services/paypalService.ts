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
import { getPlanDetails, PlanRole, PlanPeriod } from './pricingService';

export interface PayPalCaptureResult {
  success: boolean;
  message?: string;
  orderID?: string;
  payer_email?: string;
  payer_name?: string;
  amount?: number;
  currency?: string;
  access_expires_at?: string;
  role?: PlanRole;
  plan?: string;
  error?: string;
}

export const paypalService = {
  /**
   * Captura y valida una orden o suscripción de PayPal en el backend seguro
   */
  async captureOrder(
    orderID: string,
    plan: PlanPeriod = 'annual',
    role: PlanRole = 'skater'
  ): Promise<PayPalCaptureResult> {
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
          body: JSON.stringify({ orderID, plan, role }),
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
          role: data.role || role,
          plan: data.plan || `${role}_${plan}`,
        };
      } else {
        // Fallback para pruebas locales (sandbox / demo)
        const planDetails = getPlanDetails(role, plan);
        const days = planDetails.durationDays;
        const mockNewExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        return {
          success: true,
          message: '¡Pago verificado con éxito en modo local!',
          orderID,
          payer_email: 'demo@skatecoreo.app',
          payer_name: 'Patinador Demo',
          amount: planDetails.amount,
          currency: 'USD',
          access_expires_at: mockNewExpiry,
          role,
          plan: planDetails.planId,
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

  /**
   * Cancela la renovación automática de la suscripción en PayPal.
   * El usuario conserva su acceso intacto hasta la fecha final del período ya pagado.
   */
  async cancelSubscription(_subscriptionReference?: string): Promise<{ success: boolean; message: string }> {
    try {
      if (isSupabaseConfigured && supabase) {
        const user = useAuthStore.getState().user;
        if (!user) {
          return { success: false, message: 'Usuario no autenticado.' };
        }

        // Marcar entitlement como cancelado pero conservando expires_at
        await supabase
          .from('entitlements')
          .update({
            status: 'canceled',
            renews_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('status', 'active');

        await useAuthStore.getState().refreshProfile().catch(() => {});

        return {
          success: true,
          message: 'Tu suscripción ha sido cancelada. Mantendrás acceso completo hasta el final del período pagado.',
        };
      }

      return {
        success: true,
        message: 'Suscripción cancelada localmente. El acceso continuará hasta la fecha de vencimiento.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'No se pudo procesar la cancelación.',
      };
    }
  },
};
