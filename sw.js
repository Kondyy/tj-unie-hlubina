/* Service worker: instalace do telefonu (PWA) + push notifikace. Data se NEukládají do cache (vždy ze serveru). */
const CACHE = 'unie-shell-v1';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./icon-192.png', './manifest.webmanifest'])).catch(() => {})); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
/* Stránku vždy nejdřív ze sítě (aktuální verze), z cache jen když není internet. */
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { if (r.mode === 'navigate') caches.open(CACHE).then(c => c.put('./', res.clone())); return res; })
    .catch(() => caches.match(r.mode === 'navigate' ? './' : r).then(x => x || Response.error())));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || 'TJ Unie Hlubina', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', data: d, tag: d.tab || 'unie'}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(cs => {
    for (const c of cs) { if ('focus' in c) { c.postMessage({type: 'open', data: e.notification.data}); return c.focus(); } }
    return self.clients.openWindow('./');
  }));
});
