const CACHE_NAME = 'habit-tracker-v3';

// ── CACHE ─────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(['/HabitTracker/', '/HabitTracker/index.html', '/HabitTracker/manifest.json']).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('/HabitTracker/index.html');
      });
    })
  );
});

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────
let scheduledTimeouts = [];

function scheduleNotifications(times) {
  // Clear any existing scheduled timeouts
  scheduledTimeouts.forEach(t => clearTimeout(t));
  scheduledTimeouts = [];

  if (!times || times.length === 0) return;

  const now = new Date();

  times.forEach(time => {
    const [h, m] = time.split(':').map(Number);

    const target = new Date();
    target.setHours(h, m, 0, 0);

    // If this time has already passed today, schedule for tomorrow
    if (target <= now) target.setDate(target.getDate() + 1);

    const delay = target.getTime() - now.getTime();

    const timeout = setTimeout(() => {
      self.registration.showNotification('Habit Tracker 🔥', {
        body: "Don't forget to log your habits for today!",
        icon: '/HabitTracker/icon-192.png',
        badge: '/HabitTracker/icon-192.png',
        tag: 'habit-reminder-' + time,
        renotify: true,
        vibrate: [200, 100, 200],
        data: { url: '/HabitTracker/' }
      });
      // Reschedule this same time for tomorrow
      scheduleNotifications([time]);
    }, delay);

    scheduledTimeouts.push(timeout);
  });
}

// Listen for schedule updates from the page
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATIONS') {
    scheduleNotifications(event.data.times);
  }
});

// Open app when notification is tapped
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) return clientList[0].focus();
      return clients.openWindow('/HabitTracker/');
    })
  );
});
