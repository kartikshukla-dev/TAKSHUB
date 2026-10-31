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

function detectProvider() {
  if (injected) return 'smtp';
  // Jest sets NODE_ENV=test and tests load the real .env; never send real
  // mail from a test run unless a mock transporter was injected.
  if (process.env.NODE_ENV === 'test') return null;
  const explicit = env('EMAIL_PROVIDER').toLowerCase();
  if (['smtp', 'resend', 'brevo'].includes(explicit)) return explicit;
  if (env('RESEND_API_KEY')) return 'resend';
  if (env('BREVO_API_KEY')) return 'brevo';
  if (env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS')) return 'smtp';
  return null;
}

function fromAddress() {
  return env('EMAIL_FROM') || env('SMTP_FROM') || 'Oncare <no-reply@oncare.local>';
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
  if (!(env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS'))) return null;
  const port = Number(env('SMTP_PORT')) || 587;
  transporter = nodemailer.createTransport({
    host: env('SMTP_HOST'),
    port,
    secure: port === 465,
    auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
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
    if (!transport) throw new Error('SMTP is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS)');
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
      smtp: Boolean(env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS')),
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
async function sendTaskCompletedEmail({ task, project, assignee, reporter, actor }) {
  const to = [...new Set([assignee?.email, reporter?.email].filter(Boolean))];
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

async function sendWelcomeEmail({ user, viaGoogle }) {
  if (!user?.email) return null;
  return sendMail({ to: user.email, ...templates.welcome({ user, viaGoogle }) });
}

async function sendPasswordChangedEmail({ user }) {
  if (!user?.email) return null;
  return sendMail({ to: user.email, ...templates.passwordChanged({ user }) });
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
  sendWelcomeEmail,
  sendPasswordChangedEmail,
  sendTestEmail,
  buildTaskEmailHtml,
  status,
  setTransporter,
  getTransporter,
};
