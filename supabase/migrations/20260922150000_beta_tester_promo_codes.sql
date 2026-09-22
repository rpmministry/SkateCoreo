-- ==============================================================================
-- SkateCoreo — Campaña promocional BETA_TESTER (10 códigos · 30 días · un uso)
-- Fecha: 2026-09-22
--
-- INTEGRACIÓN (no paralela):
--   · Reutiliza las tablas existentes `public.users` y `public.activation_codes`.
--   · Amplía `activation_codes` con campos de campaña/estado/auditoría.
--   · Añade `users.subscription_plan` para identificar el plan concedido.
--   · La validación y el canje ocurren SIEMPRE en el backend (RPC SECURITY
--     DEFINER). El cliente no puede leer ni escribir los códigos directamente.
--   · No modifica ni elimina las modalidades existentes (PayPal, /club, etc.).
-- ==============================================================================

-- 0. EXTENSIÓN CRIPTOGRÁFICA (Bcrypt)
--    Supabase instala pgcrypto en el esquema `extensions`. Se crea con ese
--    esquema y las funciones incluyen `extensions` en su search_path para que
--    `crypt()` y `gen_salt()` resuelvan siempre (en `public` o en `extensions`).
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. CAMPOS DE CAMPAÑA / ESTADO / AUDITORÍA EN activation_codes --------------
ALTER TABLE public.activation_codes
  ADD COLUMN IF NOT EXISTS campaign           TEXT        NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS kind               TEXT        NOT NULL DEFAULT 'GIFT',      -- GIFT | PAID | PROMO
  ADD COLUMN IF NOT EXISTS max_uses           INT         NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS used_count         INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status             TEXT        NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE | REDEEMED | EXPIRED | DISABLED
  ADD COLUMN IF NOT EXISTS subscription_plan  TEXT        NOT NULL DEFAULT 'individual',-- plan concedido
  ADD COLUMN IF NOT EXISTS expires_at         TIMESTAMPTZ DEFAULT NULL;                  -- vigencia del propio código

-- Backfill de los códigos históricos (coherencia de estado/uso).
UPDATE public.activation_codes
  SET used_count = 1,
      status = 'REDEEMED'
  WHERE is_used = TRUE AND used_count = 0;

UPDATE public.activation_codes
  SET status = 'AVAILABLE'
  WHERE is_used = FALSE AND status NOT IN ('AVAILABLE', 'DISABLED', 'EXPIRED');

CREATE INDEX IF NOT EXISTS idx_activation_codes_campaign_status
  ON public.activation_codes (campaign, status);

-- 2. PLAN CONCEDIDO EN LA CUENTA --------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT NULL; -- 'individual' | 'club' | 'beta_tester'

-- 3. ENDURECER RLS: los códigos SOLO se tocan desde RPC SECURITY DEFINER -----
-- (Existía una política permisiva heredada `activation_codes_all_access` con
--  USING(true), que permitía a cualquiera con la anon key leer/generar códigos.)
DROP POLICY IF EXISTS activation_codes_all_access ON public.activation_codes;
DROP POLICY IF EXISTS "No direct public access to activation codes" ON public.activation_codes;
DROP POLICY IF EXISTS "activation_codes_no_direct_access" ON public.activation_codes;

CREATE POLICY "activation_codes_no_direct_access"
  ON public.activation_codes
  FOR ALL
  TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

REVOKE ALL ON public.activation_codes FROM anon, authenticated;

-- 4. RPC DE CANJE (crea cuenta nueva o amplía una existente) -----------------
--    · Verifica campaña BETA_TESTER, disponibilidad, vigencia y usos.
--    · Verifica la contraseña si la cuenta ya existe (nadie amplía por otro).
--    · La expiración se calcula desde la FECHA REAL DE ACTIVACIÓN (+30 días).
--    · Bloqueo pesimista FOR UPDATE → imposible canjear dos veces por carrera.
CREATE OR REPLACE FUNCTION public.redeem_promo_code(
  p_code        TEXT,
  p_email       TEXT,
  p_password    TEXT,
  p_full_name   TEXT,
  p_device_id   TEXT,
  p_device_type public.device_type,
  p_device_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_code        RECORD;
  v_user        RECORD;
  v_clean_email TEXT := LOWER(TRIM(p_email));
  v_clean_code  TEXT := UPPER(TRIM(p_code));
  v_days        INT;
  v_base        TIMESTAMPTZ;
  v_expiry      TIMESTAMPTZ;
  v_user_id     UUID;
  v_is_new      BOOLEAN := FALSE;
  v_full_name   TEXT := COALESCE(NULLIF(TRIM(p_full_name), ''), split_part(LOWER(TRIM(p_email)), '@', 1));
BEGIN
  IF LENGTH(COALESCE(p_password, '')) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La contraseña debe tener al menos 6 caracteres.');
  END IF;
  IF v_clean_email = '' OR v_clean_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes indicar correo y código.');
  END IF;

  -- 1) Bloqueo del código (anti doble canje por concurrencia).
  SELECT * INTO v_code
  FROM public.activation_codes
  WHERE UPPER(code) = v_clean_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Código promocional inválido.');
  END IF;

  -- 2) Debe pertenecer a la campaña Beta Tester.
  IF UPPER(v_code.campaign) <> 'BETA_TESTER' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este código no pertenece a la campaña Beta Tester.');
  END IF;

  -- 3) No usado / un solo uso.
  IF v_code.is_used = TRUE
     OR v_code.status <> 'AVAILABLE'
     OR v_code.used_count >= COALESCE(v_code.max_uses, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este código ya ha sido utilizado.');
  END IF;

  -- 4) Vigencia del propio código.
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este código ha expirado.');
  END IF;

  v_days := COALESCE(v_code.duration_days, 30);

  -- 5) Cuenta existente: verificar contraseña y ampliar; si no, crear.
  SELECT * INTO v_user FROM public.users WHERE LOWER(email) = v_clean_email;

  IF FOUND THEN
    IF v_user.password_hash <> crypt(p_password, v_user.password_hash) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ese correo ya está registrado. Verifica tu contraseña para activar el código.');
    END IF;
    v_user_id := v_user.id;
    v_base    := GREATEST(NOW(), COALESCE(v_user.access_expires_at, NOW()));
    v_expiry  := v_base + (v_days || ' days')::INTERVAL;

    UPDATE public.users
      SET access_expires_at  = v_expiry,
          subscription_status = 'active',
          subscription_plan   = 'beta_tester',
          updated_at          = NOW()
      WHERE id = v_user_id;
  ELSE
    v_is_new := TRUE;
    v_expiry := NOW() + (v_days || ' days')::INTERVAL;

    INSERT INTO public.users (
      email, password_hash, full_name, role, subscription_status, subscription_plan, access_expires_at
    ) VALUES (
      v_clean_email, crypt(p_password, gen_salt('bf', 10)), v_full_name,
      'tester', 'active', 'beta_tester', v_expiry
    )
    RETURNING id INTO v_user_id;

    INSERT INTO public.devices (user_id, device_id, device_type, device_name, is_active, last_login)
    VALUES (v_user_id, p_device_id, p_device_type, COALESCE(p_device_name, ''), TRUE, NOW())
    ON CONFLICT (user_id, device_type) WHERE (is_active = TRUE)
    DO UPDATE SET device_id = EXCLUDED.device_id,
                  device_name = EXCLUDED.device_name,
                  last_login = NOW();
  END IF;

  -- 6) Marcar el código como canjeado (un solo uso, con auditoría).
  UPDATE public.activation_codes
    SET is_used    = TRUE,
        used_count = v_code.used_count + 1,
        status     = 'REDEEMED',
        used_by    = v_user_id,
        used_at    = NOW()
    WHERE id = v_code.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', '¡Código Beta Tester activado! Disfruta de ' || v_days || ' días de acceso.',
    'campaign', v_code.campaign,
    'days_granted', v_days,
    'subscription_plan', 'beta_tester',
    'access_expires_at', v_expiry,
    'is_new_account', v_is_new,
    'user', jsonb_build_object(
      'id', v_user_id,
      'email', v_clean_email,
      'full_name', v_full_name,
      'role', CASE WHEN v_is_new THEN 'tester' ELSE v_user.role END,
      'subscription_status', 'active',
      'subscription_plan', 'beta_tester',
      'access_expires_at', v_expiry
    )
  );
END;
$$;

-- 5. RPC DE ADMINISTRACIÓN: listado de códigos y canjes ---------------------
CREATE OR REPLACE FUNCTION public.admin_list_activation_codes(
  p_admin_email TEXT,
  p_campaign    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_email    TEXT := LOWER(TRIM(p_admin_email));
  v_is_admin BOOLEAN;
  v_codes    JSONB;
BEGIN
  v_is_admin := v_email IN (
      'recursosparaministerios@gmail.com',
      'andradesanchezavril@gmail.com',
      'karenprofet@gmail.com',
      'contacto@alsiztech.com',
      'contactoalsiztech.com',
      'mauriandrade2@gmail.com'
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE LOWER(u.email) = v_email AND u.role = 'superadmin'
    );

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado.');
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb)
  INTO v_codes
  FROM (
    SELECT
      ac.code,
      ac.campaign,
      ac.kind,
      ac.status,
      ac.duration_days,
      ac.max_uses,
      ac.used_count,
      ac.created_at,
      ac.used_at,
      ac.expires_at,
      ac.used_by,
      u.email      AS used_by_email,
      u.full_name  AS used_by_name,
      u.access_expires_at AS used_by_access_expires_at
    FROM public.activation_codes ac
    LEFT JOIN public.users u ON u.id = ac.used_by
    WHERE p_campaign IS NULL OR UPPER(ac.campaign) = UPPER(p_campaign)
  ) t;

  RETURN jsonb_build_object('success', true, 'count', jsonb_array_length(v_codes), 'codes', v_codes);
END;
$$;

-- 6. LOGIN: devolver también el PLAN (beta_tester | individual | club) --------
--    Se re-crea `login_custom_user` añadiendo `subscription_plan` a la respuesta
--    para que el cliente muestre el plan real tras volver a iniciar sesión. El
--    resto de la lógica (Bcrypt, dispositivos, superadmin) es idéntica.
CREATE OR REPLACE FUNCTION public.login_custom_user(
  p_email TEXT,
  p_password TEXT,
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
  v_user RECORD;
  v_active_device RECORD;
  v_is_superadmin BOOLEAN;
  v_active_devices_count INT;
BEGIN
  SELECT * INTO v_user
  FROM public.users
  WHERE LOWER(email) = LOWER(TRIM(p_email));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No existe una cuenta registrada con este correo.');
  END IF;

  IF v_user.password_hash != crypt(p_password, v_user.password_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contraseña incorrecta.');
  END IF;

  v_is_superadmin := (v_user.role = 'superadmin' OR LOWER(v_user.email) IN (
    'recursosparaministerios@gmail.com',
    'andradesanchezavril@gmail.com',
    'karenprofet@gmail.com',
    'contacto@alsiztech.com',
    'contactoalsiztech.com',
    'mauriandrade2@gmail.com'
  ));

  IF NOT v_is_superadmin THEN
    IF v_user.access_expires_at IS NULL OR v_user.access_expires_at < NOW() THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Tu acceso ha expirado. Por favor adquiere un plan para reactivar tu cuenta.',
        'expired', true
      );
    END IF;
  END IF;

  IF NOT v_is_superadmin THEN
    SELECT * INTO v_active_device
    FROM public.devices
    WHERE user_id = v_user.id
      AND device_type = p_device_type
      AND is_active = TRUE;

    IF FOUND THEN
      IF v_active_device.device_id != p_device_id THEN
        IF p_device_type = 'mobile' THEN
          RETURN jsonb_build_object('success', false, 'error', 'Ya tienes un teléfono celular registrado. Cierra sesión en tu otro teléfono para usar este.');
        ELSIF p_device_type = 'tablet' THEN
          RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una tablet registrada. Cierra sesión en tu otra tablet para usar esta.');
        ELSE
          RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una computadora registrada. Cierra sesión en tu otra computadora para usar esta.');
        END IF;
      ELSE
        UPDATE public.devices
        SET last_login = NOW(),
            device_name = COALESCE(NULLIF(p_device_name, ''), device_name),
            updated_at = NOW()
        WHERE id = v_active_device.id;
      END IF;
    ELSE
      SELECT COUNT(*) INTO v_active_devices_count
      FROM public.devices
      WHERE user_id = v_user.id AND is_active = TRUE;

      IF v_active_devices_count >= 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Has alcanzado el límite de 3 dispositivos activos. Desvincula uno para conectar este equipo.');
      END IF;

      INSERT INTO public.devices (user_id, device_id, device_type, device_name, is_active, last_login)
      VALUES (v_user.id, p_device_id, p_device_type, COALESCE(p_device_name, ''), TRUE, NOW());
    END IF;
  ELSE
    INSERT INTO public.devices (user_id, device_id, device_type, device_name, is_active, last_login)
    VALUES (v_user.id, p_device_id, p_device_type, COALESCE(p_device_name, ''), TRUE, NOW())
    ON CONFLICT (user_id, device_type) WHERE (is_active = TRUE)
    DO UPDATE SET last_login = NOW(), device_id = EXCLUDED.device_id, device_name = EXCLUDED.device_name;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'email', v_user.email,
      'full_name', v_user.full_name,
      'role', CASE WHEN v_is_superadmin THEN 'superadmin' ELSE v_user.role END,
      'subscription_status', 'active',
      'subscription_plan', CASE WHEN v_is_superadmin THEN 'individual' ELSE COALESCE(v_user.subscription_plan, 'individual') END,
      'access_expires_at', CASE WHEN v_is_superadmin THEN (NOW() + INTERVAL '10 years') ELSE v_user.access_expires_at END
    ),
    'device', jsonb_build_object('device_id', p_device_id, 'device_type', p_device_type)
  );
END;
$$;

-- 7. SIEMBRA DE LA CAMPAÑA: exactamente 10 códigos Beta Tester ---------------
--    Formato SC-BETA-XXXX-XXXX-XXXX · alfabeto sin caracteres ambiguos
--    (sin O/0/I/1/L) · 32^12 combinaciones · unicidad garantizada por UNIQUE.
--    Cada código: 30 días de acceso · 1 uso · estado AVAILABLE.
INSERT INTO public.activation_codes
  (code, campaign, kind, duration_days, max_uses, used_count, status, subscription_plan, notes, expires_at)
VALUES
  ('SC-BETA-SNPN-XTTN-8DJ3', 'BETA_TESTER', 'GIFT', 30, 1, 0, 'AVAILABLE', 'beta_tester', 'BETA_TESTER · acceso 30 días', NOW() + INTERVAL '30 days'),
  ('SC-BETA-PFEW-KQ5V-2KHC', 'BETA_TESTER', 'GIFT', 30, 1, 0, 'AVAILABLE', 'beta_tester', 'BETA_TESTER · acceso 30 días', NOW() + INTERVAL '30 days'),
  ('SC-BETA-5YR4-RS78-B843', 'BETA_TESTER', 'GIFT', 30, 1, 0, 'AVAILABLE', 'beta_tester', 'BETA_TESTER · acceso 30 días', NOW() + INTERVAL '30 days'),
  ('SC-BETA-9ZG9-ZS7P-X9ZE', 'BETA_TESTER', 'GIFT', 30, 1, 0, 'AVAILABLE', 'beta_tester', 'BETA_TESTER · acceso 30 días', NOW() + INTERVAL '30 days'),
  ('SC-BETA-2E62-69GY-CJX2', 'BETA_TESTER', 'GIFT', 30, 1, 0, 'AVAILABLE', 'beta_tester', 'BETA_TESTER · acceso 30 días', NOW() + INTERVAL '30 days'),
  ('SC-BETA-3H6T-8PTZ-J9SC', 'BETA_TESTER', 'GIFT', 30, 1, 0, 'AVAILABLE', 'beta_tester', 'BETA_TESTER · acceso 30 días', NOW() + INTERVAL '30 days'),
  ('SC-BETA-H5Q3-BAAM-CUDQ', 'BETA_TESTER', 'GIFT', 30, 1, 0, 'AVAILABLE', 'beta_tester', 'BETA_TESTER · acceso 30 días', NOW() + INTERVAL '30 days'),
  ('SC-BETA-KZ32-KY3Q-XHTE', 'BETA_TESTER', 'GIFT', 30, 1, 0, 'AVAILABLE', 'beta_tester', 'BETA_TESTER · acceso 30 días', NOW() + INTERVAL '30 days'),
  ('SC-BETA-BWH9-DJ43-CBW7', 'BETA_TESTER', 'GIFT', 30, 1, 0, 'AVAILABLE', 'beta_tester', 'BETA_TESTER · acceso 30 días', NOW() + INTERVAL '30 days'),
  ('SC-BETA-5RHX-VADY-EFPV', 'BETA_TESTER', 'GIFT', 30, 1, 0, 'AVAILABLE', 'beta_tester', 'BETA_TESTER · acceso 30 días', NOW() + INTERVAL '30 days')
ON CONFLICT (code) DO NOTHING;

-- 8. Refrescar la caché de esquema de PostgREST (evita 404 al llamar al RPC
--    recién creado hasta que Supabase recarga el esquema).
NOTIFY pgrst, 'reload schema';
