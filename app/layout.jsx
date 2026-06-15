import './globals.css';
import Script from 'next/script';

export const metadata = {
  title: 'Sync Industries — Магазин',
  description: 'Магазин Sync Industries: голосовой ассистент Jarvis'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
