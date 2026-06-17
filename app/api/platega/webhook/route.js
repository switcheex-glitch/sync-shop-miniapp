import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseServer';
import { confirmPurchase } from '@/lib/fulfill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Вебхук Platega: вызывается при изменении статуса транзакции.
//
// МОДЕЛЬ БЕЗОПАСНОСТИ. Тело колбэка само по себе НЕ является основанием для выдачи ключа.
// Главный гейт — серверная перепроверка статуса ИМЕННО НАШЕЙ сохранённой транзакции
// напрямую в Platega (внутри confirmPurchase → GET /transaction/{наш transaction_id}).
// Статус «CONFIRMED» по нашей транзакции подделать нельзя — оплатить мог только реальный
// покупатель. Поэтому колбэк используется лишь как триггер перепроверки.
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch (_) {
    return NextResponse.json({ ok: true });
  }

  const txId = body.transactionId || body.id || body.Id || null;
  const payloadId = body.payload || body.Payload || null;

  const supabase = getSupabase();

  // Находим покупку: по payload (наш id) либо по id транзакции Platega.
  let purchase = null;
  if (payloadId) {
    const { data } = await supabase.from('purchases').select('*').eq('id', payloadId).maybeSingle();
    purchase = data || null;
  }
  if (!purchase && txId) {
    const { data } = await supabase.from('purchases').select('*').eq('transaction_id', txId).maybeSingle();
    purchase = data || null;
  }

  if (!purchase) {
    // Неизвестная покупка — подтверждаем приём, чтобы Platega не ретраила бесконечно.
    return NextResponse.json({ ok: true, ignored: 'unknown_purchase' });
  }

  const result = await confirmPurchase(purchase);
  return NextResponse.json({ ok: true, status: result.status });
}

// Проверка живости эндпоинта из браузера.
export async function GET() {
  return NextResponse.json({ ok: true, hook: 'platega-webhook' });
}
