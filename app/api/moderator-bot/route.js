import { webhookCallback } from 'grammy';
import { moderatorBot } from '@/lib/moderatorBot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SECRET = process.env.BOT_WEBHOOK_SECRET || '';
const handle = webhookCallback(moderatorBot, 'std/http');

// Вебхук бота-модератора. Защита — секретный заголовок Telegram (secret_token).
export async function POST(req) {
  if (SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) {
    return new Response('ok', { status: 200 });
  }
  return handle(req);
}

export function GET() {
  return new Response(JSON.stringify({ ok: true, bot: 'moderator-webhook' }), {
    headers: { 'content-type': 'application/json' }
  });
}
