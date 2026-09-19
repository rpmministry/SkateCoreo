/**
 * supabase.ts — Cliente oficial de Supabase para SkateArt PWA
 *
 * Lee de variables de entorno (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
 * Si no están configuradas, proporciona un cliente dummy seguro para no romper la app.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

