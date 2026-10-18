const CACHE = 'stocktake-app-v4';
const ASSETS = ['./', './index.html', './styles.css', './ui-refresh.css', './app.js', './cloud.js', './reports.js', './cloud-config.js', './roles.css', './updates.js', './manifest.webmanifest', './icon.svg', './brand/cgv-stocktake.svg', './brand/favicon.svg', './brand/app-icon-192.png', './brand/app-icon-512.png', './brand/app-icon-maskable-512.png', './brand/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('stocktake-app-') && key !== CACHE).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if(event.request.method !== 'GET' || url.origin !== location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(event.request, { ignoreSearch: true }) || (event.request.mode === 'navigate' ? await cache.match('./index.html', { ignoreSearch: true }) : Response.error());
  }));
});

// Activation requires an explicit Refresh click in the app.
self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')event.waitUntil(self.skipWaiting());
});
