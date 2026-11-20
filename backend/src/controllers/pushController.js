const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const push = require('../services/pushService');

// GET /api/push/config : whether the server can send push, and its public key.
const getConfig = (req, res) => {
  res.status(200).json({ enabled: push.enabled(), publicKey: push.publicKey() });
};

// POST /api/push/subscriptions { subscription } : this device wants push.
const subscribe = catchAsync(async (req, res) => {
  if (!push.enabled()) throw new ApiError(400, 'Push notifications are not set up on the server');
  const sub = req.body.subscription;
  if (!push.validSubscription(sub)) throw new ApiError(400, 'Invalid push subscription');
  await push.saveSubscription(req.user._id, sub, req.get('user-agent'));
  req.audit = { skip: true };
  res.status(201).json({ ok: true });
});

// DELETE /api/push/subscriptions { endpoint } : stop push on this device.
const unsubscribe = catchAsync(async (req, res) => {
  const endpoint = String(req.body.endpoint || '');
  if (endpoint) await push.removeSubscription(req.user._id, endpoint);
  req.audit = { skip: true };
  res.status(200).json({ ok: true });
});

module.exports = { getConfig, subscribe, unsubscribe };
