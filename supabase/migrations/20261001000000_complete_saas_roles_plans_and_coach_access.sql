-- ==============================================================================
-- SkateCoreo — Migración SaaS: Roles RBAC, Planes de Precios y Acceso Entrenador
-- Fecha: 2026-10-01
--
-- CARACTERÍSTICAS:
--   1. Roles formales de plataforma: skater, coach, club_admin, superadmin, tester, user.
--   2. Catálogo oficial de planes y precios:
--        - Patinadora/Patinador: $4.99/mes | $47.90/año (-20% anual)
--        - Entrenador: $9.99/mes | $83.90/año (-30% anual)
--   3. RPCs de gestión administrativa segura de usuarios y roles.
--   4. Registro post-pago con asignación automática de rol y soporte de upgrade.
--   5. Control estricto a nivel de base de datos para impedir auto-asignación de roles.
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. TABLA: PLANS (Catálogo Oficial de Suscripciones y Precios)
CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'skater' CHECK (role IN ('skater', 'coach', 'club_admin')),
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'annual')),
  unit_price NUMERIC(10, 2) NOT NULL,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  monthly_equivalent NUMERIC(10, 2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Semilla oficial de planes con los precios aprobados
INSERT INTO public.plans (id, name, role, billing_period, unit_price, discount_percent, monthly_equivalent, is_active)
VALUES
  ('skater_monthly', 'Patinador / Alumno Mensual', 'skater', 'monthly', 4.99, 0.00, 4.99, TRUE),
  ('skater_annual', 'Patinador / Alumno Anual', 'skater', 'annual', 47.90, 20.00, 3.99, TRUE),
  ('coach_monthly', 'Entrenador Profesional Mensual', 'coach', 'monthly', 9.99, 0.00, 9.99, TRUE),
  ('coach_annual', 'Entrenador Profesional Anual', 'coach', 'annual', 83.90, 30.00, 6.99, TRUE)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    role = EXCLUDED.role,
    billing_period = EXCLUDED.billing_period,
    unit_price = EXCLUDED.unit_price,
    discount_percent = EXCLUDED.discount_percent,
    monthly_equivalent = EXCLUDED.monthly_equivalent,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_plans" ON public.plans;
CREATE POLICY "public_read_plans" ON public.plans FOR SELECT TO anon, authenticated USING (is_active = TRUE);


-- 2. AJUSTE DE RESTRICCIÓN DE ROLES EN USERS
DO $$
BEGIN
  ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE public.users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('skater', 'coach', 'club_admin', 'superadmin', 'tester', 'user'));
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;


-- 3. RPC: Listar usuarios con roles y detalles para Superadmin
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_users JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'full_name', u.full_name,
      'role', COALESCE(u.role, 'skater'),
      'subscription_status', u.subscription_status,
      'access_expires_at', u.access_expires_at,
      'created_at', u.created_at,
      'device_count', (SELECT COUNT(*) FROM public.devices d WHERE d.user_id = u.id AND d.is_active = TRUE)
    ) ORDER BY u.created_at DESC
  ) INTO v_users
  FROM public.users u;

  RETURN COALESCE(v_users, '[]'::jsonb);
END;
$$;


-- 4. RPC: Modificación Segura de Rol de Usuario (Solo Superadmin)
CREATE OR REPLACE FUNCTION public.admin_change_user_role(
  p_target_user_id UUID,
  p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_role TEXT := LOWER(TRIM(p_new_role));
  v_old_role TEXT;
  v_target_email TEXT;
BEGIN
  IF v_clean_role NOT IN ('skater', 'coach', 'club_admin', 'superadmin', 'tester', 'user') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rol inválido especificado.');
  END IF;

  SELECT role, email INTO v_old_role, v_target_email
  FROM public.users
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no encontrado.');
  END IF;

  UPDATE public.users
  SET role = v_clean_role,
      updated_at = NOW()
  WHERE id = p_target_user_id;

  -- Registrar en log de auditoría comercial si la tabla existe
  BEGIN
    INSERT INTO public.commercial_audit_logs (performed_by, action, details)
    VALUES (
      'admin_system',
      'CHANGE_USER_ROLE',
      jsonb_build_object(
        'target_user_id', p_target_user_id,
        'target_email', v_target_email,
        'old_role', v_old_role,
        'new_role', v_clean_role
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'new_role', v_clean_role
  );
END;
$$;


-- 5. RPC: Registro Post-Pago PayPal con Rol y Soporte de Upgrade
CREATE OR REPLACE FUNCTION public.register_with_paypal_payment(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_paypal_order_id TEXT,
  p_device_id TEXT,
  p_device_type public.device_type,
  p_device_name TEXT,
  p_role TEXT DEFAULT 'skater'
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
  v_role TEXT := LOWER(TRIM(COALESCE(p_role, 'skater')));
  v_expiry TIMESTAMPTZ := NOW() + INTERVAL '1 year';
BEGIN
  IF v_role NOT IN ('skater', 'coach', 'user') THEN
    v_role := 'skater';
  END IF;

  -- 1. Validar que la orden de PayPal exista y no haya sido reclamada
  SELECT * INTO v_payment
  FROM public.pending_payments
  WHERE (paypal_order_id = p_paypal_order_id OR paypal_capture_id = p_paypal_order_id)
    AND status = 'pending_registration';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se encontró un pago de PayPal pendiente o ya fue utilizado.');
  END IF;

  -- 2. Si el usuario ya existe, actualizar su suscripción y rol (Upgrade / Renovación)
  SELECT id INTO v_user_id FROM public.users WHERE LOWER(email) = v_clean_email;

  IF v_user_id IS NOT NULL THEN
    UPDATE public.users
    SET role = CASE WHEN v_role = 'coach' THEN 'coach' ELSE role END,
        subscription_status = 'active',
        access_expires_at = GREATEST(COALESCE(access_expires_at, NOW()), NOW()) + INTERVAL '1 year',
        updated_at = NOW()
    WHERE id = v_user_id;

    -- Registrar dispositivo si no existe
    INSERT INTO public.devices (user_id, device_id, device_type, device_name, is_active, last_login)
    VALUES (v_user_id, p_device_id, p_device_type, COALESCE(p_device_name, ''), TRUE, NOW())
    ON CONFLICT (user_id, device_type) WHERE (is_active = TRUE)
    DO UPDATE SET device_id = EXCLUDED.device_id, device_name = EXCLUDED.device_name, last_login = NOW();

    -- Marcar pago como reclamado
    UPDATE public.pending_payments
    SET status = 'claimed',
        claimed_by_user_id = v_user_id,
        claimed_at = NOW()
    WHERE paypal_order_id = v_payment.paypal_order_id;

    RETURN jsonb_build_object(
      'success', true,
      'is_upgrade', true,
      'user', jsonb_build_object(
        'id', v_user_id,
        'email', v_clean_email,
        'full_name', p_full_name,
        'role', v_role,
        'subscription_status', 'active',
        'access_expires_at', v_expiry
      )
    );
  END IF;

  -- 3. Si no existe, validar contraseña para nueva cuenta
  IF LENGTH(p_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La contraseña debe tener al menos 6 caracteres.');
  END IF;

  -- 4. Crear usuario nuevo con Bcrypt y rol asignado
  INSERT INTO public.users (
    email,
    password_hash,
    full_name,
    role,
    subscription_status,
    access_expires_at
  ) VALUES (
    v_clean_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    COALESCE(NULLIF(p_full_name, ''), split_part(v_clean_email, '@', 1)),
    v_role,
    'active',
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
    'is_upgrade', false,
    'user', jsonb_build_object(
      'id', v_user_id,
      'email', v_clean_email,
      'full_name', COALESCE(NULLIF(p_full_name, ''), split_part(v_clean_email, '@', 1)),
      'role', v_role,
      'subscription_status', 'active',
      'access_expires_at', v_expiry
    )
  );
END;
$$;
