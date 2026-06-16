import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/resolveUser';
import { getSupabase } from '@/lib/supabaseServer';
import { DOC_VERSION } from '@/lib/legal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Сохраняет согласие пользователя с EULA + Политикой (обе галочки обязательны).
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

  if (!body?.acceptedEula || !body?.acceptedPrivacy) {
    return NextResponse.json({ error: 'both_required' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { error } = await supabase
    .from('consents')
    .upsert({
      user_id: user.id,
      username: user.username || null,
      first_name: user.first_name || null,
      accepted_eula: true,
      accepted_privacy: true,
      doc_version: DOC_VERSION,
      accepted_at: new Date().toISOString()
    });

  if (error) {
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
