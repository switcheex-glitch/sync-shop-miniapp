// Единый справочник способов оплаты: код метода в Platega (enum PaymentMethodInt),
// подпись для уведомлений и оформление строки выбора в Mini App.
// Модуль без серверных зависимостей — импортируется и на клиенте (app/page.jsx).
//
// Коды из документации Platega (docs.platega.io, PaymentMethodInt):
//   2 — СБП (QR-код) · 3 — ЕРИП · 11 — Карточный эквайринг
//   12 — Международная оплата · 13 — Криптовалюта · 14 — Sberpay
// card = 11: код 10 (CardsRub) мерчантом отклоняется (502), рабочий именно 11.
//
// feePct — надбавка шлюза, которую Platega добавляет К ЦЕНЕ на платёжной форме
// (в кабинете комиссия отнесена на покупателя: «на мерчанте 0% / на покупателе N%»).
// Значения сверены с ответом API 17.08.2026 — поле paymentDetails при создании
// транзакции на 4999 ₽ вернуло: СБП 5348.93 (+7%), SberPay 5348.93 (+7%),
// карта РФ 5398.92 (+8%), крипта 5198.96 (+4%), международная 4999.00 (+0%).
// По международному методу в кабинете указано 15%, но API отдаёт сумму без надбавки —
// значит эту комиссию шлюз удерживает с нас, а не с покупателя (уточнить у менеджера).
export const PAY_METHODS = [
  { key: 'sbp', code: 2, feePct: 7, icon: '🏦', title: 'СБП (QR-код)', sub: 'Оплата по QR через банк' },
  { key: 'sberpay', code: 14, feePct: 7, icon: '🟢', title: 'SberPay', sub: 'Оплата в приложении Сбербанка' },
  { key: 'card', code: 11, feePct: 8, icon: '💳', title: 'Банковская карта РФ', sub: 'МИР, Visa, Mastercard банков РФ' },
  { key: 'crypto', code: 13, feePct: 4, icon: '₿', title: 'Криптовалюта', sub: 'USDT и другие монеты' },
  {
    key: 'intl',
    code: 12,
    feePct: 0,
    icon: '🌍',
    title: 'Зарубежная карта',
    // Подпись длинная — рендерим её в две строки (wrap), иначе обрежется по ellipsis.
    sub: 'Казахстан, Армения, Грузия, Узбекистан, Кыргызстан, Азербайджан, Молдова, Турция, ОАЭ, ЕС, UK, США и др.',
    wrap: true
  }
];

export const METHOD_CODES = Object.fromEntries(PAY_METHODS.map((m) => [m.key, m.code]));

export function getMethod(key) {
  return PAY_METHODS.find((m) => m.key === key) || null;
}

// Подпись метода для уведомлений и истории покупок.
// Старые записи в БД хранят те же ключи (sbp / card / crypto), поэтому резолвятся.
export function methodLabel(key) {
  return getMethod(key)?.title || key || '—';
}

// Сумма, которую покупатель реально увидит на платёжной форме (цена + надбавка шлюза).
export function payableAmount(key, price) {
  const fee = getMethod(key)?.feePct || 0;
  return Math.round(price * (1 + fee / 100) * 100) / 100;
}

export function fmtAmount(n) {
  return Number.isInteger(n)
    ? n.toLocaleString('ru-RU')
    : n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
