import { getSupabase } from './supabaseServer';
import { getTransactionStatus, normalizeStatus } from './platega';
import { notifyOwner, dmBuyer } from './notify';

const SOFTWARE_NAME = 'Jarvis Voice Assistant';

function methodLabel(m) {
  if (m === 'crypto') return 'Криптовалюта';
  if (m === 'sbp') return 'СБП';
  return m || '—';
}

// Подтверждает оплату покупки, перепроверяя статус НАШЕЙ транзакции напрямую в Platega.
// Вызывается и из вебхука Platega, и из опроса статуса фронтом — какой сработает первым.
// Идемпотентность: переход pending → paid делается атомарным условным UPDATE,
// уведомления шлёт только тот вызов, который реально перевёл статус.
//
// Возвращает { status, license_key } — ключ только если оплачено.
export async function confirmPurchase(purchase) {
  if (!purchase) return { status: 'not_found', license_key: null };
  if (purchase.status === 'paid') {
    return { status: 'paid', license_key: purchase.license_key };
  }
  if (purchase.status === 'canceled' || purchase.status === 'chargeback') {
    return { status: purchase.status, license_key: null };
  }
  if (!purchase.transaction_id) {
    return { status: purchase.status || 'pending', license_key: null };
  }

  const fresh = await getTransactionStatus(purchase.transaction_id);
  if (!fresh || !fresh.status) {
    // Platega недоступна — статус не меняем.
    return { status: purchase.status || 'pending', license_key: null };
  }

  const status = normalizeStatus(fresh.status);
  const supabase = getSupabase();

  if (status === 'paid') {
    // Атомарно: pending → paid. Ровно один вызов получит строку и разошлёт уведомления.
    const { data: flipped } = await supabase
      .from('purchases')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', purchase.id)
      .eq('status', 'pending')
      .select()
      .maybeSingle();

    if (flipped) {
      const who = purchase.username ? `@${purchase.username}` : (purchase.first_name || `id ${purchase.user_id}`);
      await notifyOwner(
        `💰 <b>Оплата прошла</b>\n\n` +
        `🤖 ${SOFTWARE_NAME}\n` +
        `💳 Сумма: <b>${purchase.amount ?? purchase.price} ₽</b>\n` +
        `🏦 Метод: ${methodLabel(purchase.payment_method)}\n` +
        `👤 Покупатель: ${who}\n` +
        `🔑 Ключ: <code>${purchase.license_key}</code>\n` +
        `🧾 Транзакция: <code>${purchase.transaction_id}</code>`
      );
      await dmBuyer(
        purchase.user_id,
        `✅ <b>Оплата получена. Спасибо!</b>\n\n` +
        `Ваша лицензия на <b>${SOFTWARE_NAME}</b> активирована.\n\n` +
        `🔑 Ключ активации:\n<code>${purchase.license_key}</code>\n\n` +
        `Ключ также доступен в магазине → раздел «Кабинет».`
      );
    }
    return { status: 'paid', license_key: purchase.license_key };
  }

  if (status === 'canceled' || status === 'chargeback') {
    await supabase.from('purchases').update({ status }).eq('id', purchase.id).eq('status', 'pending');
    return { status, license_key: null };
  }

  return { status: 'pending', license_key: null };
}
