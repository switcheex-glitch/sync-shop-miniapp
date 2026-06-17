import { getSupabase } from './supabaseServer';

// Уведомления о платежах.
// - Владельцу (@mefr22) — через отдельного бота-уведомителя (NOTIFY_BOT_TOKEN).
// - Покупателю — через бота-магазина (TELEGRAM_BOT_TOKEN), если он открыл магазин из Telegram.

const NOTIFY_TOKEN = process.env.NOTIFY_BOT_TOKEN;
const SHOP_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CONFIG_KEY_OWNER = 'notify_chat_id';

async function tgCall(token, method, payload) {
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json().catch(() => null);
  } catch (_) {
    return null;
  }
}

// Отправка сообщения ботом-уведомителем (используется и его вебхуком для ответа).
export function notifyBotSend(method, payload) {
  return tgCall(NOTIFY_TOKEN, method, payload);
}

// Сохраняет chat_id владельца, пойманный при /start бота-уведомителя.
export async function setOwnerChatId(chatId) {
  try {
    const supabase = getSupabase();
    await supabase.from('config').upsert({ key: CONFIG_KEY_OWNER, value: String(chatId) }, { onConflict: 'key' });
    return true;
  } catch (_) {
    return false;
  }
}

// chat_id владельца: сперва из config, затем из env OWNER_CHAT_ID.
async function getOwnerChatId() {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.from('config').select('value').eq('key', CONFIG_KEY_OWNER).maybeSingle();
    if (data?.value) return data.value;
  } catch (_) {}
  return process.env.OWNER_CHAT_ID || null;
}

// Уведомить владельца (HTML). Возвращает true, если адресат известен.
export async function notifyOwner(text) {
  const chatId = await getOwnerChatId();
  if (!chatId) return false;
  await tgCall(NOTIFY_TOKEN, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });
  return true;
}

// Написать покупателю в Telegram (только реальным пользователям, у гостей id отрицательный).
export async function dmBuyer(chatId, text) {
  const id = Number(chatId);
  if (!Number.isFinite(id) || id < 0) return false;
  await tgCall(SHOP_TOKEN, 'sendMessage', {
    chat_id: id,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });
  return true;
}
