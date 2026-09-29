-- ==============================================================================
-- SkateCoreo SaaS — Aprovisionamiento de Administradores Autorizados
--
-- Cuentas autorizadas:
--   1. mauriandrade2@gmail.com
--   2. karenprofet@gmail.com
--   3. contacto@alsiztech.com
--
-- Rol: superadmin con vigencia vitalicia / 20 años y entitlements activos.
-- Permite administración total de paquetes, licencias, auditoría y funciones del software.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

SET search_path = public, extensions;

-- 1. Insertar o actualizar credenciales con Bcrypt (pgcrypto) y rol superadmin
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

-- 2. Asegurar entitlements activos para cada uno de los 3 administradores
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
      -- Actualizar entitlements previos
      UPDATE public.entitlements 
      SET status = 'replaced', updated_at = NOW()
      WHERE user_id = v_user.id AND status = 'active';

      -- Crear entitlement de superadministrador vigente
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

-- 3. Registrar en log de auditoría comercial
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
