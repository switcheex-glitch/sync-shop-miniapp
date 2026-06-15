# Sync Industries — Telegram Mini App магазин

Витрина магазина Jarvis как **Telegram Mini App** на **Next.js**, хостинг — **Vercel**.
Данные (покупки, согласия) — общая Supabase с ботами (таблицы `purchases`, `consents`).

## Как это работает
- Пользователь открывает Mini App из бота (@Sync_Industries_Shop_bot) — кнопкой-меню или прямой ссылкой.
- Фронт берёт `Telegram.WebApp.initData`; сервер (API-роуты) проверяет его подпись токеном бота — это и есть авторизация.
- Первый экран — согласие с EULA + Политикой (две галочки) → запись в `consents`.
- Дальше витрина: Купить (демо-оплата → ключ) · Кабинет · Инфо · Поддержка.

## Структура
```
app/
  layout.jsx          подключение telegram-web-app.js
  page.jsx            UI: согласие + витрина (клиент)
  globals.css         тема (использует переменные темы Telegram)
  api/session/route   профиль + статус согласия + покупки
  api/consent/route   сохранение согласия
  api/purchase/route  генерация ключа + запись покупки
lib/
  verifyInitData.js   проверка подписи Telegram initData (HMAC)
  supabaseServer.js   серверный клиент Supabase (service_role)
  legal.js            тексты EULA + Политики, DOC_VERSION
```

## Переменные окружения (Vercel → Settings → Environment Variables)
| Переменная | Значение |
|---|---|
| `TELEGRAM_BOT_TOKEN` | токен @Sync_Industries_Shop_bot |
| `SUPABASE_URL` | https://igktdoavnjhxkyyaeziz.supabase.co |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role ключ Supabase |
| `NEXT_PUBLIC_SUPPORT_BOT` | Sync_Industries_Support_Bot |

Локально те же значения лежат в `.env.local` (в репозиторий не коммитится).

## Деплой на Vercel
1. Залить проект в репозиторий GitHub (или `vercel` CLI).
2. На <https://vercel.com> → **Add New Project** → импортировать репозиторий.
3. Добавить переменные окружения из таблицы выше.
4. **Deploy.** Получите URL вида `https://sync-shop-miniapp.vercel.app`.

Через CLI:
```powershell
npm i -g vercel
cd C:\Users\famq_\Projects\sync-shop-miniapp
vercel            # первый деплой (ответьте на вопросы)
vercel --prod     # продакшн-деплой
```

## Привязка Mini App к боту (в @BotFather)
1. `/mybots` → выбрать @Sync_Industries_Shop_bot.
2. **Bot Settings → Menu Button → Configure menu button** → ввести URL Mini App (с Vercel) и текст кнопки (напр. «🛍 Магазин»).
3. (Опционально) **/newapp** — создать именованное Mini App с прямой ссылкой `t.me/Sync_Industries_Shop_bot/shop`.

После этого кнопка в боте открывает магазин. Постоянно запущенный процесс бота для магазина **не нужен**.

## Локальный запуск
```powershell
cd C:\Users\famq_\Projects\sync-shop-miniapp
npm install
npm run dev      # http://localhost:3000 (вне Telegram покажет заглушку — нужен initData)
```
Для теста внутри Telegram пробросьте локальный порт наружу (напр. `cloudflared tunnel --url http://localhost:3000`) и временно укажите этот URL в BotFather.
