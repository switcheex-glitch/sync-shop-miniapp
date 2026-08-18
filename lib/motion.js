'use client';

// Небольшой движок движения: появление по скроллу, свет за пальцем, параллакс,
// счётчик цены, тактильный отклик. Без зависимостей — только transform/opacity,
// чтобы в вебвью Telegram всё шло на композиторе и не роняло кадры.

import { useEffect, useRef, useState, useCallback } from 'react';

export function reduced() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Все элементы .reveal внутри контейнера всплывают по очереди, когда входят в кадр.
export function useReveal(deps = []) {
  const root = useRef(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = el.querySelectorAll('.reveal:not(.in)');
    if (reduced() || typeof IntersectionObserver === 'undefined') {
      items.forEach((i) => i.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }
    );
    items.forEach((item, i) => {
      item.style.setProperty('--d', `${Math.min(i, 7) * 60}ms`);
      io.observe(item);
    });
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return root;
}

// Мягкое световое пятно следует за курсором/пальцем по панели (--mx / --my).
export function useSpotlight() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let raf = 0;
    const move = (x, y) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${(((x - r.left) / r.width) * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${(((y - r.top) / r.height) * 100).toFixed(1)}%`);
      });
    };
    const onPointer = (e) => move(e.clientX, e.clientY);
    const onTouch = (e) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); };
    el.addEventListener('pointermove', onPointer);
    el.addEventListener('touchmove', onTouch, { passive: true });
    return () => {
      el.removeEventListener('pointermove', onPointer);
      el.removeEventListener('touchmove', onTouch);
      cancelAnimationFrame(raf);
    };
  }, []);
  return ref;
}

// Слой уезжает медленнее страницы: глубина сцены (--py).
export function useParallax(speed = 0.12) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const off = (r.top + r.height / 2 - window.innerHeight / 2) * -speed;
        el.style.setProperty('--py', `${off.toFixed(1)}px`);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [speed]);
  return ref;
}

// Цена набирается, а не появляется готовой.
export function useCountUp(target, duration = 850) {
  const [value, setValue] = useState(() => (reduced() ? target : 0));
  useEffect(() => {
    if (reduced()) { setValue(target); return; }
    let raf = 0;
    let start = 0;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// Тактильный отклик Telegram: light/medium/soft либо success/warning/error.
export function haptic(kind = 'light') {
  try {
    const h = typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback;
    if (!h) return;
    if (kind === 'success' || kind === 'warning' || kind === 'error') h.notificationOccurred(kind);
    else h.impactOccurred(kind);
  } catch (_) {}
}

// Короткое всплывающее сообщение (скопировано / ошибка).
export function useToast(ms = 2200) {
  const [toast, setToast] = useState(null);
  const show = useCallback((text) => setToast({ text, id: Math.random() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(t);
  }, [toast, ms]);
  return [toast, show];
}

// Копирование с запасным путём для старых вебвью.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }
}
