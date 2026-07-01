import crypto from 'crypto';

// Клиент платёжного шлюза Platega (https://app.platega.io).
// Аутентификация — заголовки X-MerchantId / X-Secret (серверные секреты).

const API_URL = (process.env.PLATEGA_API_URL || 'https://app.platega.io').replace(/\/+$/, '');
const MERCHANT_ID = process.env.PLATEGA_MERCHANT_ID;
const SECRET = process.env.PLATEGA_SECRET;

// Коды методов оплаты Platega (значения из enum PaymentMethod API Platega).
// card = 11 (CardAcquiring, «Карточный эквайринг») — подтверждено на проде:
// код 10 (CardsRub) мерчантом отклоняется (502), рабочий именно 11.
export const PLATEGA_METHODS = { sbp: 2, card: 11, crypto: 13 };

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-MerchantId': MERCHANT_ID || '',
    'X-Secret': SECRET || ''
  };
}

// Создаёт транзакцию. Возвращает { transactionId, redirect, status, ... }.
// id — UUID транзакции (передаём id нашей покупки, чтобы transactionId совпал с ней).
export async function createTransaction({ id, method, amount, description, payload, returnUrl, failedUrl, metadata }) {
  const paymentMethod = PLATEGA_METHODS[method];
  if (!paymentMethod) throw new Error('unknown_method');
  if (!MERCHANT_ID || !SECRET) throw new Error('platega_not_configured');

  const res = await fetch(`${API_URL}/transaction/process`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      id,
      paymentMethod,
      paymentDetails: { amount, currency: 'RUB' },
      description,
      return: returnUrl,
      failedUrl,
      payload,
      metadata
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`platega_http_${res.status}`);
    err.detail = data;
    throw err;
  }
  return data;
}

// Запрашивает актуальный статус транзакции на стороне Platega (server-to-server).
// Используется вебхуком как защита от поддельных колбэков. Возвращает объект или null.
export async function getTransactionStatus(transactionId) {
  if (!transactionId || !MERCHANT_ID || !SECRET) return null;
  try {
    const res = await fetch(`${API_URL}/transaction/${transactionId}`, { headers: authHeaders() });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch (_) {
    return null;
  }
}

// Проверяет заголовки вебхука Platega (сравнение с нашими секретами в постоянном времени).
export function verifyCallbackAuth(merchantIdHeader, secretHeader) {
  if (!MERCHANT_ID || !SECRET) return false;
  const eq = (a, b) => {
    const ba = Buffer.from(String(a ?? ''));
    const bb = Buffer.from(String(b ?? ''));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  };
  return eq(merchantIdHeader, MERCHANT_ID) && eq(secretHeader, SECRET);
}

// Нормализует статус Platega к нашему внутреннему словарю.
export function normalizeStatus(raw) {
  const s = String(raw || '').toUpperCase();
  if (s === 'CONFIRMED') return 'paid';
  if (s === 'CANCELED' || s === 'CANCELLED') return 'canceled';
  if (s === 'CHARGEBACKED' || s === 'CHARGEBACK') return 'chargeback';
  return 'pending';
}
