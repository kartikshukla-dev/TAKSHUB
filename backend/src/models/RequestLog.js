const mongoose = require('mongoose');

// One row per HTTP request (morgan). Much more volume than the audit log,
// so it is kept for REQUEST_LOG_DAYS (default 30) and then removed by
// MongoDB's TTL index.
const RETENTION_DAYS = Math.max(1, Number(process.env.REQUEST_LOG_DAYS) || 30);

const requestLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    method: { type: String, default: '' },
    path: { type: String, default: '', index: true },
    query: { type: String, default: '' },
    status: { type: Number, default: null, index: true },
    ms: { type: Number, default: null },
    bytes: { type: Number, default: null },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    referrer: { type: String, default: '' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    userName: { type: String, default: '' },
    userEmail: { type: String, default: '' },
    userRole: { type: String, default: '' },
  },
  { versionKey: false }
);

requestLogSchema.index({ at: -1 });
requestLogSchema.index({ at: 1 }, { expireAfterSeconds: RETENTION_DAYS * 86400 });

requestLogSchema.statics.RETENTION_DAYS = RETENTION_DAYS;

module.exports = mongoose.model('RequestLog', requestLogSchema);
