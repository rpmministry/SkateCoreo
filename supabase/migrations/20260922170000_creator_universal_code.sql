-- ==============================================================================
-- SkateCoreo — Código Universal del CREATOR
-- Fecha: 2026-09-22
--
-- Registra el código `CREATOR-MAURICIO-2026` como campaña CREATOR, ligado
-- EXCLUSIVAMENTE a las cuentas del equipo creador (allowlist). No es un backdoor:
-- si lo intenta canjear cualquier otro correo, el backend lo rechaza.
--
-- · Duración: 3650 días (acceso universal de larga duración).
-- · Usos: 1 (se marca REDEEMED al activarse).
-- · Concede rol `superadmin` y plan `individual`.
-- · No caduca el propio código (expires_at = NULL).
--
-- Integra la campaña existente (BETA_TESTER) generalizando `redeem_promo_code`.
-- ==============================================================================

-- 1. GENERALIZAR EL RPC DE CANJE A LAS CAMPAÑAS BETA_TESTER Y CREATOR ---------
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
  v_campaign    TEXT;
  v_days        INT;
  v_base        TIMESTAMPTZ;
  v_expiry      TIMESTAMPTZ;
  v_user_id     UUID;
  v_is_new      BOOLEAN := FALSE;
  v_plan        TEXT;
  v_new_role    TEXT;
  v_full_name   TEXT := COALESCE(NULLIF(TRIM(p_full_name), ''), split_part(LOWER(TRIM(p_email)), '@', 1));
  v_creator_emails TEXT[] := ARRAY[
    'recursosparaministerios@gmail.com',
    'andradesanchezavril@gmail.com',
    'karenprofet@gmail.com',
    'contacto@alsiztech.com',
    'contactoalsiztech.com',
    'mauriandrade2@gmail.com'
  ];
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

  v_campaign := UPPER(v_code.campaign);

  -- 2) Campañas soportadas por este RPC.
  IF v_campaign NOT IN ('BETA_TESTER', 'CREATOR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este código no pertenece a una campaña activa.');
  END IF;

  -- 2b) La campaña CREATOR está reservada al equipo creador.
  IF v_campaign = 'CREATOR' AND NOT (v_clean_email = ANY (v_creator_emails)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este código es exclusivo de la cuenta del creador.');
  END IF;

  -- 3) No usado / un solo uso.
  IF v_code.is_used = TRUE
     OR v_code.status <> 'AVAILABLE'
     OR v_code.used_count >= COALESCE(v_code.max_uses, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este código ya ha sido utilizado.');
  END IF;

  -- 4) Vigencia del propio código (NULL = sin caducidad).
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este código ha expirado.');
  END IF;

  v_days     := COALESCE(v_code.duration_days, 30);
  v_plan     := CASE WHEN v_campaign = 'CREATOR' THEN 'individual' ELSE 'beta_tester' END;
  v_new_role := CASE WHEN v_campaign = 'CREATOR' THEN 'superadmin' ELSE 'tester' END;

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
          subscription_plan   = v_plan,
          role                = CASE WHEN v_campaign = 'CREATOR' THEN 'superadmin' ELSE v_user.role END,
          updated_at          = NOW()
      WHERE id = v_user_id;
  ELSE
    v_is_new := TRUE;
    v_expiry := NOW() + (v_days || ' days')::INTERVAL;

    INSERT INTO public.users (
      email, password_hash, full_name, role, subscription_status, subscription_plan, access_expires_at
    ) VALUES (
      v_clean_email, crypt(p_password, gen_salt('bf', 10)), v_full_name,
      v_new_role, 'active', v_plan, v_expiry
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
    'message', CASE
      WHEN v_campaign = 'CREATOR' THEN '¡Código de Creador activado! Acceso universal habilitado.'
      ELSE '¡Código Beta Tester activado! Disfruta de ' || v_days || ' días de acceso.'
    END,
    'campaign', v_campaign,
    'days_granted', v_days,
    'subscription_plan', v_plan,
    'access_expires_at', v_expiry,
    'is_new_account', v_is_new,
    'user', jsonb_build_object(
      'id', v_user_id,
      'email', v_clean_email,
      'full_name', v_full_name,
      'role', CASE WHEN v_is_new THEN v_new_role ELSE (CASE WHEN v_campaign = 'CREATOR' THEN 'superadmin' ELSE v_user.role END) END,
      'subscription_status', 'active',
      'subscription_plan', v_plan,
      'access_expires_at', v_expiry
    )
  );
END;
$$;

-- 2. REGISTRAR EL CÓDIGO UNIVERSAL DEL CREATOR --------------------------------
--    Idempotente: si ya existe, no se duplica.
INSERT INTO public.activation_codes
  (code, campaign, kind, duration_days, max_uses, used_count, status, subscription_plan, notes, expires_at)
VALUES
  ('CREATOR-MAURICIO-2026', 'CREATOR', 'GIFT', 3650, 1, 0, 'AVAILABLE', 'individual',
   'CREATOR · acceso universal (solo equipo creador)', NULL)
ON CONFLICT (code) DO UPDATE
  SET campaign          = EXCLUDED.campaign,
      kind              = EXCLUDED.kind,
      duration_days     = EXCLUDED.duration_days,
      max_uses          = EXCLUDED.max_uses,
      subscription_plan = EXCLUDED.subscription_plan,
      notes             = EXCLUDED.notes,
      expires_at        = EXCLUDED.expires_at
  -- No se resetea el estado de un código ya canjeado.
  WHERE public.activation_codes.is_used = FALSE;

-- 3. Refrescar la caché de esquema de PostgREST.
NOTIFY pgrst, 'reload schema';
