// Штриховые иконки интерфейса: один набор вместо эмодзи.
// Все — 24×24, штрих 1.5, цвет наследуется (currentColor), поэтому подсветка
// активных состояний делается через CSS, а не подменой картинки.

const P = {
  // продукт и разделы
  mic: <><path d="M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3Z" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0" /><path d="M12 17.5V21" /><path d="M8.5 21h7" /></>,
  bolt: <path d="M13.5 3 5.5 13.2h5.2L10 21l8.2-10.4H13L13.5 3Z" />,
  chip: <><rect x="7" y="7" width="10" height="10" rx="2.5" /><path d="M10 3.5v3M14 3.5v3M10 17.5v3M14 17.5v3M3.5 10h3M3.5 14h3M17.5 10h3M17.5 14h3" /></>,
  tools: <><path d="M14.5 6.2a3.6 3.6 0 0 1 4.9 4.6l-9 9-3.6 1 1-3.6 9-9Z" /><path d="M4 4.5l3.2 3.2M4 9h4.5M9 4v4.5" /></>,
  home: <><path d="M4 10.5 12 4l8 6.5" /><path d="M6 10v9.5h12V10" /><path d="M10 19.5v-5h4v5" /></>,
  bag: <><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  vault: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="12" cy="12" r="3.5" /><path d="M12 4.5v4M12 15.5v4" /></>,
  chat: <><path d="M4.5 5.5h15v10h-9l-4.5 3.5v-3.5h-1.5Z" /><path d="M8.5 10.5h7" /></>,

  // способы оплаты
  qr: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><path d="M13.5 13.5h3v3h-3zM20.5 13.5v3M17 20.5h3.5v-3" /></>,
  sber: <><circle cx="12" cy="12" r="8" /><path d="M8.5 12.2l2.6 2.4L16 9.5" /></>,
  card: <><rect x="3" y="6" width="18" height="12" rx="2.5" /><path d="M3 10h18" /><path d="M6.5 14.5h3.5" /></>,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M10 8.5v7M13.2 8.5v7M8.6 10.5h4.2a1.7 1.7 0 0 1 0 3.4H8.6M8.6 13.9h4.6" /></>,
  globe: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16" /><path d="M12 4c2.2 2.2 3.3 5 3.3 8s-1.1 5.8-3.3 8c-2.2-2.2-3.3-5-3.3-8S9.8 6.2 12 4Z" /></>,

  // документы и служебное
  file: <><path d="M6.5 3.5h8l4 4v13h-12Z" /><path d="M14.5 3.5v4h4" /><path d="M9 12h6M9 15.5h6" /></>,
  shield: <><path d="M12 3.5 19 6v6c0 4-3 7-7 8.5-4-1.5-7-4.5-7-8.5V6l7-2.5Z" /><path d="M9.2 12.2l2 2 3.6-3.8" /></>,
  pdf: <><path d="M6.5 3.5h8l4 4v13h-12Z" /><path d="M14.5 3.5v4h4" /><path d="M12 10v6M9.5 13.5 12 16l2.5-2.5" /></>,
  help: <><circle cx="12" cy="12" r="8.2" /><path d="M9.7 9.6a2.4 2.4 0 0 1 4.6.9c0 1.6-2.3 1.9-2.3 3.3" /><path d="M12 17.2v.01" /></>,
  life: <><circle cx="12" cy="12" r="8.2" /><circle cx="12" cy="12" r="3.4" /><path d="M6.2 6.2 9.6 9.6M17.8 6.2 14.4 9.6M6.2 17.8l3.4-3.4M17.8 17.8l-3.4-3.4" /></>,
  signal: <><path d="M4.5 15.5v-3M8.5 18v-8M12.5 20V6M16.5 18v-8M20.5 15.5v-3" /></>,
  box: <><path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4v-9Z" /><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" /></>,
  key: <><circle cx="8" cy="12" r="3.5" /><path d="M11.5 12H21M18 12v3M15 12v2.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.2" /><path d="M12 7.5V12l3 1.8" /></>,
  alert: <><path d="M12 4.5 21 19.5H3L12 4.5Z" /><path d="M12 10v4M12 16.8v.01" /></>,
  inbox: <><path d="M3.5 12.5 6 5h12l2.5 7.5v6h-17Z" /><path d="M3.5 12.5h5l1 2.5h5l1-2.5h5" /></>,
  check: <path d="M5 12.5 9.5 17 19 7.5" />,
  copy: <><rect x="9" y="9" width="11.5" height="11.5" rx="2.5" /><path d="M15 6.5v-1a2 2 0 0 0-2-2H5.5a2 2 0 0 0-2 2V13a2 2 0 0 0 2 2h1" /></>,
  flash: <><path d="M12 3.2a4 4 0 0 1 4 4v10.5a4 4 0 0 1-8 0V7.2a4 4 0 0 1 4-4Z" /><path d="M12 7.5v5" /></>,
  headset: <><path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" /><rect x="2.8" y="13.5" width="4" height="6" rx="1.8" /><rect x="17.2" y="13.5" width="4" height="6" rx="1.8" /><path d="M19.5 19.5c0 1.4-1.8 2.3-4 2.3" /></>,
  layers: <><path d="M12 3.5 21 8l-9 4.5L3 8l9-4.5Z" /><path d="M3 12.5 12 17l9-4.5" /><path d="M3 16.8 12 21.3l9-4.5" /></>,
  chevron: <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  user: <><circle cx="12" cy="8.4" r="3.4" /><path d="M5.2 19.5c.9-3.4 3.5-5.3 6.8-5.3s5.9 1.9 6.8 5.3" /></>,
  back: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  minus: <path d="M5.5 12h13" />,
  external: <><path d="M14 4.5h5.5V10" /><path d="M19.5 4.5 11 13" /><path d="M18 14v5.5H4.5V6H10" /></>
};

export function Icon({ name, size = 22, className = '' }) {
  const d = P[name];
  if (!d) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {d}
    </svg>
  );
}

// Фирменный знак *sync: звёздочка-астериск из трёх штрихов с круглыми концами.
// Цвет наследуется (currentColor) — в шапке белый, на белой карточке ключа чёрный.
export function LogoMark({ size = 22, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={Math.round(size * 0.96)}
      viewBox="0 0 46 44"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="currentColor" strokeWidth="7.5" strokeLinecap="round">
        <line x1="23" y1="7" x2="23" y2="37" />
        <line x1="10" y1="14.5" x2="36" y2="29.5" />
        <line x1="36" y1="14.5" x2="10" y2="29.5" />
      </g>
    </svg>
  );
}

// Сфера-реактор на обложке: кинематографичный рендер (public/reactor.webp,
// 1080×1080, WebP с альфой, ~183 КБ) + живые слои поверх: вращающееся
// HUD-кольцо с дугой, орбитальная точка и пульс ядра. Анимация — CSS rx-*.
export function Reactor() {
  return (
    <>
      <img className="rx-img" src="/reactor.webp" alt="" width="480" height="480" draggable="false" />
      <svg className="rx" width="460" height="460" viewBox="0 0 460 460" fill="none" aria-hidden="true" focusable="false">
        <g className="rx-a">
          <circle cx="230" cy="230" r="222" stroke="rgba(255,255,255,.15)" strokeWidth="1" strokeDasharray="1 6" />
          <path d="M 230 8 A 222 222 0 0 1 448.6 191.4" stroke="rgba(255,255,255,.3)" strokeWidth="1.5" />
        </g>
        <g className="rx-c"><circle cx="230" cy="4" r="3.5" fill="#fff" opacity=".7" /></g>
      </svg>
      <span className="rx-pulse" />
    </>
  );
}

// Фирменный мотив: голосовая волна. Живёт в ожидании оплаты и в шапке товара.
export function Wave({ bars = 9, className = '' }) {
  return (
    <div className={`wave ${className}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} style={{ animationDelay: `${(i % 5) * 0.12}s` }} />
      ))}
    </div>
  );
}
