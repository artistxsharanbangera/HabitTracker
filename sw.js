// ══════════════════════════════════════════════════════════════════════
// Daily Tracker — Service Worker
// Handles: offline caching + daily notification scheduling
// ══════════════════════════════════════════════════════════════════════

const CACHE = 'daily-tracker-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── INSTALL ──────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH ─ network-first for HTML, cache-first for assets ───────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Don't touch cross-origin requests (APIs, fonts, etc.)
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
        return res;
      }).catch(() => caches.match(request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached =>
      cached || fetch(request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
        return res;
      }).catch(() => cached)
    )
  );
});

// ══════════════════════════════════════════════════════════════════════
// NOTIFICATION SCHEDULING
// The page posts { type: 'SCHEDULE_NOTIFICATIONS', times: ['HH:MM', ...] }
// We set timeouts for the next occurrence of each and reschedule on fire.
// ══════════════════════════════════════════════════════════════════════

let scheduledTimeouts = [];
let currentTimes = [];

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'SCHEDULE_NOTIFICATIONS') {
    currentTimes = Array.isArray(data.times) ? data.times : [];
    scheduleAll();
  }
});

function clearAllTimeouts() {
  scheduledTimeouts.forEach(id => clearTimeout(id));
  scheduledTimeouts = [];
}

function msUntilNext(hh, mm) {
  const now = new Date();
  const next = new Date();
  next.setHours(hh, mm, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

const NOTIF_MESSAGES = [
  { title: '✓ Daily check-in', body: "Take 10 seconds to tick off today's habits." },
  { title: '📋 Habit reminder',  body: 'How are you doing on your habits today?' },
  { title: '🍽 Log your meal',    body: "Don't forget to log what you ate." },
  { title: '🔥 Keep the streak',  body: 'Your streak is waiting — check in now.' },
  { title: '🌙 End-of-day review',body: 'Quick check: did you hit your habits today?' },
];

function showHabitNotification() {
  const pick = NOTIF_MESSAGES[Math.floor(Math.random() * NOTIF_MESSAGES.length)];
  return self.registration.showNotification(pick.title, {
    body: pick.body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'daily-tracker-reminder',
    renotify: true,
    requireInteraction: false,
    data: { url: './' }
  });
}

function scheduleOne(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return;
  const ms = msUntilNext(h, m);
  const id = setTimeout(async () => {
    try { await showHabitNotification(); } catch (e) {}
    // Reschedule for next day
    scheduleOne(timeStr);
  }, ms);
  scheduledTimeouts.push(id);
}

function scheduleAll() {
  clearAllTimeouts();
  currentTimes.forEach(scheduleOne);
}

// ── NOTIFICATION CLICK ──────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
