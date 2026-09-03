import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/resolveUser';
import { getSupabase } from '@/lib/supabaseServer';
import { DOC_VERSION } from '@/lib/legal';
import { createTransaction, PLATEGA_METHODS } from '@/lib/platega';
import { randomInt } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRICE = 7900;
// Сколько лицензий разрешено взять одной покупкой.
const MAX_QUANTITY = 20;
const SOFTWARE_NAME = 'Jarvis Voice Assistant';
// Куда вернуть пользователя из платёжной формы Platega (обратно в бота-магазин).
const RETURN_URL = process.env.PLATEGA_RETURN_URL || 'https://t.me/Sync_Industries_Shop_bot';

// Генерация лицензионного ключа JARVIS-XXXX-XXXX-XXXX.
// randomInt, а не Math.random: последовательность Math.random предсказуема по
// нескольким выданным значениям, а здесь от непредсказуемости зависит платный доступ.
// Алфавит и формат не меняются — ранее выданные ключи остаются валидными.
// randomInt берёт равномерное значение без перекоса, который дал бы простой остаток
// от деления случайного байта на 36.
function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const block = () => Array.from({ length: 4 }, () => chars[randomInt(chars.length)]).join('');
  return `JARVIS-${block()}-${block()}-${block()}`;
}

// Оформляет покупку: создаёт запись со статусом 'pending', генерирует ключ (он скрыт
// до подтверждения оплаты) и создаёт транзакцию в Platega. Возвращает ссылку на оплату.
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

  // Поддерживаемые методы — ключи из lib/methods.js (sbp / sberpay / card / crypto / intl).
  // Неизвестное значение → СБП по умолчанию.
  const method = PLATEGA_METHODS[body.method] ? body.method : 'sbp';

  // Несколько лицензий одной оплатой. Каждая лицензия — отдельная строка в
  // purchases: так учёт остаётся «одна строка = одна лицензия», а проверка
  // ключа в приложении работает без изменений. Связывает их общий
  // transaction_id, по нему же оплата подтверждается сразу для всех.
  const quantity = Math.min(MAX_QUANTITY, Math.max(1, Math.floor(Number(body.quantity) || 1)));
  const total = PRICE * quantity;

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

  // 1) Создаём pending-покупки (ключи генерируются заранее, раскрываются после оплаты).
  const rows = Array.from({ length: quantity }, () => ({
    user_id: user.id,
    username: user.username || null,
    first_name: user.first_name || 'Пользователь',
    software_name: SOFTWARE_NAME,
    license_key: generateLicenseKey(),
    price: PRICE,
    amount: PRICE,
    status: 'pending',
    provider: 'platega',
    payment_method: method
  }));

  const { data: purchases, error } = await supabase.from('purchases').insert(rows).select();

  if (error || !purchases || purchases.length === 0) {
    return NextResponse.json({ error: 'db_error', detail: error?.message }, { status: 500 });
  }

  // Первая покупка представляет заказ: её id уходит в payload платежа.
  const purchase = purchases[0];
  const purchaseIds = purchases.map((p) => p.id);

  // 2) Создаём транзакцию в Platega (payload = id нашей покупки — вернётся в вебхуке).
  let tx;
  try {
    tx = await createTransaction({
      id: purchase.id,
      method,
      amount: total,
      description:
        quantity > 1
          ? `${SOFTWARE_NAME}: ${quantity} лицензии (пожизненные)`
          : `Лицензия ${SOFTWARE_NAME} (пожизненная)`,
      payload: purchase.id,
      returnUrl: RETURN_URL,
      failedUrl: RETURN_URL,
      metadata: {
        userId: String(user.id),
        userName: user.username ? `@${user.username}` : (user.first_name || '')
      }
    });
  } catch (e) {
    await supabase.from('purchases').update({ status: 'error' }).in('id', purchaseIds);
    return NextResponse.json({ error: 'gateway_error' }, { status: 502 });
  }

  // 3) Сохраняем id транзакции Platega.
  await supabase
    .from('purchases')
    .update({ transaction_id: tx.transactionId || tx.id || null })
    .in('id', purchaseIds);

  return NextResponse.json({
    ok: true,
    purchaseId: purchase.id,
    quantity,
    total,
    transactionId: tx.transactionId || tx.id || null,
    redirect: tx.redirect || null,
    status: tx.status || 'PENDING'
  });
}
