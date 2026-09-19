-- ==============================================================================
-- SkateArt - Migración: Modelo de Acceso Anual, PayPal Business y Códigos de Activación
-- Fecha: 2026-09-19
-- ==============================================================================

-- 1. EXTENSIÓN DE LA TABLA PROFILES
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_access_expires_at 
  ON public.profiles (access_expires_at);

-- 2. TABLA DE CÓDIGOS DE ACTIVACIÓN / REGALO / TESTERS
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

-- 3. TABLA DE PAGOS (PAYPAL BUSINESS)
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
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

-- 4. POLÍTICAS DE SEGURIDAD ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Profiles: Los usuarios pueden consultar su propio registro
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view own profile'
  ) THEN
    CREATE POLICY "Users can view own profile" 
      ON public.profiles FOR SELECT 
      USING (auth.uid() = id);
  END IF;
END $$;

-- Activation codes: Ningún cliente autenticado o anónimo puede leer directamente los códigos
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'activation_codes' AND policyname = 'No direct public access to activation codes'
  ) THEN
    CREATE POLICY "No direct public access to activation codes" 
      ON public.activation_codes FOR ALL 
      TO authenticated 
      USING (FALSE);
  END IF;
END $$;

-- Payments: El usuario puede consultar sus propios comprobantes de pago
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'Users can view own payments'
  ) THEN
    CREATE POLICY "Users can view own payments" 
      ON public.payments FOR SELECT 
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. FUNCIÓN ATÓMICA RPC: Canje Seguro de Códigos contra Race Conditions (FOR UPDATE)
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

  -- Bloqueo pesimista (FOR UPDATE) para prevenir condiciones de carrera si se intenta canjear en paralelo
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

  -- Lógica acumulativa: si aún tiene días vigentes, sumamos 365 días al remanente
  IF current_expiry IS NOT NULL AND current_expiry > NOW() THEN
    new_expiry := current_expiry + (days_to_add || ' days')::INTERVAL;
  ELSE
    new_expiry := NOW() + (days_to_add || ' days')::INTERVAL;
  END IF;

  -- 1. Actualizar código como utilizado
  UPDATE public.activation_codes
  SET is_used = TRUE,
      used_by = caller_id,
      used_at = NOW()
  WHERE id = target_code.id;

  -- 2. Actualizar expiración del usuario y marcar rol si es necesario
  UPDATE public.profiles
  SET access_expires_at = new_expiry,
      subscription_status = 'active',
      updated_at = NOW()
  WHERE id = caller_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', '¡Código activado con éxito! Tienes 1 año de acceso premium.',
    'access_expires_at', new_expiry
  );
END;
$$;

