const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[email] SMTP not configured, emails will be skipped');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

// Allows tests to inject a mock transporter.
function setTransporter(mockTransporter) {
  transporter = mockTransporter;
}

function formatDateTime(date) {
  return new Date(date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

// Table-based, inline-style-only HTML so it renders consistently across
// email clients (Gmail/Outlook strip <style> blocks and don't support
// flexbox/grid). `variant` just swaps the accent color + badge; the literal
// `eventLabel` and `task.priority` strings are always present verbatim in
// the markup (relied on by backend/tests/email.test.js's toContain checks).
function buildTaskEmailHtml({ task, project, assignee, reporter, eventLabel, eventTime, variant }) {
  const accent = variant === 'completed' ? '#16A34A' : '#4338CA';
  const accentBg = variant === 'completed' ? '#DCFCE7' : '#EEF2FF';
  const row = (label, value) => `
    <tr>
      <td style="padding:6px 0;color:#6B7280;font-family:Arial,sans-serif;font-size:13px;width:140px;">${label}</td>
      <td style="padding:6px 0;color:#1E1E2E;font-family:Arial,sans-serif;font-size:13px;font-weight:600;">${value}</td>
    </tr>`;

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:8px;padding:32px;font-family:Arial,sans-serif;">
          <tr>
            <td style="font-size:16px;font-weight:700;color:#4338CA;padding-bottom:16px;">Onacre</td>
          </tr>
          <tr>
            <td style="background:${accentBg};border-radius:6px;padding:10px 16px;color:${accent};font-weight:700;font-size:14px;">
              ${eventLabel}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 0 8px;font-size:20px;font-weight:700;color:#1E1E2E;">${task.title}</td>
          </tr>
          <tr>
            <td style="padding:0 0 16px;color:#6B7280;font-size:13px;">${task.description || '-'}</td>
          </tr>
          <tr>
            <td style="background:#F9FAFB;border-radius:8px;padding:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${row('Project', `${project.name} (${project.key})`)}
                ${row('Priority', task.priority)}
                ${row('Status', task.status)}
                ${row('Assignee', assignee ? assignee.name : 'Unassigned')}
                ${row('Reporter', reporter ? reporter.name : '-')}
                ${row(`${eventLabel} at`, formatDateTime(eventTime))}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:24px;">
              <a href="#" style="background:#4338CA;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px;display:inline-block;">View task in Onacre</a>
            </td>
          </tr>
        </table>
        <table role="presentation" width="600" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0;text-align:center;color:#9CA3AF;font-family:Arial,sans-serif;font-size:11px;">
              You're receiving this because you're linked to this task on Onacre.<br />
              &copy; ${new Date().getFullYear()} Onacre
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  `;
}

async function sendMail({ to, subject, html }) {
  const transport = getTransporter();
  if (!transport || !to) return null;

  const from = process.env.SMTP_FROM || 'TaskHub <no-reply@taskhub.local>';
  return transport.sendMail({ from, to, subject, html });
}

/**
 * Fired when a task is created. Notifies the assignee only (if assigned).
 */
async function sendTaskCreatedEmail({ task, project, assignee, reporter }) {
  if (!assignee || !assignee.email) return null;

  const html = buildTaskEmailHtml({
    task,
    project,
    assignee,
    reporter,
    eventLabel: 'New task assigned to you',
    eventTime: task.createdAt || new Date(),
    variant: 'created',
  });

  return sendMail({
    to: assignee.email,
    subject: `[${project.key}] New task: ${task.title}`,
    html,
  });
}

/**
 * Fired when a task's status transitions to "done". Notifies both the
 * assignee and the reporter.
 */
async function sendTaskCompletedEmail({ task, project, assignee, reporter }) {
  const recipients = [assignee?.email, reporter?.email].filter(Boolean);
  if (recipients.length === 0) return null;

  const html = buildTaskEmailHtml({
    task,
    project,
    assignee,
    reporter,
    eventLabel: 'Task completed',
    eventTime: task.completedAt || new Date(),
    variant: 'completed',
  });

  return sendMail({
    to: recipients.join(','),
    subject: `[${project.key}] Task completed: ${task.title}`,
    html,
  });
}

module.exports = {
  sendTaskCreatedEmail,
  sendTaskCompletedEmail,
  setTransporter,
  getTransporter,
};
