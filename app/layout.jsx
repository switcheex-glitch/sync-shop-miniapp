import './globals.css';
import Script from 'next/script';
import { Inter_Tight, JetBrains_Mono } from 'next/font/google';

// Система «Монохром»: одна гарнитура на заголовки и текст (Inter Tight,
// жирные строчные в заголовках — как в логотипе *sync) + утилитарный
// моноширинный для лейблов, тегов и ключа лицензии.
const sans = Inter_Tight({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '800'],
  variable: '--font-body',
  display: 'swap'
});

const mono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap'
});

export const metadata = {
  title: 'Sync Industries — Магазин',
  description: 'Магазин Sync Industries: голосовой ассистент Jarvis'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0a0b'
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru" className={`${sans.variable} ${mono.variable}`}>
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body>
        {/* Живой логотип на заднем фоне: звёздочка *sync медленно вращается за контентом */}
        <div className="bglogo" aria-hidden="true">
          <svg viewBox="0 0 46 44" fill="none">
            <g stroke="#ffffff" strokeWidth="7.5" strokeLinecap="round">
              <line x1="23" y1="7" x2="23" y2="37" />
              <line x1="10" y1="14.5" x2="36" y2="29.5" />
              <line x1="36" y1="14.5" x2="10" y2="29.5" />
            </g>
          </svg>
        </div>
        {children}
      </body>
    </html>
  );
}
