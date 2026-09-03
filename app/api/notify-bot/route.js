import { NextResponse } from 'next/server';
import { notifyBotSend, setOwnerChatId } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Username владельца проекта (кому шлём уведомления об оплатах).
const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'mefr22').toLowerCase().replace(/^@/, '');
const SECRET = process.env.NOTIFY_WEBHOOK_SECRET || '';

// Вебхук бота-уведомителя. На /start от владельца запоминает его chat_id в config,
// чтобы вебхук Platega знал, куда слать уведомления об оплате.
export async function POST(req) {
  // Fail CLOSED. NOTIFY_WEBHOOK_SECRET was never set, so this guard never ran.
  // That was the worst hole in the shop: a forged /start claiming the owner's
  // username rebinds setOwnerChatId, and payment notifications carry the buyer's
  // licence key — so anyone able to POST here could have collected every key sold.
  if (!SECRET || req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) {
    return NextResponse.json({ ok: true });
  }

  let update;
  try {
    update = await req.json();
  } catch (_) {
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  if (msg && msg.chat?.type === 'private') {
    const chatId = msg.chat.id;
    const username = (msg.from?.username || '').toLowerCase();

    if (username === OWNER_USERNAME) {
      await setOwnerChatId(chatId);
      await notifyBotSend('sendMessage', {
        chat_id: chatId,
        text:
          '✅ <b>Уведомления о платежах подключены.</b>\n\n' +
          'Сюда будут приходить сообщения о каждой успешной оплате в магазине Jarvis.',
        parse_mode: 'HTML'
      });
    } else {
      await notifyBotSend('sendMessage', {
        chat_id: chatId,
        text: 'Этот бот служебный — он отправляет уведомления только владельцу проекта.'
      });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, bot: 'sync-notify-webhook' });
}
