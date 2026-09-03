import { getSupabase } from './supabaseServer';
import { getTransactionStatus, normalizeStatus } from './platega';
import { methodLabel } from './methods';
import { notifyOwner, dmBuyer } from './notify';

const SOFTWARE_NAME = 'Jarvis Voice Assistant';

// Все ключи заказа, к которому принадлежит эта покупка.
// Заказ на несколько лицензий — это несколько строк purchases с общим
// transaction_id. «Одна строка = одна лицензия» и в учёте, и в приложении, где
// проверка ключа ничего не знает про количество.
async function orderKeys(purchase) {
  if (!purchase.transaction_id) return [purchase.license_key].filter(Boolean);
  const supabase = getSupabase();
  const { data } = await supabase
    .from('purchases')
    .select('license_key')
    .eq('transaction_id', purchase.transaction_id)
    .eq('status', 'paid')
    .order('created_at', { ascending: true });
  const keys = (data || []).map((r) => r.license_key).filter(Boolean);
  return keys.length ? keys : [purchase.license_key].filter(Boolean);
}

// Подтверждает оплату покупки, перепроверяя статус НАШЕЙ транзакции напрямую в Platega.
// Вызывается и из вебхука Platega, и из опроса статуса фронтом — какой сработает первым.
// Идемпотентность: переход pending → paid делается атомарным условным UPDATE,
// уведомления шлёт только тот вызов, который реально перевёл статус.
//
// Возвращает { status, license_key, license_keys } — ключи только если оплачено.
export async function confirmPurchase(purchase) {
  if (!purchase) return { status: 'not_found', license_key: null, license_keys: [] };
  if (purchase.status === 'paid') {
    return {
      status: 'paid',
      license_key: purchase.license_key,
      license_keys: await orderKeys(purchase)
    };
  }
  if (purchase.status === 'canceled' || purchase.status === 'chargeback') {
    return { status: purchase.status, license_key: null, license_keys: [] };
  }
  if (!purchase.transaction_id) {
    return { status: purchase.status || 'pending', license_key: null, license_keys: [] };
  }

  const fresh = await getTransactionStatus(purchase.transaction_id);
  if (!fresh || !fresh.status) {
    // Platega недоступна — статус не меняем.
    return { status: purchase.status || 'pending', license_key: null, license_keys: [] };
  }

  const status = normalizeStatus(fresh.status);
  const supabase = getSupabase();

  if (status === 'paid') {
    // Атомарно: pending → paid для ВСЕГО заказа. Ровно один вызов получит строки
    // и разошлёт уведомления. Переводить только текущую строку нельзя — покупатель
    // заплатил бы за три лицензии, а получил одну.
    const { data: flippedRows } = await supabase
      .from('purchases')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('transaction_id', purchase.transaction_id)
      .eq('status', 'pending')
      .select();

    const keys = (flippedRows || []).map((r) => r.license_key).filter(Boolean);

    if (flippedRows && flippedRows.length) {
      const who = purchase.username
        ? `@${purchase.username}`
        : purchase.first_name || `id ${purchase.user_id}`;
      const count = keys.length || 1;
      const paid = (purchase.amount ?? purchase.price) * count;
      const keyList = keys.map((k) => `<code>${k}</code>`).join('\n');
      const word = count > 1 ? 'Ключи' : 'Ключ';

      await notifyOwner(
        `💰 <b>Оплата прошла</b>\n\n` +
          `🤖 ${SOFTWARE_NAME}${count > 1 ? ` × ${count}` : ''}\n` +
          `💳 Сумма: <b>${paid} ₽</b>\n` +
          `🏦 Метод: ${methodLabel(purchase.payment_method)}\n` +
          `👤 Покупатель: ${who}\n` +
          `🔑 ${word}:\n${keyList}\n` +
          `🧾 Транзакция: <code>${purchase.transaction_id}</code>`
      );

      const body =
        count > 1
          ? `Ваши лицензии на <b>${SOFTWARE_NAME}</b> активированы (${count} шт.).\n\n` +
            `🔑 Ключи активации:\n${keyList}\n\n` +
            `Каждый ключ работает на одном компьютере.\n\n`
          : `Ваша лицензия на <b>${SOFTWARE_NAME}</b> активирована.\n\n` +
            `🔑 Ключ активации:\n${keyList}\n\n`;

      await dmBuyer(
        purchase.user_id,
        `✅ <b>Оплата получена. Спасибо!</b>\n\n` +
          body +
          `${word} также ${count > 1 ? 'доступны' : 'доступен'} в магазине → раздел «Кабинет».`
      );
    }

    return {
      status: 'paid',
      license_key: purchase.license_key,
      license_keys: keys.length ? keys : await orderKeys(purchase)
    };
  }

  if (status === 'canceled' || status === 'chargeback') {
    await supabase
      .from('purchases')
      .update({ status })
      .eq('transaction_id', purchase.transaction_id)
      .eq('status', 'pending');
    return { status, license_key: null, license_keys: [] };
  }

  return { status: 'pending', license_key: null, license_keys: [] };
}
