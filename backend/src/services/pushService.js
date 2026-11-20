// Web Push: notifications that reach a phone or computer even when Tasks
// Manager is closed. Needs VAPID keys in the env (see scripts/generateVapidKeys.js).
// Without them everything here is a no-op and the app keeps its in-page pop-ups.
const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const User = require('../models/User');

let configuredFor = null;

function config() {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) return null;
  const subject = (process.env.VAPID_SUBJECT || 'mailto:info@oncarecancer.com').trim();
  if (configuredFor !== publicKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configuredFor = publicKey;
  }
  return { publicKey };
}

const enabled = () => Boolean(config());
const publicKey = () => (config() || {}).publicKey || null;

// Only https endpoints from the browser push services.
function validSubscription(sub) {
  if (!sub || typeof sub !== 'object') return false;
  const { endpoint, keys } = sub;
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  try {
    if (new URL(endpoint).protocol !== 'https:') return false;
  } catch {
    return false;
  }
  return Boolean(keys && typeof keys.p256dh === 'string' && typeof keys.auth === 'string' && keys.p256dh.length < 200 && keys.auth.length < 100);
}

async function saveSubscription(userId, sub, userAgent = '') {
  // A device belongs to whoever signed in last on it.
  return PushSubscription.findOneAndUpdate(
    { endpoint: sub.endpoint },
    { user: userId, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, userAgent: String(userAgent).slice(0, 300) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

const removeSubscription = (userId, endpoint) => PushSubscription.deleteOne({ user: userId, endpoint });

/**
 * Sends { title, body, link, tag } to every device of the given users.
 * Never throws; dead subscriptions (404 / 410) are removed.
 */
async function sendToUsers(userIds, payload) {
  if (!enabled()) return 0;
  const ids = [...new Set((userIds || []).filter(Boolean).map((id) => String(id._id || id)))];
  if (!ids.length) return 0;
  try {
    const active = await User.find({ _id: { $in: ids }, status: { $ne: 'disabled' } }).select('_id');
    const subs = await PushSubscription.find({ user: { $in: active.map((u) => u._id) } });
    const body = JSON.stringify({
      title: String(payload.title || 'Tasks Manager').slice(0, 120),
      body: String(payload.body || '').slice(0, 300),
      link: payload.link || '/dashboard',
      tag: payload.tag || payload.link || undefined,
    });
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 3600, urgency: 'high' });
          sent += 1;
          PushSubscription.updateOne({ _id: s._id }, { lastSentAt: new Date() }).catch(() => {});
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) await PushSubscription.deleteOne({ _id: s._id }).catch(() => {});
          else console.error('[push] send failed:', err.statusCode || '', err.message);
        }
      })
    );
    return sent;
  } catch (err) {
    console.error('[push] failed:', err.message);
    return 0;
  }
}

module.exports = { enabled, publicKey, validSubscription, saveSubscription, removeSubscription, sendToUsers };
