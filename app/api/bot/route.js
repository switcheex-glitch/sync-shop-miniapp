import { NextResponse } from 'next/server';
import { EULA_TEXT, PRIVACY_TEXT } from '@/lib/legal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sync-shop-miniapp.vercel.app';
const PDF_URL = `${APP_URL}/legal/Sync_Industries_Jarvis_Legal.pdf`;
const PRICE = 4999;

async function tg(method, payload) {
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (_) {}
}

// Разбивка длинного текста на части под лимит Telegram (4096), по абзацам
function splitText(text, maxLen = 3800) {
  const paragraphs = text.split('\n\n');
  const chunks = [];
  let cur = '';
  for (const p of paragraphs) {
    const cand = cur ? cur + '\n\n' + p : p;
    if (cand.length > maxLen) {
      if (cur) chunks.push(cur);
      if (p.length > maxLen) { for (let i = 0; i < p.length; i += maxLen) chunks.push(p.slice(i, i + maxLen)); cur = ''; }
      else cur = p;
    } else cur = cand;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

const TARIFF_TEXT = `🤖 <b>Jarvis Voice Assistant</b>
<i>Sync Industries — официальный маркетплейс</i>

Автономная локальная ИИ-система управления вашим ПК.
💻 100% локальный контур (Zero-Cloud)
🔐 Абсолютная конфиденциальность данных
⚙️ Автоматизация терминала, файлов и интерфейса

💎 <b>Тариф: Пожизненная лицензия</b>
💳 Стоимость: <b>${PRICE.toLocaleString('ru-RU')} ₽</b> (единоразово)

<b>В комплекте:</b>
✅ Полная версия Jarvis (навсегда)
✅ Премиальные утилиты для Windows
✅ Бесплатные обновления и поддержка 24/7

❗️ Перед покупкой ознакомьтесь с документами (кнопки ниже).
🛍 Для покупки откройте магазин — кнопкой ниже или кнопкой «SHOP» в левом нижнем углу.

На связи команда @Sync_Industries`;

function startKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🛍 Открыть магазин', web_app: { url: APP_URL } }],
      [
        { text: '📄 Соглашение (EULA)', callback_data: 'doc_eula' },
        { text: '🔐 Политика', callback_data: 'doc_privacy' }
      ],
      [{ text: '📑 Полный документ (PDF)', url: PDF_URL }]
    ]
  };
}

export async function POST(req) {
  // Проверка секрета вебхука (защита от посторонних вызовов)
  if (SECRET) {
    const got = req.headers.get('x-telegram-bot-api-secret-token');
    if (got !== SECRET) return NextResponse.json({ ok: true });
  }

  let update;
  try { update = await req.json(); } catch (_) { return NextResponse.json({ ok: true }); }

  // Нажатия на инлайн-кнопки документов
  const cq = update.callback_query;
  if (cq) {
    const chatId = cq.message?.chat?.id;
    await tg('answerCallbackQuery', { callback_query_id: cq.id });
    if (chatId && (cq.data === 'doc_eula' || cq.data === 'doc_privacy')) {
      const text = cq.data === 'doc_eula' ? EULA_TEXT : PRIVACY_TEXT;
      for (const ch of splitText(text)) {
        await tg('sendMessage', { chat_id: chatId, text: ch, disable_web_page_preview: true });
      }
    }
    return NextResponse.json({ ok: true });
  }

  // Команда /start (и любое сообщение в личке как фолбэк)
  const msg = update.message;
  if (msg && msg.chat?.type === 'private') {
    const chatId = msg.chat.id;
    const isStart = typeof msg.text === 'string' && msg.text.startsWith('/start');
    if (isStart || msg.text) {
      await tg('sendMessage', {
        chat_id: chatId,
        text: TARIFF_TEXT,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: startKeyboard()
      });
    }
  }

  return NextResponse.json({ ok: true });
}

// Удобная проверка из браузера, что эндпоинт жив
export async function GET() {
  return NextResponse.json({ ok: true, bot: 'sync-shop-webhook' });
}
