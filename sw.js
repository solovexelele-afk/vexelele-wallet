/* Starlify Wallet — service worker.
   Нужен, чтобы кошелёк ставился как приложение и открывался без интернета.
   Файлы приложения: сначала сеть (чтобы обновления приходили сразу), при её отсутствии — кэш.
   Запросы к TonAPI/CoinGecko не кэшируются никогда. */
const CACHE = 'vxw-v9';
const APP = ['./', 'index.html', 'wallet.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];
const LIBS = [
  'https://cdn.jsdelivr.net/npm/tonweb@0.0.66/dist/tonweb.js',
  'https://cdn.jsdelivr.net/npm/tonweb-mnemonic@1.0.1/dist/web/index.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP.concat(LIBS.map(u => new Request(u, { mode: 'cors' }))))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === self.location.origin;
  const isLib = LIBS.includes(url.href);
  if (!sameOrigin && !isLib) return;            // API и прочее — напрямую в сеть
  if (isLib) {                                   // библиотеки с фиксированной версией — из кэша
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
