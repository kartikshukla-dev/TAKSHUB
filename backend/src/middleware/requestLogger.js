const morgan = require('morgan');
const mongoose = require('mongoose');
const RequestLog = require('../models/RequestLog');

// Every HTTP request, small or big, is logged twice:
//  1. a readable line on stdout (visible in `pm2 logs taskhub-backend`)
//  2. a row in the `requestlogs` collection (Audit log page -> Requests)
// Health checks are skipped. Socket.io traffic never reaches Express.

const SECRET_QUERY = /^(code|token|access_token|refresh_token|state|password|otp)$/i;

// Query string with secrets masked, e.g. "?code=***&scope=email".
function safeQuery(url = '') {
  const i = url.indexOf('?');
  if (i < 0) return '';
  const params = new URLSearchParams(url.slice(i + 1));
  const parts = [];
  params.forEach((v, k) => parts.push(`${k}=${SECRET_QUERY.test(k) ? '***' : v.slice(0, 200)}`));
  return parts.length ? `?${parts.join('&')}` : '';
}

const pathOf = (req) => (req.originalUrl || req.url || '').split('?')[0];

morgan.token('who', (req) => (req.user && req.user.email) || '-');
morgan.token('safe-url', (req) => `${pathOf(req)}${safeQuery(req.originalUrl || req.url)}`);
morgan.token('client-ip', (req) => req.ip || '-');

const skip = (req) => pathOf(req) === '/api/health' || req.method === 'OPTIONS';

// ---------- DB writer (batched, never blocks a request) ----------
const queue = [];
let timer = null;
const MAX_QUEUE = 5000;

async function flush() {
  timer = null;
  if (!queue.length || mongoose.connection.readyState !== 1) return;
  const batch = queue.splice(0, 500);
  try {
    await RequestLog.insertMany(batch, { ordered: false });
  } catch (err) {
    console.error('[requests] could not write logs:', err.message);
  }
  if (queue.length) schedule(0);
}

function schedule(delay = 2000) {
  if (!timer) timer = setTimeout(flush, delay);
  if (timer.unref) timer.unref();
}

function enqueue(entry) {
  if (queue.length >= MAX_QUEUE) queue.shift(); // DB down for long: drop the oldest
  queue.push(entry);
  if (queue.length >= 200) {
    clearTimeout(timer);
    timer = null;
    schedule(0);
  } else schedule();
}

// morgan calls `format` once the response is finished, so req.user (set
// by requireAuth further down the chain) is available here.
const dbFormat = (tokens, req, res) => {
  const ms = Number(tokens['response-time'](req, res));
  const bytes = Number(tokens.res(req, res, 'content-length'));
  const u = req.user;
  enqueue({
    at: new Date(),
    method: req.method,
    path: pathOf(req).slice(0, 500),
    query: safeQuery(req.originalUrl || req.url).slice(0, 500),
    status: res.headersSent ? res.statusCode : null,
    ms: Number.isFinite(ms) ? Math.round(ms * 10) / 10 : null,
    bytes: Number.isFinite(bytes) ? bytes : null,
    ip: req.ip || '',
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
    referrer: String(req.get('referer') || '').slice(0, 300),
    user: u ? u._id : null,
    userName: u ? u.name || '' : '',
    userEmail: u ? u.email || '' : '',
    userRole: u ? u.role || '' : '',
  });
  return null; // nothing to print; this instance only feeds the DB
};

const CONSOLE_FORMAT = ':date[iso] :client-ip :who ":method :safe-url" :status :res[content-length]b :response-time ms ":user-agent"';

function requestLogger() {
  const test = process.env.NODE_ENV === 'test';
  const toDb = morgan(dbFormat, { skip: (req) => skip(req) || (test && process.env.REQUEST_LOG_DB !== 'on') });
  const toConsole = morgan(CONSOLE_FORMAT, { skip: (req) => skip(req) || test });
  return [toConsole, toDb];
}

module.exports = { requestLogger, safeQuery, flushRequestLogs: flush };
