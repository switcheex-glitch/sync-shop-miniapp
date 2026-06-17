import { Bot } from 'grammy';
import { createClient } from '@supabase/supabase-js';

// Бот техподдержки Sync Industries (serverless-вебхук).
// Тикеты через форум-топики в админ-группе, очередь распределения (triage),
// регистрация рабочих имён, статистика, SLA-предупреждения, CSAT, бан/разбан.
//
// Отличия от long-polling версии (bot.js):
//  - setTimeout-автоудаления служебных сообщений → таблица scheduled_deletions (+ /api/cron).
//  - setInterval(SLA / очистка логов) → runSupportTasks(), дёргается /api/cron.
//  - in-memory registrationPrompts убран (очистка промпта идёт через reply_to_message + отложенно).

const TOKEN = process.env.SUPPORT_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID || '-1004385753979';
const MODERATOR_BOT_TOKEN = process.env.MODERATOR_BOT_TOKEN;
const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'mefr22').toLowerCase().replace(/^@/, '');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
export const supportBot = new Bot(TOKEN);
const bot = supportBot; // алиас, чтобы не менять тело хендлеров

// Запланировать удаление сообщений через N секунд (вместо setTimeout в serverless).
async function scheduleDelete(messageIds, seconds, chatId = ADMIN_GROUP_ID) {
  const ids = (Array.isArray(messageIds) ? messageIds : [messageIds]).filter(Boolean);
  if (!ids.length) return;
  const delete_at = new Date(Date.now() + seconds * 1000).toISOString();
  const rows = ids.map((mid) => ({ bot: 'support', chat_id: String(chatId), message_id: mid, delete_at }));
  try { await supabase.from('scheduled_deletions').insert(rows); } catch (_) {}
}

function isOffHours() {
  const mskTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const day = mskTime.getUTCDay();
  const hour = mskTime.getUTCHours();
  if (day === 6 || day === 0) return hour < 11 || hour >= 18;
  return hour < 9 || hour >= 21;
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Проверка бана + настройки перед обработкой ЛС
bot.filter((ctx) => ctx.chat?.type === 'private').use(async (ctx, next) => {
  if (!ADMIN_GROUP_ID) {
    await ctx.reply('⚠️ Бот находится в процессе настройки администратором. Пожалуйста, попробуйте написать позже.');
    return;
  }
  const { data: banData } = await supabase
    .from('blacklist')
    .select('user_id')
    .eq('user_id', ctx.from.id)
    .maybeSingle();
  if (banData) return;
  await next();
});

// Команда /start (только в приватных чатах)
bot.filter((ctx) => ctx.chat?.type === 'private').command('start', async (ctx) => {
  const userId = ctx.from.id;
  const { data: ticket } = await supabase
    .from('tickets')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open')
    .maybeSingle();

  if (ticket) {
    await ctx.reply('🤖 Вы уже находитесь в диалоге с поддержкой [Sync Industries](https://t.me/Sync_Industries). Напишите ваш вопрос прямо сюда.', { parse_mode: 'Markdown', disable_web_page_preview: true });
  } else {
    const greetingText = `🤖 **Добро пожаловать в службу поддержки [Sync Industries](https://t.me/Sync_Industries)!**\n\n` +
      `📅 **Режим работы поддержки:**\n` +
      `• Будние дни: с **09:00** до **21:00** по МСК\n` +
      `• Суббота и воскресенье: с **11:00** до **18:00** по МСК\n\n` +
      `Мы здесь, чтобы оперативно решить любые технические и организационные вопросы, связанные с нашей экосистемой.\n\n` +
      `**Чтобы мы помогли вам как можно быстрее, пожалуйста:**\n` +
      `1. Опишите вашу проблему или вопрос в **одном сообщении**.\n` +
      `2. Прикрепите скриншоты, логи или видео экрана, если это необходимо.\n` +
      `3. Нажмите «Отправить».\n\n` +
      `Наши специалисты уже готовы помочь. Опишите ваш вопрос ниже 👇`;
    await ctx.reply(greetingText, { parse_mode: 'Markdown', disable_web_page_preview: true });
  }
});

// Основной обработчик сообщений
bot.on('message', async (ctx) => {
  const chat = ctx.chat;
  const from = ctx.from;
  const message = ctx.message;

  // 0. Удаление сервисных сообщений о закреплении
  if (message.pinned_message) {
    try { await ctx.deleteMessage(); } catch (_) {}
    return;
  }

  if (!ADMIN_GROUP_ID) return;

  // 1. Ответы от администраторов в группе саппорта
  if (chat.id.toString() === ADMIN_GROUP_ID) {
    const threadId = message.message_thread_id;
    if (!threadId) return;

    // Ветка регистрации?
    const { data: configRegister } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'register_thread_id')
      .maybeSingle();

    if (configRegister && threadId.toString() === configRegister.value) {
      const adminId = from.id;
      const adminUsername = from.username || null;

      // Анонимный администратор
      if (adminId === 1087968824 || adminUsername === 'GroupAnonymousBot') {
        const warnMsg = await ctx.reply('⚠️ Вы пишете от имени анонимного администратора. Для регистрации рабочего имени, пожалуйста, пишите от своего личного аккаунта (отключите анонимность в настройках группы).', { message_thread_id: threadId });
        await scheduleDelete([message.message_id, warnMsg.message_id], 5);
        return;
      }

      // 1. Текстовый ввод нового имени (не команда)
      if (message.text && !message.text.startsWith('/')) {
        const customName = message.text.trim();
        const adminFirstName = from.first_name || null;

        await supabase.from('admins').delete().eq('user_id', adminId);
        const { error } = await supabase.from('admins').insert({
          user_id: adminId, alias: customName, username: adminUsername, first_name: adminFirstName
        });

        if (error) {
          console.error('Ошибка сохранения кастомного имени:', error.message);
          await ctx.reply('⚠️ Ошибка сохранения имени в базе данных.', { message_thread_id: threadId });
          return;
        }

        const confirmMsg = await ctx.reply(`✅ Успешно! Ваше имя в системе: **${customName}**`, {
          message_thread_id: threadId, parse_mode: 'Markdown'
        });
        await updateRegisterMessage();
        await scheduleDelete([message.message_id, message.reply_to_message?.message_id, confirmMsg.message_id], 5);
        return;
      }

      // 2. Команда /setname в ветке регистрации
      if (message.text && message.text.startsWith('/setname')) {
        const parts = message.text.split(' ');
        parts.shift();
        const customName = parts.join(' ').trim();

        if (!customName) {
          const warnMsg = await ctx.reply('⚠️ Пожалуйста, укажите имя после команды, например:\n`/setname Специалист Влад`', { message_thread_id: threadId, parse_mode: 'Markdown' });
          await scheduleDelete([message.message_id, warnMsg.message_id], 5);
          return;
        }

        const adminId2 = from.id;
        const adminUsername2 = from.username || null;
        const adminFirstName = from.first_name || null;

        await supabase.from('admins').delete().eq('user_id', adminId2);
        const { error } = await supabase.from('admins').insert({
          user_id: adminId2, alias: customName, username: adminUsername2, first_name: adminFirstName
        });

        if (error) {
          console.error('Ошибка сохранения кастомного имени:', error.message);
          const errMsg = await ctx.reply('⚠️ Ошибка при сохранении имени в базе данных.', { message_thread_id: threadId });
          await scheduleDelete([message.message_id, errMsg.message_id], 5);
          return;
        }

        const confirmMsg = await ctx.reply(`✅ Имя <b>${escapeHtml(customName)}</b> успешно закреплено за вашим аккаунтом! Теперь при взятии и закрытии тикетов клиенты будут видеть это имя.`, { message_thread_id: threadId, parse_mode: 'HTML' });
        await updateRegisterMessage();
        await scheduleDelete([message.message_id, confirmMsg.message_id], 5);
        return;
      }

      // 3. Любое другое сообщение в ветке регистрации — чистим через ~минуту
      if (message.text !== '/register_init') {
        await scheduleDelete([message.message_id], 5);
        return;
      }
    }

    // /stats_init
    if (message.text === '/stats_init') {
      if (from.username?.toLowerCase() !== OWNER_USERNAME) {
        const warn = await ctx.reply('⚠️ Эта команда доступна только владельцу проекта (@mefr22).', { message_thread_id: threadId });
        await scheduleDelete([message.message_id, warn.message_id], 5);
        return;
      }
      try {
        const { data: oldStatsMsg } = await supabase.from('config').select('value').eq('key', 'stats_message_id').maybeSingle();
        if (oldStatsMsg) {
          const oldId = parseInt(oldStatsMsg.value);
          try { await bot.api.unpinChatMessage(ADMIN_GROUP_ID, oldId); } catch (_) {}
          try { await bot.api.deleteMessage(ADMIN_GROUP_ID, oldId); } catch (_) {}
        }
      } catch (_) {}

      await supabase.from('config').upsert({ key: 'stats_thread_id', value: threadId.toString() }, { onConflict: 'key' });
      try { await ctx.deleteMessage(); } catch (_) {}

      const initialText = `📊 <b>Статистика работы поддержки Sync Industries</b>\n\nРасчет и запуск сбора данных... Начните закрывать тикеты для отображения статистики.`;
      const sentMsg = await bot.api.sendMessage(ADMIN_GROUP_ID, initialText, { message_thread_id: threadId, parse_mode: 'HTML' });
      await supabase.from('config').upsert({ key: 'stats_message_id', value: sentMsg.message_id.toString() }, { onConflict: 'key' });
      try { await bot.api.pinChatMessage(ADMIN_GROUP_ID, sentMsg.message_id); } catch (err) { console.error('Не удалось закрепить сообщение статистики:', err.message); }
      await updateStatistics();
      return;
    }

    // /stats_clear
    if (message.text === '/stats_clear') {
      if (from.username?.toLowerCase() !== OWNER_USERNAME) {
        const warn = await ctx.reply('⚠️ Эта команда доступна только владельцу проекта (@mefr22).', { message_thread_id: threadId });
        await scheduleDelete([message.message_id, warn.message_id], 5);
        return;
      }
      const { error } = await supabase.from('tickets').delete().eq('status', 'closed');
      if (error) {
        console.error('Ошибка сброса статистики в БД:', error.message);
        const errMsg = await ctx.reply('⚠️ Ошибка при очистке статистики в базе данных.', { message_thread_id: threadId });
        await scheduleDelete([message.message_id, errMsg.message_id], 5);
        return;
      }
      const confirmMsg = await ctx.reply('📊 <b>Статистика успешно сброшена на 0!</b>', { message_thread_id: threadId, parse_mode: 'HTML' });
      await updateStatistics();
      await scheduleDelete([message.message_id, confirmMsg.message_id], 5);
      return;
    }

    // /unban <username_or_id>
    if (message.text && message.text.startsWith('/unban')) {
      if (from.username?.toLowerCase() !== OWNER_USERNAME) {
        const warn = await ctx.reply('⚠️ Эта команда доступна только владельцу проекта (@mefr22).', { message_thread_id: threadId });
        await scheduleDelete([message.message_id, warn.message_id], 5);
        return;
      }

      const target = message.text.split(' ')[1];
      if (!target) {
        const warn = await ctx.reply('⚠️ Пожалуйста, укажите имя пользователя или ID, например:\n`/unban @direcode_ceo`', { message_thread_id: threadId });
        await scheduleDelete([message.message_id, warn.message_id], 5);
        return;
      }

      let userId = /^\d+$/.test(target) ? parseInt(target) : await findUserIdByUsername(target);
      if (!userId) {
        const warn = await ctx.reply('⚠️ Пользователь не найден в базе данных.', { message_thread_id: threadId });
        await scheduleDelete([message.message_id, warn.message_id], 5);
        return;
      }

      await supabase.from('blacklist').delete().eq('user_id', userId);

      let unbannedInChat = false;
      try {
        const { data: configChat } = await supabase.from('config').select('value').eq('key', 'public_chat_id').maybeSingle();
        if (configChat) {
          const publicChatId = parseInt(configChat.value);
          try {
            const modBot = new Bot(MODERATOR_BOT_TOKEN);
            await modBot.api.unbanChatMember(publicChatId, userId);
            unbannedInChat = true;
          } catch (_) {
            try { await bot.api.unbanChatMember(publicChatId, userId); unbannedInChat = true; } catch (_) {}
          }
        }
      } catch (_) {}

      const confirmMsg = await ctx.reply(`✅ Пользователь (ID: <code>${userId}</code>) успешно разбанен в поддержке${unbannedInChat ? ' и в общем чате' : ''}!`, { message_thread_id: threadId, parse_mode: 'HTML' });
      await scheduleDelete([message.message_id, confirmMsg.message_id], 5);
      return;
    }

    // /logs_init
    if (message.text === '/logs_init') {
      if (from.username?.toLowerCase() !== OWNER_USERNAME) {
        const warn = await ctx.reply('⚠️ Эта команда доступна только владельцу проекта (@mefr22).', { message_thread_id: threadId });
        await scheduleDelete([message.message_id, warn.message_id], 5);
        return;
      }
      await supabase.from('config').upsert({ key: 'logs_thread_id', value: threadId.toString() }, { onConflict: 'key' });
      try { await ctx.deleteMessage(); } catch (_) {}
      await bot.api.sendMessage(ADMIN_GROUP_ID, `🪵 **Журнал системных логов Sync Industries успешно запущен!**\nСюда будут транслироваться все действия саппорта в реальном времени.`, { message_thread_id: threadId, parse_mode: 'Markdown' });
      return;
    }

    // /triage_init
    if (message.text === '/triage_init') {
      if (from.username?.toLowerCase() !== OWNER_USERNAME) {
        const warn = await ctx.reply('⚠️ Эта команда доступна только владельцу проекта (@mefr22).', { message_thread_id: threadId });
        await scheduleDelete([message.message_id, warn.message_id], 5);
        return;
      }
      await supabase.from('config').upsert({ key: 'triage_thread_id', value: threadId.toString() }, { onConflict: 'key' });
      try { await ctx.deleteMessage(); } catch (_) {}
      await bot.api.sendMessage(ADMIN_GROUP_ID, `🎫 **Очередь распределения тикетов Sync Industries запущена!**\nСюда будут поступать все новые обращения. Саппорты могут «забирать» их кликом по кнопке.`, { message_thread_id: threadId, parse_mode: 'Markdown' });
      return;
    }

    // /register_init
    if (message.text === '/register_init') {
      if (from.username?.toLowerCase() !== OWNER_USERNAME) {
        const warn = await ctx.reply('⚠️ Эта команда доступна только владельцу проекта (@mefr22).', { message_thread_id: threadId });
        await scheduleDelete([message.message_id, warn.message_id], 5);
        return;
      }
      try {
        const { data: oldRegMsg } = await supabase.from('config').select('value').eq('key', 'register_message_id').maybeSingle();
        if (oldRegMsg) {
          const oldId = parseInt(oldRegMsg.value);
          try { await bot.api.unpinChatMessage(ADMIN_GROUP_ID, oldId); } catch (_) {}
          try { await bot.api.deleteMessage(ADMIN_GROUP_ID, oldId); } catch (_) {}
        }
      } catch (_) {}

      await supabase.from('config').upsert({ key: 'register_thread_id', value: threadId.toString() }, { onConflict: 'key' });
      try { await ctx.deleteMessage(); } catch (_) {}

      const msg = await sendRegisterMessage(threadId);
      await supabase.from('config').upsert({ key: 'register_message_id', value: msg.message_id.toString() }, { onConflict: 'key' });
      try { await bot.api.pinChatMessage(ADMIN_GROUP_ID, msg.message_id); } catch (err) { console.error('Не удалось закрепить сообщение регистрации:', err.message); }
      return;
    }

    // /setname <Имя> в других ветках
    if (message.text && message.text.startsWith('/setname')) {
      const adminId3 = from.id;
      const adminUsername3 = from.username || null;
      const adminFirstName = from.first_name || null;

      if (adminId3 === 1087968824 || adminUsername3 === 'GroupAnonymousBot') {
        const warnMsg = await ctx.reply('⚠️ Вы пишете от имени анонимного администратора. Пожалуйста, отправляйте команду со своего личного аккаунта (выключите анонимность в настройках группы).', { message_thread_id: threadId });
        await scheduleDelete([message.message_id, warnMsg.message_id], 5);
        return;
      }

      const parts = message.text.split(' ');
      parts.shift();
      const customName = parts.join(' ').trim();

      if (!customName) {
        const warnMsg = await ctx.reply('⚠️ Пожалуйста, укажите имя после команды, например:\n`/setname Специалист Влад`', { message_thread_id: threadId, parse_mode: 'Markdown' });
        await scheduleDelete([message.message_id, warnMsg.message_id], 5);
        return;
      }

      await supabase.from('admins').delete().eq('user_id', adminId3);
      const { error } = await supabase.from('admins').insert({
        user_id: adminId3, alias: customName, username: adminUsername3, first_name: adminFirstName
      });

      if (error) {
        console.error('Ошибка при сохранении кастомного имени админа:', error.message);
        const errMsg = await ctx.reply('⚠️ Ошибка при сохранении имени в базе данных.', { message_thread_id: threadId });
        await scheduleDelete([message.message_id, errMsg.message_id], 5);
        return;
      }

      const confirmMsg = await ctx.reply(`✅ Имя <b>${escapeHtml(customName)}</b> успешно закреплено за вашим аккаунтом! Теперь при взятии и закрытии тикетов клиенты будут видеть это имя.`, { message_thread_id: threadId, parse_mode: 'HTML' });
      await updateRegisterMessage();
      await scheduleDelete([message.message_id, confirmMsg.message_id], 5);
      return;
    }

    // Тему закрыли вручную в Telegram
    if (message.forum_topic_closed) {
      const { data: ticket } = await supabase
        .from('tickets').select('*').eq('thread_id', threadId).eq('status', 'open').maybeSingle();

      if (ticket) {
        const adminId = from.id;
        const adminName = `${from.first_name || ''} ${from.last_name || ''}`.trim() || 'Администратор';
        const adminUsername = from.username || null;

        const { data: adminProfile } = await supabase.from('admins').select('alias').eq('user_id', adminId).maybeSingle();
        const displayName = adminProfile ? adminProfile.alias : adminName;

        await supabase.from('tickets').update({
          status: 'closed', updated_at: new Date().toISOString(),
          closed_by_id: adminId, closed_by_name: displayName, closed_by_username: adminUsername
        }).eq('id', ticket.id);

        await sendCSATKeyboard(ticket.user_id, ticket.id, displayName);
        await updateStatistics();
        await updateTriageStatus(ticket, 'closed', displayName);
        await logAction(`🔒 <b>Тикет закрыт (вручную):</b> Специалист <b>${escapeHtml(displayName)}</b> (${adminUsername ? '@' + adminUsername : 'ID: ' + adminId}) закрыл тему клиента <b>${escapeHtml(ticket.first_name || 'клиент')}</b> (Тема: #${ticket.thread_id})`);
        try { await bot.api.deleteForumTopic(ADMIN_GROUP_ID, threadId); } catch (err) { console.error('Не удалось удалить тему после ручного закрытия:', err.message); }
      }
      return;
    }

    // Игнорируем служебные сообщения
    const isServiceMessage = !message.text && !message.photo && !message.document && !message.voice && !message.video && !message.sticker && !message.audio && !message.video_note;
    if (isServiceMessage) return;

    const { data: ticket, error } = await supabase
      .from('tickets').select('*').eq('thread_id', threadId).eq('status', 'open').maybeSingle();

    if (error) { console.error('Ошибка БД при поиске тикета:', error); return; }
    if (!ticket) return;

    // /ban
    if (message.text === '/ban') {
      const adminId = from.id;
      const adminName = `${from.first_name || ''} ${from.last_name || ''}`.trim() || 'Администратор';
      const adminUsername = from.username || null;
      const { data: adminProfile } = await supabase.from('admins').select('alias').eq('user_id', adminId).maybeSingle();
      const displayName = adminProfile ? adminProfile.alias : adminName;

      await supabase.from('blacklist').upsert({ user_id: ticket.user_id, username: ticket.username || null, banned_by: adminId });
      await supabase.from('tickets').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', ticket.id);
      await updateStatistics();
      await updateTriageStatus(ticket, 'banned', displayName);
      await logAction(`🚫 <b>Пользователь забанен (командой):</b> Специалист <b>${escapeHtml(displayName)}</b> (${adminUsername ? '@' + adminUsername : 'ID: ' + adminId}) заблокировал пользователя <b>${escapeHtml(ticket.first_name || 'клиент')}</b> (ID: <code>${ticket.user_id}</code>)`);
      try { await bot.api.deleteForumTopic(ADMIN_GROUP_ID, threadId); } catch (err) { console.error('Не удалось автоматически удалить тему в Telegram:', err.message); }
      return;
    }

    // /close
    if (message.text === '/close') {
      const adminId = from.id;
      const adminName = `${from.first_name || ''} ${from.last_name || ''}`.trim() || 'Администратор';
      const adminUsername = from.username || null;
      const { data: adminProfile } = await supabase.from('admins').select('alias').eq('user_id', adminId).maybeSingle();
      const displayName = adminProfile ? adminProfile.alias : adminName;

      await supabase.from('tickets').update({
        status: 'closed', updated_at: new Date().toISOString(),
        closed_by_id: adminId, closed_by_name: displayName, closed_by_username: adminUsername
      }).eq('id', ticket.id);

      await sendCSATKeyboard(ticket.user_id, ticket.id, displayName);
      await updateStatistics();
      await updateTriageStatus(ticket, 'closed', displayName);
      await logAction(`🔒 <b>Тикет закрыт (командой):</b> Специалист <b>${escapeHtml(displayName)}</b> (${adminUsername ? '@' + adminUsername : 'ID: ' + adminId}) закрыл тему клиента <b>${escapeHtml(ticket.first_name || 'клиент')}</b> (Тема: #${ticket.thread_id})`);
      try { await bot.api.deleteForumTopic(ADMIN_GROUP_ID, threadId); } catch (err) { console.error('Не удалось автоматически удалить тему в Telegram:', err.message); }
      return;
    }

    // Ответ админа пользователю с подписью
    let sentSuccessfully = false;
    const adminId = from.id;
    const adminName = `${from.first_name || ''} ${from.last_name || ''}`.trim() || 'Администратор';
    const { data: adminProfile } = await supabase.from('admins').select('alias').eq('user_id', adminId).maybeSingle();
    const displayName = adminProfile ? adminProfile.alias : adminName;
    const signature = `\n\n— \`${displayName}\``;

    try {
      if (message.text) {
        await bot.api.sendMessage(ticket.user_id, message.text + signature, { parse_mode: 'Markdown' });
        sentSuccessfully = true;
      } else if (message.photo) {
        await bot.api.sendPhoto(ticket.user_id, message.photo[message.photo.length - 1].file_id, { caption: (message.caption || '') + signature, parse_mode: 'Markdown' });
        sentSuccessfully = true;
      } else if (message.document) {
        await bot.api.sendDocument(ticket.user_id, message.document.file_id, { caption: (message.caption || '') + signature, parse_mode: 'Markdown' });
        sentSuccessfully = true;
      } else if (message.voice) {
        await bot.api.sendVoice(ticket.user_id, message.voice.file_id, { caption: (message.caption || '') + signature, parse_mode: 'Markdown' });
        sentSuccessfully = true;
      } else if (message.video) {
        await bot.api.sendVideo(ticket.user_id, message.video.file_id, { caption: (message.caption || '') + signature, parse_mode: 'Markdown' });
        sentSuccessfully = true;
      } else if (message.sticker) {
        await bot.api.sendSticker(ticket.user_id, message.sticker.file_id);
        sentSuccessfully = true;
      }
    } catch (err) {
      console.error('Ошибка при отправке ответа пользователю с подписью:', err.message);
      try { await bot.api.copyMessage(ticket.user_id, chat.id, message.message_id); sentSuccessfully = true; } catch (copyErr) { console.error('Ошибка при резервном копировании сообщения:', copyErr.message); }
    }

    if (!sentSuccessfully) {
      await ctx.reply('❌ Ошибка отправки: пользователь мог заблокировать бота, либо в группе включена защита содержимого.', { message_thread_id: threadId });
    }

    if (sentSuccessfully && !ticket.has_admin_responded) {
      await supabase.from('tickets').update({ has_admin_responded: true }).eq('id', ticket.id);
    }
    return;
  }

  // 2. Входящие сообщения от пользователей (в ЛС бота)
  if (chat.type === 'private') {
    const { data: ticket, error } = await supabase
      .from('tickets').select('*').eq('user_id', from.id).eq('status', 'open').maybeSingle();

    if (error) {
      console.error('Ошибка БД при поиске активного тикета:', error);
      await ctx.reply('⚠️ Ошибка подключения к серверу. Попробуйте написать позже.');
      return;
    }

    let threadId;

    if (!ticket) {
      const userDisplayName = `${from.first_name || ''} ${from.last_name || ''}`.trim();
      const topicName = `${userDisplayName} (${from.username ? '@' + from.username : 'ID: ' + from.id})`.trim();

      try {
        const topic = await bot.api.createForumTopic(ADMIN_GROUP_ID, topicName);
        threadId = topic.message_thread_id;

        const { data: insertData, error: insertError } = await supabase
          .from('tickets').insert({
            user_id: from.id, username: from.username || null, first_name: from.first_name || null,
            last_name: from.last_name || null, thread_id: threadId, status: 'open'
          }).select();

        if (insertError || !insertData || insertData.length === 0) {
          console.error('Ошибка при добавлении тикета в БД:', insertError || 'Данные не вернулись');
          try { await bot.api.deleteForumTopic(ADMIN_GROUP_ID, threadId); } catch (_) {}
          await ctx.reply('⚠️ Не удалось создать обращение. Попробуйте позже.');
          return;
        }

        await ctx.reply('🤖 **Ваше обращение зарегистрировано!**\nСпециалист поддержки [Sync Industries](https://t.me/Sync_Industries) ответит вам прямо в этом чате.', { parse_mode: 'Markdown', disable_web_page_preview: true });

        if (isOffHours()) {
          const offHoursText = `🌙 **Сейчас нерабочее время поддержки [Sync Industries](https://t.me/Sync_Industries)**\n\n` +
            `📅 **Наш режим работы:**\n` +
            `• Будние дни: с **09:00** до **21:00** по МСК\n` +
            `• Суббота и воскресенье: с **11:00** до **18:00** по МСК\n\n` +
            `Ваше обращение сохранено в очереди. Специалист ответит вам сразу, как только начнется рабочая смена! Спасибо за понимание.`;
          await ctx.reply(offHoursText, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }

        const escName = escapeHtml(userDisplayName);
        const escUsername = from.username ? `@${from.username}` : 'скрыт';
        const userInfoText = `🆕 <b>Новое обращение!</b>\n` +
          `• <b>Имя:</b> ${escName}\n` +
          `• <b>Юзернейм:</b> ${escUsername}\n` +
          `• <b>ID:</b> <code>${from.id}</code>\n\n` +
          `Отвечайте в этой теме для переписки с клиентом. Используйте кнопки ниже для быстрого управления тикетом:`;

        const adminKeyboard = {
          inline_keyboard: [[
            { text: '🟢 Закрыть тикет', callback_data: `admin_close:${insertData[0].id}` },
            { text: '🔴 Заблокировать', callback_data: `admin_ban:${insertData[0].id}` }
          ]]
        };

        await bot.api.sendMessage(ADMIN_GROUP_ID, userInfoText, { message_thread_id: threadId, reply_markup: adminKeyboard, parse_mode: 'HTML' });

        try {
          const { data: configTriage } = await supabase.from('config').select('value').eq('key', 'triage_thread_id').maybeSingle();
          if (configTriage) {
            const triageThreadId = parseInt(configTriage.value);
            const groupCleanId = ADMIN_GROUP_ID.replace('-100', '');
            const threadLink = `https://t.me/c/${groupCleanId}/${threadId}`;

            let triageText = `🎫 <b>Новое обращение!</b>\n`;
            triageText += `• <b>Клиент:</b> ${escName} (${from.username ? '@' + from.username : 'скрыт'})\n`;
            triageText += `• <b>Статус:</b> ⏳ Ожидает саппорта\n`;
            triageText += `• <b>Тема:</b> <a href="${threadLink}">Перейти в тему 🔗</a>`;

            const triageKeyboard = { inline_keyboard: [[{ text: '🙋‍♂️ Взять в работу', callback_data: `admin_claim:${insertData[0].id}` }]] };

            const triageMsg = await bot.api.sendMessage(ADMIN_GROUP_ID, triageText, { message_thread_id: triageThreadId, reply_markup: triageKeyboard, parse_mode: 'HTML', disable_web_page_preview: true });
            await supabase.from('tickets').update({ triage_message_id: triageMsg.message_id }).eq('id', insertData[0].id);
          }
        } catch (triageErr) {
          console.error('Ошибка отправки в очередь тикетов:', triageErr.message);
        }

        await logAction(`🟢 <b>Новый тикет:</b> Пользователь <b>${escapeHtml(userDisplayName)}</b> (${from.username ? '@' + from.username : 'нет'}) открыл обращение (Тема: #${threadId})`);
      } catch (err) {
        console.error('Ошибка создания темы в Telegram:', err.message);
        await ctx.reply('⚠️ Служба поддержки временно недоступна. Пожалуйста, попробуйте написать позже.');
        return;
      }
    } else {
      threadId = ticket.thread_id;
    }

    try {
      await bot.api.copyMessage(ADMIN_GROUP_ID, chat.id, message.message_id, { message_thread_id: threadId });
    } catch (err) {
      console.error('Ошибка копирования сообщения пользователя в тему:', err.message);
    }
  }
});

// Инлайн-кнопки
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const from = ctx.from;

  // 1. CSAT
  if (data.startsWith('rate:')) {
    const parts = data.split(':');
    const ticketId = parts[1];
    const rating = parseInt(parts[2]);

    const { error } = await supabase.from('tickets').update({ rating }).eq('id', ticketId);
    if (error) {
      console.error('Ошибка при сохранении оценки CSAT:', error.message);
      await ctx.answerCallbackQuery({ text: '⚠️ Ошибка при сохранении оценки.' });
      return;
    }

    await ctx.editMessageText(`✅ Спасибо за вашу оценку! Вы поставили: ${rating} ⭐`);
    await ctx.answerCallbackQuery({ text: 'Спасибо за отзыв!' });
    await updateStatistics();

    try {
      const { data: ticket } = await supabase.from('tickets').select('*').eq('id', ticketId).maybeSingle();
      if (ticket) {
        const clientName = `${ticket.first_name || ''} ${ticket.last_name || ''}`.trim() || 'Клиент';
        await logAction(`⭐ <b>Оценка CSAT:</b> Пользователь <b>${escapeHtml(clientName)}</b> поставил оценку <b>${rating} ⭐</b> для тикета (закрыл: <b>${escapeHtml(ticket.closed_by_name || 'саппорт')}</b>)`);
      }
    } catch (err) { console.error('Ошибка логирования оценки:', err.message); }
    return;
  }

  // 2. Взятие тикета в работу
  if (data.startsWith('admin_claim:')) {
    const ticketId = data.split(':')[1];
    const { data: ticket, error } = await supabase.from('tickets').select('*').eq('id', ticketId).maybeSingle();

    if (error || !ticket) { await ctx.answerCallbackQuery({ text: '⚠️ Тикет не найден в базе данных.' }); return; }
    if (ticket.status === 'closed') { await ctx.answerCallbackQuery({ text: '🔒 Этот тикет уже закрыт.' }); return; }
    if (ticket.assigned_to_id) { await ctx.answerCallbackQuery({ text: `⚠️ Этот тикет уже закрепил: ${ticket.assigned_to_name}` }); return; }

    const adminId = from.id;
    const adminName = `${from.first_name || ''} ${from.last_name || ''}`.trim() || 'Администратор';
    const adminUsername = from.username || null;
    const { data: adminProfile } = await supabase.from('admins').select('alias').eq('user_id', adminId).maybeSingle();
    const displayName = adminProfile ? adminProfile.alias : adminName;

    await supabase.from('tickets').update({ assigned_to_id: adminId, assigned_to_name: displayName, assigned_to_username: adminUsername }).eq('id', ticket.id);
    await ctx.answerCallbackQuery({ text: 'Вы закрепили тикет за собой!' });

    const groupCleanId = ADMIN_GROUP_ID.replace('-100', '');
    const threadLink = `https://t.me/c/${groupCleanId}/${ticket.thread_id}`;
    const clientName = `${ticket.first_name || 'клиент'} ${ticket.last_name || ''}`.trim();
    let updatedTriageText = `🎫 <b>Обращение в работе!</b>\n`;
    updatedTriageText += `• <b>Клиент:</b> ${escapeHtml(clientName)} (${ticket.username ? '@' + ticket.username : 'скрыт'})\n`;
    updatedTriageText += `• <b>Статус:</b> 🟢 В работе у: <b>${escapeHtml(displayName)}</b> (${adminUsername ? '@' + adminUsername : ''})\n`;
    updatedTriageText += `• <b>Тема:</b> <a href="${threadLink}">Перейти в тему 🔗</a>`;

    try { await ctx.editMessageText(updatedTriageText, { parse_mode: 'HTML', disable_web_page_preview: true }); } catch (err) { console.error('Не удалось изменить сообщение в очереди:', err.message); }

    try {
      await bot.api.sendMessage(ADMIN_GROUP_ID, `🙋‍♂️ <b>Тикет принят:</b> Специалист <b>${escapeHtml(displayName)}</b> (${adminUsername ? '@' + adminUsername : 'ID: ' + adminId}) взял это обращение в работу.`, { message_thread_id: ticket.thread_id, parse_mode: 'HTML' });
    } catch (_) {}

    try {
      await bot.api.sendMessage(ticket.user_id, `🙋‍♂️ **Ваш тикет принял в работу:** ${displayName}. Специалист уже изучает ваш вопрос и ответит в этом чате!`, { parse_mode: 'Markdown' });
    } catch (err) { console.error('Не удалось отправить уведомление клиенту о принятии в работу:', err.message); }

    await logAction(`🙋‍♂️ <b>Тикет взят в работу:</b> Специалист <b>${escapeHtml(displayName)}</b> (${adminUsername ? '@' + adminUsername : 'ID: ' + adminId}) взял тикет клиента <b>${escapeHtml(ticket.first_name || 'клиент')}</b> (Тема: #${ticket.thread_id})`);
    return;
  }

  // 3. Запрос на указание рабочего имени
  if (data === 'admin_register_prompt') {
    const threadId = ctx.callbackQuery.message?.message_thread_id;
    if (!threadId) return;

    try {
      const nameEsc = escapeHtml(from.first_name || 'администратор');
      const usernameDisplay = from.username ? `@${from.username}` : nameEsc;

      const promptMsg = await ctx.reply(
        `👤 ${usernameDisplay}, напишите ваше рабочее имя в ответ на это сообщение (например, <b>Специалист Влад</b>):`,
        { message_thread_id: threadId, reply_markup: { force_reply: true, selective: true }, parse_mode: 'HTML' }
      );
      // Авто-удаление промпта примерно через 2 минуты, если проигнорировали
      await scheduleDelete([promptMsg.message_id], 120);
      await ctx.answerCallbackQuery();
    } catch (err) {
      console.error('Ошибка при отправке prompt для регистрации:', err.message);
      await ctx.answerCallbackQuery({ text: '⚠️ Не удалось запустить процесс регистрации.' });
    }
    return;
  }

  // 4. Закрыть тикет / Забанить из темы тикета
  if (data.startsWith('admin_close:') || data.startsWith('admin_ban:')) {
    const parts = data.split(':');
    const action = parts[0];
    const ticketId = parts[1];

    const { data: ticket, error } = await supabase.from('tickets').select('*').eq('id', ticketId).maybeSingle();
    if (error || !ticket) { await ctx.answerCallbackQuery({ text: '⚠️ Тикет не найден в базе данных.' }); return; }
    if (ticket.status === 'closed') { await ctx.answerCallbackQuery({ text: '🔒 Этот тикет уже закрыт.' }); try { await ctx.deleteMessage(); } catch (_) {} return; }

    const adminId = from.id;
    const adminName = `${from.first_name || ''} ${from.last_name || ''}`.trim() || 'Администратор';
    const adminUsername = from.username || null;
    const { data: adminProfile } = await supabase.from('admins').select('alias').eq('user_id', adminId).maybeSingle();
    const displayName = adminProfile ? adminProfile.alias : adminName;

    if (action === 'admin_close') {
      await supabase.from('tickets').update({
        status: 'closed', updated_at: new Date().toISOString(),
        closed_by_id: adminId, closed_by_name: displayName, closed_by_username: adminUsername
      }).eq('id', ticket.id);

      await ctx.answerCallbackQuery({ text: 'Тикет успешно закрыт!' });
      await sendCSATKeyboard(ticket.user_id, ticket.id, displayName);
      await updateStatistics();
      await updateTriageStatus(ticket, 'closed', displayName);
      await logAction(`🔒 <b>Тикет закрыт (кнопкой):</b> Специалист <b>${escapeHtml(displayName)}</b> (${adminUsername ? '@' + adminUsername : 'ID: ' + adminId}) закрыл тему клиента <b>${escapeHtml(ticket.first_name || 'клиент')}</b> (Тема: #${ticket.thread_id})`);
      try { await bot.api.deleteForumTopic(ADMIN_GROUP_ID, ticket.thread_id); } catch (_) {}
    } else if (action === 'admin_ban') {
      await supabase.from('blacklist').upsert({ user_id: ticket.user_id, username: ticket.username || null, banned_by: adminId });
      await supabase.from('tickets').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', ticket.id);

      await ctx.answerCallbackQuery({ text: 'Пользователь успешно заблокирован!' });
      await updateStatistics();
      await updateTriageStatus(ticket, 'banned', displayName);
      await logAction(`🚫 <b>Пользователь забанен (кнопкой):</b> Специалист <b>${escapeHtml(displayName)}</b> (${adminUsername ? '@' + adminUsername : 'ID: ' + adminId}) заблокировал пользователя <b>${escapeHtml(ticket.first_name || 'клиент')}</b> (ID: <code>${ticket.user_id}</code>)`);
      try { await bot.api.deleteForumTopic(ADMIN_GROUP_ID, ticket.thread_id); } catch (_) {}
    }
  }
});

/* ===================== Вспомогательные функции ===================== */

async function sendCSATKeyboard(userId, ticketId, displayName) {
  const csatKeyboard = {
    inline_keyboard: [[
      { text: '1 ⭐', callback_data: `rate:${ticketId}:1` },
      { text: '2 ⭐', callback_data: `rate:${ticketId}:2` },
      { text: '3 ⭐', callback_data: `rate:${ticketId}:3` },
      { text: '4 ⭐', callback_data: `rate:${ticketId}:4` },
      { text: '5 ⭐', callback_data: `rate:${ticketId}:5` }
    ]]
  };
  try {
    await bot.api.sendMessage(userId, `✅ Ваш тикет был успешно закрыт специалистом **${displayName}**.\nПожалуйста, оцените качество его работы:`, { reply_markup: csatKeyboard, parse_mode: 'Markdown' });
  } catch (err) { console.error('Не удалось отправить опрос CSAT пользователю:', err.message); }
}

async function sendRegisterMessage(threadId) {
  const { data: admins } = await supabase.from('admins').select('*');
  let text = `📋 <b>Регистрация сотрудников техподдержки Sync Industries</b>\n\n<b>Зарегистрированные специалисты:</b>\n`;
  if (!admins || admins.length === 0) {
    text += `• <i>Пока никто не зарегистрировался</i>\n`;
  } else {
    for (const admin of admins) {
      const usernameDisplay = admin.username ? `@${escapeHtml(admin.username)}` : `ID: ${admin.user_id}`;
      const nameDisplay = admin.first_name ? ` (${escapeHtml(admin.first_name)})` : '';
      text += `• ${usernameDisplay}${nameDisplay} — <b>${escapeHtml(admin.alias)}</b>\n`;
    }
  }
  text += `\nНажмите на кнопку ниже, чтобы привязать или изменить своё рабочее имя (оно будет показываться клиентам при принятии и закрытии тикетов).`;
  const keyboard = [[{ text: '✏️ Указать / Изменить имя', callback_data: 'admin_register_prompt' }]];
  return await bot.api.sendMessage(ADMIN_GROUP_ID, text, { message_thread_id: threadId, reply_markup: { inline_keyboard: keyboard }, parse_mode: 'HTML' });
}

async function updateRegisterMessage() {
  try {
    const { data: configThread } = await supabase.from('config').select('value').eq('key', 'register_thread_id').maybeSingle();
    const { data: configMessage } = await supabase.from('config').select('value').eq('key', 'register_message_id').maybeSingle();
    if (!configThread || !configMessage) return;
    const messageId = parseInt(configMessage.value);

    const { data: admins } = await supabase.from('admins').select('*');
    let text = `📋 <b>Регистрация сотрудников техподдержки Sync Industries</b>\n\n<b>Зарегистрированные специалисты:</b>\n`;
    if (!admins || admins.length === 0) {
      text += `• <i>Пока никто не зарегистрировался</i>\n`;
    } else {
      for (const admin of admins) {
        const usernameDisplay = admin.username ? `@${escapeHtml(admin.username)}` : `ID: ${admin.user_id}`;
        const nameDisplay = admin.first_name ? ` (${escapeHtml(admin.first_name)})` : '';
        text += `• ${usernameDisplay}${nameDisplay} — <b>${escapeHtml(admin.alias)}</b>\n`;
      }
    }
    text += `\nНажмите на кнопку ниже, чтобы привязать или изменить своё рабочее имя (оно будет показываться клиентам при принятии и закрытии тикетов).`;
    const keyboard = [[{ text: '✏️ Указать / Изменить имя', callback_data: 'admin_register_prompt' }]];
    await bot.api.editMessageText(ADMIN_GROUP_ID, messageId, text, { reply_markup: { inline_keyboard: keyboard }, parse_mode: 'HTML' });
  } catch (err) { console.error('Ошибка обновления сообщения регистрации:', err.message); }
}

async function logAction(text) {
  try {
    const { data: configThread } = await supabase.from('config').select('value').eq('key', 'logs_thread_id').maybeSingle();
    if (!configThread) return;
    const logsThreadId = parseInt(configThread.value);
    const sentMsg = await bot.api.sendMessage(ADMIN_GROUP_ID, `🪵 ${text}`, { message_thread_id: logsThreadId, parse_mode: 'HTML' });
    const { error: dbErr } = await supabase.from('logs').insert({ message_id: sentMsg.message_id });
    if (dbErr) console.warn('⚠️ Не удалось сохранить ID лога в БД:', dbErr.message);
  } catch (err) { console.error('Ошибка записи лога в Telegram:', err.message); }
}

async function cleanOldLogs() {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: oldLogs, error: fetchError } = await supabase.from('logs').select('message_id').lt('created_at', threeDaysAgo);
    if (fetchError || !oldLogs || oldLogs.length === 0) return;
    for (const log of oldLogs) {
      try { await bot.api.deleteMessage(ADMIN_GROUP_ID, log.message_id); } catch (_) {}
    }
    const messageIds = oldLogs.map((l) => l.message_id);
    await supabase.from('logs').delete().in('message_id', messageIds);
  } catch (err) { console.error('Ошибка в cleanOldLogs:', err.message); }
}

async function updateTriageStatus(ticket, status, adminName) {
  try {
    if (!ticket.triage_message_id) return;
    const { data: configTriage } = await supabase.from('config').select('value').eq('key', 'triage_thread_id').maybeSingle();
    if (!configTriage) return;

    const clientName = `${ticket.first_name || 'клиент'} ${ticket.last_name || ''}`.trim();
    let text = `🎫 <b>Обращение закрыто!</b>\n• <b>Клиент:</b> ${escapeHtml(clientName)} (${ticket.username ? '@' + ticket.username : 'скрыт'})\n`;
    if (status === 'closed') text += `• <b>Статус:</b> 🔒 Решено (<b>${escapeHtml(adminName)}</b>)\n`;
    else if (status === 'banned') text += `• <b>Статус:</b> 🚫 Заблокирован (<b>${escapeHtml(adminName)}</b>)\n`;
    await bot.api.editMessageText(ADMIN_GROUP_ID, parseInt(ticket.triage_message_id), text, { parse_mode: 'HTML' });
  } catch (err) { console.error('Ошибка обновления статуса в очереди:', err.message); }
}

function getTicketWord(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'обращений';
  if (mod10 === 1) return 'обращение';
  if (mod10 >= 2 && mod10 <= 4) return 'обращения';
  return 'обращений';
}

async function updateStatistics() {
  try {
    const { data: configThread } = await supabase.from('config').select('value').eq('key', 'stats_thread_id').maybeSingle();
    const { data: configMessage } = await supabase.from('config').select('value').eq('key', 'stats_message_id').maybeSingle();
    if (!configThread || !configMessage) return;
    const statsMessageId = parseInt(configMessage.value);

    const { data: stats, error } = await supabase.from('tickets').select('closed_by_name, closed_by_username, rating').eq('status', 'closed');
    if (error) { console.error('Ошибка при подсчете статистики:', error.message); return; }

    const counts = {};
    for (const row of stats) {
      const name = row.closed_by_name || 'Неизвестный сотрудник';
      const username = row.closed_by_username ? `@${row.closed_by_username}` : '';
      const key = `${name} ${username}`.trim();
      if (!counts[key]) counts[key] = { count: 0, totalRating: 0, ratedCount: 0 };
      counts[key].count++;
      if (row.rating) { counts[key].totalRating += row.rating; counts[key].ratedCount++; }
    }

    let statsText = `📊 <b>Статистика работы поддержки Sync Industries</b>\n\nКоличество закрытых обращений и средний рейтинг:\n\n`;
    const sortedCounts = Object.entries(counts).sort((a, b) => b[1].count - a[1].count);
    if (sortedCounts.length === 0) {
      statsText += `• Пока нет закрытых обращений.\n`;
    } else {
      for (const [employee, d] of sortedCounts) {
        const avg = d.ratedCount > 0 ? (d.totalRating / d.ratedCount).toFixed(1) : '-';
        statsText += `👤 <b>${escapeHtml(employee)}</b>: <code>${d.count}</code> ${getTicketWord(d.count)} | Рейтинг: <b>${avg} ⭐</b>\n`;
      }
    }
    statsText += `\n<i>Данные обновляются автоматически в реальном времени при закрытии тикетов.</i>`;
    await bot.api.editMessageText(ADMIN_GROUP_ID, statsMessageId, statsText, { parse_mode: 'HTML' });
  } catch (err) { console.error('Ошибка обновления статистики:', err.message); }
}

async function checkSLATimeouts() {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: tickets, error } = await supabase
      .from('tickets').select('*')
      .eq('status', 'open').eq('has_admin_responded', false).eq('sla_warned', false)
      .lt('created_at', fifteenMinutesAgo);
    if (error) { console.error('Ошибка при проверке SLA:', error.message); return; }

    for (const ticket of tickets) {
      try {
        await bot.api.sendMessage(ADMIN_GROUP_ID, `🚨 **ВНИМАНИЕ (SLA):** Этот тикет висит без ответа саппорта уже более 15 минут!\nПожалуйста, ответьте пользователю.`, { message_thread_id: ticket.thread_id, parse_mode: 'Markdown' });
        await supabase.from('tickets').update({ sla_warned: true }).eq('id', ticket.id);
      } catch (err) { console.error(`Не удалось отправить предупреждение SLA для тикета ${ticket.id}:`, err.message); }
    }
  } catch (err) { console.error('Ошибка в цикле проверки SLA:', err.message); }
}

async function findUserIdByUsername(username) {
  const cleanUsername = username.replace('@', '').trim();
  for (const table of ['warns', 'admins', 'tickets', 'blacklist']) {
    try {
      const { data } = await supabase.from(table).select('user_id').eq('username', cleanUsername).maybeSingle();
      if (data) return data.user_id;
    } catch (_) {}
  }
  return null;
}

// Периодические задачи (вызывается из /api/cron вместо setInterval).
export async function runSupportTasks() {
  await checkSLATimeouts();
  await cleanOldLogs();
}
