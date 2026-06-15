import { createClient } from '@supabase/supabase-js';

// Серверный клиент Supabase с service_role-ключом.
// Используется ТОЛЬКО в API-роутах (на сервере). Никогда не отдаётся в браузер.
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY не заданы в переменных окружения');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
