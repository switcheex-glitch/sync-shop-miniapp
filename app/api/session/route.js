import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/resolveUser';
import { getSupabase } from '@/lib/supabaseServer';
import { DOC_VERSION } from '@/lib/legal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Возвращает профиль пользователя, статус согласия и список покупок.
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

  const { data: consent } = await supabase
    .from('consents')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('doc_version', DOC_VERSION)
    .eq('accepted_eula', true)
    .eq('accepted_privacy', true)
    .maybeSingle();

  const { data: purchases } = await supabase
    .from('purchases')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Ключ отдаём только для оплаченных покупок; неоплаченные показываем со статусом.
  const safePurchases = (purchases || []).map((p) => ({
    id: p.id,
    software_name: p.software_name,
    price: p.price,
    amount: p.amount ?? p.price,
    payment_method: p.payment_method || null,
    status: p.status || 'paid',
    created_at: p.created_at,
    paid_at: p.paid_at || null,
    license_key: (p.status || 'paid') === 'paid' ? p.license_key : null
  }));

  return NextResponse.json({
    user: { id: user.id, first_name: user.first_name || '', username: user.username || null },
    guest: user.guest,
    hasConsent: !!consent,
    purchases: safePurchases
  });
}
