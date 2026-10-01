-- ==============================================================================
-- SkateCoreo — Campaña promocional BETA_TESTER (20 códigos · 7 días · un uso)
-- ==============================================================================
INSERT INTO public.activation_codes
  (code, campaign, kind, duration_days, max_uses, used_count, status, subscription_plan, notes, expires_at)
VALUES
  ('SC-BETA-7H9P-3K4D-W6XQ', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-V8M2-B9F5-C3ZT', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-P4N8-X2R9-G7HJ', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-D6K3-M9V4-F8YB', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-T2Q7-Z5W8-L4CR', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-J9S4-H7K2-N5M6', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-B3F8-P2D9-X4V7', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-G5R2-T8Q6-W9Z3', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-M7N4-C6B2-F3H8', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-K9J5-D4P8-X7V2', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-W2Z6-R5T9-Q4C7', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-L8H3-N7M2-B9K5', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-F6V4-X2P9-D8Z3', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-Q3C7-W5R8-T2N4', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-S9J6-H4K2-M7F5', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-Z2B8-P4D9-X6V3', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-R7T5-G3Q8-W2C9', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-N4M6-B8H2-F5K9', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-C2Z4-R7T9-Q6W8', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months'),
  ('SC-BETA-P9D3-X4V6-B8F2', 'BETA_TESTER', 'GIFT', 7, 1, 0, 'AVAILABLE', 'beta_tester', 'TESTER_STAGE · acceso 7 días', NOW() + INTERVAL '3 months')
ON CONFLICT (code) DO NOTHING;
