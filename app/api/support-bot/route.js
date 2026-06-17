import { webhookCallback } from 'grammy';
import { supportBot } from '@/lib/supportBot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SECRET = process.env.BOT_WEBHOOK_SECRET || '';
const handle = webhookCallback(supportBot, 'std/http');

// Вебхук бота техподдержки. Защита — секретный заголовок Telegram (secret_token).
export async function POST(req) {
  if (SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) {
    return new Response('ok', { status: 200 });
  }
  return handle(req);
}

export function GET() {
  return new Response(JSON.stringify({ ok: true, bot: 'support-webhook' }), {
    headers: { 'content-type': 'application/json' }
  });
}
