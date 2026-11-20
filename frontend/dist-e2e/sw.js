/* Tasks Manager service worker.
 *
 * - Makes the app installable and opens it fast: the app shell (index.html,
 *   hashed JS/CSS, icons, stickers, sounds) is cached.
 * - Never caches the API or the socket: task and chat data always come live
 *   from the server, so nobody sees stale or someone else's data.
 * - Shows notifications for the page (needed on Android, where pages cannot
 *   create notifications themselves) and opens the right screen on click.
 *
 * Bump VERSION to throw away old caches.
 */
const VERSION = 'v2';
const SHELL = `tm-shell-${VERSION}`;
const ASSETS = `tm-assets-${VERSION}`;
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/logo.png', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tm-') && k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isStatic = (url) =>
  url.pathname.startsWith('/assets/') ||
  url.pathname.startsWith('/icons/') ||
  url.pathname.startsWith('/stickers/') ||
  url.pathname.startsWith('/sounds/') ||
  url.pathname.startsWith('/whats-new/') ||
  url.pathname === '/logo.png';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Same origin only, and never the API, the socket or the service worker itself.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io') || url.pathname === '/sw.js') return;
  // Range requests (audio seeking) go straight to the network.
  if (req.headers.has('range')) return;

  // Pages: network first so a new deploy shows at once; cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put('/index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Hashed build files and static media: cache first (file names change on deploy).
  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});

// Web Push from the server (works when the app is closed). If Tasks Manager
// is open and in front, the page already shows it, so stay quiet.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const inFront = list.some((c) => c.visibilityState === 'visible' && c.focused);
      if (inFront) return undefined;
      return self.registration.showNotification(data.title || 'Tasks Manager', {
        body: data.body || '',
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { link: data.link || '/dashboard' },
      });
    })
  );
});

// Notification clicks: focus an open window (and move it to the link) or open one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/dashboard';
  const target = new URL(link, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) {
        return open.focus().then((c) => (c && 'navigate' in c ? c.navigate(target) : c));
      }
      return self.clients.openWindow(target);
    })
  );
});
