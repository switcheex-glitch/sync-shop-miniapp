import { verifyInitData } from './verifyInitData';

// Определяет пользователя запроса.
// 1) Если есть валидный Telegram initData — это проверенный пользователь Telegram.
// 2) Иначе — гостевой режим (открытие по прямой ссылке вне Telegram).
//    Гостевые id всегда отрицательные, поэтому никогда не пересекаются с реальными Telegram-id (они положительные).
export function resolveUser(body) {
  const verified = verifyInitData(body?.initData, process.env.TELEGRAM_BOT_TOKEN);
  if (verified) {
    return {
      id: verified.user.id,
      username: verified.user.username || null,
      first_name: verified.user.first_name || null,
      guest: false
    };
  }

  const gid = Number(body?.guestId);
  if (Number.isFinite(gid) && gid < 0) {
    return {
      id: gid,
      username: null,
      first_name: String(body?.guestName || 'Гость').slice(0, 40),
      guest: true
    };
  }

  return null;
}
