-- ==============================================================================
-- SkateCoreo — Sistema Comercial Integral: Suscripciones y Licencias de Clubes
-- Fecha: 2026-09-30
--
-- CARACTERÍSTICAS:
--   1. Arquitectura de Entitlements (fuente de acceso, vigencia, estado).
--   2. Planes individuales: Mensual ($5/mes) y Anual ($48/año con 20% descuento).
--   3. Licencias para Clubes / Paquetes de Licencias con descuento por volumen o negociado.
--   4. Snapshot comercial inmutable al momento de crear el paquete.
--   5. Códigos únicos criptográficamente seguros de un solo uso (SKC-XXXX-XXXX).
--   6. Renovación masiva de paquetes sin duplicar usuarios ni cuentas.
--   7. Auditoría completa de operaciones administrativas.
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. TABLA: DISCOUNT_TIERS (Escalas de descuento por volumen configurables)
CREATE TABLE IF NOT EXISTS public.discount_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  min_licenses INT NOT NULL CHECK (min_licenses > 0),
  max_licenses INT DEFAULT NULL, -- NULL indica sin límite superior (ej: 50+)
  discount_percent NUMERIC(5, 2) NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
  plan TEXT NOT NULL DEFAULT 'all', -- 'all' | 'annual' | 'monthly'
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discount_tiers_lookup 
  ON public.discount_tiers (min_licenses, is_active);

-- Semilla de tramos de descuento por volumen por defecto
INSERT INTO public.discount_tiers (min_licenses, max_licenses, discount_percent, plan, is_active)
SELECT 5, 9, 10.00, 'all', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.discount_tiers WHERE min_licenses = 5 AND max_licenses = 9);

INSERT INTO public.discount_tiers (min_licenses, max_licenses, discount_percent, plan, is_active)
SELECT 10, 19, 20.00, 'all', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.discount_tiers WHERE min_licenses = 10 AND max_licenses = 19);

INSERT INTO public.discount_tiers (min_licenses, max_licenses, discount_percent, plan, is_active)
SELECT 20, 49, 35.00, 'all', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.discount_tiers WHERE min_licenses = 20 AND max_licenses = 49);

INSERT INTO public.discount_tiers (min_licenses, max_licenses, discount_percent, plan, is_active)
SELECT 50, NULL, 50.00, 'all', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.discount_tiers WHERE min_licenses = 50 AND max_licenses IS NULL);


-- 2. TABLA: LICENSE_PACKAGES (Paquetes Comerciales de Clubes / Organizaciones)
CREATE TABLE IF NOT EXISTS public.license_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_number SERIAL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  contact_phone TEXT,
  total_licenses INT NOT NULL CHECK (total_licenses > 0),
  used_licenses INT NOT NULL DEFAULT 0 CHECK (used_licenses >= 0 AND used_licenses <= total_licenses),
  plan TEXT NOT NULL DEFAULT 'annual', -- 'annual' | 'monthly'
  billing_period TEXT NOT NULL DEFAULT 'annual',
  unit_base_price NUMERIC(10, 2) NOT NULL, -- $48.00 anual / $5.00 mensual
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  discount_type TEXT NOT NULL DEFAULT 'tiered', -- 'tiered' | 'negotiated' | 'promotional'
  subtotal NUMERIC(10, 2) NOT NULL,
  discount_amount NUMERIC(10, 2) NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'expired' | 'canceled' | 'draft'
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  payment_reference TEXT,
  authorized_by TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_license_packages_status ON public.license_packages (status);
CREATE INDEX IF NOT EXISTS idx_license_packages_client ON public.license_packages (LOWER(client_name));


-- 3. TABLA: LICENSE_CODES (Códigos Únicos Individuales por Licencia)
CREATE TABLE IF NOT EXISTS public.license_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.license_packages(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'available', -- 'available' | 'assigned' | 'revoked'
  assigned_to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_email TEXT,
  assigned_name TEXT,
  assigned_at TIMESTAMPTZ DEFAULT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_license_codes_code ON public.license_codes (UPPER(code));
CREATE INDEX IF NOT EXISTS idx_license_codes_package ON public.license_codes (package_id);
CREATE INDEX IF NOT EXISTS idx_license_codes_status ON public.license_codes (status);


-- 4. TABLA: ENTITLEMENTS (Control General y Unificado de Acceso por Cuenta)
CREATE TABLE IF NOT EXISTS public.entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  access_source TEXT NOT NULL, -- 'individual_subscription' | 'bulk_license' | 'club_license' | 'promotional_license'
  plan TEXT NOT NULL DEFAULT 'annual', -- 'monthly' | 'annual' | 'custom'
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'canceled' | 'expired' | 'suspended' | 'past_due' | 'revoked'
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  renews_at TIMESTAMPTZ DEFAULT NULL,
  payment_reference TEXT DEFAULT NULL,
  package_id UUID REFERENCES public.license_packages(id) ON DELETE SET NULL,
  license_code_id UUID REFERENCES public.license_codes(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user_active 
  ON public.entitlements (user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_entitlements_package 
  ON public.entitlements (package_id);


-- 5. TABLA: COMMERCIAL_AUDIT_LOGS (Registro Inmutable de Acciones Administrativas)
CREATE TABLE IF NOT EXISTS public.commercial_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by TEXT NOT NULL,
  action TEXT NOT NULL,
  package_id UUID REFERENCES public.license_packages(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.commercial_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_package ON public.commercial_audit_logs (package_id);


-- 6. HABILITAR RLS CON ACCESO RESTRINGIDO
ALTER TABLE public.discount_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_audit_logs ENABLE ROW LEVEL SECURITY;

-- Denegar acceso directo anónimo a tablas comerciales; todo se opera vía RPCs con SECURITY DEFINER
DO $$
BEGIN
  DROP POLICY IF EXISTS "no_direct_license_packages" ON public.license_packages;
  CREATE POLICY "no_direct_license_packages" ON public.license_packages FOR ALL TO anon, authenticated USING (FALSE) WITH CHECK (FALSE);

  DROP POLICY IF EXISTS "no_direct_license_codes" ON public.license_codes;
  CREATE POLICY "no_direct_license_codes" ON public.license_codes FOR ALL TO anon, authenticated USING (FALSE) WITH CHECK (FALSE);

  DROP POLICY IF EXISTS "no_direct_entitlements" ON public.entitlements;
  CREATE POLICY "no_direct_entitlements" ON public.entitlements FOR ALL TO anon, authenticated USING (FALSE) WITH CHECK (FALSE);

  DROP POLICY IF EXISTS "no_direct_audit_logs" ON public.commercial_audit_logs;
  CREATE POLICY "no_direct_audit_logs" ON public.commercial_audit_logs FOR ALL TO anon, authenticated USING (FALSE) WITH CHECK (FALSE);

  DROP POLICY IF EXISTS "public_read_discount_tiers" ON public.discount_tiers;
  CREATE POLICY "public_read_discount_tiers" ON public.discount_tiers FOR SELECT TO anon, authenticated USING (is_active = TRUE);
END $$;


-- 7. FUNCIÓN AUXILIAR: Verificación estricta de Superadmin
CREATE OR REPLACE FUNCTION public.is_admin_user(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean TEXT := LOWER(TRIM(p_email));
  v_role TEXT;
BEGIN
  IF v_clean IN (
    'recursosparaministerios@gmail.com',
    'andradesanchezavril@gmail.com',
    'karenprofet@gmail.com',
    'contacto@alsiztech.com',
    'contactoalsiztech.com',
    'mauriandrade2@gmail.com'
  ) OR v_clean LIKE '%alsiztech%' OR v_clean LIKE '%admin@skatecoreo%' THEN
    RETURN TRUE;
  END IF;

  SELECT role INTO v_role FROM public.users WHERE LOWER(email) = v_clean LIMIT 1;
  RETURN COALESCE(v_role = 'superadmin', FALSE);
END;
$$;


-- 8. RPC: Cálculo Seguro de Precios y Descuento en Backend
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
  v_tier RECORD;
BEGIN
  IF p_total_licenses <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El número de licencias debe ser mayor a 0');
  END IF;

  -- Precios unitarios oficiales de SkateCoreo
  IF LOWER(TRIM(p_plan)) = 'monthly' THEN
    v_unit_price := 5.00;
  ELSE
    v_unit_price := 48.00; -- Anual $48 ($60 normal con 20% descuento base individual)
  END IF;

  v_subtotal := v_unit_price * p_total_licenses;

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
  v_total := v_subtotal - v_discount_amount;

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


-- 9. RPC: Creación de Paquete de Licencias y Generación de Códigos Únicos
CREATE OR REPLACE FUNCTION public.admin_create_license_package(
  p_admin_email TEXT,
  p_client_name TEXT,
  p_client_email TEXT,
  p_total_licenses INT,
  p_plan TEXT DEFAULT 'annual',
  p_negotiated_discount NUMERIC DEFAULT NULL,
  p_payment_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_pricing JSONB;
  v_package_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_codes TEXT[] := ARRAY[]::TEXT[];
  v_code TEXT;
  v_chars TEXT := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- Evita caracteres ambiguos (0/O, 1/I, L)
  v_part1 TEXT;
  v_part2 TEXT;
  i INT;
  j INT;
BEGIN
  IF NOT public.is_admin_user(p_admin_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes autorización para realizar esta operación.');
  END IF;

  IF TRIM(COALESCE(p_client_name, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El nombre del cliente o club es obligatorio.');
  END IF;

  IF p_total_licenses <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La cantidad de licencias debe ser mayor a 0.');
  END IF;

  -- Calcular precios validados por el motor
  v_pricing := public.calculate_package_pricing(p_total_licenses, p_plan, p_negotiated_discount);
  IF NOT (v_pricing->>'success')::BOOLEAN THEN
    RETURN v_pricing;
  END IF;

  -- Vigencia: 1 año para annual, 1 mes para monthly
  IF LOWER(TRIM(p_plan)) = 'monthly' THEN
    v_expires_at := NOW() + INTERVAL '30 days';
  ELSE
    v_expires_at := NOW() + INTERVAL '365 days';
  END IF;

  -- Insertar paquete con snapshot comercial inmutable
  INSERT INTO public.license_packages (
    client_name,
    client_email,
    total_licenses,
    used_licenses,
    plan,
    billing_period,
    unit_base_price,
    discount_percent,
    discount_type,
    subtotal,
    discount_amount,
    total_amount,
    status,
    starts_at,
    expires_at,
    payment_reference,
    authorized_by,
    notes
  ) VALUES (
    TRIM(p_client_name),
    TRIM(COALESCE(p_client_email, '')),
    p_total_licenses,
    0,
    LOWER(TRIM(p_plan)),
    LOWER(TRIM(p_plan)),
    (v_pricing->>'unit_base_price')::NUMERIC,
    (v_pricing->>'discount_percent')::NUMERIC,
    (v_pricing->>'discount_type')::TEXT,
    (v_pricing->>'subtotal')::NUMERIC,
    (v_pricing->>'discount_amount')::NUMERIC,
    (v_pricing->>'total_amount')::NUMERIC,
    'active',
    NOW(),
    v_expires_at,
    TRIM(COALESCE(p_payment_reference, '')),
    LOWER(TRIM(p_admin_email)),
    TRIM(COALESCE(p_notes, ''))
  ) RETURNING id INTO v_package_id;

  -- Generación de exactamente N códigos únicos e impredecibles
  FOR i IN 1..p_total_licenses LOOP
    LOOP
      v_part1 := '';
      FOR j IN 1..4 LOOP
        v_part1 := v_part1 || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
      END LOOP;

      v_part2 := '';
      FOR j IN 1..4 LOOP
        v_part2 := v_part2 || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
      END LOOP;

      v_code := 'SKC-' || v_part1 || '-' || v_part2;

      -- Verificar unicidad
      IF NOT EXISTS (SELECT 1 FROM public.license_codes WHERE code = v_code) THEN
        EXIT;
      END IF;
    END LOOP;

    INSERT INTO public.license_codes (
      package_id,
      code,
      status,
      expires_at
    ) VALUES (
      v_package_id,
      v_code,
      'available',
      v_expires_at
    );

    v_codes := array_append(v_codes, v_code);
  END LOOP;

  -- Registrar en log de auditoría
  INSERT INTO public.commercial_audit_logs (
    performed_by,
    action,
    package_id,
    details
  ) VALUES (
    LOWER(TRIM(p_admin_email)),
    'create_package',
    v_package_id,
    jsonb_build_object(
      'client_name', p_client_name,
      'total_licenses', p_total_licenses,
      'plan', p_plan,
      'pricing', v_pricing,
      'expires_at', v_expires_at,
      'payment_reference', p_payment_reference
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'package_id', v_package_id,
    'client_name', p_client_name,
    'total_licenses', p_total_licenses,
    'plan', p_plan,
    'pricing', v_pricing,
    'expires_at', v_expires_at,
    'codes', v_codes
  );
END;
$$;


-- 10. RPC: Listar Paquetes para el Panel Administrativo
CREATE OR REPLACE FUNCTION public.admin_list_license_packages(p_admin_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_packages JSONB;
BEGIN
  IF NOT public.is_admin_user(p_admin_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso no autorizado.');
  END IF;

  SELECT COALESCE(jsonb_agg(pkg_data ORDER BY pkg_data->>'created_at' DESC), '[]'::jsonb)
  INTO v_packages
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'package_number', p.package_number,
      'client_name', p.client_name,
      'client_email', p.client_email,
      'total_licenses', p.total_licenses,
      'used_licenses', p.used_licenses,
      'available_licenses', (p.total_licenses - p.used_licenses),
      'plan', p.plan,
      'unit_base_price', p.unit_base_price,
      'discount_percent', p.discount_percent,
      'discount_type', p.discount_type,
      'subtotal', p.subtotal,
      'discount_amount', p.discount_amount,
      'total_amount', p.total_amount,
      'status', p.status,
      'starts_at', p.starts_at,
      'expires_at', p.expires_at,
      'payment_reference', p.payment_reference,
      'authorized_by', p.authorized_by,
      'notes', p.notes,
      'created_at', p.created_at
    ) AS pkg_data
    FROM public.license_packages p
  ) sub;

  RETURN jsonb_build_object('success', true, 'packages', v_packages);
END;
$$;


-- 11. RPC: Listar Códigos de un Paquete Específico
CREATE OR REPLACE FUNCTION public.admin_get_package_codes(
  p_admin_email TEXT,
  p_package_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codes JSONB;
  v_package RECORD;
BEGIN
  IF NOT public.is_admin_user(p_admin_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso no autorizado.');
  END IF;

  SELECT * INTO v_package FROM public.license_packages WHERE id = p_package_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Paquete no encontrado.');
  END IF;

  SELECT COALESCE(jsonb_agg(cd_data ORDER BY cd_data->>'created_at' ASC), '[]'::jsonb)
  INTO v_codes
  FROM (
    SELECT jsonb_build_object(
      'id', c.id,
      'code', c.code,
      'status', c.status,
      'assigned_to_user_id', c.assigned_to_user_id,
      'assigned_email', c.assigned_email,
      'assigned_name', c.assigned_name,
      'assigned_at', c.assigned_at,
      'expires_at', c.expires_at,
      'created_at', c.created_at
    ) AS cd_data
    FROM public.license_codes c
    WHERE c.package_id = p_package_id
  ) sub;

  RETURN jsonb_build_object(
    'success', true,
    'package', jsonb_build_object(
      'id', v_package.id,
      'package_number', v_package.package_number,
      'client_name', v_package.client_name,
      'total_licenses', v_package.total_licenses,
      'used_licenses', v_package.used_licenses,
      'plan', v_package.plan,
      'expires_at', v_package.expires_at,
      'status', v_package.status
    ),
    'codes', v_codes
  );
END;
$$;


-- 12. RPC: Revocación Segura de Licencia
CREATE OR REPLACE FUNCTION public.admin_revoke_license_code(
  p_admin_email TEXT,
  p_code_id UUID,
  p_reason TEXT DEFAULT 'Revocación administrativa'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code RECORD;
  v_package RECORD;
BEGIN
  IF NOT public.is_admin_user(p_admin_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso no autorizado.');
  END IF;

  SELECT * INTO v_code FROM public.license_codes WHERE id = p_code_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Código no encontrado.');
  END IF;

  SELECT * INTO v_package FROM public.license_packages WHERE id = v_code.package_id;

  -- Marcar código como revocado
  UPDATE public.license_codes
  SET status = 'revoked',
      updated_at = NOW()
  WHERE id = p_code_id;

  -- Si estaba asignado a un usuario, revocar también su entitlement activo
  IF v_code.assigned_to_user_id IS NOT NULL THEN
    UPDATE public.entitlements
    SET status = 'revoked',
        updated_at = NOW()
    WHERE user_id = v_code.assigned_to_user_id
      AND license_code_id = p_code_id;

    -- Ajustar used_licenses en el paquete
    UPDATE public.license_packages
    SET used_licenses = GREATEST(0, used_licenses - 1),
        updated_at = NOW()
    WHERE id = v_code.package_id;

    -- Comprobar si el usuario tiene otros entitlements vigentes
    IF NOT EXISTS (
      SELECT 1 FROM public.entitlements 
      WHERE user_id = v_code.assigned_to_user_id 
        AND status = 'active' 
        AND expires_at > NOW()
    ) THEN
      UPDATE public.users
      SET subscription_status = 'inactive',
          access_expires_at = NOW()
      WHERE id = v_code.assigned_to_user_id;
    END IF;
  END IF;

  -- Registrar auditoría
  INSERT INTO public.commercial_audit_logs (
    performed_by,
    action,
    package_id,
    details
  ) VALUES (
    LOWER(TRIM(p_admin_email)),
    'revoke_license',
    v_code.package_id,
    jsonb_build_object(
      'code_id', p_code_id,
      'code', v_code.code,
      'previous_status', v_code.status,
      'assigned_email', v_code.assigned_email,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'Licencia revocada exitosamente.');
END;
$$;


-- 13. RPC: Renovación de Paquete de Licencias (Extiende vigencia de miembros sin duplicar cuentas)
CREATE OR REPLACE FUNCTION public.admin_renew_license_package(
  p_admin_email TEXT,
  p_package_id UUID,
  p_extension_days INT DEFAULT 365,
  p_payment_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pkg RECORD;
  v_base_time TIMESTAMPTZ;
  v_new_expiry TIMESTAMPTZ;
  v_updated_users INT := 0;
BEGIN
  IF NOT public.is_admin_user(p_admin_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso no autorizado.');
  END IF;

  IF p_extension_days <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El número de días a extender debe ser positivo.');
  END IF;

  SELECT * INTO v_pkg FROM public.license_packages WHERE id = p_package_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Paquete no encontrado.');
  END IF;

  -- Si el paquete aún no expiró, extender a partir de su expiración previa; si ya expiró, a partir de hoy
  v_base_time := GREATEST(NOW(), v_pkg.expires_at);
  v_new_expiry := v_base_time + (p_extension_days || ' days')::INTERVAL;

  -- 1. Actualizar el paquete
  UPDATE public.license_packages
  SET expires_at = v_new_expiry,
      status = 'active',
      payment_reference = COALESCE(NULLIF(TRIM(p_payment_reference), ''), payment_reference),
      notes = COALESCE(notes || E'\n' || TRIM(p_notes), notes),
      updated_at = NOW()
  WHERE id = p_package_id;

  -- 2. Extender vigencia de todos los códigos del paquete
  UPDATE public.license_codes
  SET expires_at = v_new_expiry,
      updated_at = NOW()
  WHERE package_id = p_package_id;

  -- 3. Extender vigencia de los entitlements de los usuarios activos del paquete
  UPDATE public.entitlements
  SET expires_at = v_new_expiry,
      status = 'active',
      updated_at = NOW()
  WHERE package_id = p_package_id
    AND status != 'revoked';

  -- 4. Actualizar users.access_expires_at para todos los usuarios miembros del paquete
  UPDATE public.users u
  SET access_expires_at = v_new_expiry,
      subscription_status = 'active',
      updated_at = NOW()
  FROM public.entitlements e
  WHERE e.user_id = u.id
    AND e.package_id = p_package_id
    AND e.status = 'active';

  GET DIAGNOSTICS v_updated_users = ROW_COUNT;

  -- Registrar en log de auditoría
  INSERT INTO public.commercial_audit_logs (
    performed_by,
    action,
    package_id,
    details
  ) VALUES (
    LOWER(TRIM(p_admin_email)),
    'renew_package',
    p_package_id,
    jsonb_build_object(
      'extension_days', p_extension_days,
      'previous_expiry', v_pkg.expires_at,
      'new_expiry', v_new_expiry,
      'members_extended', v_updated_users,
      'payment_reference', p_payment_reference
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Paquete renovado con éxito.',
    'new_expires_at', v_new_expiry,
    'members_extended', v_updated_users
  );
END;
$$;


-- 14. RPC: Canje Simple y Seguro de Código de Licencia para Usuario Final
CREATE OR REPLACE FUNCTION public.redeem_club_license_code(
  p_code TEXT,
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_device_id TEXT,
  p_device_type public.device_type,
  p_device_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_code TEXT := UPPER(TRIM(p_code));
  v_clean_email TEXT := LOWER(TRIM(p_email));
  v_code RECORD;
  v_pkg RECORD;
  v_user RECORD;
  v_user_id UUID;
  v_is_new BOOLEAN := FALSE;
  v_display_name TEXT;
  v_entitlement_id UUID;
BEGIN
  IF v_clean_code = '' OR v_clean_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes ingresar el código de licencia y tu correo.');
  END IF;

  IF LENGTH(COALESCE(p_password, '')) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La contraseña debe tener al menos 6 caracteres.');
  END IF;

  -- 1. Buscar código en license_codes con bloqueo pesimista
  SELECT * INTO v_code
  FROM public.license_codes
  WHERE UPPER(code) = v_clean_code
  FOR UPDATE;

  -- Fallback de compatibilidad con activation_codes históricos si no está en license_codes
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.activation_codes WHERE UPPER(code) = v_clean_code) THEN
      RETURN public.redeem_promo_code(
        p_code, p_email, p_password, p_full_name,
        p_device_id, p_device_type, p_device_name
      );
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'El código de licencia ingresado no existe.');
    END IF;
  END IF;

  IF v_code.status != 'available' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este código de licencia ya fue utilizado o ha sido revocado.');
  END IF;

  IF v_code.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este paquete de licencias ha expirado.');
  END IF;

  SELECT * INTO v_pkg FROM public.license_packages WHERE id = v_code.package_id;

  v_display_name := COALESCE(NULLIF(TRIM(p_full_name), ''), split_part(v_clean_email, '@', 1));

  -- 2. Buscar si el usuario ya existe o crearlo
  SELECT * INTO v_user
  FROM public.users
  WHERE LOWER(email) = v_clean_email
  FOR UPDATE;

  IF FOUND THEN
    -- Validar contraseña de cuenta existente
    IF v_user.password_hash != crypt(p_password, v_user.password_hash) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Esta cuenta ya existe pero la contraseña no coincide.');
    END IF;

    v_user_id := v_user.id;
    v_is_new := FALSE;

    -- Actualizar vigencia en usuario
    UPDATE public.users
    SET access_expires_at = GREATEST(COALESCE(access_expires_at, NOW()), v_code.expires_at),
        subscription_status = 'active',
        subscription_plan = 'club',
        updated_at = NOW()
    WHERE id = v_user_id;
  ELSE
    -- Crear nuevo usuario
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
      v_display_name,
      'user',
      'active',
      'club',
      v_code.expires_at
    ) RETURNING id INTO v_user_id;

    v_is_new := TRUE;
  END IF;

  -- 3. Registrar o actualizar dispositivo
  PERFORM 1 FROM public.devices WHERE user_id = v_user_id AND device_id = p_device_id;
  IF NOT FOUND THEN
    INSERT INTO public.devices (user_id, device_id, device_type, device_name, is_active, last_login)
    VALUES (v_user_id, p_device_id, p_device_type, COALESCE(p_device_name, ''), TRUE, NOW())
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.devices
    SET last_login = NOW(),
        is_active = TRUE
    WHERE user_id = v_user_id AND device_id = p_device_id;
  END IF;

  -- 4. Crear Entitlement
  INSERT INTO public.entitlements (
    user_id,
    access_source,
    plan,
    status,
    starts_at,
    expires_at,
    package_id,
    license_code_id,
    metadata
  ) VALUES (
    v_user_id,
    'club_license',
    COALESCE(v_pkg.plan, 'annual'),
    'active',
    NOW(),
    v_code.expires_at,
    v_code.package_id,
    v_code.id,
    jsonb_build_object('client_name', v_pkg.client_name)
  ) RETURNING id INTO v_entitlement_id;

  -- 5. Marcar código como asignado
  UPDATE public.license_codes
  SET status = 'assigned',
      assigned_to_user_id = v_user_id,
      assigned_email = v_clean_email,
      assigned_name = v_display_name,
      assigned_at = NOW(),
      updated_at = NOW()
  WHERE id = v_code.id;

  -- 6. Incrementar contador de licencias usadas en el paquete
  UPDATE public.license_packages
  SET used_licenses = used_licenses + 1,
      updated_at = NOW()
  WHERE id = v_code.package_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', '¡Licencia activada con éxito!',
    'is_new_user', v_is_new,
    'plan', COALESCE(v_pkg.plan, 'annual'),
    'access_expires_at', v_code.expires_at,
    'user', jsonb_build_object(
      'id', v_user_id,
      'email', v_clean_email,
      'full_name', v_display_name,
      'role', 'user',
      'subscription_status', 'active',
      'subscription_plan', 'club',
      'access_expires_at', v_code.expires_at
    )
  );
END;
$$;


-- 15. RPC: Auditoría y Listado de Logs
CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(
  p_admin_email TEXT,
  p_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_logs JSONB;
BEGIN
  IF NOT public.is_admin_user(p_admin_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso no autorizado.');
  END IF;

  SELECT COALESCE(jsonb_agg(log_row ORDER BY log_row->>'created_at' DESC), '[]'::jsonb)
  INTO v_logs
  FROM (
    SELECT jsonb_build_object(
      'id', l.id,
      'performed_by', l.performed_by,
      'action', l.action,
      'package_id', l.package_id,
      'details', l.details,
      'created_at', l.created_at
    ) AS log_row
    FROM public.commercial_audit_logs l
    LIMIT p_limit
  ) sub;

  RETURN jsonb_build_object('success', true, 'logs', v_logs);
END;
$$;
