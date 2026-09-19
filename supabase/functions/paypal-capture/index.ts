// supabase/functions/paypal-capture/index.ts
// Edge Function de Captura y Verificación Segura de PayPal Business

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Manejo de Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cabecera de autorización faltante' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const paypalClientId = Deno.env.get('PAYPAL_CLIENT_ID') || '';
    const paypalClientSecret = Deno.env.get('PAYPAL_CLIENT_SECRET') || '';
    const paypalEnv = Deno.env.get('PAYPAL_ENV') || 'production';

    const paypalApiBase = paypalEnv === 'sandbox'
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com';

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Validar el token del usuario solicitante
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Usuario no autenticado o sesión expirada' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { orderID } = await req.json();
    if (!orderID) {
      return new Response(
        JSON.stringify({ success: false, error: 'orderID es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Autenticación con PayPal Business (OAuth 2.0 Server-to-Server)
    const basicAuth = btoa(`${paypalClientId}:${paypalClientSecret}`);
    const tokenResponse = await fetch(`${paypalApiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('Error al obtener token de PayPal:', errText);
      return new Response(
        JSON.stringify({ success: false, error: 'Error al conectar con la pasarela de PayPal' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { access_token } = await tokenResponse.json();

    // 3. Capturar Fondos de la Orden en PayPal
    const captureResponse = await fetch(`${paypalApiBase}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const captureData = await captureResponse.json();

    if (!captureResponse.ok || captureData.status !== 'COMPLETED') {
      console.error('Error en captura de PayPal:', captureData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'El pago no fue aprobado o completado por PayPal',
          details: captureData 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Extraer metadata de la transacción
    const purchaseUnit = captureData.purchase_units?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0];
    const amountPaid = parseFloat(capture?.amount?.value || '20.00');
    const currencyPaid = capture?.amount?.currency_code || 'USD';
    const captureId = capture?.id || captureData.id;
    const payerEmail = captureData.payer?.email_address || null;
    const payerId = captureData.payer?.payer_id || null;

    // 5. Registrar en tabla payments (idempotencia garantizada por UNIQUE paypal_order_id)
    const { error: paymentError } = await supabase.from('payments').insert({
      user_id: user.id,
      paypal_order_id: orderID,
      paypal_capture_id: captureId,
      paypal_payer_id: payerId,
      paypal_payer_email: payerEmail,
      amount: amountPaid,
      currency: currencyPaid,
      status: 'COMPLETED',
      access_extended_days: 365,
      raw_response: captureData,
    });

    if (paymentError) {
      if (paymentError.code === '23505') {
        // Replay Attack: la orden ya había sido capturada previamente
        return new Response(
          JSON.stringify({ success: false, error: 'Esta orden de PayPal ya fue procesada anteriormente.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.warn('Advertencia al auditar pago:', paymentError);
    }

    // 6. Calcular expiración acumulativa: MAX(NOW(), actual) + 365 días
    const { data: profile } = await supabase
      .from('profiles')
      .select('access_expires_at')
      .eq('id', user.id)
      .single();

    const now = Date.now();
    const currentExpiryMs = profile?.access_expires_at 
      ? new Date(profile.access_expires_at).getTime() 
      : 0;

    const baseTimeMs = Math.max(now, currentExpiryMs);
    const newExpiryDate = new Date(baseTimeMs + (365 * 24 * 60 * 60 * 1000)).toISOString();

    // 7. Actualizar el perfil del usuario con acceso anual
    const { error: updateError } = await supabase.from('profiles').update({
      access_expires_at: newExpiryDate,
      subscription_status: 'active',
      subscription_plan: 'individual',
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);

    if (updateError) {
      console.error('Error al actualizar fecha en profiles:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Error al actualizar período de acceso del usuario' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: '¡Pago verificado con éxito! Tienes 1 año de acceso ilimitado a SkateArt Pro.',
        access_expires_at: newExpiryDate,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('Error no controlado en paypal-capture:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

