// Email templates. Table layout + inline styles only, because Gmail and
// Outlook strip <style> blocks and don't support flexbox/grid. Every value
// that can come from a user (titles, names, comments) goes through esc().

const BRAND = {
  name: 'Oncare',
  navy: '#002f70',
  purple: '#9966ff',
  text: '#0f1b2d',
  muted: '#596475',
  border: '#dde4e9',
  canvas: '#f4f7fb',
  soft: '#f7f9fc',
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

const STATUS = {
  todo: { label: 'To do', color: '#596475', bg: '#eef2f5' },
  'in-progress': { label: 'In progress', color: '#1d6fb8', bg: '#e3f0fb' },
  'in-review': { label: 'In review', color: '#8a3fd1', bg: '#f4e9fe' },
  done: { label: 'Done', color: '#15803d', bg: '#e8f6ee' },
};

const PRIORITY = {
  low: { color: '#596475', bg: '#eef2f5' },
  medium: { color: '#1d6fb8', bg: '#e3f0fb' },
  high: { color: '#b45309', bg: '#fdf0d8' },
  urgent: { color: '#b91c1c', bg: '#fde4e4' },
};

const TONES = {
  info: { accent: BRAND.navy, bg: '#e8f0fb', icon: '&#9679;' },
  success: { accent: '#15803d', bg: '#e8f6ee', icon: '&#10003;' },
  comment: { accent: '#6d3fd1', bg: '#f1eafe', icon: '&#8220;' },
  security: { accent: '#b45309', bg: '#fdf3e3', icon: '&#9888;' },
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appUrl(path = '') {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}${path}`;
}

function formatDate(date, withTime = true) {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return withTime
    ? d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function taskKey(task, project) {
  return project?.key && task?.number ? `${project.key}-${task.number}` : project?.key || '';
}

// ---------- building blocks ----------

function pill(text, { color, bg }) {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${bg};color:${color};font-size:12px;font-weight:600;line-height:18px;white-space:nowrap;">${text}</span>`;
}

function button(label, href, color = BRAND.navy) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0;">
    <tr>
      <td style="border-radius:8px;background:${color};">
        <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(label)}</a>
      </td>
    </tr>
  </table>`;
}

function avatar(name) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="32" height="32" align="center" valign="middle" style="width:32px;height:32px;border-radius:16px;background:#dfedf6;color:${BRAND.navy};font-family:${FONT};font-size:12px;font-weight:700;">${esc(initials(name))}</td></tr></table>`;
}

function banner(tone, text) {
  const t = TONES[tone] || TONES.info;
  return `
  <tr>
    <td style="padding:0 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${t.bg};border-radius:8px;">
        <tr>
          <td width="36" valign="middle" style="padding:12px 0 12px 14px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="22" height="22" align="center" valign="middle" style="width:22px;height:22px;border-radius:11px;background:${t.accent};color:#ffffff;font-family:${FONT};font-size:12px;font-weight:700;line-height:22px;">${t.icon}</td></tr></table>
          </td>
          <td valign="middle" style="padding:12px 14px 12px 4px;font-family:${FONT};font-size:14px;font-weight:600;color:${t.accent};">${text}</td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function metaRows(rows) {
  return rows
    .map(
      ([label, value], i) => `
      <tr>
        <td width="130" valign="top" style="padding:9px 0;${i ? `border-top:1px solid ${BRAND.border};` : ''}font-family:${FONT};font-size:13px;color:${BRAND.muted};">${label}</td>
        <td valign="top" style="padding:9px 0;${i ? `border-top:1px solid ${BRAND.border};` : ''}font-family:${FONT};font-size:13px;color:${BRAND.text};font-weight:500;">${value}</td>
      </tr>`
    )
    .join('');
}

// The task "card": key + title + description + a key/value table.
function taskCard(task, project, extraRows = []) {
  const status = STATUS[task.status] || STATUS.todo;
  const priority = PRIORITY[task.priority] || PRIORITY.medium;
  const key = taskKey(task, project);
  const description = task.description
    ? `<p style="margin:8px 0 0;font-family:${FONT};font-size:14px;line-height:21px;color:${BRAND.muted};">${esc(
        task.description.length > 280 ? `${task.description.slice(0, 280)}…` : task.description
      )}</p>`
    : '';
  const rows = [
    ['Project', `${esc(project?.name || '—')}${project?.key ? ` <span style="font-family:${MONO};color:${BRAND.muted};font-size:12px;">${esc(project.key)}</span>` : ''}`],
    // The raw lowercase priority stays the chip text (relied on by tests and
    // easy to scan); CSS capitalises it visually where supported.
    ['Priority', pill(`<span style="text-transform:capitalize;">${esc(task.priority)}</span>`, priority)],
    ['Status', pill(status.label, status)],
    ...(task.dueDate ? [['Due date', esc(formatDate(task.dueDate, false))]] : []),
    ...extraRows,
  ];
  return `
  <tr>
    <td style="padding:20px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BRAND.border};border-radius:10px;">
        <tr>
          <td style="padding:18px 20px 6px;">
            ${key ? `<div style="font-family:${MONO};font-size:12px;color:${BRAND.muted};letter-spacing:0.02em;">${esc(key)}</div>` : ''}
            <div style="margin-top:4px;font-family:${FONT};font-size:19px;line-height:26px;font-weight:700;color:${BRAND.text};">${esc(task.title)}</div>
            ${description}
          </td>
        </tr>
        <tr>
          <td style="padding:6px 20px 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${metaRows(rows)}</table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function paragraph(html, style = '') {
  return `<tr><td style="padding:16px 32px 0;font-family:${FONT};font-size:15px;line-height:23px;color:${BRAND.text};${style}">${html}</td></tr>`;
}

function cta(label, href, color) {
  return `<tr><td style="padding:24px 32px 4px;">${button(label, href, color)}</td></tr>`;
}

/**
 * Wraps body rows in the shared shell: preheader, brand header, white card,
 * footer with a link to notification settings.
 */
function layout({ preheader, heading, body, footerNote }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.canvas};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
          <tr>
            <td style="padding:0 4px 18px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="30" height="30" align="center" valign="middle" style="width:30px;height:30px;border-radius:8px;background:${BRAND.navy};">
                    <span style="display:inline-block;width:12px;height:14px;border-radius:7px 7px 6px 6px;background:${BRAND.purple};"></span>
                  </td>
                  <td style="padding-left:10px;font-family:${FONT};font-size:18px;font-weight:700;color:${BRAND.navy};letter-spacing:-0.01em;">${BRAND.name}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid ${BRAND.border};border-radius:12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:4px;line-height:4px;font-size:0;border-radius:12px 12px 0 0;background:${BRAND.navy};background-image:linear-gradient(90deg,${BRAND.navy},${BRAND.purple});">&nbsp;</td></tr>
                <tr>
                  <td style="padding:28px 32px 4px;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:${BRAND.text};letter-spacing:-0.01em;">${esc(heading)}</td>
                </tr>
                ${body}
                <tr><td style="height:32px;line-height:32px;font-size:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${BRAND.muted};text-align:center;">
              ${footerNote ? `${footerNote}<br>` : ''}
              <a href="${esc(appUrl('/settings'))}" style="color:${BRAND.muted};text-decoration:underline;">Notification settings</a>
              &nbsp;·&nbsp; &copy; ${new Date().getFullYear()} ${BRAND.name}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------- templates ----------
// Each returns { subject, html, text }.

function taskLink(task, project) {
  return project?._id && task?._id ? appUrl(`/projects/${project._id}?task=${task._id}`) : appUrl('/my-tasks');
}

// "Assigned to you" (new task or reassignment).
function taskAssigned({ task, project, assignee, reporter, actor, eventLabel = 'New task assigned to you', eventTime }) {
  const key = taskKey(task, project);
  const by = actor || reporter;
  const link = taskLink(task, project);
  const html = layout({
    preheader: `${by?.name || 'Someone'} assigned you ${key ? `${key}: ` : ''}${task.title}`,
    heading: `Hi ${assignee?.name?.split(' ')[0] || 'there'},`,
    body: [
      paragraph(`<strong>${esc(by?.name || 'Someone')}</strong> assigned you a task in <strong>${esc(project?.name || 'a project')}</strong>.`),
      `<tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>`,
      banner('info', esc(eventLabel)),
      taskCard(task, project, [
        ['Reporter', esc(reporter?.name || '—')],
        ['Assigned at', esc(formatDate(eventTime || task.createdAt || new Date()))],
      ]),
      cta('Open task', link),
    ].join(''),
    footerNote: `You're receiving this because you were assigned this task.`,
  });
  const text = [
    `${by?.name || 'Someone'} assigned you a task in ${project?.name || 'a project'}.`,
    '',
    `${key ? `${key}  ` : ''}${task.title}`,
    `Priority: ${task.priority}   Status: ${(STATUS[task.status] || STATUS.todo).label}`,
    task.dueDate ? `Due: ${formatDate(task.dueDate, false)}` : '',
    '',
    `Open: ${link}`,
  ]
    .filter((l) => l !== null)
    .join('\n');
  return { subject: `[${project?.key || BRAND.name}] ${eventLabel === 'New task assigned to you' ? 'New task' : 'Assigned to you'}: ${task.title}`, html, text };
}

function taskCompleted({ task, project, assignee, reporter, actor, eventTime }) {
  const key = taskKey(task, project);
  const link = taskLink(task, project);
  const doneBy = actor || assignee;
  const html = layout({
    preheader: `${key ? `${key} ` : ''}${task.title} was marked done`,
    heading: 'Task completed 🎉',
    body: [
      paragraph(
        `<strong>${esc(doneBy?.name || 'Someone')}</strong> marked a task as done in <strong>${esc(project?.name || 'a project')}</strong>.`
      ),
      `<tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>`,
      banner('success', 'Task completed'),
      taskCard(task, project, [
        ['Assignee', esc(assignee?.name || 'Unassigned')],
        ['Reporter', esc(reporter?.name || '—')],
        ['Completed at', esc(formatDate(eventTime || task.completedAt || new Date()))],
      ]),
      cta('View task', link, '#15803d'),
    ].join(''),
    footerNote: `You're receiving this because you're the assignee or reporter of this task.`,
  });
  const text = [
    `Task completed in ${project?.name || 'a project'}.`,
    '',
    `${key ? `${key}  ` : ''}${task.title}`,
    `Assignee: ${assignee?.name || 'Unassigned'}   Reporter: ${reporter?.name || '—'}`,
    '',
    `View: ${link}`,
  ].join('\n');
  return { subject: `[${project?.key || BRAND.name}] Task completed: ${task.title}`, html, text };
}

function taskComment({ task, project, actor, comment }) {
  const key = taskKey(task, project);
  const link = taskLink(task, project);
  const quoted = esc(comment.length > 600 ? `${comment.slice(0, 600)}…` : comment).replace(/\n/g, '<br>');
  const html = layout({
    preheader: `${actor?.name || 'Someone'}: ${comment.slice(0, 90)}`,
    heading: `New comment on ${key || 'your task'}`,
    body: [
      `<tr>
        <td style="padding:16px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="44" valign="top">${avatar(actor?.name)}</td>
              <td valign="top">
                <div style="font-family:${FONT};font-size:14px;color:${BRAND.text};"><strong>${esc(actor?.name || 'Someone')}</strong> <span style="color:${BRAND.muted};">commented</span></div>
                <div style="margin-top:8px;padding:12px 14px;border-left:3px solid ${BRAND.purple};background:${BRAND.soft};border-radius:0 8px 8px 0;font-family:${FONT};font-size:14px;line-height:21px;color:${BRAND.text};">${quoted}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`,
      taskCard(task, project),
      cta('Reply in Oncare', link),
    ].join(''),
    footerNote: `You're receiving this because you're the assignee or reporter of this task.`,
  });
  const text = [`${actor?.name || 'Someone'} commented on ${key ? `${key} ` : ''}${task.title}:`, '', comment, '', `Reply: ${link}`].join('\n');
  return { subject: `[${project?.key || BRAND.name}] New comment: ${task.title}`, html, text };
}

function welcome({ user, viaGoogle = false }) {
  const link = appUrl('/dashboard');
  const steps = [
    ['Check your dashboard', 'See what is assigned to you, what is due and what is overdue.'],
    ['Open your projects', 'Track work on a list or a board, and drag cards as they move.'],
    ['Stay in the loop', 'Chat with your team and turn on notifications in Settings.'],
  ];
  const stepRows = steps
    .map(
      ([title, body], i) => `
      <tr>
        <td width="40" valign="top" style="padding:10px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;border-radius:13px;background:#dfedf6;color:${BRAND.navy};font-family:${FONT};font-size:12px;font-weight:700;">${i + 1}</td></tr></table>
        </td>
        <td valign="top" style="padding:10px 0;font-family:${FONT};">
          <div style="font-size:14px;font-weight:600;color:${BRAND.text};">${title}</div>
          <div style="font-size:13px;line-height:19px;color:${BRAND.muted};">${body}</div>
        </td>
      </tr>`
    )
    .join('');
  const html = layout({
    preheader: `Your ${BRAND.name} account is ready.`,
    heading: `Welcome to ${BRAND.name}, ${user?.name?.split(' ')[0] || 'there'}!`,
    body: [
      paragraph(
        `Your account is ready${viaGoogle ? ' and linked to your Google sign-in' : ''}. ${BRAND.name} is your team&apos;s private workspace for projects, tasks and chat.`,
        `color:${BRAND.muted};`
      ),
      `<tr><td style="padding:12px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${stepRows}</table></td></tr>`,
      cta(`Open ${BRAND.name}`, link),
      paragraph(`Signed up as <strong>${esc(user?.email)}</strong>.`, `font-size:13px;color:${BRAND.muted};`),
    ].join(''),
    footerNote: `You're receiving this because an account was created with this email.`,
  });
  const text = [
    `Welcome to ${BRAND.name}, ${user?.name || ''}!`,
    '',
    'Your account is ready.',
    ...steps.map(([t, b], i) => `${i + 1}. ${t} - ${b}`),
    '',
    `Open: ${link}`,
  ].join('\n');
  return { subject: `Welcome to ${BRAND.name}`, html, text };
}

function passwordChanged({ user, at = new Date() }) {
  const html = layout({
    preheader: `Your ${BRAND.name} password was changed.`,
    heading: 'Your password was changed',
    body: [
      `<tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>`,
      banner('security', 'Security notice'),
      paragraph(
        `The password for <strong>${esc(user?.email)}</strong> was changed on <strong>${esc(formatDate(at))}</strong>.`
      ),
      paragraph(
        `If this was you, you don&apos;t need to do anything. If it wasn&apos;t, sign in and change your password right away, and tell your workspace admin.`,
        `color:${BRAND.muted};`
      ),
      cta('Go to settings', appUrl('/settings'), '#b45309'),
    ].join(''),
    footerNote: 'Security emails are always sent, even if notifications are turned off.',
  });
  const text = `Your ${BRAND.name} password for ${user?.email} was changed on ${formatDate(at)}.\nIf this wasn't you, change it now: ${appUrl('/settings')}`;
  return { subject: `Your ${BRAND.name} password was changed`, html, text };
}

function testEmail({ user, provider }) {
  const html = layout({
    preheader: 'Email delivery is working.',
    heading: 'Email delivery works ✅',
    body: [
      `<tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>`,
      banner('success', `Sent through ${esc(provider)}`),
      paragraph(`Hi ${esc(user?.name || 'there')}, this is a test email from ${BRAND.name}. If you can read it, notifications will reach your team.`),
      cta(`Open ${BRAND.name}`, appUrl('/settings')),
    ].join(''),
    footerNote: 'Sent from Settings → Email delivery.',
  });
  return {
    subject: `${BRAND.name} test email`,
    html,
    text: `This is a test email from ${BRAND.name}, sent through ${provider}. Delivery works.`,
  };
}

// Sample data for the in-app preview (Settings → Email delivery).
function previews() {
  const project = { _id: 'p1', name: 'Website Revamp', key: 'WEB' };
  const task = {
    _id: 't1',
    number: 12,
    title: 'Design the new homepage hero',
    description: 'Hero section with headline, sub-copy and two CTAs. Mobile first, please share a Figma link when ready.',
    priority: 'high',
    status: 'todo',
    dueDate: new Date(Date.now() + 3 * 86400000),
    createdAt: new Date(),
  };
  const assignee = { name: 'Neha Sharma', email: 'neha@example.com' };
  const reporter = { name: 'Priya Mehta', email: 'priya@example.com' };
  return {
    welcome: welcome({ user: { name: 'Neha Sharma', email: 'neha@example.com' } }),
    'task-assigned': taskAssigned({ task, project, assignee, reporter }),
    'task-completed': taskCompleted({ task: { ...task, status: 'done', completedAt: new Date() }, project, assignee, reporter }),
    'task-comment': taskComment({ task: { ...task, status: 'in-review' }, project, actor: reporter, comment: 'Looks great! Can we try a darker navy for the primary button?' }),
    'password-changed': passwordChanged({ user: assignee }),
  };
}

module.exports = { taskAssigned, taskCompleted, taskComment, welcome, passwordChanged, testEmail, previews, esc };
