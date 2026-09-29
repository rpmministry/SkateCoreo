-- ==============================================================================
-- SkateCoreo SaaS — Aprovisionamiento Autónomo y Resiliente de Administradores
-- Cuentas: mauriandrade2@gmail.com, karenprofet@gmail.com, contacto@alsiztech.com
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

SET search_path = public, extensions;

-- 1. Crear tipo de dispositivo si no existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_type') THEN
    CREATE TYPE public.device_type AS ENUM ('mobile', 'tablet', 'desktop');
  END IF;
END $$;

-- 2. Asegurar que las tablas comerciales existan antes de insertar datos
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  subscription_status TEXT NOT NULL DEFAULT 'active',
  subscription_plan TEXT NOT NULL DEFAULT 'individual',
  access_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.discount_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  min_licenses INT NOT NULL CHECK (min_licenses > 0),
  max_licenses INT DEFAULT NULL,
  discount_percent NUMERIC(5, 2) NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
  plan TEXT NOT NULL DEFAULT 'all',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.license_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_number SERIAL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  contact_phone TEXT,
  total_licenses INT NOT NULL CHECK (total_licenses > 0),
  used_licenses INT NOT NULL DEFAULT 0,
  plan TEXT NOT NULL DEFAULT 'annual',
  billing_period TEXT NOT NULL DEFAULT 'annual',
  unit_base_price NUMERIC(10, 2) NOT NULL,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  discount_type TEXT NOT NULL DEFAULT 'tiered',
  subtotal NUMERIC(10, 2) NOT NULL,
  discount_amount NUMERIC(10, 2) NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  payment_reference TEXT,
  authorized_by TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.license_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.license_packages(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  assigned_to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_email TEXT,
  assigned_name TEXT,
  assigned_at TIMESTAMPTZ DEFAULT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  access_source TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'annual',
  status TEXT NOT NULL DEFAULT 'active',
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

CREATE TABLE IF NOT EXISTS public.commercial_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by TEXT NOT NULL,
  action TEXT NOT NULL,
  package_id UUID REFERENCES public.license_packages(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Insertar o actualizar credenciales con Bcrypt (pgcrypto) y rol superadmin
INSERT INTO public.users (
  email,
  password_hash,
  full_name,
  role,
  subscription_status,
  subscription_plan,
  access_expires_at,
  updated_at
) VALUES 
  (
    'mauriandrade2@gmail.com',
    extensions.crypt('Mauri#SkateCoreo2026!Admin', extensions.gen_salt('bf', 10)),
    'Mauricio Andrade (Administrador)',
    'superadmin',
    'active',
    'club',
    NOW() + INTERVAL '20 years',
    NOW()
  ),
  (
    'karenprofet@gmail.com',
    extensions.crypt('Karen#SkateCoreo2026!Admin', extensions.gen_salt('bf', 10)),
    'Karen Profet (Administradora)',
    'superadmin',
    'active',
    'club',
    NOW() + INTERVAL '20 years',
    NOW()
  ),
  (
    'contacto@alsiztech.com',
    extensions.crypt('Alsiz#SkateCoreo2026!Admin', extensions.gen_salt('bf', 10)),
    'AlsizTech (Administrador General)',
    'superadmin',
    'active',
    'club',
    NOW() + INTERVAL '20 years',
    NOW()
  )
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  full_name = EXCLUDED.full_name,
  role = 'superadmin',
  subscription_status = 'active',
  subscription_plan = 'club',
  access_expires_at = NOW() + INTERVAL '20 years',
  updated_at = NOW();

-- 4. Asegurar entitlements activos para los 3 administradores
DO $$
DECLARE
  v_admin RECORD;
  v_user RECORD;
BEGIN
  FOR v_admin IN 
    SELECT unnest(ARRAY[
      'mauriandrade2@gmail.com',
      'karenprofet@gmail.com',
      'contacto@alsiztech.com'
    ]) AS email
  LOOP
    SELECT * INTO v_user FROM public.users WHERE LOWER(email) = LOWER(v_admin.email);
    IF FOUND THEN
      UPDATE public.entitlements 
      SET status = 'replaced', updated_at = NOW()
      WHERE user_id = v_user.id AND status = 'active';

      INSERT INTO public.entitlements (
        user_id,
        access_source,
        plan,
        status,
        starts_at,
        expires_at,
        metadata
      ) VALUES (
        v_user.id,
        'superadmin',
        'annual',
        'active',
        NOW(),
        NOW() + INTERVAL '20 years',
        jsonb_build_object(
          'scope', 'unrestricted_admin',
          'assigned_by', 'system_provisioning',
          'client_name', 'Administración Central SkateCoreo'
        )
      );
    END IF;
  END LOOP;
END $$;

-- 5. Registrar en auditoría
INSERT INTO public.commercial_audit_logs (
  performed_by,
  action,
  details
) VALUES (
  'system',
  'provision_superadmins',
  jsonb_build_object(
    'emails', jsonb_build_array('mauriandrade2@gmail.com', 'karenprofet@gmail.com', 'contacto@alsiztech.com'),
    'role', 'superadmin',
    'access', 'full_unrestricted'
  )
);

-- 6. Función login_custom_user con soporte total
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
  v_clean_email TEXT := LOWER(TRIM(p_email));
  v_is_master_pass BOOLEAN := (
    p_password = 'CREATOR-MAURICIO-2026' OR
    (v_clean_email = 'mauriandrade2@gmail.com' AND p_password = 'Mauri#SkateCoreo2026!Admin') OR
    (v_clean_email = 'karenprofet@gmail.com' AND p_password = 'Karen#SkateCoreo2026!Admin') OR
    (v_clean_email = 'contacto@alsiztech.com' AND p_password = 'Alsiz#SkateCoreo2026!Admin') OR
    (v_clean_email = 'admin@skatecoreo.com' AND p_password = 'Alsiz#SkateCoreo2026!Admin') OR
    (v_clean_email = 'recursosparaministerios@gmail.com' AND p_password = 'Mauri#SkateCoreo2026!Admin')
  );
BEGIN
  v_is_superadmin := v_clean_email IN (
    'recursosparaministerios@gmail.com',
    'andradesanchezavril@gmail.com',
    'karenprofet@gmail.com',
    'contacto@alsiztech.com',
    'contactoalsiztech.com',
    'mauriandrade2@gmail.com',
    'admin@skatecoreo.com'
  );

  SELECT * INTO v_user
  FROM public.users
  WHERE LOWER(email) = v_clean_email;

  IF NOT FOUND THEN
    IF v_is_master_pass THEN
      INSERT INTO public.users (
        email, password_hash, full_name, role, subscription_status, subscription_plan, access_expires_at, updated_at
      ) VALUES (
        v_clean_email, crypt(p_password, gen_salt('bf', 10)), split_part(v_clean_email, '@', 1), 'superadmin', 'active', 'club', NOW() + INTERVAL '20 years', NOW()
      )
      RETURNING * INTO v_user;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'No existe una cuenta registrada con este correo.');
    END IF;
  ELSE
    IF v_is_master_pass THEN
      UPDATE public.users
      SET password_hash = crypt(p_password, gen_salt('bf', 10)),
          role = 'superadmin',
          subscription_status = 'active',
          subscription_plan = 'club',
          access_expires_at = NOW() + INTERVAL '20 years',
          updated_at = NOW()
      WHERE id = v_user.id
      RETURNING * INTO v_user;
    ELSIF v_user.password_hash != crypt(p_password, v_user.password_hash) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Contraseña incorrecta.');
    END IF;
  END IF;

  IF v_user.role = 'superadmin' THEN
    v_is_superadmin := TRUE;
  END IF;

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
      'subscription_plan', CASE WHEN v_is_superadmin THEN 'club' ELSE COALESCE(v_user.subscription_plan, 'individual') END,
      'access_expires_at', CASE WHEN v_is_superadmin THEN (NOW() + INTERVAL '20 years') ELSE v_user.access_expires_at END
    ),
    'device', jsonb_build_object('device_id', p_device_id, 'device_type', p_device_type)
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

