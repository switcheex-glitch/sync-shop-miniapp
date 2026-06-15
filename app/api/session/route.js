import { NextResponse } from 'next/server';
import { verifyInitData } from '@/lib/verifyInitData';
import { getSupabase } from '@/lib/supabaseServer';
import { DOC_VERSION } from '@/lib/legal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Возвращает профиль пользователя, статус согласия и список покупок.
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch (_) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const verified = verifyInitData(body?.initData, process.env.TELEGRAM_BOT_TOKEN);
  if (!verified) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const user = verified.user;
  const supabase = getSupabase();

  const { data: consent } = await supabase
    .from('consents')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('doc_version', DOC_VERSION)
    .eq('accepted_eula', true)
    .eq('accepted_privacy', true)
    .maybeSingle();

  const { data: purchases } = await supabase
    .from('purchases')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return NextResponse.json({
    user: { id: user.id, first_name: user.first_name || '', username: user.username || null },
    hasConsent: !!consent,
    purchases: purchases || []
  });
}
