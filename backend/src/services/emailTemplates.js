// Email templates. Table layout + inline styles only, because Gmail and
// Outlook strip <style> blocks and don't support flexbox/grid. Every value
// that can come from a user (titles, names, comments) goes through esc().
// Each template returns { subject, html, text }.

// Email images must be on a public URL (Gmail/Outlook can't load localhost
// or attachments by default), so the Oncare logo is loaded from its website
// unless EMAIL_LOGO_URL points somewhere else.
const LOGO_URL = () => process.env.EMAIL_LOGO_URL || 'https://www.oncarecancer.com/images/favicon.png';

const BRAND = {
  name: 'TaskHub',
  company: 'Oncare',
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

const ROLE_LABEL = { admin: 'Super Admin', manager: 'Team Head', member: 'Member' };

const TONES = {
  info: { accent: BRAND.navy, bg: '#e8f0fb', icon: '&#9679;' },
  success: { accent: '#15803d', bg: '#e8f6ee', icon: '&#10003;' },
  comment: { accent: '#6d3fd1', bg: '#f1eafe', icon: '&#8220;' },
  team: { accent: '#6d3fd1', bg: '#f1eafe', icon: '&#8594;' },
  update: { accent: '#1d6fb8', bg: '#e3f0fb', icon: '&#8635;' },
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
  return `${require('../utils/frontendUrls').primaryFrontendUrl()}${path}`;
}

function formatDate(date, withTime = true) {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return withTime
    ? d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function firstName(person) {
  return person?.name?.split(' ')[0] || 'there';
}

function taskKey(task, project) {
  return project?.key && task?.number ? `${project.key}-${task.number}` : project?.key || '';
}

function teamName(t) {
  return t && typeof t === 'object' && t.name ? t.name : '';
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

function spacer(h = 16) {
  return `<tr><td style="height:${h}px;line-height:${h}px;font-size:0;">&nbsp;</td></tr>`;
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

function routeHtml(task) {
  const from = teamName(task.fromTeam);
  const to = teamName(task.toTeam);
  if (!to) return null;
  const chip = (t) => pill(esc(t), { color: '#6d3fd1', bg: '#f1eafe' });
  return from ? `${chip(from)} <span style="color:${BRAND.muted};">&#8594;</span> ${chip(to)}` : chip(to);
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
  const route = routeHtml(task);
  const rows = [
    ...(route ? [['Team', route]] : []),
    ...(project && !project.system
      ? [['Project', `${esc(project.name)}${project.key ? ` <span style="font-family:${MONO};color:${BRAND.muted};font-size:12px;">${esc(project.key)}</span>` : ''}`]]
      : []),
    // The raw lowercase priority stays the chip text (relied on by tests).
    ['Priority', pill(`<span style="text-transform:capitalize;">${esc(task.priority)}</span>`, priority)],
    ['Status', pill(status.label, status)],
    ['Deadline', task.dueDate ? `<strong>${esc(formatDate(task.dueDate, false))}</strong>` : `<span style="color:${BRAND.muted};">Not set yet</span>`],
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
                  <td width="32" height="32" valign="middle" style="width:32px;height:32px;">
                    <img src="${esc(LOGO_URL())}" width="32" height="32" alt="${BRAND.company}" style="display:block;width:32px;height:32px;border:0;border-radius:7px;">
                  </td>
                  <td style="padding-left:10px;font-family:${FONT};font-size:18px;font-weight:700;color:${BRAND.navy};letter-spacing:-0.01em;">${BRAND.name}<span style="font-weight:500;color:${BRAND.muted};font-size:13px;">&nbsp;&nbsp;by ${BRAND.company}</span></td>
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
                ${spacer(32)}
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

function taskLink(task, project) {
  return project?._id && task?._id ? appUrl(`/projects/${project._id}?task=${task._id}`) : appUrl('/my-tasks');
}

function subjectPrefix(task, project) {
  const key = taskKey(task, project);
  return key ? `[${key}]` : `[${BRAND.name}]`;
}

function textCard(task, project) {
  const lines = [`${taskKey(task, project) ? `${taskKey(task, project)}  ` : ''}${task.title}`];
  if (teamName(task.toTeam)) lines.push(`Team: ${teamName(task.fromTeam) ? `${teamName(task.fromTeam)} -> ` : ''}${teamName(task.toTeam)}`);
  lines.push(`Priority: ${task.priority}   Status: ${(STATUS[task.status] || STATUS.todo).label}`);
  lines.push(`Deadline: ${task.dueDate ? formatDate(task.dueDate, false) : 'not set yet'}`);
  return lines.join('\n');
}

// ---------- account templates ----------

function loginCode({ user, code, minutes = 10 }) {
  const digits = String(code)
    .split('')
    .map(
      (d) =>
        `<td width="44" height="54" align="center" valign="middle" style="width:44px;height:54px;border:1px solid ${BRAND.border};border-radius:8px;background:${BRAND.soft};font-family:${MONO};font-size:26px;font-weight:700;color:${BRAND.navy};">${esc(d)}</td><td width="8" style="width:8px;font-size:0;">&nbsp;</td>`
    )
    .join('');
  const html = layout({
    preheader: `${code} is your ${BRAND.name} sign-in code`,
    heading: 'Your sign-in code',
    body: [
      paragraph(`Hi ${esc(firstName(user))}, use this code to sign in to ${BRAND.name}. It expires in ${minutes} minutes.`, `color:${BRAND.muted};`),
      `<tr><td style="padding:22px 32px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${digits}</tr></table></td></tr>`,
      spacer(20),
      banner('security', `Never share this code. ${BRAND.company} staff will never ask for it.`),
      paragraph(`If you didn&apos;t try to sign in, you can ignore this email. Someone may have typed your address by mistake.`, `font-size:13px;color:${BRAND.muted};`),
    ].join(''),
    footerNote: 'Sign-in emails are always sent, even if notifications are turned off.',
  });
  return {
    subject: `${code} is your ${BRAND.name} sign-in code`,
    html,
    text: `Your ${BRAND.name} sign-in code is ${code}. It expires in ${minutes} minutes. Never share it.`,
  };
}

function invite({ user, invitedBy, team, role }) {
  const link = appUrl(`/login?email=${encodeURIComponent(user.email)}`);
  const html = layout({
    preheader: `${invitedBy?.name || 'Your admin'} invited you to ${BRAND.name}${team ? ` (${team.name})` : ''}`,
    heading: `You're invited to ${BRAND.name}`,
    body: [
      paragraph(
        `Hi ${esc(firstName(user))}, <strong>${esc(invitedBy?.name || 'Your admin')}</strong> added you to the ${BRAND.name} workspace${
          team ? ` in the <strong>${esc(team.name)}</strong> team` : ''
        }.`
      ),
      `<tr><td style="padding:18px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BRAND.border};border-radius:10px;"><tr><td style="padding:6px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${metaRows(
        [
          ['Email', esc(user.email)],
          ['Team', team ? esc(team.name) : '—'],
          ['Role', esc(ROLE_LABEL[role || user.role] || 'Member')],
        ]
      )}</table></td></tr></table></td></tr>`,
      paragraph(
        `To sign in, open ${BRAND.name}, enter this email and we&apos;ll send you a one-time code. You can also use <strong>Continue with Google</strong> with the same email.`,
        `color:${BRAND.muted};font-size:14px;`
      ),
      cta('Accept invite and sign in', link),
    ].join(''),
    footerNote: `You're receiving this because someone invited ${esc(user.email)} to ${BRAND.name}.`,
  });
  return {
    subject: `${invitedBy?.name || 'You'} invited you to ${BRAND.name}`,
    html,
    text: `${invitedBy?.name || 'Your admin'} invited you to ${BRAND.name}${team ? ` (${team.name} team)` : ''}.\nSign in with ${user.email}: ${link}`,
  };
}

function roleChanged({ user, changedBy, team, previousRole }) {
  const label = ROLE_LABEL[user.role] || user.role;
  const what =
    user.role === 'manager'
      ? `You are now the <strong>Team Head</strong>${team ? ` of <strong>${esc(team.name)}</strong>` : ''}. You can set deadlines and assign the tasks sent to your team, and invite your team members.`
      : user.role === 'admin'
        ? 'You are now a <strong>Super Admin</strong>. You can see every team, manage users and give roles.'
        : `You are now a <strong>Member</strong>${team ? ` of <strong>${esc(team.name)}</strong>` : ''}.`;
  const html = layout({
    preheader: `Your ${BRAND.name} role is now ${label}`,
    heading: 'Your access was updated',
    body: [
      spacer(12),
      banner('info', `${esc(ROLE_LABEL[previousRole] || previousRole || '—')} &#8594; ${esc(label)}`),
      paragraph(what),
      paragraph(`Changed by ${esc(changedBy?.name || 'an admin')}.`, `font-size:13px;color:${BRAND.muted};`),
      cta(`Open ${BRAND.name}`, appUrl('/dashboard')),
    ].join(''),
    footerNote: 'Access emails are always sent.',
  });
  return {
    subject: `Your ${BRAND.name} role is now ${label}`,
    html,
    text: `Your ${BRAND.name} role changed from ${ROLE_LABEL[previousRole] || previousRole} to ${label}${team ? ` (${team.name})` : ''}.`,
  };
}

// ---------- task templates ----------

// Sent to the heads of the team a task was raised to.
function taskRequest({ task, project, actor, recipient }) {
  const link = taskLink(task, project);
  const to = teamName(task.toTeam) || 'your team';
  const from = teamName(task.fromTeam);
  const html = layout({
    preheader: `${actor?.name || 'Someone'}${from ? ` (${from})` : ''} raised a task for ${to}: ${task.title}`,
    heading: `New request for ${to}`,
    body: [
      paragraph(
        `Hi ${esc(firstName(recipient))}, <strong>${esc(actor?.name || 'Someone')}</strong>${from ? ` from <strong>${esc(from)}</strong>` : ''} raised a task for your team.`
      ),
      spacer(16),
      banner('team', 'Set a deadline and assign it to someone in your team'),
      taskCard(task, project, [
        ['Raised by', esc(actor?.name || '—')],
        ['Raised at', esc(formatDate(task.createdAt || new Date()))],
      ]),
      cta('Review and assign', link),
    ].join(''),
    footerNote: `You're receiving this because you're a head of ${esc(to)}.`,
  });
  return {
    subject: `${subjectPrefix(task, project)} New request for ${to}: ${task.title}`,
    html,
    text: `${actor?.name || 'Someone'}${from ? ` (${from})` : ''} raised a task for ${to}.\n\n${textCard(task, project)}\n\nReview and assign: ${link}`,
  };
}

// "Assigned to you" (new task or reassignment).
function taskAssigned({ task, project, assignee, reporter, actor, eventLabel = 'New task assigned to you', eventTime }) {
  const by = actor || reporter;
  const link = taskLink(task, project);
  const html = layout({
    preheader: `${by?.name || 'Someone'} assigned you ${taskKey(task, project) ? `${taskKey(task, project)}: ` : ''}${task.title}`,
    heading: `Hi ${firstName(assignee)},`,
    body: [
      paragraph(`<strong>${esc(by?.name || 'Someone')}</strong> assigned you a task${project && !project.system ? ` in <strong>${esc(project.name)}</strong>` : ''}.`),
      spacer(16),
      banner('info', esc(eventLabel)),
      taskCard(task, project, [
        ['Raised by', esc(reporter?.name || '—')],
        ['Assigned at', esc(formatDate(eventTime || task.createdAt || new Date()))],
      ]),
      cta('Open task', link),
    ].join(''),
    footerNote: `You're receiving this because you were assigned this task.`,
  });
  return {
    subject: `${subjectPrefix(task, project)} Assigned to you: ${task.title}`,
    html,
    text: `${by?.name || 'Someone'} assigned you a task.\n\n${textCard(task, project)}\n\nOpen: ${link}`,
  };
}

// One email per update, listing every change (deadline, assignee, status ...).
function taskUpdated({ task, project, actor, changes, recipient }) {
  const link = taskLink(task, project);
  const deadline = changes.find((c) => c.field === 'dueDate');
  const rows = changes
    .map(
      (c, i) => `
      <tr>
        <td width="120" valign="top" style="padding:10px 0;${i ? `border-top:1px solid ${BRAND.border};` : ''}font-family:${FONT};font-size:13px;color:${BRAND.muted};">${esc(c.label)}</td>
        <td valign="top" style="padding:10px 0;${i ? `border-top:1px solid ${BRAND.border};` : ''}font-family:${FONT};font-size:13px;">
          <span style="color:${BRAND.muted};text-decoration:line-through;">${esc(c.from)}</span>
          <span style="color:${BRAND.muted};">&nbsp;&#8594;&nbsp;</span>
          <strong style="color:${BRAND.text};">${esc(c.to)}</strong>
        </td>
      </tr>`
    )
    .join('');
  const heading = deadline ? `Deadline ${deadline.from === 'Not set' ? 'set' : 'changed'}: ${deadline.to}` : 'Task updated';
  const html = layout({
    preheader: `${actor?.name || 'Someone'} updated ${taskKey(task, project) || task.title}: ${changes.map((c) => c.label.toLowerCase()).join(', ')}`,
    heading,
    body: [
      paragraph(`Hi ${esc(firstName(recipient))}, <strong>${esc(actor?.name || 'Someone')}</strong> updated a task you&apos;re following.`),
      `<tr><td style="padding:18px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BRAND.border};border-radius:10px;background:${BRAND.soft};"><tr><td style="padding:4px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table></td></tr>`,
      taskCard(task, project, [['Assignee', esc(task.assignee?.name || 'Unassigned')]]),
      cta('Open task', link),
    ].join(''),
    footerNote: `You're receiving this because you raised, own or lead the team on this task.`,
  });
  return {
    subject: `${subjectPrefix(task, project)} ${deadline ? `Deadline ${deadline.to}` : 'Updated'}: ${task.title}`,
    html,
    text: `${actor?.name || 'Someone'} updated a task.\n\n${changes.map((c) => `${c.label}: ${c.from} -> ${c.to}`).join('\n')}\n\n${textCard(task, project)}\n\nOpen: ${link}`,
  };
}

function taskCompleted({ task, project, assignee, reporter, actor, eventTime }) {
  const link = taskLink(task, project);
  const doneBy = actor || assignee;
  const html = layout({
    preheader: `${taskKey(task, project) ? `${taskKey(task, project)} ` : ''}${task.title} was marked done`,
    heading: 'Task completed 🎉',
    body: [
      paragraph(`<strong>${esc(doneBy?.name || 'Someone')}</strong> marked a task as done.`),
      spacer(16),
      banner('success', 'Task completed'),
      taskCard(task, project, [
        ['Assignee', esc(assignee?.name || 'Unassigned')],
        ['Raised by', esc(reporter?.name || '—')],
        ['Completed at', esc(formatDate(eventTime || task.completedAt || new Date()))],
      ]),
      cta('View task', link, '#15803d'),
    ].join(''),
    footerNote: `You're receiving this because you raised, own or lead the team on this task.`,
  });
  return {
    subject: `${subjectPrefix(task, project)} Task completed: ${task.title}`,
    html,
    text: `Task completed.\n\n${textCard(task, project)}\nAssignee: ${assignee?.name || 'Unassigned'}\n\nView: ${link}`,
  };
}

function taskComment({ task, project, actor, comment }) {
  const link = taskLink(task, project);
  const quoted = esc(comment.length > 600 ? `${comment.slice(0, 600)}…` : comment).replace(/\n/g, '<br>');
  const html = layout({
    preheader: `${actor?.name || 'Someone'}: ${comment.slice(0, 90)}`,
    heading: `New comment on ${taskKey(task, project) || 'your task'}`,
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
      cta(`Reply in ${BRAND.name}`, link),
    ].join(''),
    footerNote: `You're receiving this because you raised, own or lead the team on this task.`,
  });
  return {
    subject: `${subjectPrefix(task, project)} New comment: ${task.title}`,
    html,
    text: `${actor?.name || 'Someone'} commented:\n\n${comment}\n\n${textCard(task, project)}\n\nReply: ${link}`,
  };
}

function testEmail({ user, provider }) {
  const html = layout({
    preheader: 'Email delivery is working.',
    heading: 'Email delivery works ✅',
    body: [
      spacer(12),
      banner('success', `Sent through ${esc(provider)}`),
      paragraph(`Hi ${esc(user?.name || 'there')}, this is a test email from ${BRAND.name}. If you can read it, sign-in codes and notifications will reach your team.`),
      cta(`Open ${BRAND.name}`, appUrl('/settings')),
    ].join(''),
    footerNote: 'Sent from Settings → Email delivery.',
  });
  return { subject: `${BRAND.name} test email`, html, text: `Test email from ${BRAND.name}, sent through ${provider}.` };
}

// Sample data for the in-app preview (Settings → Email delivery).
function previews() {
  const project = { _id: 'p1', name: 'Team requests', key: 'REQ', system: true };
  const task = {
    _id: 't1',
    number: 12,
    title: 'Monthly patient report for the board',
    description: 'Need the October numbers by region with a one-page summary. Format like last month, please.',
    priority: 'high',
    status: 'todo',
    fromTeam: { name: 'Operations' },
    toTeam: { name: 'Data' },
    dueDate: null,
    createdAt: new Date(),
  };
  const head = { name: 'Anvi Singh', email: 'anvi@example.com' };
  const raiser = { name: 'Srishti Bisht', email: 'srishti@example.com' };
  const member = { name: 'Rahul Verma', email: 'rahul@example.com', role: 'member' };
  const withDeadline = { ...task, dueDate: new Date(Date.now() + 5 * 86400000), assignee: member, status: 'in-progress' };
  return {
    'login-code': loginCode({ user: member, code: '482913' }),
    invite: invite({ user: member, invitedBy: head, team: { name: 'Data' }, role: 'member' }),
    'role-changed': roleChanged({ user: { ...head, role: 'manager' }, changedBy: { name: 'Kartik' }, team: { name: 'Data' }, previousRole: 'member' }),
    'team-request': taskRequest({ task, project, actor: raiser, recipient: head }),
    'task-assigned': taskAssigned({ task: withDeadline, project, assignee: member, reporter: raiser, actor: head }),
    'task-updated': taskUpdated({
      task: withDeadline,
      project,
      actor: head,
      recipient: raiser,
      changes: [
        { field: 'dueDate', label: 'Deadline', from: 'Not set', to: formatDate(withDeadline.dueDate, false) },
        { field: 'assignee', label: 'Assignee', from: 'Unassigned', to: member.name },
        { field: 'status', label: 'Status', from: 'To do', to: 'In progress' },
      ],
    }),
    'task-completed': taskCompleted({ task: { ...withDeadline, status: 'done', completedAt: new Date() }, project, assignee: member, reporter: raiser }),
    'task-comment': taskComment({ task: withDeadline, project, actor: head, comment: 'Rahul has started on this. We will share a draft by Wednesday.' }),
  };
}

module.exports = {
  loginCode,
  invite,
  roleChanged,
  taskRequest,
  taskAssigned,
  taskUpdated,
  taskCompleted,
  taskComment,
  testEmail,
  previews,
  esc,
  formatDate,
  STATUS,
  ROLE_LABEL,
};
