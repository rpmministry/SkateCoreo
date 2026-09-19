-- ==============================================================================
-- SkateArt - Sistema Completo de Identidad Propia, Anti-Piratería y Control de Dispositivos
-- Autor: Mauricio Andrade Luna & Antigravity Security
-- ==============================================================================

-- 1. Habilitar extensión criptográfica estándar (Bcrypt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Enumerador de Tipos de Dispositivo (Máx: 1 mobile, 1 tablet, 1 desktop)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_type') THEN
    CREATE TYPE public.device_type AS ENUM ('mobile', 'tablet', 'desktop');
  END IF;
END $$;

-- 3. TABLA: USERS (Cuentas independientes de proveedores externos)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user', -- 'user' | 'superadmin' | 'tester'
  subscription_status TEXT NOT NULL DEFAULT 'inactive', -- 'active' | 'inactive'
  access_expires_at TIMESTAMPTZ DEFAULT NULL, -- Fecha límite del acceso anual
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_access_expires ON public.users (access_expires_at);

-- 4. TABLA: DEVICES (Hardware Fingerprint y Límite Anti-Sharing)
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,                    -- UUID persistido en localStorage
  device_type public.device_type NOT NULL,    -- 'mobile' | 'tablet' | 'desktop'
  device_name TEXT DEFAULT '',                -- Ej: 'iPhone (Safari)', 'PC Windows'
  last_login TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON public.devices (user_id);
CREATE INDEX IF NOT EXISTS idx_devices_lookup ON public.devices (user_id, device_id);

-- Restricción Estricta a Nivel de Motor:
-- Solo 1 dispositivo activo por tipo para cada usuario
DROP INDEX IF EXISTS idx_unique_active_device_per_type;
CREATE UNIQUE INDEX idx_unique_active_device_per_type 
ON public.devices (user_id, device_type) 
WHERE (is_active = TRUE);

-- 5. TABLA: PENDING_PAYMENTS (Recibos Temporales de PayPal para Registro Post-Pago)
CREATE TABLE IF NOT EXISTS public.pending_payments (
  paypal_order_id TEXT PRIMARY KEY,
  paypal_capture_id TEXT,
  payer_email TEXT NOT NULL,
  payer_name TEXT DEFAULT '',
  amount NUMERIC DEFAULT 20.00,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending_registration', -- 'pending_registration' | 'claimed'
  claimed_by_user_id UUID REFERENCES public.users(id),
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_payments_email ON public.pending_payments (LOWER(payer_email));
CREATE INDEX IF NOT EXISTS idx_pending_payments_status ON public.pending_payments (status);

-- 6. TABLA: ACTIVATION_CODES (Códigos de Activación y Regalo Anuales)
CREATE TABLE IF NOT EXISTS public.activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) UNIQUE NOT NULL,
  duration_days INT NOT NULL DEFAULT 365,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_by UUID DEFAULT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activation_codes_lookup ON public.activation_codes (UPPER(code)) WHERE is_used = FALSE;

-- Eliminar posible FK restrictiva a profiles(id) si la tabla ya existía
ALTER TABLE public.activation_codes DROP CONSTRAINT IF EXISTS activation_codes_used_by_fkey;

-- Eliminar código público TESTER-2026 para evitar accesos no autorizados
DELETE FROM public.activation_codes WHERE UPPER(code) = 'TESTER-2026';

-- Desacoplar user_id NOT NULL en payments para permitir pagos de invitados pre-registro
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
    ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_user_id_fkey;
    ALTER TABLE public.payments ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;

-- 7. HABILITAR RLS Y POLÍTICAS PÚBLICAS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'users_all_access') THEN
    CREATE POLICY users_all_access ON public.users FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'devices' AND policyname = 'devices_all_access') THEN
    CREATE POLICY devices_all_access ON public.devices FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pending_payments' AND policyname = 'pending_payments_all_access') THEN
    CREATE POLICY pending_payments_all_access ON public.pending_payments FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activation_codes' AND policyname = 'activation_codes_all_access') THEN
    CREATE POLICY activation_codes_all_access ON public.activation_codes FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 8. FUNCIÓN: Registro Post-Pago PayPal
CREATE OR REPLACE FUNCTION public.register_with_paypal_payment(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_paypal_order_id TEXT,
  p_device_id TEXT,
  p_device_type public.device_type,
  p_device_name TEXT
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
  v_expiry TIMESTAMPTZ := NOW() + INTERVAL '1 year';
BEGIN
  IF LENGTH(p_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La contraseña debe tener al menos 6 caracteres.');
  END IF;

  -- 1. Validar que la orden exista y esté disponible
  SELECT * INTO v_payment
  FROM public.pending_payments
  WHERE (paypal_order_id = p_paypal_order_id OR paypal_capture_id = p_paypal_order_id)
    AND status = 'pending_registration';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se encontró un pago de PayPal pendiente o ya fue utilizado.');
  END IF;

  -- 2. Verificar que no exista el correo
  IF EXISTS (SELECT 1 FROM public.users WHERE LOWER(email) = v_clean_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya existe una cuenta con este correo. Inicia sesión en su lugar.');
  END IF;

  -- 3. Crear usuario con Bcrypt
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
    'user',
    'active',
    v_expiry
  )
  RETURNING id INTO v_user_id;

  -- 4. Registrar primer dispositivo activo
  INSERT INTO public.devices (user_id, device_id, device_type, device_name, is_active, last_login)
  VALUES (v_user_id, p_device_id, p_device_type, COALESCE(p_device_name, ''), TRUE, NOW());

  -- 5. Marcar pago como reclamado
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
      'role', 'user',
      'subscription_status', 'active',
      'access_expires_at', v_expiry
    )
  );
END;
$$;

-- 9. FUNCIÓN: Registro con Código de Activación / Regalo
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
SET search_path = public
AS $$
DECLARE
  v_code RECORD;
  v_user_id UUID;
  v_clean_email TEXT := LOWER(TRIM(p_email));
  v_clean_code TEXT := UPPER(TRIM(p_code));
  v_expiry TIMESTAMPTZ := NOW() + INTERVAL '1 year';
BEGIN
  IF LENGTH(p_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La contraseña debe tener al menos 6 caracteres.');
  END IF;

  -- 1. Validar código en activation_codes
  SELECT * INTO v_code
  FROM public.activation_codes
  WHERE UPPER(code) = v_clean_code
    AND is_used = FALSE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Código de activación inválido o ya utilizado.');
  END IF;

  -- 2. Verificar que no exista el correo
  IF EXISTS (SELECT 1 FROM public.users WHERE LOWER(email) = v_clean_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya existe una cuenta con este correo. Inicia sesión en su lugar.');
  END IF;

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
    'user',
    'active',
    v_expiry
  )
  RETURNING id INTO v_user_id;

  -- 4. Registrar primer dispositivo activo
  INSERT INTO public.devices (user_id, device_id, device_type, device_name, is_active, last_login)
  VALUES (v_user_id, p_device_id, p_device_type, COALESCE(p_device_name, ''), TRUE, NOW());

  -- 5. Consumir uso del código
  UPDATE public.activation_codes
  SET is_used = TRUE,
      used_by = v_user_id,
      used_at = NOW()
  WHERE id = v_code.id;

  RETURN jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_user_id,
      'email', v_clean_email,
      'full_name', COALESCE(NULLIF(p_full_name, ''), split_part(v_clean_email, '@', 1)),
      'role', 'user',
      'subscription_status', 'active',
      'access_expires_at', v_expiry
    )
  );
END;
$$;

-- 10. FUNCIÓN: Recuperar Pago (Lookup de Recibo sin cobrar de nuevo)
CREATE OR REPLACE FUNCTION public.recover_payment_lookup(p_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_clean TEXT := LOWER(TRIM(p_query));
BEGIN
  SELECT * INTO v_payment
  FROM public.pending_payments
  WHERE (LOWER(payer_email) = v_clean OR LOWER(paypal_order_id) = v_clean OR LOWER(paypal_capture_id) = v_clean)
    AND status = 'pending_registration'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'error', 'No se encontró ningún pago pendiente por registrar con ese correo o código de transacción.');
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'paypal_order_id', v_payment.paypal_order_id,
    'payer_email', v_payment.payer_email,
    'payer_name', v_payment.payer_name,
    'amount', v_payment.amount,
    'currency', v_payment.currency,
    'created_at', v_payment.created_at
  );
END;
$$;

-- 11. FUNCIÓN: Login con Control de Dispositivos (Device Fingerprinting)
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
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_active_device RECORD;
  v_is_superadmin BOOLEAN;
  v_active_devices_count INT;
BEGIN
  -- 1. Buscar usuario
  SELECT * INTO v_user
  FROM public.users
  WHERE LOWER(email) = LOWER(TRIM(p_email));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No existe una cuenta registrada con este correo.');
  END IF;

  -- 2. Verificar contraseña con Bcrypt
  IF v_user.password_hash != crypt(p_password, v_user.password_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contraseña incorrecta.');
  END IF;

  -- 3. Verificar superadmin y expiración de acceso
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

-- 12. FUNCIÓN: Obtener Dispositivos Conectados
CREATE OR REPLACE FUNCTION public.get_user_connected_devices(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_devices JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'device_id', device_id,
      'device_type', device_type,
      'device_name', device_name,
      'last_login', last_login,
      'is_active', is_active
    )
  ) INTO v_devices
  FROM public.devices
  WHERE user_id = p_user_id AND is_active = TRUE;

  RETURN COALESCE(v_devices, '[]'::jsonb);
END;
$$;

-- 13. FUNCIÓN: Desvincular Dispositivo
CREATE OR REPLACE FUNCTION public.unlink_user_device(
  p_user_id UUID,
  p_device_id_to_unlink TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.devices
  SET is_active = FALSE,
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND (id::TEXT = p_device_id_to_unlink OR device_id = p_device_id_to_unlink);

  RETURN jsonb_build_object('success', true, 'message', 'Dispositivo desvinculado con éxito.');
END;
$$;

-- 14. FUNCIÓN: Cambio de Contraseña
CREATE OR REPLACE FUNCTION public.change_user_password(
  p_user_id UUID,
  p_old_password TEXT,
  p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_hash TEXT;
BEGIN
  IF LENGTH(p_new_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La nueva contraseña debe tener al menos 6 caracteres.');
  END IF;

  SELECT password_hash INTO v_stored_hash
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no encontrado.');
  END IF;

  IF v_stored_hash != crypt(p_old_password, v_stored_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'La contraseña actual no coincide.');
  END IF;

  UPDATE public.users
  SET password_hash = crypt(p_new_password, gen_salt('bf', 10)),
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'message', 'Contraseña actualizada con éxito.');
END;
$$;

-- 15. FUNCIÓN: Generar Códigos de Activación por Año
CREATE OR REPLACE FUNCTION public.generate_activation_code(
  p_prefix TEXT DEFAULT 'SKATE',
  p_notes TEXT DEFAULT 'Licencia Anual 2026'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_code TEXT;
BEGIN
  v_new_code := UPPER(TRIM(p_prefix)) || '-' || TO_CHAR(NOW(), 'YYYY') || '-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8));
  INSERT INTO public.activation_codes (code, duration_days, is_used, notes)
  VALUES (v_new_code, 365, FALSE, p_notes);
  RETURN v_new_code;
END;
$$;
