// PWA helpers: service worker registration, "Install app" prompt and
// notifications that also work on Android / installed apps.

let deferredPrompt = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true);

export const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep it for our own "Install app" button instead of Chrome's mini bar.
    e.preventDefault();
    deferredPrompt = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

export const canInstall = () => Boolean(deferredPrompt);

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Returns 'accepted' | 'dismissed' | 'unavailable'.
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  const e = deferredPrompt;
  deferredPrompt = null;
  emit();
  e.prompt();
  const choice = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
  return choice.outcome;
}

// ---------- Web Push ----------
// With push on, the server sends notifications even when the app is
// closed, so the page stops showing its own pop-ups (no doubles).
export const WEB_PUSH_KEY = 'oncare_webpush';
export const webPushActive = () => {
  try {
    return localStorage.getItem(WEB_PUSH_KEY) === 'on';
  } catch {
    return false;
  }
};
const setWebPushFlag = (on) => {
  try {
    if (on) localStorage.setItem(WEB_PUSH_KEY, 'on');
    else localStorage.removeItem(WEB_PUSH_KEY);
  } catch {
    /* storage blocked */
  }
};

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function swRegistration() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || typeof PushManager === 'undefined') return null;
  return (await navigator.serviceWorker.getRegistration()) || null;
}

// Subscribes this device. `api` = { getConfig, subscribe }. Returns true
// when the server will now push; false when push isn't available here.
export async function enableWebPush(api) {
  const reg = await swRegistration();
  if (!reg) return false;
  const cfg = await api.getConfig().catch(() => null);
  if (!cfg || !cfg.enabled || !cfg.publicKey) return false;
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // Server key changed: start over.
    const current = sub.options && sub.options.applicationServerKey;
    const want = urlBase64ToUint8Array(cfg.publicKey);
    if (current && new Uint8Array(current).toString() !== want.toString()) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.publicKey) });
  await api.subscribe(sub.toJSON());
  setWebPushFlag(true);
  return true;
}

// Stops push on this device (also used on log out, so the next person
// signing in on a shared computer doesn't get the last person's alerts).
export async function disableWebPush(api) {
  setWebPushFlag(false);
  const reg = await swRegistration();
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (!sub) return;
  await api.unsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// Shows a system notification. Uses the service worker when there is one
// (the only way on Android Chrome), else the plain Notification API.
export async function showNotification(title, { body, link, tag } = {}) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const options = { body, tag: tag || link || title, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { link } };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    /* fall back below */
  }
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      if (link) window.location.assign(link);
    };
    return true;
  } catch {
    return false;
  }
}
