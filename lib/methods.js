// Единый справочник способов оплаты: код метода в Platega (enum PaymentMethodInt),
// подпись для уведомлений и оформление строки выбора в Mini App.
// Модуль без серверных зависимостей — импортируется и на клиенте (app/page.jsx).
//
// Коды из документации Platega (docs.platega.io, PaymentMethodInt):
//   2 — СБП (QR-код) · 3 — ЕРИП · 11 — Карточный эквайринг
//   12 — Международная оплата · 13 — Криптовалюта · 14 — Sberpay
// card = 11: код 10 (CardsRub) мерчантом отклоняется (502), рабочий именно 11.
//
// feePct — комиссия провайдера, которую Platega добавляет К ЦЕНЕ на платёжной форме
// (в кабинете комиссия отнесена на покупателя: «на мерчанте 0% / на покупателе N%»).
// СБП +7%, SberPay +7%, карта РФ +8%, крипта +4%, зарубежная карта +15% —
// значения по указанию владельца от 18.08.2026, показываются в UI как
// «комиссия провайдера» и входят в «итого».
// ВНИМАНИЕ: ответ API от 17.08.2026 для международного метода возвращал сумму
// БЕЗ надбавки (4999.00) — если в кабинете Platega комиссия intl не переведена
// на покупателя, на платёжной форме спишется меньше, чем «итого» в приложении.
export const PAY_METHODS = [
  { key: 'sbp', code: 2, feePct: 7, icon: 'qr', title: 'СБП (QR-код)', sub: 'Оплата по QR через банк' },
  { key: 'sberpay', code: 14, feePct: 7, icon: 'sber', title: 'SberPay', sub: 'Оплата в приложении Сбербанка' },
  { key: 'card', code: 11, feePct: 8, icon: 'card', title: 'Банковская карта РФ', sub: 'МИР, Visa, Mastercard, UnionPay банков РФ' },
  { key: 'crypto', code: 13, feePct: 4, icon: 'coin', title: 'Криптовалюта', sub: 'USDT, TON, BTC, ETH — из любой страны' },
  {
    key: 'intl',
    code: 12,
    feePct: 15,
    icon: 'globe',
    title: 'Зарубежная карта',
    // Шлюз международного эквайринга работает в EUR: банк покупателя сам конвертирует
    // локальную валюту (KZT, USD, BYN, TRY, PLN…) по своему курсу в момент списания.
    sub: 'Visa / Mastercard банков 210+ стран, счёт в EUR',
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
