-- ==============================================================================
-- SkateArt - Acceso Maestro para Creador (Mauricio Andrade Luna)
-- Código Maestro: CREATOR-MAURICIO-2026
-- Permite acceso ilimitado en cualquier dispositivo a nivel de Superadmin
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

SET search_path = public, extensions;

-- 1. Insertar Código Maestro en activation_codes con usos ilimitados
INSERT INTO public.activation_codes (code, duration_days, is_used, notes)
VALUES ('CREATOR-MAURICIO-2026', 3650, FALSE, 'Código Maestro del Creador - Acceso Ilimitado Multi-Dispositivo')
ON CONFLICT (code) DO UPDATE 
SET is_used = FALSE, duration_days = 3650, notes = 'Código Maestro del Creador - Acceso Ilimitado Multi-Dispositivo';

-- 2. Pre-registrar Cuentas Superusuario Iniciales (con contraseña maestra inicial)
INSERT INTO public.users (email, password_hash, full_name, role, subscription_status, access_expires_at)
VALUES 
  ('mauriandrade2@gmail.com', extensions.crypt('CREATOR-MAURICIO-2026', extensions.gen_salt('bf', 10)), 'Mauricio Andrade (Creador)', 'superadmin', 'active', NOW() + INTERVAL '10 years'),
  ('recursosparaministerios@gmail.com', extensions.crypt('CREATOR-MAURICIO-2026', extensions.gen_salt('bf', 10)), 'Mauricio Andrade Luna', 'superadmin', 'active', NOW() + INTERVAL '10 years'),
  ('andradesanchezavril@gmail.com', extensions.crypt('CREATOR-MAURICIO-2026', extensions.gen_salt('bf', 10)), 'Avril Andrade', 'superadmin', 'active', NOW() + INTERVAL '10 years'),
  ('karenprofet@gmail.com', extensions.crypt('CREATOR-MAURICIO-2026', extensions.gen_salt('bf', 10)), 'Karen Profet', 'superadmin', 'active', NOW() + INTERVAL '10 years'),
  ('contacto@alsiztech.com', extensions.crypt('CREATOR-MAURICIO-2026', extensions.gen_salt('bf', 10)), 'AlsizTech Admin', 'superadmin', 'active', NOW() + INTERVAL '10 years'),
  ('contactoalsiztech.com', extensions.crypt('CREATOR-MAURICIO-2026', extensions.gen_salt('bf', 10)), 'AlsizTech Support', 'superadmin', 'active', NOW() + INTERVAL '10 years')
ON CONFLICT (email) DO UPDATE 
SET role = 'superadmin', 
    subscription_status = 'active', 
    access_expires_at = NOW() + INTERVAL '10 years';

-- 3. Actualizar función register_with_code para soportar Código Maestro Ilimitado
CREATE OR REPLACE FUNCTION public.register_with_code(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_code TEXT,
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
  v_code RECORD;
  v_user_id UUID;
  v_clean_email TEXT := LOWER(TRIM(p_email));
  v_clean_code TEXT := UPPER(TRIM(p_code));
  v_is_master BOOLEAN := (v_clean_code = 'CREATOR-MAURICIO-2026');
  v_expiry TIMESTAMPTZ := CASE WHEN v_is_master THEN (NOW() + INTERVAL '10 years') ELSE (NOW() + INTERVAL '1 year') END;
  v_role TEXT := CASE WHEN v_is_master THEN 'superadmin' ELSE 'user' END;
BEGIN
  IF LENGTH(p_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La contraseña debe tener al menos 6 caracteres.');
  END IF;

  -- 1. Validar código
  IF NOT v_is_master THEN
    SELECT * INTO v_code
    FROM public.activation_codes
    WHERE UPPER(code) = v_clean_code
      AND is_used = FALSE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Código de activación inválido o ya utilizado.');
    END IF;
  END IF;

  -- 2. Si es código maestro y el correo ya existe, actualizarlo a superadmin sin error
  IF EXISTS (SELECT 1 FROM public.users WHERE LOWER(email) = v_clean_email) THEN
    IF v_is_master THEN
      UPDATE public.users
      SET password_hash = crypt(p_password, gen_salt('bf', 10)),
          role = 'superadmin',
          subscription_status = 'active',
          access_expires_at = v_expiry,
          updated_at = NOW()
      WHERE LOWER(email) = v_clean_email
      RETURNING id INTO v_user_id;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Ya existe una cuenta con este correo. Inicia sesión en su lugar.');
    END IF;
  ELSE
    -- 3. Crear el usuario con Bcrypt
    INSERT INTO public.users (
      email,
      password_hash,
      full_name,
      role,
      subscription_status,
      access_expires_at
    ) VALUES (
      v_clean_email,
      crypt(p_password, gen_salt('bf', 10)),
      COALESCE(NULLIF(p_full_name, ''), split_part(v_clean_email, '@', 1)),
      v_role,
      'active',
      v_expiry
    )
    RETURNING id INTO v_user_id;
  END IF;

  -- 4. Registrar dispositivo (Superadmin no bloquea dispositivos)
  IF v_is_master THEN
    INSERT INTO public.devices (user_id, device_id, device_type, device_name, is_active, last_login)
    VALUES (v_user_id, p_device_id, p_device_type, COALESCE(p_device_name, ''), TRUE, NOW())
    ON CONFLICT (user_id, device_type) WHERE (is_active = TRUE)
    DO UPDATE SET last_login = NOW(), device_id = EXCLUDED.device_id, device_name = EXCLUDED.device_name;
  ELSE
    INSERT INTO public.devices (user_id, device_id, device_type, device_name, is_active, last_login)
    VALUES (v_user_id, p_device_id, p_device_type, COALESCE(p_device_name, ''), TRUE, NOW());

    -- Consumir código normal (código maestro NO se marca como usado)
    UPDATE public.activation_codes
    SET is_used = TRUE,
        used_by = v_user_id,
        used_at = NOW()
    WHERE id = v_code.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
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

-- 4. Actualizar función login_custom_user con soporte de Clave Maestra
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
  v_is_master_pass BOOLEAN := (p_password = 'CREATOR-MAURICIO-2026');
  v_clean_email TEXT := LOWER(TRIM(p_email));
BEGIN
  -- 1. Buscar usuario
  SELECT * INTO v_user
  FROM public.users
  WHERE LOWER(email) = v_clean_email;

  -- Si se ingresa la clave maestra y el usuario aún no existía, crearlo de inmediato
  IF NOT FOUND THEN
    IF v_is_master_pass THEN
      INSERT INTO public.users (email, password_hash, full_name, role, subscription_status, access_expires_at)
      VALUES (v_clean_email, crypt(p_password, gen_salt('bf', 10)), split_part(v_clean_email, '@', 1), 'superadmin', 'active', NOW() + INTERVAL '10 years')
      RETURNING * INTO v_user;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'No existe una cuenta registrada con este correo.');
    END IF;
  END IF;

  -- 2. Verificar contraseña con Bcrypt (O bypass si coincide con la Clave Maestra)
  IF NOT v_is_master_pass AND v_user.password_hash != crypt(p_password, v_user.password_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contraseña incorrecta.');
  END IF;

  -- 3. Verificar superadmin y expiración de acceso
  v_is_superadmin := (v_is_master_pass OR v_user.role = 'superadmin' OR v_clean_email IN (
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
        'error', 'Tu acceso anual ha expirado. Por favor adquiere un plan para reactivar tu cuenta.',
        'expired', true
      );
    END IF;
  END IF;

  -- 4. REGLA ESTRICTA ANTI-PIRATERÍA (Dispositivos)
  IF NOT v_is_superadmin THEN
    SELECT * INTO v_active_device
    FROM public.devices
    WHERE user_id = v_user.id 
      AND device_type = p_device_type
      AND is_active = TRUE;

    IF FOUND THEN
      IF v_active_device.device_id != p_device_id THEN
        IF p_device_type = 'mobile' THEN
          RETURN jsonb_build_object(
            'success', false,
            'error', 'Ya tienes un teléfono celular registrado. Cierra sesión en tu otro teléfono para usar este.'
          );
        ELSIF p_device_type = 'tablet' THEN
          RETURN jsonb_build_object(
            'success', false,
            'error', 'Ya tienes una tablet registrada. Cierra sesión en tu otra tablet para usar esta.'
          );
        ELSE
          RETURN jsonb_build_object(
            'success', false,
            'error', 'Ya tienes una computadora registrada. Cierra sesión en tu otra computadora para usar esta.'
          );
        END IF;
      ELSE
        -- Mismo dispositivo: refrescar último acceso
        UPDATE public.devices
        SET last_login = NOW(),
            device_name = COALESCE(NULLIF(p_device_name, ''), device_name),
            updated_at = NOW()
        WHERE id = v_active_device.id;
      END IF;
    ELSE
      -- Nuevo tipo de dispositivo: comprobar límite global de 3
      SELECT COUNT(*) INTO v_active_devices_count
      FROM public.devices
      WHERE user_id = v_user.id AND is_active = TRUE;

      IF v_active_devices_count >= 3 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Has alcanzado el límite de 3 dispositivos activos. Desvincula uno para conectar este equipo.'
        );
      END IF;

      -- Registrar el nuevo dispositivo
      INSERT INTO public.devices (user_id, device_id, device_type, device_name, is_active, last_login)
      VALUES (v_user.id, p_device_id, p_device_type, COALESCE(p_device_name, ''), TRUE, NOW());
    END IF;
  ELSE
    -- Superadmin: Registrar o refrescar dispositivo sin bloquear
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
      'access_expires_at', CASE WHEN v_is_superadmin THEN (NOW() + INTERVAL '10 years') ELSE v_user.access_expires_at END
    ),
    'device', jsonb_build_object(
      'device_id', p_device_id,
      'device_type', p_device_type
    )
  );
END;
$$;

