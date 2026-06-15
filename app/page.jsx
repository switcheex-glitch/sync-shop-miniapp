'use client';

import { useEffect, useState, useCallback } from 'react';
import { EULA_TEXT, PRIVACY_TEXT } from '@/lib/legal';

const PRICE = 1599;
const SUPPORT_BOT = process.env.NEXT_PUBLIC_SUPPORT_BOT || 'Sync_Industries_Support_Bot';

function getTG() {
  return typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
}

async function api(path, initData, extra = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData, ...extra })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export default function Page() {
  const [status, setStatus] = useState('loading'); // loading | no-telegram | error | ready
  const [errorMsg, setErrorMsg] = useState('');
  const [initData, setInitData] = useState('');
  const [session, setSession] = useState(null);

  const loadSession = useCallback(async (id) => {
    const data = await api('/api/session', id);
    setSession(data);
    setStatus('ready');
  }, []);

  useEffect(() => {
    const tg = getTG();
    if (tg) {
      tg.ready();
      tg.expand();
    }
    const id = tg?.initData;
    if (!id) {
      setStatus('no-telegram');
      return;
    }
    setInitData(id);
    loadSession(id).catch((e) => {
      setErrorMsg(e.message);
      setStatus('error');
    });
  }, [loadSession]);

  if (status === 'loading') {
    return (
      <div className="app">
        <div className="center"><div className="spinner" /><p className="hint">Загрузка магазина…</p></div>
      </div>
    );
  }

  if (status === 'no-telegram') {
    return (
      <div className="app">
        <div className="center">
          <h1>🛍 Sync Industries</h1>
          <p className="hint">Этот магазин открывается внутри Telegram.<br />Откройте его через бота @Sync_Industries_Shop_bot.</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="app">
        <div className="center">
          <h1>⚠️ Ошибка</h1>
          <p className="hint">
            {errorMsg === 'server_misconfigured'
              ? 'Сервер не настроен: на Vercel не задана переменная TELEGRAM_BOT_TOKEN. Добавьте её и сделайте Redeploy.'
              : errorMsg === 'unauthorized'
              ? 'Не удалось подтвердить вашу сессию Telegram. Проверьте, что TELEGRAM_BOT_TOKEN на Vercel совпадает с токеном этого бота.'
              : errorMsg}
          </p>
          <button className="btn" onClick={() => location.reload()}>Перезагрузить</button>
        </div>
      </div>
    );
  }

  if (!session.hasConsent) {
    return <ConsentGate initData={initData} onAccepted={() => loadSession(initData)} />;
  }

  return <Store initData={initData} session={session} reload={() => loadSession(initData)} />;
}

// ===================== Экран согласия =====================
function ConsentGate({ initData, onAccepted }) {
  const [eula, setEula] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [viewing, setViewing] = useState(null); // null | 'eula' | 'privacy'
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setSubmitting(true);
    setErr('');
    try {
      await api('/api/consent', initData, { acceptedEula: eula, acceptedPrivacy: privacy });
      onAccepted();
    } catch (e) {
      setErr('Не удалось сохранить согласие. Попробуйте ещё раз.');
      setSubmitting(false);
    }
  };

  if (viewing) {
    return (
      <div className="app">
        <h1>{viewing === 'eula' ? '📄 Пользовательское соглашение' : '🔐 Политика конфиденциальности'}</h1>
        <div className="doc">{viewing === 'eula' ? EULA_TEXT : PRIVACY_TEXT}</div>
        <button className="btn" onClick={() => setViewing(null)}>⬅️ Вернуться к согласию</button>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>🤝 Добро пожаловать в Sync Industries!</h1>
      <p>Прежде чем перейти в магазин, ознакомьтесь и примите наши документы:</p>
      <div className="card">
        <button className="btn secondary" onClick={() => setViewing('eula')}>📄 Читать Соглашение (EULA)</button>
        <div style={{ height: 8 }} />
        <button className="btn secondary" onClick={() => setViewing('privacy')}>🔐 Читать Политику конфиденциальности</button>
      </div>

      <label className="check">
        <input type="checkbox" checked={eula} onChange={(e) => setEula(e.target.checked)} />
        <span>Я прочитал(а) и принимаю <b>Пользовательское лицензионное соглашение (EULA)</b></span>
      </label>
      <label className="check">
        <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
        <span>Я прочитал(а) и принимаю <b>Политику конфиденциальности</b></span>
      </label>

      {err && <p className="hint" style={{ color: 'var(--danger)' }}>{err}</p>}

      <button className="btn" disabled={!eula || !privacy || submitting} onClick={submit}>
        {submitting ? 'Сохраняем…' : '🚀 Продолжить в магазин'}
      </button>
      <p className="muted" style={{ textAlign: 'center' }}>Без принятия обоих документов доступ к магазину закрыт.</p>
    </div>
  );
}

// ===================== Витрина магазина =====================
function Store({ initData, session, reload }) {
  const [tab, setTab] = useState('buy');
  const name = session.user.first_name || 'друг';

  return (
    <div className="app">
      <div className="tabs">
        <div className={`tab ${tab === 'buy' ? 'active' : ''}`} onClick={() => setTab('buy')}>🛍 Купить</div>
        <div className={`tab ${tab === 'cabinet' ? 'active' : ''}`} onClick={() => setTab('cabinet')}>👤 Кабинет</div>
        <div className={`tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>ℹ️ Инфо</div>
        <div className={`tab ${tab === 'support' ? 'active' : ''}`} onClick={() => setTab('support')}>💬 Помощь</div>
      </div>

      {tab === 'buy' && <BuyTab initData={initData} onPurchased={reload} />}
      {tab === 'cabinet' && <CabinetTab name={name} purchases={session.purchases} />}
      {tab === 'info' && <InfoTab />}
      {tab === 'support' && <SupportTab />}
    </div>
  );
}

function BuyTab({ initData, onPurchased }) {
  const [buying, setBuying] = useState(false);
  const [purchase, setPurchase] = useState(null);
  const [err, setErr] = useState('');

  const pay = async () => {
    setBuying(true);
    setErr('');
    try {
      const data = await api('/api/purchase', initData);
      setPurchase(data.purchase);
      const tg = getTG();
      tg?.HapticFeedback?.notificationOccurred?.('success');
      onPurchased();
    } catch (e) {
      setErr('Не удалось оформить покупку. Попробуйте позже.');
    } finally {
      setBuying(false);
    }
  };

  if (purchase) {
    return (
      <div className="card">
        <h2>🎉 Оплата успешно завершена!</h2>
        <p>Лицензия на <b>Jarvis Voice Assistant</b> активирована.</p>
        <p>🔑 Ваш лицензионный ключ:</p>
        <p><span className="key">{purchase.license_key}</span></p>
        <p className="muted">Ключ сохранён в разделе «Кабинет». Инструкция по установке — во вкладке «Инфо».</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>🛍 Jarvis Voice Assistant</h2>
      <p>Пожизненная лицензия на интеллектуального голосового помощника для ПК.</p>
      <ul className="feat">
        <li>✅ Полная версия Jarvis (пожизненный доступ)</li>
        <li>✅ Бонус: набор премиальных утилит для Windows</li>
        <li>✅ Бесплатные обновления и поддержка 24/7</li>
      </ul>
      <div className="divider" />
      <p className="price">{PRICE.toLocaleString('ru-RU')} ₽</p>
      <p className="muted">Единоразовый платёж. Оплата в демонстрационном режиме.</p>
      {err && <p className="hint" style={{ color: 'var(--danger)' }}>{err}</p>}
      <button className="btn" disabled={buying} onClick={pay}>
        {buying ? 'Обработка платежа…' : `💳 Оплатить ${PRICE.toLocaleString('ru-RU')} ₽`}
      </button>
    </div>
  );
}

function CabinetTab({ name, purchases }) {
  return (
    <div>
      <div className="card">
        <h2>👤 Личный кабинет</h2>
        <p>Привет, <b>{name}</b>!</p>
      </div>
      {(!purchases || purchases.length === 0) ? (
        <div className="card"><p className="hint">У вас пока нет активных покупок. Оформить можно во вкладке «Купить».</p></div>
      ) : (
        purchases.map((p) => (
          <div className="card" key={p.id}>
            <h2>📦 {p.software_name}</h2>
            <p>Ключ: <span className="key">{p.license_key}</span></p>
            <p className="muted">Дата: {new Date(p.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)</p>
            <p className="muted">Цена: {p.price} ₽</p>
          </div>
        ))
      )}
    </div>
  );
}

function InfoTab() {
  return (
    <div className="card">
      <h2>ℹ️ Информация и требования</h2>
      <p><b>Системные требования:</b></p>
      <ul className="feat">
        <li>ОС: Windows 7/8/10/11 (x64)</li>
        <li>ЦП: двухъядерный от 1.8 ГГц</li>
        <li>ОЗУ: минимум 2 ГБ</li>
        <li>Место: 500 МБ</li>
        <li>Микрофон для голосового ввода</li>
      </ul>
      <div className="divider" />
      <p><b>Установка:</b></p>
      <ul className="feat">
        <li>1. Купите ключ во вкладке «Купить».</li>
        <li>2. Скачайте дистрибутив из канала <a href="https://t.me/Sync_Industries" target="_blank" rel="noreferrer">Sync Industries</a>.</li>
        <li>3. Запустите Setup.exe и введите лицензионный ключ.</li>
      </ul>
    </div>
  );
}

function SupportTab() {
  const open = () => {
    const tg = getTG();
    const url = `https://t.me/${SUPPORT_BOT}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  };
  return (
    <div className="card">
      <h2>💬 Техническая поддержка</h2>
      <p>Возникли вопросы по установке, активации или работе Jarvis? Напишите нам.</p>
      <p className="muted">Будни: 09:00–21:00 МСК · Выходные: 11:00–18:00 МСК</p>
      <button className="btn" onClick={open}>🔗 Написать в поддержку</button>
    </div>
  );
}
