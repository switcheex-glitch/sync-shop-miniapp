# Sync Industries — Telegram Mini App магазин

Витрина магазина Jarvis как **Telegram Mini App** на **Next.js**, хостинг — **Vercel**.
Оплата — через шлюз **Platega** (СБП, SberPay, карты РФ, крипта, зарубежные карты) с подтверждением по вебхуку.
Данные (покупки, согласия) — общая Supabase с ботами (таблицы `purchases`, `consents`, `config`).

## Как это работает
- Пользователь открывает Mini App из бота (@Sync_Industries_Shop_bot) — кнопкой-меню или прямой ссылкой.
- Фронт берёт `Telegram.WebApp.initData`; сервер (API-роуты) проверяет его подпись токеном бота — это и есть авторизация.
- Первый экран — согласие с EULA + Политикой (две галочки) → запись в `consents`.
- В разделе «Купить» пользователь выбирает способ оплаты (СБП / SberPay / карта РФ / крипта / зарубежная карта) и нажимает «Оплатить».
- Сервер создаёт покупку со статусом `pending`, генерирует ключ (он скрыт до оплаты) и создаёт транзакцию в Platega.
- Фронт открывает платёжную ссылку Platega и опрашивает статус. Покупатель платит.
- Platega дёргает вебхук `/api/platega/webhook`; сервер **перепроверяет статус транзакции напрямую в Platega**, и только при `CONFIRMED` помечает покупку оплаченной, раскрывает ключ, шлёт уведомление владельцу (бот-уведомитель) и ключ покупателю (бот-магазин).

## Платёжный флоу (Platega)
- Создание транзакции: `POST https://app.platega.io/transaction/process`, заголовки `X-MerchantId` / `X-Secret`.
  Методы (enum `PaymentMethodInt`, единый справочник — `lib/methods.js`):
  **2 = СБП (QR)**, **11 = карточный эквайринг РФ (МИР/Visa/MC)**, **12 = международная оплата (зарубежные карты)**,
  **13 = криптовалюта**, **14 = SberPay** (код 10 `CardsRub` мерчантом отклоняется — 502).
  В `payload` кладём id нашей покупки.
  Комиссия шлюза в кабинете Platega отнесена **на покупателя** (мерчант 0%), поэтому на форме
  списывается цена + процент метода — проценты дублируются в `lib/methods.js` (`feePct`) для показа в UI.
- Подтверждение оплаты: вебхук от Platega → `/api/platega/webhook`.
  Главный гейт безопасности — серверная перепроверка `GET /transaction/{наш transaction_id}`:
  ключ выдаётся только если Platega реально вернула статус `CONFIRMED` по нашей транзакции
  (подделать чужим колбэком нельзя). Заголовки колбэка — мягкий доп. сигнал.

## Структура
```
app/
  layout.jsx                 подключение telegram-web-app.js
  page.jsx                   UI: согласие + витрина + выбор оплаты + ожидание/выдача ключа
  globals.css                тема
  api/session/route          профиль + статус согласия + покупки (ключ только у оплаченных)
  api/consent/route          сохранение согласия
  api/purchase/route         создаёт pending-покупку + транзакцию Platega, отдаёт ссылку на оплату
  api/payment-status/route   опрос статуса покупки (для экрана ожидания)
  api/platega/webhook/route  колбэк Platega → подтверждение оплаты, выдача ключа, уведомления
  api/notify-bot/route       вебхук бота-уведомителя (ловит chat_id владельца на /start)
  api/bot/route              вебхук бота-магазина (/start: тариф + документы)
lib/
  verifyInitData.js          проверка подписи Telegram initData (HMAC)
  resolveUser.js             пользователь Telegram или гость
  supabaseServer.js          серверный клиент Supabase (service_role)
  platega.js                 клиент Platega (create / status / verify)
  methods.js                 способы оплаты: код Platega, комиссия, подпись и иконка для UI
  notify.js                  уведомления владельцу и покупателю
  legal.js                   тексты EULA + Политики, DOC_VERSION
```

## Переменные окружения (Vercel → Settings → Environment Variables)
| Переменная | Значение |
|---|---|
| `TELEGRAM_BOT_TOKEN` | токен @Sync_Industries_Shop_bot |
| `SUPABASE_URL` | https://igktdoavnjhxkyyaeziz.supabase.co |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role ключ Supabase |
| `NEXT_PUBLIC_SUPPORT_BOT` | Sync_Industries_Support_Bot |
| `PLATEGA_MERCHANT_ID` | merchant id из кабинета Platega |
| `PLATEGA_SECRET` | API-ключ (X-Secret) из кабинета Platega |
| `NOTIFY_BOT_TOKEN` | токен отдельного бота-уведомителя |
| `OWNER_USERNAME` | username владельца (по умолчанию `mefr22`) |
| `PLATEGA_RETURN_URL` | (опц.) URL возврата из платёжки, по умолчанию ссылка на бот-магазин |
| `OWNER_CHAT_ID` | (опц.) запасной chat_id владельца |

Локально те же значения лежат в `.env.local` (в репозиторий не коммитится). Образец — `.env.example`.

## Деплой и настройка (по шагам)
1. **Миграция БД** (Supabase → SQL Editor): выполнить `migration_v9.sql` из проекта ботов
   (`C:\Users\famq_\Projects\sync-industries-bot\migration_v9.sql`) — добавляет в `purchases`
   статус/метод/transaction_id и создаёт `config`. **Без этого покупка работать не будет.**
2. **Env-переменные** на Vercel (таблица выше) — задать в окружении Production.
3. **Деплой:** `vercel --prod`.
4. **Вебхук Platega:** в кабинете Platega указать URL уведомлений (callback / webhook):
   `https://sync-shop-miniapp.vercel.app/api/platega/webhook`. URL перенаправления (return) —
   ссылка на бот-магазин (уже задан в кабинете).
5. **Бот-уведомитель:** зарегистрировать вебхук в Telegram:
   `https://api.telegram.org/bot<NOTIFY_BOT_TOKEN>/setWebhook?url=https://sync-shop-miniapp.vercel.app/api/notify-bot`
   затем владельцу (@mefr22) нажать **/start** этому боту — он запомнит chat_id для уведомлений.
6. **Кнопка Mini App** в @BotFather уже привязана к боту-магазину.

## Локальный запуск
```powershell
cd C:\Users\famq_\Projects\sync-shop-miniapp
npm install
npm run dev      # http://localhost:3000 (вне Telegram — гостевой режим)
```
Для теста внутри Telegram пробросьте порт наружу (`cloudflared tunnel --url http://localhost:3000`)
и временно укажите этот URL в BotFather и в вебхуках.
