-- ============================================================================
-- ARREGLO DE ACCESO DEL CREADOR (ejecutar UNA vez en el SQL Editor de Supabase)
-- ============================================================================
--
-- Uso:
--   1. Reemplaza  TU_NUEVA_CLAVE  por la contraseña que quieras (mín. 6).
--   2. Reemplaza  Mauricio Andrade  por tu nombre si lo deseas.
--   3. Pega TODO este archivo en el SQL Editor y pulsa Run.
--   4. Inicia sesión en la app con:
--        correo:    mauriandrade2@gmail.com
--        contraseña: TU_NUEVA_CLAVE
--
-- Este bloque CREA la cuenta si no existe o RESTABLECE su contraseña si ya
-- existe, y garantiza rol superadmin + acceso de larga duración. Es idempotente
-- y no afecta a ningún otro usuario.
-- ============================================================================

-- Asegura pgcrypto y resuelve crypt()/gen_salt() en cualquier esquema.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET search_path = public, extensions;

-- Upsert de la cuenta del creador (crear o resetear contraseña + privilegios).
INSERT INTO public.users (
  email, password_hash, full_name, role, subscription_status, subscription_plan, access_expires_at
)
VALUES (
  'mauriandrade2@gmail.com',
  crypt('TU_NUEVA_CLAVE', gen_salt('bf', 10)),
  'Mauricio Andrade',
  'superadmin',
  'active',
  'individual',
  NOW() + INTERVAL '10 years'
)
ON CONFLICT (email) DO UPDATE
  SET password_hash       = EXCLUDED.password_hash,
      role                = 'superadmin',
      subscription_status = 'active',
      subscription_plan   = COALESCE(public.users.subscription_plan, 'individual'),
      access_expires_at   = GREATEST(NOW(), COALESCE(public.users.access_expires_at, NOW())) + INTERVAL '10 years',
      updated_at          = NOW();

-- Refresca la caché de PostgREST.
NOTIFY pgrst, 'reload schema';

-- Verificación:
SELECT id, email, role, subscription_status, subscription_plan, access_expires_at
FROM public.users
WHERE LOWER(email) = 'mauriandrade2@gmail.com';
