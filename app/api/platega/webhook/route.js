import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseServer';
import { verifyCallbackAuth, getTransactionStatus, normalizeStatus } from '@/lib/platega';
import { notifyOwner, dmBuyer } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOFTWARE_NAME = 'Jarvis Voice Assistant';

function methodLabel(m) {
  if (m === 'crypto') return 'Криптовалюта';
  if (m === 'sbp') return 'СБП';
  return m || '—';
}

// Вебхук Platega: вызывается при изменении статуса транзакции.
//
// МОДЕЛЬ БЕЗОПАСНОСТИ.
// Главный гейт — серверная перепроверка статуса ИМЕННО НАШЕЙ сохранённой транзакции
// напрямую в Platega (GET /transaction/{наш transaction_id}). Это надёжно: статус
// «CONFIRMED» по нашей транзакции невозможно подделать — оплатить мог только реальный
// покупатель. Тело и заголовки колбэка сами по себе НЕ являются основанием для выдачи ключа.
// Заголовки X-MerchantId/X-Secret проверяем как мягкий доп. сигнал (не блокируем на них,
// т.к. точный формат колбэка Platega не гарантирован документацией).
export async function POST(req) {
  const headerOk = verifyCallbackAuth(req.headers.get('x-merchantid'), req.headers.get('x-secret'));

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return NextResponse.json({ ok: true });
  }

  // Поля колбэка приходят в разном регистре — читаем мягко.
  const txId = body.transactionId || body.id || body.Id || null;
  const payloadId = body.payload || body.Payload || null;
  const rawStatus = body.status || body.Status || null;

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

  // Идемпотентность: уже оплачено — повторный колбэк ничего не делает.
  if (purchase.status === 'paid') {
    return NextResponse.json({ ok: true, already: 'paid' });
  }

  // Определяем подлинный статус. Доверяем ТОЛЬКО перепроверке нашей транзакции в Platega.
  const verifyId = purchase.transaction_id;
  let effectiveStatus;
  if (verifyId) {
    const fresh = await getTransactionStatus(verifyId);
    if (fresh && fresh.status) {
      effectiveStatus = normalizeStatus(fresh.status);
    } else {
      // Platega недоступна — не выдаём ключ по непроверенному телу; ждём следующий ретрай.
      return NextResponse.json({ ok: true, status: 'recheck_failed' });
    }
  } else if (headerOk) {
    // Нет сохранённого id транзакции (редкий случай) — опираемся на подписанный заголовками колбэк.
    effectiveStatus = normalizeStatus(rawStatus);
  } else {
    return NextResponse.json({ ok: true, status: 'unverifiable' });
  }

  if (effectiveStatus === 'paid') {
    await supabase
      .from('purchases')
      .update({ status: 'paid', paid_at: new Date().toISOString(), transaction_id: verifyId || txId || purchase.transaction_id })
      .eq('id', purchase.id);

    const who = purchase.username ? `@${purchase.username}` : (purchase.first_name || `id ${purchase.user_id}`);
    await notifyOwner(
      `💰 <b>Оплата прошла</b>\n\n` +
      `🤖 ${SOFTWARE_NAME}\n` +
      `💳 Сумма: <b>${purchase.amount ?? purchase.price} ₽</b>\n` +
      `🏦 Метод: ${methodLabel(purchase.payment_method)}\n` +
      `👤 Покупатель: ${who}\n` +
      `🔑 Ключ: <code>${purchase.license_key}</code>\n` +
      `🧾 Транзакция: <code>${verifyId || txId || '—'}</code>`
    );

    await dmBuyer(
      purchase.user_id,
      `✅ <b>Оплата получена. Спасибо!</b>\n\n` +
      `Ваша лицензия на <b>${SOFTWARE_NAME}</b> активирована.\n\n` +
      `🔑 Ключ активации:\n<code>${purchase.license_key}</code>\n\n` +
      `Ключ также доступен в магазине → раздел «Кабинет».`
    );

    return NextResponse.json({ ok: true, status: 'paid' });
  }

  if (effectiveStatus === 'canceled' || effectiveStatus === 'chargeback') {
    await supabase.from('purchases').update({ status: effectiveStatus }).eq('id', purchase.id);
    return NextResponse.json({ ok: true, status: effectiveStatus });
  }

  return NextResponse.json({ ok: true, status: 'pending' });
}

// Проверка живости эндпоинта из браузера.
export async function GET() {
  return NextResponse.json({ ok: true, hook: 'platega-webhook' });
}
