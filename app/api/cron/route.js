import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseServer';
import { supportBot, runSupportTasks } from '@/lib/supportBot';
import { moderatorBot } from '@/lib/moderatorBot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET || '';

// Периодические задачи ботов (раз в минуту дёргается внешним пингером cron-job.org):
//  1) отложенные удаления служебных сообщений (замена setTimeout);
//  2) SLA-предупреждения по тикетам (>15 мин без ответа);
//  3) очистка логов старше 3 дней.
async function handle(req) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret') || req.headers.get('x-cron-secret');
  // Fail CLOSED. This used to be `if (CRON_SECRET && ...)`, so an unset env var
  // silently disabled authentication instead of refusing to serve.
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  let deleted = 0;

  // 1) Отложенные удаления, которым подошёл срок
  try {
    const now = new Date().toISOString();
    const { data: due } = await supabase
      .from('scheduled_deletions')
      .select('*')
      .lte('delete_at', now)
      .limit(300);

    if (due && due.length) {
      for (const row of due) {
        const api = row.bot === 'moderator' ? moderatorBot.api : supportBot.api;
        try { await api.deleteMessage(row.chat_id, Number(row.message_id)); } catch (_) {}
      }
      await supabase.from('scheduled_deletions').delete().in('id', due.map((r) => r.id));
      deleted = due.length;
    }
  } catch (e) {
    console.error('cron deletions error:', e.message);
  }

  // 2) + 3) SLA и очистка логов поддержки
  try {
    await runSupportTasks();
  } catch (e) {
    console.error('cron support tasks error:', e.message);
  }

  return NextResponse.json({ ok: true, deleted });
}

export async function GET(req) { return handle(req); }
export async function POST(req) { return handle(req); }
