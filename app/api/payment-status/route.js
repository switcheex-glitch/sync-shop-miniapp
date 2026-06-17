import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/resolveUser';
import { getSupabase } from '@/lib/supabaseServer';
import { confirmPurchase } from '@/lib/fulfill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Опрос статуса конкретной покупки (для экрана ожидания оплаты во фронте).
// Ключ возвращается только когда покупка оплачена и принадлежит этому пользователю.
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

  const purchaseId = body.purchaseId;
  if (!purchaseId) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: purchase } = await supabase
    .from('purchases')
    .select('*')
    .eq('id', purchaseId)
    .maybeSingle();

  if (!purchase || purchase.user_id !== user.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Активная перепроверка статуса в Platega: подтверждаем оплату даже без вебхука.
  const result = await confirmPurchase(purchase);
  return NextResponse.json({
    status: result.status,
    license_key: result.license_key
  });
}
