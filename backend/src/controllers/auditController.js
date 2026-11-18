const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const RequestLog = require('../models/RequestLog');
const catchAsync = require('../utils/catchAsync');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Filters: actor (user id), action (prefix, e.g. "task" or "auth.login"),
// category, entityId, ok (true/false), from / to (dates), q (free text).
function buildFilter(query) {
  const f = {};
  if (query.actor && mongoose.Types.ObjectId.isValid(query.actor)) f.actor = query.actor;
  if (query.category) f.category = String(query.category);
  if (query.action) f.action = new RegExp(`^${escapeRegex(query.action)}`);
  if (query.entityId) f.entityId = String(query.entityId);
  if (query.ok === 'true' || query.ok === 'false') f.ok = query.ok === 'true';
  if (query.from || query.to) {
    f.at = {};
    if (query.from) f.at.$gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      // A bare date means "until the end of that day".
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.to))) to.setHours(23, 59, 59, 999);
      f.at.$lte = to;
    }
  }
  if (query.q) {
    const rx = new RegExp(escapeRegex(String(query.q).slice(0, 100)), 'i');
    f.$or = [{ actorName: rx }, { actorEmail: rx }, { summary: rx }, { entityLabel: rx }, { action: rx }, { ip: rx }, { path: rx }];
  }
  return f;
}

// GET /api/admin/audit?page=1&limit=50&...filters
const listAudit = catchAsync(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filter = buildFilter(req.query);
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.status(200).json({ logs, total, page, pages: Math.max(1, Math.ceil(total / limit)), retentionDays: AuditLog.RETENTION_DAYS });
});

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Quote, double inner quotes, and neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

// GET /api/admin/audit/export?...filters  (CSV, newest first, max 50k rows)
const exportAudit = catchAsync(async (req, res) => {
  const filter = buildFilter(req.query);
  const cols = ['at', 'actorName', 'actorEmail', 'actorRole', 'action', 'summary', 'entity', 'entityLabel', 'entityId', 'ok', 'status', 'error', 'method', 'path', 'ip', 'userAgent', 'changes', 'meta'];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.write(`\ufeff${cols.join(',')}\n`);
  const cursor = AuditLog.find(filter).sort({ at: -1 }).limit(50000).lean().cursor();
  // eslint-disable-next-line no-restricted-syntax
  for await (const row of cursor) {
    res.write(`${cols.map((c) => csvCell(c === 'at' ? new Date(row.at).toISOString() : row[c])).join(',')}\n`);
  }
  res.end();
});

// GET /api/admin/audit/facets : people and action names for the filters.
const auditFacets = catchAsync(async (req, res) => {
  const [actions, actors] = await Promise.all([
    AuditLog.distinct('action'),
    AuditLog.aggregate([
      { $match: { actor: { $ne: null } } },
      { $group: { _id: '$actor', name: { $last: '$actorName' }, email: { $last: '$actorEmail' } } },
      { $sort: { name: 1 } },
    ]),
  ]);
  res.status(200).json({ actions: actions.sort(), actors: actors.map((a) => ({ _id: a._id, name: a.name, email: a.email })) });
});

// ---------- request logs (morgan) ----------
// Filters: user, method, status ("2xx" / "4xx" / "5xx" / exact), slow (ms),
// from / to, q (path, IP, email, browser).
function buildRequestFilter(query) {
  const f = {};
  if (query.user && mongoose.Types.ObjectId.isValid(query.user)) f.user = query.user;
  if (query.method) f.method = String(query.method).toUpperCase();
  if (query.status) {
    const s = String(query.status);
    if (/^[1-5]xx$/.test(s)) {
      const base = Number(s[0]) * 100;
      f.status = { $gte: base, $lt: base + 100 };
    } else if (/^\d{3}$/.test(s)) f.status = Number(s);
  }
  if (query.slow && Number(query.slow) > 0) f.ms = { $gte: Number(query.slow) };
  if (query.from || query.to) {
    f.at = {};
    if (query.from) f.at.$gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.to))) to.setHours(23, 59, 59, 999);
      f.at.$lte = to;
    }
  }
  if (query.q) {
    const rx = new RegExp(escapeRegex(String(query.q).slice(0, 100)), 'i');
    f.$or = [{ path: rx }, { ip: rx }, { userEmail: rx }, { userName: rx }, { userAgent: rx }];
  }
  return f;
}

// GET /api/admin/requests?page=&limit=&...filters
const listRequests = catchAsync(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filter = buildRequestFilter(req.query);
  const [logs, total] = await Promise.all([
    RequestLog.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    RequestLog.countDocuments(filter),
  ]);
  res.status(200).json({ logs, total, page, pages: Math.max(1, Math.ceil(total / limit)), retentionDays: RequestLog.RETENTION_DAYS });
});

// GET /api/admin/requests/export (CSV, max 100k rows)
const exportRequests = catchAsync(async (req, res) => {
  const filter = buildRequestFilter(req.query);
  const cols = ['at', 'method', 'path', 'query', 'status', 'ms', 'bytes', 'userName', 'userEmail', 'userRole', 'ip', 'userAgent', 'referrer'];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="request-log-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.write(`\ufeff${cols.join(',')}\n`);
  const cursor = RequestLog.find(filter).sort({ at: -1 }).limit(100000).lean().cursor();
  // eslint-disable-next-line no-restricted-syntax
  for await (const row of cursor) {
    res.write(`${cols.map((c) => csvCell(c === 'at' ? new Date(row.at).toISOString() : row[c])).join(',')}\n`);
  }
  res.end();
});

module.exports = { listAudit, exportAudit, auditFacets, buildFilter, listRequests, exportRequests };
