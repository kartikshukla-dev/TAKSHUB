const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');

// Fields that never go into the log, wherever they appear.
const SECRET_KEYS = /^(code|otp|password|pass|token|accessToken|refreshToken|secret|apiKey|authorization)$/i;
// Private content: chat text stays out of the log (only "sent a message").
const PRIVATE_KEYS = /^(text|snippet)$/i;
const MAX_STRING = 300;
const MAX_KEYS = 40;

function clean(value, depth = 0, privateFields = false) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (${value.length} chars)` : value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (depth > 3) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => clean(v, depth + 1, privateFields));
  const out = {};
  Object.keys(value)
    .slice(0, MAX_KEYS)
    .forEach((k) => {
      if (SECRET_KEYS.test(k)) out[k] = '[hidden]';
      else if (privateFields && PRIVATE_KEYS.test(k)) out[k] = '[private]';
      else out[k] = clean(value[k], depth + 1, privateFields);
    });
  return out;
}

// Route pattern -> action name. First match wins; method + pattern otherwise.
const ROUTES = [
  ['POST /api/auth/otp/request', 'auth.code_requested', 'auth', 'Requested a sign-in code'],
  ['POST /api/auth/otp/verify', 'auth.login', 'auth', 'Signed in with a code'],
  ['POST /api/auth/logout', 'auth.logout', 'auth', 'Signed out'],
  ['GET /api/auth/google/callback', 'auth.login_google', 'auth', 'Signed in with Google'],

  ['POST /api/tasks', 'task.create', 'task', 'Created a task'],
  ['POST /api/projects/:projectId/tasks', 'task.create', 'task', 'Created a task'],
  ['PATCH /api/projects/:projectId/tasks/:id', 'task.update', 'task', 'Updated a task'],
  ['DELETE /api/projects/:projectId/tasks/:id', 'task.delete', 'task', 'Deleted a task'],
  ['POST /api/projects/:projectId/tasks/:id/comments', 'task.comment', 'task', 'Commented on a task'],
  ['POST /api/projects/:projectId/tasks/:id/attachments', 'task.attachment_upload', 'task', 'Attached a file'],
  ['GET /api/projects/:projectId/tasks/:id/attachments/:fileId', 'task.attachment_download', 'task', 'Downloaded an attachment'],
  ['POST /api/projects/:projectId/tasks/:id/subtasks', 'subtask.create', 'task', 'Added a subtask'],
  ['PUT /api/projects/:projectId/tasks/:id/subtasks/order', 'subtask.reorder', 'task', 'Reordered subtasks'],
  ['PATCH /api/projects/:projectId/tasks/:id/subtasks/:sid', 'subtask.update', 'task', 'Updated a subtask'],
  ['DELETE /api/projects/:projectId/tasks/:id/subtasks/:sid', 'subtask.delete', 'task', 'Deleted a subtask'],

  ['POST /api/projects', 'project.create', 'project', 'Created a project'],
  ['PATCH /api/projects/:id', 'project.update', 'project', 'Updated a project'],
  ['DELETE /api/projects/:id', 'project.delete', 'project', 'Deleted a project'],
  ['POST /api/projects/:id/members', 'project.member_add', 'project', 'Added a project member'],
  ['DELETE /api/projects/:id/members/:userId', 'project.member_remove', 'project', 'Removed a project member'],

  ['POST /api/invites', 'user.invite', 'user', 'Invited someone'],
  ['POST /api/invites/:id/resend', 'user.invite_resend', 'user', 'Resent an invite'],
  ['DELETE /api/invites/:id', 'user.invite_cancel', 'user', 'Cancelled an invite'],
  ['PATCH /api/users/me', 'user.profile_update', 'user', 'Updated own profile'],
  ['PATCH /api/users/:id', 'user.update', 'user', 'Changed a user'],

  ['POST /api/departments', 'team.create', 'team', 'Created a team'],
  ['PATCH /api/departments/:id', 'team.update', 'team', 'Renamed a team'],
  ['DELETE /api/departments/:id', 'team.delete', 'team', 'Deleted a team'],

  ['POST /api/todos', 'todo.create', 'todo', 'Added a to-do'],
  ['PATCH /api/todos/:id', 'todo.update', 'todo', 'Updated a to-do'],
  ['DELETE /api/todos/:id', 'todo.delete', 'todo', 'Deleted a to-do'],

  ['POST /api/chat/conversations', 'chat.conversation_create', 'chat', 'Started a conversation'],
  ['PATCH /api/chat/conversations/:id', 'chat.conversation_update', 'chat', 'Renamed a conversation'],
  ['POST /api/chat/conversations/:id/members', 'chat.member_add', 'chat', 'Added people to a conversation'],
  ['DELETE /api/chat/conversations/:id/members/:userId', 'chat.member_remove', 'chat', 'Removed someone from a conversation'],
  ['POST /api/chat/conversations/:id/join', 'chat.channel_join', 'chat', 'Joined a channel'],
  ['POST /api/chat/conversations/:id/mute', 'chat.mute', 'chat', 'Muted / unmuted a conversation'],
  ['POST /api/chat/conversations/:id/star', 'chat.star', 'chat', 'Starred / unstarred a conversation'],
  ['POST /api/chat/conversations/:id/messages', 'chat.message_send', 'chat', 'Sent a message'],
  ['POST /api/chat/conversations/:id/read', null], // too noisy: every chat open
  ['PATCH /api/chat/messages/:mid', 'chat.message_edit', 'chat', 'Edited a message'],
  ['DELETE /api/chat/messages/:mid', 'chat.message_delete', 'chat', 'Deleted a message'],
  ['POST /api/chat/messages/:mid/reactions', 'chat.reaction', 'chat', 'Reacted to a message'],
  ['POST /api/chat/messages/:mid/pin', 'chat.pin', 'chat', 'Pinned / unpinned a message'],
  ['POST /api/chat/messages/:mid/save', 'chat.save', 'chat', 'Saved / unsaved a message'],
  ['GET /api/chat/messages/:mid/files/:fileId', 'chat.file_download', 'chat', 'Downloaded a chat file'],

  ['POST /api/notifications/read-all', 'notification.read_all', 'notification', 'Marked all notifications read'],
  ['POST /api/notifications/:id/read', null],

  ['POST /api/admin/email/test', 'email.test', 'email', 'Sent a test email'],
  ['GET /api/admin/audit/export', 'audit.export', 'audit', 'Exported the audit log'],
];

// "PATCH /api/users/:id" -> { method, regex, names } (first match wins, so
// specific paths such as /users/me are listed before /users/:id).
const COMPILED = ROUTES.map(([key, action, category, summary]) => {
  const [method, pattern] = key.split(' ');
  const names = [];
  const rx = new RegExp(
    `^${pattern.replace(/:(\w+)/g, (_, n) => {
      names.push(n);
      return '([^/]+)';
    })}/?$`
  );
  return { method, rx, names, info: action ? { action, category, summary } : null };
});

// GETs that are worth recording (downloads, exports) are listed above;
// every other read is skipped to keep the log useful and small. Changes on
// routes not listed still get a generic entry.
// Returns { info, params } or null.
function describe(method, path) {
  for (const r of COMPILED) {
    if (r.method !== method) continue;
    const m = r.rx.exec(path);
    if (m) {
      if (!r.info) return null;
      const params = {};
      r.names.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
      return { info: r.info, params };
    }
  }
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
  const category = (path.split('/')[2] || 'other').replace(/s$/, '');
  const pattern = path.replace(/\/[a-f\d]{24}(?=\/|$)/gi, '/:id');
  return { info: { action: `${category}.${method.toLowerCase()}`, category, summary: `${method} ${pattern}` }, params: {} };
}

// Entity guessed from route params; controllers can override via req.audit.
function entityFromParams(category, params = {}) {
  if (params.sid) return { entity: 'subtask', entityId: params.sid };
  if (params.mid) return { entity: 'message', entityId: params.mid };
  if (category === 'task' && params.id) return { entity: 'task', entityId: params.id };
  if (params.id) return { entity: category, entityId: params.id };
  if (params.projectId) return { entity: 'project', entityId: params.projectId };
  return { entity: category, entityId: '' };
}

function actorFields(user) {
  if (!user) return {};
  return { actor: user._id, actorName: user.name || '', actorEmail: user.email || '', actorRole: user.role || '' };
}

// Fire-and-forget write. A logging failure must never break the request.
async function record(entry) {
  // No database (yet): skip instead of queueing writes forever.
  if (mongoose.connection.readyState !== 1) return;
  try {
    await AuditLog.create({ ...entry, changes: clean(entry.changes), meta: clean(entry.meta) });
  } catch (err) {
    console.error('[audit] could not write log:', err.message);
  }
}

// Log from places with no HTTP request (emails, background work).
function recordEvent({ action, category, summary, user, entity = '', entityId = '', entityLabel = '', ok = true, error = '', meta = null }) {
  return record({ ...actorFields(user), action, category: category || action.split('.')[0], summary, entity, entityId: String(entityId || ''), entityLabel, ok, error, meta });
}

module.exports = { record, recordEvent, describe, entityFromParams, actorFields, clean };
