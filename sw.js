// Service worker de Cuentas Hermanizzz: solo notificaciones (no guarda la app en caché).
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'Cuentas Hermanizzz', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Cuentas Hermanizzz', {
    body: d.body || '',
    icon: 'img/icon-192.png',
    badge: 'img/icon-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || '' }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var hash = (e.notification.data && e.notification.data.url) || '';
  var url = self.registration.scope + hash;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) {
      if (cs[i].url.indexOf(self.registration.scope) === 0) {
        cs[i].postMessage({ abrir: hash });
        return cs[i].focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
