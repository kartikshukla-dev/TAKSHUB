const mongoose = require('mongoose');

// One browser / installed app that asked for push notifications.
const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true, maxlength: 1000 },
    keys: {
      p256dh: { type: String, required: true, maxlength: 200 },
      auth: { type: String, required: true, maxlength: 100 },
    },
    userAgent: { type: String, default: '', maxlength: 300 },
    lastSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
