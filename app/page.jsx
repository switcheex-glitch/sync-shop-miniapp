'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { EULA_TEXT, PRIVACY_TEXT } from '@/lib/legal';
import { PAY_FAQ } from '@/lib/payFaq';
import { Icon, Wave, LogoMark, Reactor } from '@/lib/icons';
import { PAY_METHODS, getMethod, payableAmount, fmtAmount } from '@/lib/methods';
import { useReveal, useParallax, useCountUp, useToast, haptic, copyText } from '@/lib/motion';

const PRICE = 7900;
const MAX_QUANTITY = 20;
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

function openTelegram(url) {
  const tg = getTG();
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else if (typeof window !== 'undefined') window.open(url, '_blank');
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

/* ===================== ВХОД ===================== */
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
          tg.setHeaderColor('#0a0a0b');
          tg.setBackgroundColor('#0a0a0b');
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
    return (
      <div className="app">
        <div className="masthead">
          <div className="top">
            <div className="brand"><span className="logo"><LogoMark size={20} /></span> Sync Industries</div>
            <div className="avatar" />
          </div>
          <div className="rail"><span className="ind" /></div>
        </div>
        <div className="skeleton" style={{ height: '46vh', marginTop: 34 }} />
        <div className="skeleton" style={{ height: 84, marginTop: 14 }} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="app"><div className="center fade">
        <div style={{ color: 'var(--ember)', display: 'flex', justifyContent: 'center', marginBottom: 14 }}><Icon name="alert" size={32} /></div>
        <div className="title">Витрина закрыта</div>
        <p className="hint" style={{ marginTop: 12 }}>{errorMsg === 'unauthorized' ? 'Не удалось проверить сессию. Обновите страницу — обычно помогает.' : errorMsg}</p>
        <div style={{ height: 16 }} />
        <button className="btn btn-primary" style={{ maxWidth: 220, margin: '0 auto' }} onClick={() => location.reload()}>Обновить</button>
      </div></div>
    );
  }

  // Витрина открыта без барьера: согласие с документами принимается
  // на шаге «Условия» маршрута покупки — там, где оно юридически и нужно.
  return <Store auth={auth} session={session} reload={() => loadSession(auth)} />;
}

/* ===================== МАГАЗИН ===================== */
const TABS = [
  { k: 'cover', t: 'Обзор' },
  { k: 'buy', t: 'Купить' },
  { k: 'keys', t: 'Ключи' },
  { k: 'help', t: 'Помощь' }
];

function Store({ auth, session, reload }) {
  const [tab, setTab] = useState('cover');
  const [toast, showToast] = useToast();
  const idx = Math.max(0, TABS.findIndex((t) => t.k === tab));

  const go = (k) => { haptic(); setTab(k); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="app">
      <div className="masthead">
        <div className="top">
          <div className="brand"><span className="logo"><LogoMark size={20} /></span> Sync Industries</div>
          <div className="avatar"><Icon name="user" size={15} /></div>
        </div>
        <nav className="rail">
          <span className="ind" style={{ '--i': idx }} />
          {TABS.map((t) => (
            <div key={t.k} className={`seg ${tab === t.k ? 'active' : ''}`} onClick={() => go(t.k)}>{t.t}</div>
          ))}
        </nav>
      </div>

      <div className="swap" key={tab}>
        {tab === 'cover' && <Cover purchases={session.purchases} goBuy={() => go('buy')} />}
        {tab === 'buy' && <Buy auth={auth} hasConsent={session.hasConsent} onPurchased={reload} showToast={showToast} goKeys={() => go('keys')} />}
        {tab === 'keys' && <Keys purchases={session.purchases} goBuy={() => go('buy')} showToast={showToast} />}
        {tab === 'help' && <Help />}
      </div>

      {toast && <div className="toast" key={toast.id}><span className="g"><Icon name="check" size={15} /></span>{toast.text}</div>}
    </div>
  );
}

/* ===================== ОБЗОР ===================== */
const FEATURES = [
  { g: 'mic', t: 'Голосовое управление', s: 'Команды на естественном языке, без заученных фраз' },
  { g: 'bolt', t: 'Автоматизация рутины', s: 'Сценарии и макросы для повторяющихся задач' },
  { g: 'chip', t: 'Гибридный ИИ', s: 'Распознавание речи работает локально, без записи на серверы' },
  { g: 'tools', t: 'Утилиты Windows', s: 'Очистка и оптимизация системы в комплекте' }
];

// Сверено с реальным билдом Jarvis 1.5.0 (Electron 30 → только Windows 10+,
// установленная программа ~1,2 ГБ, облачные ИИ-модели требуют интернет).
const SPECS = [
  { k: 'Система', v: 'Windows 10 / 11 · x64' },
  { k: 'Процессор', v: '2 ядра · от 2 ГГц' },
  { k: 'Память', v: 'от 4 ГБ' },
  { k: 'Диск', v: '1,5 ГБ свободного места' },
  { k: 'Оборудование', v: 'Микрофон' },
  { k: 'Подключение', v: 'Интернет' }
];

const PACK = [
  { t: 'Полная версия Jarvis', s: 'Пожизненный доступ, без подписки и продлений' },
  { t: 'Премиальные утилиты', s: 'Набор инструментов для Windows в подарок' },
  { t: 'Обновления и поддержка', s: 'Новые версии и помощь без доплат' }
];

// Путь покупателя от оплаты до работающей программы — закрывает вопрос
// «а что будет после того, как я заплачу?»
const FLOW = [
  { t: 'Выбираете способ оплаты', s: 'СБП, SberPay, карта РФ, зарубежная карта или криптовалюта' },
  { t: 'Оплачиваете на защищённой форме', s: 'Платёж идёт через шлюз Platega, обычно занимает минуту' },
  { t: 'Ключ выдаётся автоматически', s: 'Появляется в разделе «Ключи» и дублируется ботом в чат' },
  { t: 'Скачиваете и активируете', s: 'Дистрибутив — в нашем канале, ключ вводится при первом запуске' }
];

function Cover({ purchases, goBuy }) {
  const root = useReveal();
  const rings = useParallax(0.05);
  const price = useCountUp(PRICE);
  const owned = purchases && purchases.some((p) => p.status === 'paid');

  return (
    <div ref={root}>
      <section className="cover">
        <div className="reactor" ref={rings}><Reactor /></div>
        <div className="shards"><i /><i /><i /></div>

        <div className="kicker"><span className="dot" /><span className="mono">Издание 2026 · Пожизненная лицензия</span></div>
        <Wave bars={11} />
        <h1 className="hero-type" style={{ marginTop: 18 }}>Jarvis<span className="em">Voice</span></h1>
        <p className="lead">Голосовое управление компьютером и премиальные утилиты для Windows.</p>

        <div className="facts">
          <div><div className="n">01</div><div className="l">Голос вместо мыши</div></div>
          <div><div className="n">02</div><div className="l">Работает локально</div></div>
          <div><div className="n">03</div><div className="l">Ключ за минуту</div></div>
        </div>

        <div className="scroll-cue">
          <span className="mono">Листайте вниз</span><span className="line" />
          <span style={{ display: 'flex', transform: 'rotate(90deg)' }}><Icon name="chevron" size={15} /></span>
        </div>
      </section>

      <section className="chapter reveal">
        <div className="head">
          <span className="num">01</span>
          <span className="name">Возможности</span>
          <span className="aside">{FEATURES.length} блока</span>
        </div>
        <div className="gallery">
          {FEATURES.map((f, i) => (
            <article className="gcard" key={f.t}>
              <span className="g"><Icon name={f.g} size={26} /></span>
              <span className="idx">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <div className="t">{f.t}</div>
                <div className="s">{f.s}</div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="chapter reveal">
        <div className="head">
          <span className="num">02</span>
          <span className="name">Как это работает</span>
          <span className="aside">≈ 2 минуты</span>
        </div>
        <ul className="pack">
          {FLOW.map((p, i) => (
            <li key={p.t}>
              <span className="g mono" style={{ color: 'var(--acc)' }}>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <div className="t">{p.t}</div>
                <div className="s">{p.s}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="list" style={{ borderTop: 0, marginTop: 0 }}>
          <div className="row" onClick={() => { haptic(); openTelegram('https://t.me/Sync_Industries'); }}>
            <span className="g"><Icon name="box" size={19} /></span>
            <div className="meta"><div className="t">Скачать дистрибутив</div><div className="s">Канал @Sync_Industries — актуальная версия в закрепе</div></div>
            <span className="chev"><Icon name="external" size={16} /></span>
          </div>
        </div>
      </section>

      <section className="chapter reveal">
        <div className="head">
          <span className="num">03</span>
          <span className="name">Что входит</span>
        </div>
        <ul className="pack">
          {PACK.map((p) => (
            <li key={p.t}>
              <span className="g"><Icon name="check" size={17} /></span>
              <div>
                <div className="t">{p.t}</div>
                <div className="s">{p.s}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="chapter reveal">
        <div className="head">
          <span className="num">04</span>
          <span className="name">Технические данные</span>
        </div>
        <div style={{ marginTop: 6 }}>
          {SPECS.map((s, i) => (
            <div className="specrow" key={s.k}>
              <span className="n">{String(i + 1).padStart(2, '0')}</span>
              <span className="k">{s.k}</span>
              <span className="v">{s.v}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="actionbar">
        <div className="sum">
          <div className="l">Единоразово, без подписки</div>
          <div className="v">{price.toLocaleString('ru-RU')} ₽</div>
        </div>
        <button className="btn btn-primary" onClick={goBuy}>{owned ? 'Купить в подарок' : 'Купить'}</button>
      </div>
    </div>
  );
}

/* ===================== ДОКУМЕНТЫ И FAQ ===================== */
function PayFaq() {
  const [open, setOpen] = useState(PAY_FAQ.blocks[0].key);
  return (
    <>
      <p className="hint">{PAY_FAQ.intro}</p>
      <div style={{ borderTop: '1px solid var(--edge)', marginTop: 14 }}>
        {PAY_FAQ.blocks.map((b) => {
          const on = open === b.key;
          return (
            <div className={`faq ${on ? 'on' : ''}`} key={b.key}>
              <div className="head" onClick={() => { haptic(); setOpen(on ? null : b.key); }}>
                <span className="g"><Icon name={b.icon} size={19} /></span>
                <div className="meta">
                  <div className="t">{b.title}</div>
                  <span className="tag">{b.tag}</span>
                </div>
                <span className="sign"><Icon name={on ? 'minus' : 'plus'} size={16} /></span>
              </div>
              {on && (
                <div className="body">
                  <ul className="feat">
                    {b.steps.map((s, i) => <li key={i}><span className="b">•</span><span>{s}</span></li>)}
                  </ul>
                  {(b.warns || []).map((w, i) => (
                    <div className="note" key={i}><span className="g"><Icon name="alert" size={16} /></span><span>{w}</span></div>
                  ))}
                  {(b.groups || []).map((g, i) => (
                    <div key={i}>
                      <div className="faq-sub">{g.title}</div>
                      <div className="chips">
                        {g.items.map((it, j) => <span className={`chip ${g.kind}`} key={j}>{g.kind === 'ok' ? '✓' : '✕'} {it}</span>)}
                      </div>
                    </div>
                  ))}
                  {(b.issues || []).length > 0 && <div className="faq-sub">Если платёж не проходит</div>}
                  {(b.issues || []).map((q, i) => (
                    <div className="qa" key={i}><div className="q">{q.q}</div><div className="a">{q.a}</div></div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="hint" style={{ marginTop: 18 }}>{PAY_FAQ.footer}</p>
    </>
  );
}

const DOCS = {
  eula: { title: 'Публичная оферта', text: EULA_TEXT, pdf: true },
  privacy: { title: 'Политика конфиденциальности', text: PRIVACY_TEXT, pdf: true },
  payfaq: { title: 'Как оплатить', faq: true }
};

function DocView({ id, onBack, backLabel = 'Назад' }) {
  const d = DOCS[id];
  if (!d) return null;
  return (
    <div className="fade">
      <div className="doc-head">
        <button className="icon-btn" onClick={() => { haptic(); onBack(); }}><Icon name="back" size={17} /></button>
        <span className="mono">{d.title}</span>
      </div>
      {d.faq ? <PayFaq /> : <div className="doc">{d.text}</div>}
      {d.pdf && (
        <>
          <button className="btn btn-ghost" onClick={() => openExternal(PDF_URL)}>Открыть оригинал (PDF)</button>
          <div style={{ height: 10 }} />
        </>
      )}
      <button className="btn btn-primary" onClick={onBack}>{backLabel}</button>
      <div style={{ height: 20 }} />
    </div>
  );
}

/* ===================== ПОКУПКА: МАРШРУТ ИЗ ТРЁХ ШАГОВ ===================== */
function Buy({ auth, hasConsent, onPurchased, showToast, goKeys }) {
  const [step, setStep] = useState(1); // 1 способ · 2 условия · 3 оплата
  const [phase, setPhase] = useState('select'); // select | waiting | done
  const [method, setMethod] = useState('sbp');
  const [quantity, setQuantity] = useState(1);
  const [buying, setBuying] = useState(false);
  const [err, setErr] = useState('');
  const [agreed, setAgreed] = useState(false);
  // согласие пишется в БД один раз — на переходе «Условия» → «Подтверждение»
  const [consented, setConsented] = useState(!!hasConsent);
  const [saving, setSaving] = useState(false);
  const [doc, setDoc] = useState(null);

  const [purchaseId, setPurchaseId] = useState(null);
  const [redirect, setRedirect] = useState(null);
  const [licenseKey, setLicenseKey] = useState(null);
  const [checking, setChecking] = useState(false);

  const pollRef = useRef(null);
  const root = useReveal([step, phase, doc]);

  const checkOnce = useCallback(async (pid) => {
    try {
      const data = await api('/api/payment-status', auth, { purchaseId: pid });
      if (data.status === 'paid') {
        setLicenseKey(data.license_key);
        setPhase('done');
        haptic('success');
        onPurchased();
        return true;
      }
      if (data.status === 'canceled' || data.status === 'chargeback') {
        setErr('Платёж отменён. Попробуйте ещё раз.');
        setPhase('select'); setStep(1);
        return true;
      }
    } catch (_) {}
    return false;
  }, [auth, onPurchased]);

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

  const setQty = (n) => {
    haptic('light');
    setQuantity(Math.min(MAX_QUANTITY, Math.max(1, n)));
  };

  const pay = async () => {
    if (!agreed) return;
    setBuying(true); setErr(''); haptic('medium');
    try {
      const data = await api('/api/purchase', auth, { method, quantity });
      if (!data.redirect) throw new Error('no_redirect');
      setPurchaseId(data.purchaseId);
      setRedirect(data.redirect);
      setPhase('waiting');
      openExternal(data.redirect);
    } catch (e) {
      setErr('Не удалось создать платёж. Попробуйте позже.');
      haptic('error');
    } finally {
      setBuying(false);
    }
  };

  const manualCheck = async () => {
    if (!purchaseId) return;
    setChecking(true);
    const done = await checkOnce(purchaseId);
    setChecking(false);
    if (!done) haptic('warning');
  };

  if (doc) return <DocView id={doc} onBack={() => setDoc(null)} backLabel="Назад к покупке" />;

  if (phase === 'done') {
    return (
      <div className="fade" style={{ paddingTop: 26 }}>
        <span className="mono em">Оплата получена</span>
        <h1 className="hero-type" style={{ marginTop: 14 }}>Лицензия<span className="em">активна</span></h1>
        <div className="credential">
          <div className="top">
            <span className="name">Jarvis Voice Assistant</span>
            <span className="stamp">Активна</span>
          </div>
          <div className="key-line">
            <span className="key">{licenseKey}</span>
            <button className="icon-btn" aria-label="Скопировать ключ" onClick={async () => {
              const ok = await copyText(licenseKey);
              haptic(ok ? 'success' : 'warning');
              showToast?.(ok ? 'Ключ скопирован' : 'Скопируйте вручную');
            }}><Icon name="copy" size={16} /></button>
          </div>
          <button className="dl" onClick={() => { haptic('medium'); openTelegram('https://t.me/Sync_Industries'); }}>
            <Icon name="box" size={16} /> Скачать дистрибутив
          </button>
          <div className="foot"><span>Пожизненно</span><span>Sync Industries</span></div>
        </div>
        <p className="hint">Ключ сохранён в разделе «Ключи». Скачайте программу по кнопке выше — ключ вводится при первом запуске.</p>
        <div className="actionbar">
          <div className="sum"><div className="l">Готово</div><div className="v">Ключ выдан</div></div>
          <button className="btn btn-primary" onClick={goKeys}>Мои ключи</button>
        </div>
      </div>
    );
  }

  if (phase === 'waiting') {
    return (
      <div className="fade" style={{ paddingTop: 26 }}>
        <span className="mono em">Шаг 03 · Оплата</span>
        <div className="title" style={{ marginTop: 14 }}>Ждём платёж</div>
        <div className="panel" style={{ textAlign: 'center', padding: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}><Wave bars={15} /></div>
          <p style={{ margin: '18px 0 0', fontSize: 14.5 }}>Завершите оплату в открывшейся форме.</p>
          <p className="hint">Ключ появится здесь сам, как только платёж пройдёт.</p>
          <div style={{ height: 16 }} />
          <button className="btn btn-primary" onClick={() => redirect && openExternal(redirect)}>Открыть форму оплаты</button>
          <div style={{ height: 9 }} />
          <button className="btn btn-ghost" disabled={checking} onClick={manualCheck}>{checking ? 'Проверяем…' : 'Я оплатил — проверить'}</button>
        </div>
        {err && <p className="hint" style={{ color: 'var(--danger)' }}>{err}</p>}
        <button className="btn btn-ghost" onClick={() => { clearInterval(pollRef.current); setPhase('select'); setStep(1); }}>Отменить платёж</button>
        <div style={{ height: 20 }} />
      </div>
    );
  }

  const sel = getMethod(method);
  // Цена за одну лицензию не меняется — умножается количество.
  const subtotal = PRICE * quantity;
  const total = payableAmount(method, subtotal);

  return (
    <div ref={root} style={{ paddingTop: 26 }}>
      <span className="mono em">Шаг {String(step).padStart(2, '0')} · {step === 1 ? 'Способ оплаты' : step === 2 ? 'Условия' : 'Подтверждение'}</span>
      <div className="steps">
        <i className={step >= 1 ? 'on' : ''} /><i className={step >= 2 ? 'on' : ''} /><i className={step >= 3 ? 'on' : ''} />
      </div>

      {step === 1 && (
        <>
          <div className="title">Сколько лицензий</div>
          <div className="qty">
            <button
              type="button"
              className="qty-btn"
              onClick={() => setQty(quantity - 1)}
              disabled={quantity <= 1}
              aria-label="Меньше"
            >
              −
            </button>
            <div className="qty-val">
              <b>{quantity}</b>
              <span>{quantity === 1 ? 'лицензия' : quantity < 5 ? 'лицензии' : 'лицензий'}</span>
            </div>
            <button
              type="button"
              className="qty-btn"
              onClick={() => setQty(quantity + 1)}
              disabled={quantity >= MAX_QUANTITY}
              aria-label="Больше"
            >
              +
            </button>
            <div className="qty-sum">
              <b>{fmtAmount(PRICE * quantity)} ₽</b>
              {quantity > 1 && <span>{fmtAmount(PRICE)} ₽ за лицензию</span>}
            </div>
          </div>
          <p className="hint">
            Один ключ работает на одном компьютере. Все ключи придут сразу после оплаты.
          </p>

          <div className="title">Как платим</div>
          <div className="tiles">
            {PAY_METHODS.map((m) => (
              <button
                type="button"
                key={m.key}
                className={`tile ${m.wrap ? 'wide' : ''} ${method === m.key ? 'on' : ''}`}
                onClick={() => { haptic(); setMethod(m.key); }}
              >
                <div className="head">
                  <span className="g"><Icon name={m.icon} size={24} /></span>
                  <span className="mark">{method === m.key ? <Icon name="check" size={11} /> : null}</span>
                </div>
                <div className="t">{m.title}</div>
                <div className="s">{m.sub}</div>
                {m.feePct > 0 && <span className="fee">+{m.feePct}% комиссия провайдера</span>}
              </button>
            ))}
          </div>

          <div className="list">
            <div className="row" onClick={() => { haptic(); setDoc('payfaq'); }}>
              <span className="g"><Icon name="help" size={19} /></span>
              <div className="meta"><div className="t">Как оплатить</div><div className="s">Инструкции, банки КЗ и БР, решение ошибок</div></div>
              <span className="chev"><Icon name="chevron" size={16} /></span>
            </div>
          </div>

          <div className="note">
            <span className="g"><Icon name="shield" size={16} /></span>
            <span>Оплата проходит через защищённый шлюз Platega. Ключ выдаётся автоматически — обычно в течение минуты. Если платёж завис, поддержка выдаст ключ вручную.</span>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="title">Условия</div>
          <div className="note">
            <span className="g"><Icon name="alert" size={16} /></span>
            <span>Это цифровой товар. После активации ключа <b className="accent">возврат средств невозможен</b> — пункт 3 оферты.</span>
          </div>
          <div className="list">
            <div className="row" onClick={() => { haptic(); setDoc('eula'); }}>
              <span className="g"><Icon name="file" size={19} /></span>
              <div className="meta"><div className="t">Публичная оферта</div><div className="s">Лицензия, оплата, возвраты</div></div>
              <span className="chev"><Icon name="chevron" size={16} /></span>
            </div>
            <div className="row" onClick={() => { haptic(); setDoc('privacy'); }}>
              <span className="g"><Icon name="shield" size={19} /></span>
              <div className="meta"><div className="t">Политика конфиденциальности</div><div className="s">Обработка данных</div></div>
              <span className="chev"><Icon name="chevron" size={16} /></span>
            </div>
            <div className="row" onClick={() => openExternal(PDF_URL)}>
              <span className="g"><Icon name="pdf" size={19} /></span>
              <div className="meta"><div className="t">Пакет документов</div><div className="s">Оригинал в PDF</div></div>
              <span className="chev"><Icon name="external" size={16} /></span>
            </div>
          </div>
          <div className={`check ${agreed ? 'on' : ''}`} onClick={() => { haptic(); setAgreed(!agreed); }}>
            <div className="box"><Icon name="check" size={13} /></div>
            <span className="txt">Принимаю оферту и Политику. Понимаю, что после активации ключа возврат невозможен.</span>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div className="title">Проверьте заказ</div>
          <div className="panel">
            <div className="specrow" style={{ paddingTop: 0 }}>
              <span className="n">01</span><span className="k">Товар</span><span className="v">Jarvis Voice Assistant</span>
            </div>
            <div className="specrow">
              <span className="n">02</span><span className="k">Лицензия</span><span className="v">Пожизненная</span>
            </div>
            <div className="specrow">
              <span className="n">03</span><span className="k">Способ</span><span className="v">{sel?.title}</span>
            </div>
            <div className="specrow">
              <span className="n">04</span><span className="k">Цена</span><span className="v">{quantity > 1 ? `${fmtAmount(PRICE)} × ${quantity} = ${fmtAmount(subtotal)} ₽` : `${fmtAmount(PRICE)} ₽`}</span>
            </div>
            <div className="specrow" style={{ borderBottom: 0 }}>
              <span className="n">05</span><span className="k">Комиссия</span>
              <span className="v">{sel?.feePct > 0 ? `${sel.feePct}% · ${fmtAmount(total - subtotal)} ₽` : 'нет'}</span>
            </div>
          </div>
          <p className="hint">После нажатия откроется защищённая форма платёжного шлюза. Ключ придёт сюда автоматически.</p>
          {method === 'intl' && (
            <p className="hint">Списание пройдёт в евро — ваш банк сам сконвертирует сумму по своему курсу в момент оплаты.</p>
          )}
        </>
      )}

      {err && <p className="hint" style={{ color: 'var(--danger)' }}>{err}</p>}

      <div className="actionbar">
        <div className="sum">
          <div className="l">{step === 3 ? 'К списанию' : 'Итого'}</div>
          <div className="v">{fmtAmount(total)} ₽</div>
        </div>
        {step < 3 ? (
          <button
            className="btn btn-primary"
            disabled={(step === 2 && !agreed) || saving}
            onClick={async () => {
              haptic('medium');
              if (step === 2 && !consented) {
                setSaving(true); setErr('');
                try {
                  await api('/api/consent', auth, { acceptedEula: true, acceptedPrivacy: true });
                  setConsented(true);
                } catch (_) {
                  setErr('Не удалось сохранить согласие. Проверьте связь и попробуйте ещё раз.');
                  setSaving(false);
                  return;
                }
                setSaving(false);
              }
              setStep(step + 1);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            {step === 2 && !agreed ? 'Примите условия' : saving ? 'Сохраняем…' : 'Далее'}
          </button>
        ) : (
          <button className="btn btn-primary" disabled={buying} onClick={pay}>{buying ? 'Создаём…' : 'Оплатить'}</button>
        )}
      </div>

      {step > 1 && (
        <button className="btn btn-ghost" style={{ marginTop: 22 }} onClick={() => { haptic(); setStep(step - 1); }}>Назад</button>
      )}
      <div style={{ height: 12 }} />
    </div>
  );
}

/* ===================== КЛЮЧИ ===================== */
function Keys({ purchases, goBuy, showToast }) {
  const [doc, setDoc] = useState(null);
  const root = useReveal([doc]);

  if (doc) return <DocView id={doc} onBack={() => setDoc(null)} />;

  const paid = (purchases || []).filter((p) => p.status === 'paid');
  const pending = (purchases || []).filter((p) => p.status === 'pending');

  return (
    <div ref={root} style={{ paddingTop: 26 }}>
      <span className="mono em">Личные данные</span>
      <div className="title" style={{ marginTop: 14 }}>Ключи</div>

      {paid.length === 0 && pending.length === 0 ? (
        <div className="empty reveal">
          <div style={{ color: 'var(--ember)', display: 'flex', justifyContent: 'center', marginBottom: 12 }}><Icon name="inbox" size={28} /></div>
          <p style={{ margin: 0, fontSize: 14.5 }}>Здесь появятся ваши ключи</p>
          <p className="hint">Оформление занимает пару минут.</p>
          <div style={{ height: 14 }} />
          <button className="btn btn-primary" style={{ maxWidth: 220, margin: '0 auto' }} onClick={goBuy}>Купить лицензию</button>
        </div>
      ) : (
        <>
          {paid.map((p) => (
            <div className="credential reveal" key={p.id}>
              <div className="top">
                <span className="name">{p.software_name}</span>
                <span className="stamp">Активна</span>
              </div>
              <div className="key-line">
                <span className="key">{p.license_key}</span>
                <button className="icon-btn" aria-label="Скопировать ключ" onClick={async () => {
                  const ok = await copyText(p.license_key);
                  haptic(ok ? 'success' : 'warning');
                  showToast?.(ok ? 'Ключ скопирован' : 'Скопируйте вручную');
                }}><Icon name="copy" size={16} /></button>
              </div>
              <button className="dl" onClick={() => { haptic('medium'); openTelegram('https://t.me/Sync_Industries'); }}>
                <Icon name="box" size={16} /> Скачать дистрибутив
              </button>
              <div className="foot">
                <span>{new Date(p.created_at).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}</span>
                <span>{p.amount ?? p.price} ₽</span>
              </div>
            </div>
          ))}
          {pending.map((p) => (
            <div className="credential pend reveal" key={p.id}>
              <div className="top">
                <span className="name">{p.software_name}</span>
                <span className="stamp">Ожидает оплаты</span>
              </div>
              <div className="key-line"><span className="key" style={{ color: 'var(--ash)' }}>— — — — · — — — — · — — — —</span></div>
              <div className="foot"><span>Не оплачено</span><span>{p.amount ?? p.price} ₽</span></div>
            </div>
          ))}
        </>
      )}

      <section className="chapter reveal">
        <div className="head"><span className="num">01</span><span className="name">Документы</span></div>
        <div className="list" style={{ marginTop: 0, borderTop: 0 }}>
          <div className="row" onClick={() => { haptic(); setDoc('eula'); }}>
            <span className="g"><Icon name="file" size={19} /></span>
            <div className="meta"><div className="t">Публичная оферта</div><div className="s">Лицензия, оплата, возвраты</div></div>
            <span className="chev"><Icon name="chevron" size={16} /></span>
          </div>
          <div className="row" onClick={() => { haptic(); setDoc('privacy'); }}>
            <span className="g"><Icon name="shield" size={19} /></span>
            <div className="meta"><div className="t">Политика конфиденциальности</div><div className="s">Обработка данных</div></div>
            <span className="chev"><Icon name="chevron" size={16} /></span>
          </div>
          <div className="row" onClick={() => openExternal(PDF_URL)}>
            <span className="g"><Icon name="pdf" size={19} /></span>
            <div className="meta"><div className="t">Пакет документов</div><div className="s">Оригинал в PDF</div></div>
            <span className="chev"><Icon name="external" size={16} /></span>
          </div>
        </div>
      </section>
      <div style={{ height: 20 }} />
    </div>
  );
}

/* ===================== ПОМОЩЬ ===================== */
function Help() {
  const [doc, setDoc] = useState(null);
  const root = useReveal([doc]);

  if (doc) return <DocView id={doc} onBack={() => setDoc(null)} />;

  return (
    <div ref={root} style={{ paddingTop: 26 }}>
      <span className="mono em">Сервис</span>
      <div className="title" style={{ marginTop: 14 }}>Помощь</div>
      <p className="hint">Оплата, установка, активация — отвечаем в Telegram.</p>

      <div className="tiles reveal">
        <button type="button" className="tile" onClick={() => { haptic('medium'); openTelegram(`https://t.me/${SUPPORT_BOT}`); }}>
          <div className="head"><span className="g"><Icon name="life" size={24} /></span><span className="chev"><Icon name="external" size={15} /></span></div>
          <div className="t">Поддержка</div>
          <div className="s">Будни 09–21 · Выходные 11–18 МСК</div>
        </button>
        <button type="button" className="tile" onClick={() => { haptic(); openTelegram('https://t.me/Sync_Industries'); }}>
          <div className="head"><span className="g"><Icon name="signal" size={24} /></span><span className="chev"><Icon name="external" size={15} /></span></div>
          <div className="t">Канал</div>
          <div className="s">Новости и дистрибутив</div>
        </button>
      </div>

      <section className="chapter reveal">
        <div className="head"><span className="num">01</span><span className="name">Оплата</span></div>
        <div className="list" style={{ marginTop: 0, borderTop: 0 }}>
          <div className="row" onClick={() => { haptic(); setDoc('payfaq'); }}>
            <span className="g"><Icon name="help" size={19} /></span>
            <div className="meta"><div className="t">Как оплатить</div><div className="s">Пять способов, банки и решение ошибок</div></div>
            <span className="chev"><Icon name="chevron" size={16} /></span>
          </div>
        </div>
      </section>

      <section className="chapter reveal">
        <div className="head"><span className="num">02</span><span className="name">Документы</span></div>
        <div className="list" style={{ marginTop: 0, borderTop: 0 }}>
          <div className="row" onClick={() => { haptic(); setDoc('eula'); }}>
            <span className="g"><Icon name="file" size={19} /></span>
            <div className="meta"><div className="t">Публичная оферта</div><div className="s">Лицензия, оплата, возвраты</div></div>
            <span className="chev"><Icon name="chevron" size={16} /></span>
          </div>
          <div className="row" onClick={() => { haptic(); setDoc('privacy'); }}>
            <span className="g"><Icon name="shield" size={19} /></span>
            <div className="meta"><div className="t">Политика конфиденциальности</div><div className="s">Обработка данных</div></div>
            <span className="chev"><Icon name="chevron" size={16} /></span>
          </div>
        </div>
      </section>
      <div style={{ height: 20 }} />
    </div>
  );
}
