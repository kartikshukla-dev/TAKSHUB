export const STATUSES = [
  { id: 'todo', label: 'To do' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'in-review', label: 'In review' },
  { id: 'done', label: 'Done' },
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));

export const PRIORITIES = [
  { id: 'urgent', label: 'Urgent' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];
export const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.id, p.label]));

export const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', member: 'Employee' };

export const WORKSPACE_NAME = 'Oncare';

export const idOf = (v) => (v ? String(v._id || v.id || v) : '');

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Stable pastel per person, so avatars are recognisable at a glance.
const AVATAR_TONES = ['blue', 'rose', 'violet', 'amber', 'teal', 'slate'];
export function avatarTone(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export function taskKey(task) {
  const key = task?.project?.key;
  if (key && task.number) return `${key}-${task.number}`;
  return key || '';
}

export function projectIdOf(task) {
  return idOf(task?.project);
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function dateKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

// For date-only fields (due/start/target dates).
export function formatShortDate(d) {
  if (!d) return '';
  return dueDateLocal(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatDate(d) {
  if (!d) return '';
  return dueDateLocal(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(d) {
  if (!d) return '';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return formatShortDate(d);
}

// Due dates are date-only values stored as UTC midnight. Read the
// YYYY-MM-DD part as a local date so the day never shifts by timezone.
export function dueKey(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.substring(0, 10);
  return new Date(d).toISOString().substring(0, 10);
}

export function dueDateLocal(d) {
  const [y, m, day] = dueKey(d).split('-').map(Number);
  return new Date(y, m - 1, day);
}

// 'overdue' | 'soon' (today or within 3 days) | 'done' | null
export function dueState(task) {
  if (!task?.dueDate) return null;
  if (task.status === 'done') return 'done';
  const today = startOfDay();
  const due = dueDateLocal(task.dueDate);
  if (due < today) return 'overdue';
  if (due - today <= 3 * 86400000) return 'soon';
  return null;
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  const h = ms / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export function describeActivity(entry) {
  const who = entry.changedBy?.name || 'Someone';
  const val = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (entry.field === 'status') return STATUS_LABEL[v] || v;
    if (entry.field === 'priority') return PRIORITY_LABEL[v] || v;
    if (entry.field === 'dueDate') return formatDate(v);
    if (entry.field === 'blocked') return v ? 'blocked' : 'unblocked';
    if (Array.isArray(v)) return v.join(', ') || '—';
    return String(v);
  };
  switch (entry.field) {
    case 'created':
      return `${who} created the task`;
    case 'comment':
      return `${who} commented`;
    case 'blocked':
      return `${who} marked it ${val(entry.newValue)}`;
    case 'assignee':
      return `${who} changed the assignee`;
    case 'dueDate':
      return `${who} changed due date to ${val(entry.newValue)}`;
    default:
      return `${who} changed ${entry.field} from ${val(entry.oldValue)} to ${val(entry.newValue)}`;
  }
}
