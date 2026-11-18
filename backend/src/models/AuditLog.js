const mongoose = require('mongoose');

// Append-only record of who did what, when and from where.
// Rows are never edited or deleted by the app; MongoDB's TTL index removes
// them after AUDIT_RETENTION_DAYS (default 365).
const RETENTION_DAYS = Math.max(30, Number(process.env.AUDIT_RETENTION_DAYS) || 365);

const auditLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    // Who. Copied (not only referenced) so the log still reads correctly
    // after a user is renamed or their role changes.
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorName: { type: String, default: '' },
    actorEmail: { type: String, default: '' },
    actorRole: { type: String, default: '' },
    // What. e.g. task.update, auth.login.failed, email.sent
    action: { type: String, required: true, index: true },
    category: { type: String, default: 'other', index: true }, // auth, task, user, chat, email, ...
    summary: { type: String, default: '' },
    // On what.
    entity: { type: String, default: '' },
    entityId: { type: String, default: '', index: true },
    entityLabel: { type: String, default: '' },
    // Details: request fields that were sent (secrets removed) and before -> after.
    changes: { type: mongoose.Schema.Types.Mixed, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    // Result + request.
    ok: { type: Boolean, default: true, index: true },
    status: { type: Number, default: null },
    error: { type: String, default: '' },
    method: { type: String, default: '' },
    path: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    durationMs: { type: Number, default: null },
  },
  { versionKey: false }
);

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ at: 1 }, { expireAfterSeconds: RETENTION_DAYS * 86400 });

// Append-only: block every update / delete path through Mongoose.
function readOnly(next) {
  next(new Error('Audit logs are read-only'));
}
['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndReplace'].forEach((op) => {
  auditLogSchema.pre(op, readOnly);
});
auditLogSchema.pre('save', function onlyNew(next) {
  if (!this.isNew) return next(new Error('Audit logs are read-only'));
  return next();
});

auditLogSchema.statics.RETENTION_DAYS = RETENTION_DAYS;

module.exports = mongoose.model('AuditLog', auditLogSchema);
