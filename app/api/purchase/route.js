import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/resolveUser';
import { getSupabase } from '@/lib/supabaseServer';
import { DOC_VERSION } from '@/lib/legal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRICE = 4999;
const SOFTWARE_NAME = 'Jarvis Voice Assistant';

// Генерация лицензионного ключа JARVIS-XXXX-XXXX-XXXX
function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const block = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `JARVIS-${block()}-${block()}-${block()}`;
}

// Оформляет покупку: генерирует ключ и записывает её в Supabase.
// (Сейчас оплата в демо-режиме — реальный платёжный шлюз подключим отдельно.)
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch (_) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const user = resolveUser(body);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  // Покупка разрешена только при наличии актуального согласия с документами
  const { data: consent } = await supabase
    .from('consents')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('doc_version', DOC_VERSION)
    .eq('accepted_eula', true)
    .eq('accepted_privacy', true)
    .maybeSingle();

  if (!consent) {
    return NextResponse.json({ error: 'consent_required' }, { status: 403 });
  }

  const licenseKey = generateLicenseKey();

  const { data, error } = await supabase
    .from('purchases')
    .insert({
      user_id: user.id,
      username: user.username || null,
      first_name: user.first_name || 'Пользователь',
      software_name: SOFTWARE_NAME,
      license_key: licenseKey,
      price: PRICE
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, purchase: data });
}
