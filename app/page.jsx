'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { EULA_TEXT, PRIVACY_TEXT } from '@/lib/legal';
import { PAY_METHODS, getMethod, payableAmount, fmtAmount } from '@/lib/methods';

const PRICE = 4999;
const SUPPORT_BOT = process.env.NEXT_PUBLIC_SUPPORT_BOT || 'Sync_Industries_Support_Bot';
const PDF_URL = '/legal/Sync_Industries_Jarvis_Legal.pdf';

function getTG() {
  return typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
}

function openExternal(url) {
  const full = url.startsWith('http') || typeof window === 'undefined' ? url : window.location.origin + url;
  const tg = getTG();
  if (tg?.openLink) tg.openLink(full);
  else if (typeof window !== 'undefined') window.open(full, '_blank');
}

// Постоянный гостевой id для открытия вне Telegram (по прямой ссылке Vercel).
// Отрицательный — чтобы не пересекаться с настоящими Telegram-id.
function getGuestId() {
  try {
    let g = localStorage.getItem('sync_guest_id');
    if (!g) {
      g = String(-Math.floor(100000000 + Math.random() * 899999999));
      localStorage.setItem('sync_guest_id', g);
    }
    return g;
  } catch (_) {
    return String(-Math.floor(100000000 + Math.random() * 899999999));
  }
}

// auth — объект { initData } (Telegram) ИЛИ { guestId, guestName } (гость)
async function api(path, auth, extra = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...auth, ...extra })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export default function Page() {
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [auth, setAuth] = useState(null);
  const [session, setSession] = useState(null);

  const loadSession = useCallback(async (a) => {
    const data = await api('/api/session', a);
    setSession(data);
    setStatus('ready');
  }, []);

  const startWith = useCallback((a) => {
    setAuth(a);
    loadSession(a).catch((e) => { setErrorMsg(e.message); setStatus('error'); });
  }, [loadSession]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 18; // ~1.8 с ждём Telegram; не дождались — открываем как гость

    const tick = () => {
      if (cancelled) return;
      const tg = getTG();
      if (tg) {
        try {
          tg.ready();
          tg.expand();
          tg.setHeaderColor('#08080a');
          tg.setBackgroundColor('#08080a');
        } catch (_) {}
        if (tg.initData) {
          startWith({ initData: tg.initData });
          return;
        }
      }
      if (attempts++ >= maxAttempts) {
        // Вне Telegram или initData недоступен — гостевой режим (работает по прямой ссылке)
        startWith({ guestId: getGuestId(), guestName: 'Гость' });
        return;
      }
      setTimeout(tick, 100);
    };

    tick();
    return () => { cancelled = true; };
  }, [startWith]);

  if (status === 'loading') {
    return <div className="screen"><div className="center"><div className="spinner" /><p className="hint">Загрузка…</p></div></div>;
  }

  if (status === 'error') {
    return (
      <div className="screen"><div className="center">
        <div style={{ fontSize: 40 }}>⚠️</div>
        <h2>Ошибка</h2>
        <p className="hint">{errorMsg === 'unauthorized' ? 'Не удалось открыть магазин. Попробуйте перезагрузить.' : errorMsg}</p>
        <button className="btn btn-primary" style={{ maxWidth: 220 }} onClick={() => location.reload()}>Перезагрузить</button>
      </div></div>
    );
  }

  if (!session.hasConsent) {
    return <Onboarding auth={auth} onAccepted={() => loadSession(auth)} />;
  }

  return <Shop auth={auth} session={session} reload={() => loadSession(auth)} />;
}

/* ===================== ОНБОРДИНГ + СОГЛАСИЕ ===================== */
function Onboarding({ auth, onAccepted }) {
  const [step, setStep] = useState('welcome'); // welcome | consent
  const [doc, setDoc] = useState(null); // null | 'eula' | 'privacy'
  const [eula, setEula] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const accept = async () => {
    setSubmitting(true); setErr('');
    try {
      await api('/api/consent', auth, { acceptedEula: eula, acceptedPrivacy: privacy });
      getTG()?.HapticFeedback?.notificationOccurred?.('success');
      onAccepted();
    } catch (e) { setErr('Не удалось сохранить согласие. Попробуйте ещё раз.'); setSubmitting(false); }
  };

  if (doc) {
    return (
      <div className="screen fade">
        <div className="doc-head">
          <button className="icon-btn" onClick={() => setDoc(null)}>‹</button>
          <h3>{doc === 'eula' ? 'Пользовательское соглашение' : 'Политика конфиденциальности'}</h3>
        </div>
        <div className="doc">{doc === 'eula' ? EULA_TEXT : PRIVACY_TEXT}</div>
        <button className="btn btn-ghost" onClick={() => openExternal(PDF_URL)}>📑 Открыть оригинал (PDF)</button>
        <div style={{ height: 8 }} />
        <button className="btn btn-primary" onClick={() => setDoc(null)}>Понятно</button>
      </div>
    );
  }

  if (step === 'welcome') {
    return (
      <div className="screen fade" style={{ display: 'flex', flexDirection: 'column', paddingBottom: 24 }}>
        <div className="hero">
          <div className="brand"><span className="logo">◆</span> Sync Industries</div>
          <div className="hero-grow" />
          <h1>Твой ПК 💻<br /><span className="accent">слушает тебя</span> 🎙️</h1>
          <p className="sub">Голосовой ассистент <b>Jarvis</b> открывает приложения, пишет код, ищет в сети и автоматизирует рутину — одной фразой.</p>
        </div>
        <div style={{ flex: 1, minHeight: 18 }} />
        <button className="btn btn-primary" onClick={() => setStep('consent')}>Начать</button>
      </div>
    );
  }

  // step === 'consent'
  return (
    <div className="screen fade">
      <div className="brand" style={{ marginBottom: 18 }}><span className="logo">◆</span> Sync Industries</div>
      <h1>Прежде чем<br /><span className="accent">продолжить</span> 📄</h1>
      <p className="hint" style={{ marginTop: 12 }}>Ознакомьтесь и примите наши документы. Без этого доступ в магазин закрыт.</p>

      <div className="card tight" style={{ marginTop: 18 }}>
        <div className="row" onClick={() => setDoc('eula')}>
          <div className="ico">📄</div>
          <div className="meta"><div className="t">Пользовательское соглашение</div><div className="s">Лицензия, оплата, возвраты (EULA)</div></div>
          <div className="chev">›</div>
        </div>
        <div className="row" onClick={() => setDoc('privacy')}>
          <div className="ico">🔐</div>
          <div className="meta"><div className="t">Политика конфиденциальности</div><div className="s">Как обрабатываются данные</div></div>
          <div className="chev">›</div>
        </div>
      </div>

      <div className={`check ${eula ? 'on' : ''}`} onClick={() => setEula(!eula)}>
        <div className="box">{eula ? '✓' : ''}</div>
        <span className="txt">Я прочитал(а) и принимаю <b>Пользовательское соглашение</b></span>
      </div>
      <div className={`check ${privacy ? 'on' : ''}`} onClick={() => setPrivacy(!privacy)}>
        <div className="box">{privacy ? '✓' : ''}</div>
        <span className="txt">Я прочитал(а) и принимаю <b>Политику конфиденциальности</b></span>
      </div>

      {err && <p className="hint" style={{ color: 'var(--danger)' }}>{err}</p>}

      <div style={{ height: 8 }} />
      <button className="btn btn-primary" disabled={!eula || !privacy || submitting} onClick={accept}>
        {submitting ? 'Сохраняем…' : 'Принять и продолжить'}
      </button>
    </div>
  );
}

/* ===================== ВИТРИНА ===================== */
function Shop({ auth, session, reload }) {
  const [tab, setTab] = useState('home');
  const name = session.user.first_name || 'друг';
  const initial = (name[0] || 'S').toUpperCase();

  return (
    <div className="screen fade">
      <div className="topbar">
        <div className="brand"><span className="logo">◆</span> Sync Industries</div>
        <div className="avatar">{initial}</div>
      </div>

      {tab === 'home' && <Home name={name} purchases={session.purchases} goBuy={() => setTab('buy')} />}
      {tab === 'buy' && <Buy auth={auth} onPurchased={reload} />}
      {tab === 'cabinet' && <Cabinet name={name} purchases={session.purchases} goBuy={() => setTab('buy')} />}
      {tab === 'support' && <Support />}

      <nav className="nav">
        {[
          { k: 'home', g: '🏠', t: 'Главная' },
          { k: 'buy', g: '🛒', t: 'Купить' },
          { k: 'cabinet', g: '🗝️', t: 'Кабинет' },
          { k: 'support', g: '💬', t: 'Помощь' }
        ].map((n) => (
          <div key={n.k} className={`n ${tab === n.k ? 'active' : ''}`} onClick={() => setTab(n.k)}>
            <span className="g">{n.g}</span>{n.t}
          </div>
        ))}
      </nav>
    </div>
  );
}

function Home({ name, purchases, goBuy }) {
  const owned = purchases && purchases.some((p) => p.status === 'paid');
  return (
    <div className="fade">
      <h1 style={{ marginTop: 6 }}>Привет, {name} 👋</h1>
      <p className="hint">Управляй своим ПК голосом с ассистентом Jarvis.</p>

      <div className="hero" style={{ minHeight: '34vh', marginTop: 16 }}>
        <span className="badge">Хит продаж</span>
        <div className="hero-grow" />
        <h1 style={{ fontSize: 30 }}>Jarvis 🎙️<br /><span className="accent">Voice Assistant</span></h1>
        <p className="sub">Пожизненная лицензия + премиальные утилиты для Windows.</p>
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="price">{PRICE.toLocaleString('ru-RU')} ₽ <small>разово</small></div>
        <button className="btn btn-primary" style={{ width: 'auto', padding: '12px 22px' }} onClick={goBuy}>
          {owned ? 'Купить ещё' : 'Купить'}
        </button>
      </div>

      <div className="section-label">Возможности</div>
      <div className="card tight">
        {[
          { g: '🎙️', t: 'Голосовое управление', s: 'Команды на естественном языке' },
          { g: '⚡', t: 'Автоматизация рутины', s: 'Сценарии и макросы' },
          { g: '🧠', t: 'Локальный ИИ', s: 'Zero-Cloud, данные на вашем ПК' },
          { g: '🧰', t: 'Утилиты для Windows', s: 'Очистка и оптимизация в комплекте' }
        ].map((f) => (
          <div className="row" key={f.t}>
            <div className="ico">{f.g}</div>
            <div className="meta"><div className="t">{f.t}</div><div className="s">{f.s}</div></div>
          </div>
        ))}
      </div>

      <div className="section-label">Системные требования</div>
      <div className="card">
        <ul className="feat">
          <li><span className="b">•</span> Windows 7 / 8 / 10 / 11 (x64)</li>
          <li><span className="b">•</span> ЦП от 1.8 ГГц, ОЗУ от 2 ГБ</li>
          <li><span className="b">•</span> 500 МБ на диске, микрофон</li>
        </ul>
      </div>
    </div>
  );
}

function Buy({ auth, onPurchased }) {
  const [phase, setPhase] = useState('select'); // select | waiting | done
  const [method, setMethod] = useState('sbp');
  const [buying, setBuying] = useState(false);
  const [err, setErr] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [doc, setDoc] = useState(null); // null | 'eula' | 'privacy'

  const [purchaseId, setPurchaseId] = useState(null);
  const [redirect, setRedirect] = useState(null);
  const [licenseKey, setLicenseKey] = useState(null);
  const [checking, setChecking] = useState(false);

  const pollRef = useRef(null);

  // Один опрос статуса оплаты. Возвращает true, если оплата подтверждена.
  const checkOnce = useCallback(async (pid) => {
    try {
      const data = await api('/api/payment-status', auth, { purchaseId: pid });
      if (data.status === 'paid') {
        setLicenseKey(data.license_key);
        setPhase('done');
        getTG()?.HapticFeedback?.notificationOccurred?.('success');
        onPurchased();
        return true;
      }
      if (data.status === 'canceled' || data.status === 'chargeback') {
        setErr('Платёж отменён. Попробуйте ещё раз.');
        setPhase('select');
        return true; // останавливаем опрос
      }
    } catch (_) {}
    return false;
  }, [auth, onPurchased]);

  // Авто-опрос статуса, пока ждём оплату (каждые 3 c, до ~5 минут).
  useEffect(() => {
    if (phase !== 'waiting' || !purchaseId) return;
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      const done = await checkOnce(purchaseId);
      if (done || attempts >= 100) clearInterval(pollRef.current);
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [phase, purchaseId, checkOnce]);

  const pay = async () => {
    if (!agreed) return;
    setBuying(true); setErr('');
    try {
      const data = await api('/api/purchase', auth, { method });
      if (!data.redirect) throw new Error('no_redirect');
      setPurchaseId(data.purchaseId);
      setRedirect(data.redirect);
      setPhase('waiting');
      openExternal(data.redirect);
    } catch (e) {
      setErr('Не удалось создать платёж. Попробуйте позже.');
    } finally {
      setBuying(false);
    }
  };

  const manualCheck = async () => {
    if (!purchaseId) return;
    setChecking(true);
    const done = await checkOnce(purchaseId);
    setChecking(false);
    if (!done) getTG()?.HapticFeedback?.notificationOccurred?.('warning');
  };

  if (doc) {
    return (
      <div className="fade">
        <div className="doc-head">
          <button className="icon-btn" onClick={() => setDoc(null)}>‹</button>
          <h3>{doc === 'eula' ? 'Публичная оферта (EULA)' : 'Политика конфиденциальности'}</h3>
        </div>
        <div className="doc">{doc === 'eula' ? EULA_TEXT : PRIVACY_TEXT}</div>
        <button className="btn btn-ghost" onClick={() => openExternal(PDF_URL)}>📑 Открыть оригинал (PDF)</button>
        <div style={{ height: 8 }} />
        <button className="btn btn-primary" onClick={() => setDoc(null)}>Назад к покупке</button>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="fade">
        <h1 style={{ marginTop: 6 }}>Готово 🎉</h1>
        <p className="hint">Оплата получена, лицензия на Jarvis активирована.</p>
        <div className="card glow">
          <div className="badge">Оплачено</div>
          <p style={{ marginTop: 12 }}>🔑 Ваш лицензионный ключ:</p>
          <span className="key">{licenseKey}</span>
          <p className="hint" style={{ marginTop: 12 }}>Ключ сохранён в разделе «Кабинет». Инструкция по установке — на «Главной».</p>
        </div>
      </div>
    );
  }

  if (phase === 'waiting') {
    return (
      <div className="fade">
        <h1 style={{ marginTop: 6 }}>Ждём оплату ⏳</h1>
        <div className="card" style={{ textAlign: 'center', padding: 26 }}>
          <div className="spinner" style={{ margin: '0 auto 14px' }} />
          <p>Откройте платёжную форму и завершите оплату.</p>
          <p className="hint">Как только платёж пройдёт, ключ появится здесь автоматически.</p>
          <div style={{ height: 14 }} />
          <button className="btn btn-primary" onClick={() => redirect && openExternal(redirect)}>Открыть оплату</button>
          <div style={{ height: 8 }} />
          <button className="btn btn-ghost" disabled={checking} onClick={manualCheck}>
            {checking ? 'Проверяем…' : 'Я оплатил — проверить'}
          </button>
        </div>
        {err && <p className="hint" style={{ color: 'var(--danger)' }}>{err}</p>}
        <button className="btn btn-ghost" onClick={() => { clearInterval(pollRef.current); setPhase('select'); }}>Отмена</button>
      </div>
    );
  }

  // phase === 'select'
  // Комиссия шлюза отнесена на покупателя, поэтому на платёжной форме
  // спишется цена + надбавка выбранного метода (см. lib/methods.js).
  const sel = getMethod(method);
  const total = payableAmount(method, PRICE);

  return (
    <div className="fade">
      <h1 style={{ marginTop: 6 }}>Оформление 🛒</h1>
      <div className="hero" style={{ minHeight: '24vh', marginTop: 14 }}>
        <div className="brand"><span className="logo">◆</span> Jarvis</div>
        <div className="hero-grow" />
        <h2 style={{ margin: 0 }}>Jarvis <span className="accent">Voice Assistant</span></h2>
        <p className="sub">Пожизненная лицензия</p>
      </div>

      <div className="card">
        <ul className="feat">
          <li><span className="b">✓</span> Полная версия (пожизненный доступ)</li>
          <li><span className="b">✓</span> Бонус: премиальные утилиты для Windows</li>
          <li><span className="b">✓</span> Бесплатные обновления и поддержка 24/7</li>
        </ul>
        <div className="divider" />
        <div className="price">{PRICE.toLocaleString('ru-RU')} ₽ <small>единоразово</small></div>
      </div>

      <div className="section-label">Способ оплаты</div>
      <div className="card tight">
        {PAY_METHODS.map((m) => (
          <div key={m.key} className={`row ${method === m.key ? 'on' : ''}`} onClick={() => setMethod(m.key)}>
            <div className="ico">{m.icon}</div>
            <div className="meta">
              <div className="t">{m.title}</div>
              <div className="s" style={m.wrap ? { whiteSpace: 'normal' } : undefined}>{m.sub}</div>
            </div>
            <div className="box" style={{ borderRadius: '50%' }}>{method === m.key ? '✓' : ''}</div>
          </div>
        ))}
      </div>
      {/* Строка с итогом нужна только там, где шлюз добавляет комиссию к цене. */}
      {sel && sel.feePct > 0 && (
        <p className="hint">
          К списанию {fmtAmount(total)} ₽ — цена {fmtAmount(PRICE)} ₽ + комиссия платёжной системы {sel.feePct}%
        </p>
      )}

      <div className="section-label">Условия покупки</div>
      <div className="card glow">
        <p style={{ marginTop: 0 }}>❗ <b>Важно:</b> это покупка цифрового товара. После ввода и активации ключа <b className="accent">возврат средств невозможен</b> (оферта, п. 3).</p>
        <div className="card tight" style={{ margin: '8px 0' }}>
          <div className="row" onClick={() => setDoc('eula')}>
            <div className="ico">📄</div>
            <div className="meta"><div className="t">Публичная оферта (EULA)</div><div className="s">Лицензия, оплата, возвраты</div></div>
            <div className="chev">›</div>
          </div>
          <div className="row" onClick={() => setDoc('privacy')}>
            <div className="ico">🔐</div>
            <div className="meta"><div className="t">Политика конфиденциальности</div><div className="s">Обработка данных</div></div>
            <div className="chev">›</div>
          </div>
          <div className="row" onClick={() => openExternal(PDF_URL)}>
            <div className="ico">📑</div>
            <div className="meta"><div className="t">Полный документ (PDF)</div><div className="s">Оригинал пакета документов</div></div>
            <div className="chev">↗</div>
          </div>
        </div>
        <div className={`check ${agreed ? 'on' : ''}`} onClick={() => setAgreed(!agreed)}>
          <div className="box">{agreed ? '✓' : ''}</div>
          <span className="txt">Я ознакомился(ась) с офертой и Политикой и принимаю их. Понимаю, что после активации ключа возврат средств невозможен.</span>
        </div>
        {err && <p className="hint" style={{ color: 'var(--danger)' }}>{err}</p>}
        <div style={{ height: 4 }} />
        <button className="btn btn-primary" disabled={!agreed || buying} onClick={pay}>
          {buying ? 'Создаём платёж…' : `Оплатить ${PRICE.toLocaleString('ru-RU')} ₽`}
        </button>
      </div>
    </div>
  );
}

function Cabinet({ name, purchases, goBuy }) {
  const [doc, setDoc] = useState(null); // null | 'eula' | 'privacy'

  if (doc) {
    return (
      <div className="fade">
        <div className="doc-head">
          <button className="icon-btn" onClick={() => setDoc(null)}>‹</button>
          <h3>{doc === 'eula' ? 'Публичная оферта (EULA)' : 'Политика конфиденциальности'}</h3>
        </div>
        <div className="doc">{doc === 'eula' ? EULA_TEXT : PRIVACY_TEXT}</div>
        <button className="btn btn-ghost" onClick={() => openExternal(PDF_URL)}>📑 Открыть оригинал (PDF)</button>
        <div style={{ height: 8 }} />
        <button className="btn btn-primary" onClick={() => setDoc(null)}>Назад</button>
      </div>
    );
  }

  const paid = (purchases || []).filter((p) => p.status === 'paid');
  const pending = (purchases || []).filter((p) => p.status === 'pending');

  return (
    <div className="fade">
      <h1 style={{ marginTop: 6 }}>Кабинет 🗝️</h1>
      <p className="hint">Ваши лицензии и ключи активации.</p>
      {paid.length === 0 && pending.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 28 }}>
          <div style={{ fontSize: 36 }}>📭</div>
          <p>Пока нет покупок</p>
          <p className="hint">Оформите лицензию на Jarvis за пару секунд.</p>
          <div style={{ height: 6 }} />
          <button className="btn btn-primary" onClick={goBuy}>Перейти к покупке</button>
        </div>
      ) : (
        <>
          {paid.map((p) => (
            <div className="card" key={p.id}>
              <div className="row" style={{ padding: 0 }}>
                <div className="ico">📦</div>
                <div className="meta"><div className="t">{p.software_name}</div><div className="s">{new Date(p.created_at).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })} · {p.amount ?? p.price} ₽</div></div>
              </div>
              <div style={{ height: 12 }} />
              <span className="key">{p.license_key}</span>
            </div>
          ))}
          {pending.map((p) => (
            <div className="card" key={p.id}>
              <div className="row" style={{ padding: 0 }}>
                <div className="ico">⏳</div>
                <div className="meta"><div className="t">{p.software_name}</div><div className="s">Ожидает оплаты · {p.amount ?? p.price} ₽</div></div>
              </div>
            </div>
          ))}
        </>
      )}

      <div className="section-label">Документы</div>
      <div className="card tight">
        <div className="row" onClick={() => setDoc('eula')}>
          <div className="ico">📄</div>
          <div className="meta"><div className="t">Публичная оферта (EULA)</div><div className="s">Лицензия, оплата, возвраты</div></div>
          <div className="chev">›</div>
        </div>
        <div className="row" onClick={() => setDoc('privacy')}>
          <div className="ico">🔐</div>
          <div className="meta"><div className="t">Политика конфиденциальности</div><div className="s">Обработка данных</div></div>
          <div className="chev">›</div>
        </div>
        <div className="row" onClick={() => openExternal(PDF_URL)}>
          <div className="ico">📑</div>
          <div className="meta"><div className="t">Полный документ (PDF)</div><div className="s">Оригинал пакета документов</div></div>
          <div className="chev">↗</div>
        </div>
      </div>
    </div>
  );
}

function Support() {
  const open = () => {
    const tg = getTG();
    const url = `https://t.me/${SUPPORT_BOT}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  };
  return (
    <div className="fade">
      <h1 style={{ marginTop: 6 }}>Помощь 💬</h1>
      <p className="hint">Вопросы по установке, активации или работе Jarvis?</p>
      <div className="card">
        <div className="row" style={{ padding: 0 }}>
          <div className="ico">🛟</div>
          <div className="meta"><div className="t">Техническая поддержка</div><div className="s">Будни 09–21 · Выходные 11–18 МСК</div></div>
        </div>
        <div style={{ height: 14 }} />
        <button className="btn btn-primary" onClick={open}>Написать в поддержку</button>
      </div>
      <div className="card">
        <div className="row" style={{ padding: 0 }} onClick={() => { const tg = getTG(); const u = 'https://t.me/Sync_Industries'; tg?.openTelegramLink ? tg.openTelegramLink(u) : window.open(u, '_blank'); }}>
          <div className="ico">📣</div>
          <div className="meta"><div className="t">Канал Sync Industries</div><div className="s">Новости и дистрибутив</div></div>
          <div className="chev">›</div>
        </div>
      </div>
    </div>
  );
}
