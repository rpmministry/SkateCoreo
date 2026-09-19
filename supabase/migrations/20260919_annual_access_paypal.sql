-- ==============================================================================
-- SkateArt - Migración Completa: Perfiles, Acceso Anual, PayPal y Códigos
-- Fecha: 2026-09-19
-- ==============================================================================

-- 1. TABLA PROFILES (Crea la tabla si no existe, o añade campos faltantes)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',                    -- 'user' | 'tester' | 'superadmin'
  subscription_status TEXT NOT NULL DEFAULT 'inactive', -- 'active' | 'inactive'
  subscription_plan TEXT DEFAULT NULL,                  -- 'individual' | 'club'
  access_expires_at TIMESTAMPTZ DEFAULT NULL,           -- Fecha exacta de expiración (UTC)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asegurar columna access_expires_at por si profiles ya existía previamente
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_access_expires_at 
  ON public.profiles (access_expires_at);

-- 2. TRIGGER AUTOMÁTICO: Crear perfil al registrarse nuevo usuario en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, subscription_status, access_expires_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    'user',
    'inactive',
    NULL
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Sincronizar usuarios existentes en auth.users que aún no tengan perfil
INSERT INTO public.profiles (id, email, full_name, role, subscription_status)
SELECT 
  id, 
  email, 
  split_part(email, '@', 1), 
  'user', 
  'inactive'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 3. TABLA DE CÓDIGOS DE ACTIVACIÓN / REGALO / TESTERS
CREATE TABLE IF NOT EXISTS public.activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) UNIQUE NOT NULL,             -- Código único en mayúsculas
  duration_days INT NOT NULL DEFAULT 365,       -- 365 días por defecto
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  notes TEXT DEFAULT NULL,                      -- Auditoría: ej. 'Tester Femenino - Club Bogotá'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activation_codes_unused 
  ON public.activation_codes (code) WHERE is_used = FALSE;

-- 4. TABLA DE AUDITORÍA DE PAGOS (PAYPAL BUSINESS)
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  paypal_order_id VARCHAR(128) UNIQUE NOT NULL,      -- Protección contra Replay Attack
  paypal_capture_id VARCHAR(128) UNIQUE,
  paypal_payer_id VARCHAR(128),
  paypal_payer_email VARCHAR(255),
  amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(50) NOT NULL,                       -- 'COMPLETED', etc.
  access_extended_days INT NOT NULL DEFAULT 365,
  raw_response JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id 
  ON public.payments (user_id);

-- 5. POLÍTICAS DE SEGURIDAD ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Profiles: Los usuarios pueden consultar su propio registro
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id);

-- Activation codes: Protegida (solo la función RPC puede canjear)
DROP POLICY IF EXISTS "No direct public access to activation codes" ON public.activation_codes;
CREATE POLICY "No direct public access to activation codes" 
  ON public.activation_codes FOR ALL 
  TO authenticated 
  USING (FALSE);

-- Payments: El usuario puede consultar sus propios recibos
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments" 
  ON public.payments FOR SELECT 
  USING (auth.uid() = user_id);

-- 6. FUNCIÓN ATÓMICA RPC: Canje Seguro contra Race Conditions (FOR UPDATE)
CREATE OR REPLACE FUNCTION public.redeem_activation_code(code_input TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID;
  target_code RECORD;
  current_expiry TIMESTAMPTZ;
  new_expiry TIMESTAMPTZ;
  days_to_add INT;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Debes iniciar sesión para canjear un código.');
  END IF;

  -- Bloqueo pesimista (FOR UPDATE) para prevenir condiciones de carrera
  SELECT * INTO target_code 
  FROM public.activation_codes 
  WHERE UPPER(code) = UPPER(TRIM(code_input))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'El código ingresado no existe.');
  END IF;

  IF target_code.is_used THEN
    RETURN jsonb_build_object('success', false, 'message', 'Este código ya ha sido utilizado anteriormente.');
  END IF;

  days_to_add := COALESCE(target_code.duration_days, 365);

  -- Obtener fecha actual de expiración del usuario
  SELECT access_expires_at INTO current_expiry 
  FROM public.profiles 
  WHERE id = caller_id;

  -- Lógica acumulativa: si aún tiene días vigentes, sumamos sobre el remanente
  IF current_expiry IS NOT NULL AND current_expiry > NOW() THEN
    new_expiry := current_expiry + (days_to_add || ' days')::INTERVAL;
  ELSE
    new_expiry := NOW() + (days_to_add || ' days')::INTERVAL;
  END IF;

  -- 1. Marcar código como usado
  UPDATE public.activation_codes
  SET is_used = TRUE,
      used_by = caller_id,
      used_at = NOW()
  WHERE id = target_code.id;

  -- 2. Acreditar acceso anual al usuario
  UPDATE public.profiles
  SET access_expires_at = new_expiry,
      subscription_status = 'active',
      subscription_plan = 'individual',
      updated_at = NOW()
  WHERE id = caller_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', '¡Código activado con éxito! Tienes 1 año de acceso premium.',
    'access_expires_at', new_expiry
  );
END;
$$;
