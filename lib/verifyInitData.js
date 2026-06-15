import crypto from 'crypto';

// Проверка подписи Telegram WebApp initData.
// Документация: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// Возвращает { user, authDate } при успехе или null, если подпись неверна / данные просрочены.
export function verifyInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  // data_check_string: строки "key=value", отсортированные по алфавиту, через \n
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // Сравнение в постоянном времени
  const a = Buffer.from(computedHash, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (maxAgeSeconds > 0 && authDate > 0) {
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    if (ageSeconds > maxAgeSeconds) return null;
  }

  let user = null;
  try {
    const raw = params.get('user');
    user = raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
  if (!user || !user.id) return null;

  return { user, authDate };
}
