-- Update admin_get_dashboard_stats to include user lists
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats(p_admin_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_email    TEXT := LOWER(TRIM(p_admin_email));
  v_is_admin BOOLEAN;
  v_total_users INT;
  v_active_testers INT;
  v_active_codes INT;
  v_pending_codes INT;
  v_recent_sessions INT;
  v_recent_errors INT;
  v_users_list JSONB;
  v_testers_list JSONB;
BEGIN
  v_is_admin := v_email IN (
      'recursosparaministerios@gmail.com', 'contacto@alsiztech.com', 'contactoalsiztech.com'
    ) OR EXISTS (SELECT 1 FROM public.users u WHERE LOWER(u.email) = v_email AND u.role = 'superadmin');
  IF NOT v_is_admin THEN RETURN jsonb_build_object('success', false, 'error', 'No autorizado.'); END IF;

  SELECT COUNT(*) INTO v_total_users FROM public.users;
  
  -- Generar lista de usuarios totales (ultimos 100 por simplicidad o todos si son pocos)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('email', email, 'role', role, 'created_at', created_at) ORDER BY created_at DESC
  ), '[]'::jsonb) INTO v_users_list FROM public.users;

  SELECT COUNT(*) INTO v_active_testers FROM public.users WHERE subscription_plan = 'beta_tester' AND access_expires_at > NOW();
  
  -- Generar lista de testers
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('email', email, 'expires_at', access_expires_at) ORDER BY access_expires_at DESC
  ), '[]'::jsonb) INTO v_testers_list FROM public.users WHERE subscription_plan = 'beta_tester' AND access_expires_at > NOW();

  SELECT COUNT(*) INTO v_active_codes FROM public.activation_codes WHERE status = 'USED';
  SELECT COUNT(*) INTO v_pending_codes FROM public.activation_codes WHERE status = 'AVAILABLE';
  SELECT COUNT(*) INTO v_recent_sessions FROM public.telemetry_sessions WHERE login_at > NOW() - INTERVAL '24 hours';
  SELECT COUNT(*) INTO v_recent_errors FROM public.telemetry_errors WHERE created_at > NOW() - INTERVAL '24 hours';

  RETURN jsonb_build_object(
    'success', true,
    'stats', jsonb_build_object(
      'total_users', v_total_users,
      'users_list', v_users_list,
      'active_testers', v_active_testers,
      'testers_list', v_testers_list,
      'active_codes', v_active_codes,
      'pending_codes', v_pending_codes,
      'recent_sessions', v_recent_sessions,
      'recent_errors', v_recent_errors
    )
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
