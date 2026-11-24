// في مثل هذا اليوم — Service Worker للعمل بدون إنترنت
// عند تعديل أي ملف في التطبيق غيّر رقم الإصدار هنا ليتحدث عند المستخدمين
const VERSION = 'otd-v2';
const APP_CACHE = VERSION + '-app';
const FONT_CACHE = 'otd-fonts';

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png'
];
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Amiri:wght@700&family=Reem+Kufi:wght@600&family=Tajawal:wght@400;500;700;800&display=swap';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(APP_FILES);
    // محاولة حفظ الخطوط مسبقاً (لا يفشل التثبيت إن تعذر ذلك)
    try {
      const fc = await caches.open(FONT_CACHE);
      const res = await fetch(FONTS_CSS);
      if (res.ok) {
        await fc.put(FONTS_CSS, res.clone());
        const css = await res.text();
        const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map(m => m[1]);
        await Promise.all(urls.map(u => fetch(u, { mode: 'cors' }).then(r => r.ok && fc.put(u, r)).catch(() => {})));
      }
    } catch (e) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== APP_CACHE && k !== FONT_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // الخطوط: من الذاكرة أولاً ثم التحديث من الإنترنت
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(req, { ignoreVary: true });
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') cache.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || new Response('', { status: 504 });
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // فتح صفحات التطبيق: من الإنترنت إن توفر (لأخذ آخر نسخة) وإلا من الذاكرة
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
        const cache = await caches.open(APP_CACHE);
        cache.put('./index.html', res.clone());
        return res;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./'));
      }
    })());
    return;
  }

  // باقي ملفات التطبيق: من الذاكرة أولاً
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(APP_CACHE)).put(req, res.clone());
      return res;
    } catch (e) {
      return new Response('', { status: 504 });
    }
  })());
});
