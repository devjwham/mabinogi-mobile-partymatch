self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {};

  // 메시지에 timestamp가 없는 경우 대비
  const timestamp = data.timestamp || 0;
  const now = Date.now();

  // 10분(600,000ms) 초과 시 알림 무시
  if (now - timestamp > 30 * 1000) {
    return;
  }

  const title = data.title || '알림';
  const options = {
    body: data.body || '',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const urlToOpen = new URL('/party.html', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});