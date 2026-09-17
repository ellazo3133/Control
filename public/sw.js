const CACHE = 'asistencia-v3';
const OFFLINE_URL = '/offline.html';

// Assets to cache on install
const PRECACHE = ['/', '/offline.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// Push notifications
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  const title = data.title || 'Control de Asistencia';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'asistencia',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({type:'window'}).then(wins => {
      const w = wins.find(w => w.url === url && 'focus' in w);
      if (w) return w.focus();
      return clients.openWindow(url);
    })
  );
});

// Background sync for offline check-ins
self.addEventListener('sync', e => {
  if (e.tag === 'sync-attendance') {
    e.waitUntil(syncPendingAttendance());
  }
});

async function syncPendingAttendance() {
  // Handled by the app on reconnect
  const allClients = await clients.matchAll();
  allClients.forEach(c => c.postMessage({type:'SYNC_ATTENDANCE'}));
}
