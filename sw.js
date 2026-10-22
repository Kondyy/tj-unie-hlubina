/* Service worker: instalace do telefonu (PWA), offline režim a push notifikace.
   Stránka a knihovny: nejdřív ze sítě (vždy aktuální verze), bez internetu z cache.
   Data z databáze (Supabase) se tu necachují – poslední načtená data si aplikace uloží sama (Offline). */
const CACHE = 'unie-shell-v2';
const CDN = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './icon-192.png', './manifest.webmanifest'])).catch(() => {})); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request, url = new URL(r.url);
  if (r.method !== 'GET') return;
  const own = url.origin === location.origin, cdn = CDN.includes(url.hostname);
  if (!own && !cdn) return;                                           // databáze, počasí, mapy… jen ze sítě
  const key = own && r.mode === 'navigate' ? './' : r;               // všechny adresy aplikace (i ?tab=…) = jedna stránka
  e.respondWith(fetch(r).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
    return res;
  }).catch(() => caches.match(key).then(x => x || Response.error())));
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
