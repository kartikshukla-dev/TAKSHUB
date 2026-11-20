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
