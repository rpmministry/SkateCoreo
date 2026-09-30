-- ==============================================================================
-- SkateCoreo — Sincronización Oficial de Precios, Descuentos y Suscripciones
-- Fecha: 2026-09-30
--
-- PRECIOS OFICIALES VIGENTES:
--   1. Plan Patinadora/Patinador:
--      - Mensual: USD 4.99 / mes (30 días de vigencia)
--      - Anual:   USD 47.90 / año (365 días de vigencia, 20% descuento sobre base $59.88)
--      - Ahorro anual: USD 11.98 / año (equivalente a $3.99 / mes)
--   2. Plan Entrenador:
--      - Mensual: USD 9.99 / mes (30 días de vigencia)
--      - Anual:   USD 83.92 / año (365 días de vigencia, 30% descuento sobre base $119.88)
--      - Ahorro anual: USD 35.96 / año (equivalente a $6.99 / mes)
--   3. Licencias para Clubes / Paquetes Comerciales:
--      - Precio base unitario mensual: USD 4.99
--      - Precio base unitario anual:   USD 47.90
--      - Descuentos por volumen: 5-9 (10%), 10-19 (20%), 20-49 (35%), 50+ (50%)
-- ==============================================================================

-- 1. Actualizar función RPC de cálculo seguro de precios en backend
CREATE OR REPLACE FUNCTION public.calculate_package_pricing(
  p_total_licenses INT,
  p_plan TEXT DEFAULT 'annual',
  p_negotiated_discount NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_price NUMERIC(10, 2);
  v_subtotal NUMERIC(10, 2);
  v_discount_percent NUMERIC(5, 2) := 0.00;
  v_discount_type TEXT := 'tiered';
  v_discount_amount NUMERIC(10, 2);
  v_total NUMERIC(10, 2);
BEGIN
  IF p_total_licenses <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El número de licencias debe ser mayor a 0');
  END IF;

  -- Precios unitarios oficiales de SkateCoreo ($4.99 mensual / $47.90 anual con 20% desc.)
  IF LOWER(TRIM(p_plan)) = 'monthly' THEN
    v_unit_price := 4.99;
  ELSE
    v_unit_price := 47.90;
  END IF;

  v_subtotal := ROUND(v_unit_price * p_total_licenses, 2);

  -- Si se indicó un descuento negociado válido (entre 0 y 100)
  IF p_negotiated_discount IS NOT NULL AND p_negotiated_discount >= 0 AND p_negotiated_discount <= 100 THEN
    v_discount_percent := ROUND(p_negotiated_discount, 2);
    v_discount_type := 'negotiated';
  ELSE
    -- Buscar tramo de descuento automático por volumen
    SELECT discount_percent INTO v_discount_percent
    FROM public.discount_tiers
    WHERE is_active = TRUE
      AND min_licenses <= p_total_licenses
      AND (max_licenses IS NULL OR max_licenses >= p_total_licenses)
    ORDER BY min_licenses DESC
    LIMIT 1;

    v_discount_percent := COALESCE(v_discount_percent, 0.00);
    v_discount_type := 'tiered';
  END IF;

  v_discount_amount := ROUND((v_subtotal * (v_discount_percent / 100.0)), 2);
  v_total := ROUND(v_subtotal - v_discount_amount, 2);

  RETURN jsonb_build_object(
    'success', true,
    'total_licenses', p_total_licenses,
    'plan', LOWER(TRIM(p_plan)),
    'unit_base_price', v_unit_price,
    'subtotal', v_subtotal,
    'discount_percent', v_discount_percent,
    'discount_type', v_discount_type,
    'discount_amount', v_discount_amount,
    'total_amount', v_total,
    'savings_amount', v_discount_amount
  );
END;
$$;


-- 2. Actualizar función RPC de registro condicionado con PayPal
--    Calcula vigencia exacta (30 días vs 365 días) y asigna rol/plan según importe verificado
CREATE OR REPLACE FUNCTION public.register_with_paypal_payment(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_paypal_order_id TEXT,
  p_device_id TEXT,
  p_device_type public.device_type,
  p_device_name TEXT,
  p_plan_role TEXT DEFAULT 'skater'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_user_id UUID;
  v_clean_email TEXT := LOWER(TRIM(p_email));
  v_expiry TIMESTAMPTZ;
  v_assigned_role TEXT := 'user';
  v_assigned_plan TEXT := 'individual';
  v_amount NUMERIC;
BEGIN
  IF LENGTH(p_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La contraseña debe tener al menos 6 caracteres.');
  END IF;

  -- 1. Validar que la orden exista y esté disponible en pending_payments
  SELECT * INTO v_payment
  FROM public.pending_payments
  WHERE (paypal_order_id = p_paypal_order_id OR paypal_capture_id = p_paypal_order_id)
    AND status = 'pending_registration';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se encontró un pago de PayPal pendiente o ya fue utilizado.');
  END IF;

  -- 2. Verificar que no exista el correo en users
  IF EXISTS (SELECT 1 FROM public.users WHERE LOWER(email) = v_clean_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya existe una cuenta con este correo. Inicia sesión en su lugar.');
  END IF;

  v_amount := COALESCE(v_payment.amount, 0);

  -- 3. Calcular vigencia y rol según el importe verificado en PayPal
  --    Patinador Mensual: $4.99 (30 días)
  --    Patinador Anual:   $47.90 (365 días, 20% desc.)
  --    Entrenador Mensual: $9.99 (30 días)
  --    Entrenador Anual:   $83.92 (365 días, 30% desc.)
  IF v_amount >= 75.00 THEN
    -- Entrenador Anual ($83.92)
    v_expiry := NOW() + INTERVAL '365 days';
    v_assigned_role := 'coach';
    v_assigned_plan := 'coach';
  ELSIF v_amount >= 40.00 THEN
    -- Patinador Anual ($47.90)
    v_expiry := NOW() + INTERVAL '365 days';
    v_assigned_role := 'user';
    v_assigned_plan := 'individual';
  ELSIF v_amount >= 7.00 THEN
    -- Entrenador Mensual ($9.99)
    v_expiry := NOW() + INTERVAL '30 days';
    v_assigned_role := 'coach';
    v_assigned_plan := 'coach';
  ELSIF v_amount > 0 THEN
    -- Patinador Mensual ($4.99)
    v_expiry := NOW() + INTERVAL '30 days';
    v_assigned_role := 'user';
    v_assigned_plan := 'individual';
  ELSE
    -- Fallback según parámetro solicitado si monto fuese 0/demo
    IF p_plan_role = 'coach' THEN
      v_expiry := NOW() + INTERVAL '365 days';
      v_assigned_role := 'coach';
      v_assigned_plan := 'coach';
    ELSE
      v_expiry := NOW() + INTERVAL '365 days';
      v_assigned_role := 'user';
      v_assigned_plan := 'individual';
    END IF;
  END IF;

  -- Si el cliente explícitamente solicitó rol coach y pagó tarifa de coach
  IF p_plan_role = 'coach' AND (v_amount >= 7.00 OR v_amount = 0) THEN
    v_assigned_role := 'coach';
    v_assigned_plan := 'coach';
  END IF;

  -- 4. Crear usuario con Bcrypt
  INSERT INTO public.users (
    email,
    password_hash,
    full_name,
    role,
    subscription_status,
    subscription_plan,
    access_expires_at
  ) VALUES (
    v_clean_email,
    crypt(p_password, gen_salt('bf', 10)),
    COALESCE(NULLIF(p_full_name, ''), split_part(v_clean_email, '@', 1)),
    v_assigned_role,
    'active',
    v_assigned_plan,
    v_expiry
  )
  RETURNING id INTO v_user_id;

  -- 5. Registrar primer dispositivo activo
  INSERT INTO public.devices (user_id, device_id, device_type, device_name, is_active, last_login)
  VALUES (v_user_id, p_device_id, p_device_type, COALESCE(p_device_name, ''), TRUE, NOW());

  -- 6. Marcar pago como reclamado
  UPDATE public.pending_payments
  SET status = 'claimed',
      claimed_by_user_id = v_user_id,
      claimed_at = NOW()
  WHERE paypal_order_id = v_payment.paypal_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_user_id,
      'email', v_clean_email,
      'full_name', COALESCE(NULLIF(p_full_name, ''), split_part(v_clean_email, '@', 1)),
      'role', v_assigned_role,
      'subscription_status', 'active',
      'subscription_plan', v_assigned_plan,
      'access_expires_at', v_expiry
    )
  );
END;
$$;
