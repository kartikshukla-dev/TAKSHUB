const nodemailer = require('nodemailer');
const templates = require('./emailTemplates');

/*
 * Email delivery with three interchangeable providers:
 *   - smtp   : any SMTP server via Nodemailer (Gmail app password, Outlook, ...)
 *   - resend : Resend HTTP API      (RESEND_API_KEY)
 *   - brevo  : Brevo HTTP API       (BREVO_API_KEY)
 *
 * EMAIL_PROVIDER picks one explicitly; if unset, the first provider with
 * credentials present wins (resend > brevo > smtp). With nothing configured,
 * sends are skipped and logged so the rest of the app keeps working.
 */

let transporter = null; // nodemailer transport, or a mock injected by tests
let injected = false;
let warned = false;

function env(name) {
  return (process.env[name] || '').trim();
}

// Gmail / Google Workspace via OAuth2 (no password stored): the client id,
// secret and refresh token come from Google Cloud + OAuth Playground.
// Nodemailer swaps the refresh token for fresh access tokens by itself.
function oauthReady() {
  return Boolean(env('SMTP_USER') && env('GMAIL_CLIENT_ID') && env('GMAIL_CLIENT_SECRET') && env('GMAIL_REFRESH_TOKEN'));
}

function smtpReady() {
  if (oauthReady()) return true;
  return Boolean(env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS'));
}

function detectProvider() {
  if (injected) return 'smtp';
  // Jest sets NODE_ENV=test and tests load the real .env; never send real
  // mail from a test run unless a mock transporter was injected.
  if (process.env.NODE_ENV === 'test') return null;
  const ready = {
    resend: Boolean(env('RESEND_API_KEY')),
    brevo: Boolean(env('BREVO_API_KEY')),
    smtp: smtpReady(),
  };
  // EMAIL_PROVIDER=gmail is an alias for the SMTP/Nodemailer provider.
  if (env('EMAIL_PROVIDER').toLowerCase() === 'gmail') return ready.smtp ? 'smtp' : null;
  // An explicit choice only counts once its credentials are filled in, so a
  // half-configured .env falls back to "not configured" instead of erroring.
  const explicit = env('EMAIL_PROVIDER').toLowerCase();
  if (explicit in ready) return ready[explicit] ? explicit : null;
  return ['resend', 'brevo', 'smtp'].find((p) => ready[p]) || null;
}

function fromAddress() {
  return env('EMAIL_FROM') || env('SMTP_FROM') || 'Tasks Manager <info@oncarecancer.com>';
}

// "Name <email>" -> { name, email }
function parseAddress(value) {
  const m = String(value).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim(), email: m[2].trim() } : { name: '', email: String(value).trim() };
}

function recipients(to) {
  return (Array.isArray(to) ? to : String(to).split(','))
    .map((s) => s.trim())
    .filter(Boolean);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!smtpReady()) return null;
  const oauth = oauthReady();
  // OAuth2 implies Gmail; otherwise any SMTP host (Gmail app password,
  // Outlook, ...). Gmail: smtp.gmail.com, port 465.
  const host = env('SMTP_HOST') || 'smtp.gmail.com';
  const port = Number(env('SMTP_PORT')) || (oauth ? 465 : 587);
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: oauth
      ? {
          type: 'OAuth2',
          user: env('SMTP_USER'),
          clientId: env('GMAIL_CLIENT_ID'),
          clientSecret: env('GMAIL_CLIENT_SECRET'),
          refreshToken: env('GMAIL_REFRESH_TOKEN'),
        }
      : { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
    pool: true,
    maxConnections: 3,
    // Fail fast when the host blocks SMTP (Render free blocks 25/465/587)
    // instead of hanging the sign-in request.
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return transporter;
}

// Allows tests to inject a mock transporter.
function setTransporter(mockTransporter) {
  transporter = mockTransporter;
  injected = Boolean(mockTransporter);
}

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message = data?.message || data?.error?.message || data?.name || text || res.statusText;
    const err = new Error(`${res.status} ${message}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const PROVIDERS = {
  async smtp({ from, to, subject, html, text }) {
    const transport = getTransporter();
    if (!transport) throw new Error('SMTP is not configured (SMTP_USER + SMTP_PASS, or Gmail OAuth2 vars)');
    return transport.sendMail({ from, to: to.join(','), subject, html, text });
  },

  async resend({ from, to, subject, html, text }) {
    const key = env('RESEND_API_KEY');
    if (!key) throw new Error('RESEND_API_KEY is not set');
    const data = await postJson('https://api.resend.com/emails', { Authorization: `Bearer ${key}` }, { from, to, subject, html, text });
    return { messageId: data?.id };
  },

  async brevo({ from, to, subject, html, text }) {
    const key = env('BREVO_API_KEY');
    if (!key) throw new Error('BREVO_API_KEY is not set');
    const sender = parseAddress(from);
    const data = await postJson(
      'https://api.brevo.com/v3/smtp/email',
      { 'api-key': key },
      {
        sender: sender.name ? sender : { email: sender.email },
        to: to.map((email) => ({ email })),
        subject,
        htmlContent: html,
        textContent: text,
      }
    );
    return { messageId: data?.messageId };
  },
};

/**
 * Sends one email. Returns the provider result, or null when skipped
 * (no recipients / nothing configured). Throws on delivery errors so
 * callers can decide whether to surface or just log them.
 */
async function sendMail({ to, subject, html, text }) {
  const list = recipients(to || []);
  if (list.length === 0) return null;

  const provider = detectProvider();
  if (!provider) {
    if (!warned) {
      console.warn('[email] No email provider configured (SMTP, Resend or Brevo); emails will be skipped');
      warned = true;
    }
    return null;
  }
  return PROVIDERS[provider]({ from: fromAddress(), to: list, subject, html, text });
}

// Fire-and-forget helper for notification emails.
function sendQuietly(label, payload) {
  return sendMail(payload).catch((err) => {
    console.error(`[email] ${label} failed:`, err.message);
    return null;
  });
}

function status() {
  const provider = detectProvider();
  return {
    provider,
    configured: Boolean(provider),
    from: fromAddress(),
    available: {
      smtp: smtpReady(),
      resend: Boolean(env('RESEND_API_KEY')),
      brevo: Boolean(env('BREVO_API_KEY')),
    },
  };
}

// Kept for backwards compatibility with older callers.
function buildTaskEmailHtml({ task, project, assignee, reporter, eventLabel, eventTime, variant }) {
  return variant === 'completed'
    ? templates.taskCompleted({ task, project, assignee, reporter, eventTime }).html
    : templates.taskAssigned({ task, project, assignee, reporter, eventLabel, eventTime }).html;
}

/**
 * Fired when a task is created (or reassigned). Notifies the assignee only.
 */
async function sendTaskCreatedEmail({ task, project, assignee, reporter, actor, reassigned = false }) {
  if (!assignee || !assignee.email) return null;
  const mail = templates.taskAssigned({
    task,
    project,
    assignee,
    reporter,
    actor,
    eventLabel: reassigned ? 'Task assigned to you' : 'New task assigned to you',
    eventTime: reassigned ? new Date() : task.createdAt || new Date(),
  });
  return sendMail({ to: assignee.email, ...mail });
}

/**
 * Fired when a task's status transitions to "done". Notifies both the
 * assignee and the reporter.
 */
async function sendTaskCompletedEmail({ task, project, assignee, reporter, actor, others = [] }) {
  const to = [...new Set([assignee?.email, reporter?.email, ...others.map((o) => o?.email)].filter(Boolean))];
  if (to.length === 0) return null;
  const mail = templates.taskCompleted({
    task,
    project,
    assignee,
    reporter,
    actor,
    eventTime: task.completedAt || new Date(),
  });
  return sendMail({ to: to.join(','), ...mail });
}

async function sendTaskCommentEmail({ task, project, recipients: people, actor, comment }) {
  const to = [...new Set(people.map((p) => p?.email).filter(Boolean))];
  if (to.length === 0) return null;
  return sendMail({ to, ...templates.taskComment({ task, project, actor, comment }) });
}

// Personalised emails go out one per recipient (they greet by name).
async function sendEach(recipients, build) {
  const seen = new Set();
  const list = recipients.filter((r) => r?.email && !seen.has(r.email) && seen.add(r.email));
  return Promise.all(list.map((r) => sendQuietly('notification', { to: r.email, ...build(r) })));
}

async function sendTaskRequestEmail({ task, project, actor, recipients }) {
  return sendEach(recipients, (recipient) => templates.taskRequest({ task, project, actor, recipient }));
}

async function sendTaskUpdatedEmail({ task, project, actor, changes, recipients }) {
  if (!changes.length) return [];
  return sendEach(recipients, (recipient) => templates.taskUpdated({ task, project, actor, changes, recipient }));
}

// Returns whether a provider actually accepted the code email, so the
// caller can fall back to logging the code in development.
async function sendLoginCodeEmail({ user, code }) {
  if (!detectProvider()) return false;
  await sendMail({ to: user.email, ...templates.loginCode({ user, code }) });
  return true;
}

async function sendInviteEmail({ user, invitedBy, team, role }) {
  return sendMail({ to: user.email, ...templates.invite({ user, invitedBy, team, role }) });
}

async function sendRoleChangedEmail({ user, changedBy, team, previousRole }) {
  return sendMail({ to: user.email, ...templates.roleChanged({ user, changedBy, team, previousRole }) });
}

async function sendTestEmail({ user, to }) {
  const provider = detectProvider();
  if (!provider) {
    const err = new Error('No email provider is configured on the server');
    err.statusCode = 400;
    throw err;
  }
  return sendMail({ to: to || user.email, ...templates.testEmail({ user, provider }) });
}

module.exports = {
  sendMail,
  sendQuietly,
  sendTaskCreatedEmail,
  sendTaskCompletedEmail,
  sendTaskCommentEmail,
  sendTaskRequestEmail,
  sendTaskUpdatedEmail,
  sendLoginCodeEmail,
  sendInviteEmail,
  sendRoleChangedEmail,
  sendTestEmail,
  providerName: () => detectProvider(),
  buildTaskEmailHtml,
  status,
  setTransporter,
  getTransporter,
};
