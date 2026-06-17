import { Bot } from 'grammy';
import { createClient } from '@supabase/supabase-js';

// Бот-модератор публичного чата (serverless-вебхук).
// Антиспам (ссылки) + антимат, система 3 варнов → автобан, удаление сервисных сообщений.
// Отложенные удаления служебных сообщений бота записываются в scheduled_deletions
// и выполняются /api/cron (в serverless setTimeout после ответа не работает).

const TOKEN = process.env.MODERATOR_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'mefr22').toLowerCase().replace(/^@/, '');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
export const moderatorBot = new Bot(TOKEN);

const PR_LINK_REGEX = /(https?:\/\/[^\s]+|t\.me\/[^\s]+|telegram\.me\/[^\s]+)/gi;
const SWEAR_REGEX = /(хуй|хуя|хуе|хуи|пизд|еба|ебл|ебу|бля|сук|пидор|пидар|пидр|гандо|шлюх|мудак|муди|залуп|поху|наху|охуе|пидец|пидес|курв|ублюд)/i;

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Запланировать удаление сообщений через N секунд (вместо setTimeout).
async function scheduleDelete(chatId, messageIds, seconds) {
  const ids = (Array.isArray(messageIds) ? messageIds : [messageIds]).filter(Boolean);
  if (!ids.length) return;
  const delete_at = new Date(Date.now() + seconds * 1000).toISOString();
  const rows = ids.map((mid) => ({ bot: 'moderator', chat_id: String(chatId), message_id: mid, delete_at }));
  try { await supabase.from('scheduled_deletions').insert(rows); } catch (_) {}
}

async function findUserIdByUsername(username) {
  const clean = username.replace('@', '').trim();
  for (const table of ['warns', 'admins', 'tickets']) {
    try {
      const { data } = await supabase.from(table).select('user_id').eq('username', clean).maybeSingle();
      if (data) return data.user_id;
    } catch (_) {}
  }
  return null;
}

moderatorBot.on('message', async (ctx) => {
  const chat = ctx.chat;
  const from = ctx.from;
  const message = ctx.message;

  if (chat.type !== 'group' && chat.type !== 'supergroup') return;

  // Сохраняем ID чата в конфиг
  try {
    await supabase.from('config').upsert({ key: 'public_chat_id', value: chat.id.toString() }, { onConflict: 'key' });
  } catch (_) {}

  // Удаляем сервисные сообщения о входе/выходе участников
  if (message.new_chat_members || message.left_chat_member) {
    try { await ctx.deleteMessage(); } catch (_) {}
    return;
  }

  // Команда /unban от владельца
  if (message.text && message.text.startsWith('/unban')) {
    if (from.username?.toLowerCase() !== OWNER_USERNAME) {
      await scheduleDelete(chat.id, [message.message_id], 5);
      return;
    }

    const target = message.text.split(' ')[1];
    if (!target) {
      const reply = await ctx.reply('⚠️ Пожалуйста, укажите имя пользователя или ID, например:\n`/unban @direcode_ceo`');
      await scheduleDelete(chat.id, [message.message_id, reply.message_id], 5);
      return;
    }

    let userId = /^\d+$/.test(target) ? parseInt(target) : await findUserIdByUsername(target);
    if (!userId) {
      const reply = await ctx.reply('⚠️ Пользователь не найден в базе данных.');
      await scheduleDelete(chat.id, [message.message_id, reply.message_id], 5);
      return;
    }

    try {
      await ctx.unbanChatMember(userId);
      const reply = await ctx.reply(`✅ Пользователь (ID: <code>${userId}</code>) успешно разбанен в чате!`, { parse_mode: 'HTML' });
      await scheduleDelete(chat.id, [message.message_id, reply.message_id], 5);
    } catch (err) {
      const reply = await ctx.reply(`⚠️ Не удалось разбанить: ${err.message}`);
      await scheduleDelete(chat.id, [message.message_id, reply.message_id], 5);
    }
    return;
  }

  // Пропускаем администраторов и ботов
  try {
    const author = await ctx.getAuthor();
    if (author.status === 'administrator' || author.status === 'creator' || from.is_bot) return;
  } catch (_) {}

  const text = message.text || message.caption || '';
  if (!text) return;

  const hasLink = PR_LINK_REGEX.test(text);
  const hasSwear = SWEAR_REGEX.test(text);
  if (!hasLink && !hasSwear) return;

  const userId = from.id;
  const username = from.username || null;
  const firstName = from.first_name || 'Пользователь';
  const userMention = username ? `@${username}` : `<a href="tg://user?id=${userId}">${escapeHtml(firstName)}</a>`;

  // 1. Удаляем сообщение нарушителя
  try {
    await ctx.deleteMessage();
  } catch (_) {
    return; // нет прав на удаление — дальше бессмысленно
  }

  // 2. Текущее число варнов
  let warnCount = 0;
  try {
    const { data: warnData } = await supabase.from('warns').select('*').eq('user_id', userId).maybeSingle();
    if (warnData) warnCount = warnData.warn_count;
  } catch (_) {
    return;
  }
  warnCount += 1;

  // 3. 3 варна → бан
  if (warnCount >= 3) {
    try {
      await ctx.banChatMember(userId);
      await supabase.from('warns').delete().eq('user_id', userId);
      const banMsg = await ctx.reply(
        `🚫 Пользователь ${userMention} забанен за достижение 3/3 предупреждений (мат / несанкционированный пиар).`,
        { parse_mode: 'HTML' }
      );
      await scheduleDelete(chat.id, [banMsg.message_id], 15);
    } catch (_) {
      await ctx.reply(`⚠️ Не удалось автоматически заблокировать ${userMention}. Пожалуйста, забаньте его вручную.`, { parse_mode: 'HTML' });
    }
  } else {
    // 4. Иначе предупреждение
    try {
      await supabase.from('warns').upsert({
        user_id: userId,
        username,
        first_name: firstName,
        warn_count: warnCount,
        updated_at: new Date().toISOString()
      });
      const reason = hasLink ? 'пиар / ссылки' : 'нецензурную лексику';
      const warnMsg = await ctx.reply(
        `⚠️ ${userMention}, ваше сообщение удалено за ${reason}!\nПредупреждения: <b>${warnCount}/3</b> (на 3-е предупреждение последует бан).`,
        { parse_mode: 'HTML' }
      );
      await scheduleDelete(chat.id, [warnMsg.message_id], 10);
    } catch (_) {}
  }
});
