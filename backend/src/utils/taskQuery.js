const mongoose = require('mongoose');
const Task = require('../models/Task');
const Project = require('../models/Project');
const { visibleTaskFilter } = require('./access');

const USER_FIELDS = 'name email avatar jobTitle role';
const PROJECT_FIELDS = 'name key status visibility members';

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };

const DAY = 86400000;

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isId(v) {
  return typeof v === 'string' && mongoose.Types.ObjectId.isValid(v);
}

function list(v) {
  if (!v) return [];
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveUser(value, me) {
  if (value === 'me') return me._id;
  if (isId(value)) return new mongoose.Types.ObjectId(value);
  return undefined;
}

/**
 * Builds a Mongo filter from URL query params, always ANDed with the
 * caller's visibility filter. Supported params:
 *   assignee=me|none|<id>  reporter=me|<id>  project=<id>
 *   status=a,b  priority=a,b  open=1  blocked=1  label=<s>
 *   due=overdue|today|week|none  due_from/due_to=<ISO>
 *   completed_from/completed_to=<ISO>  q=<text or KEY-12>
 *   include_archived=1 (tasks in archived projects are hidden by default)
 */
async function buildTaskFilter(user, query = {}) {
  const and = [await visibleTaskFilter(user)];
  const today = startOfDay();

  if (query.assignee === 'none') and.push({ assignee: null });
  else if (query.assignee) {
    const id = resolveUser(query.assignee, user);
    if (id) and.push({ assignee: id });
  }
  if (query.reporter) {
    const id = resolveUser(query.reporter, user);
    if (id) and.push({ reporter: id });
  }
  if (query.involved === 'me') and.push({ $or: [{ assignee: user._id }, { reporter: user._id }] });
  if (isId(query.project)) and.push({ project: new mongoose.Types.ObjectId(query.project) });

  const statuses = list(query.status).filter((s) => Task.STATUSES.includes(s));
  if (statuses.length) and.push({ status: { $in: statuses } });
  else if (query.open === '1') and.push({ status: { $ne: 'done' } });
  if (query.open === '1' && statuses.length) and.push({ status: { $ne: 'done' } });

  const priorities = list(query.priority).filter((p) => Task.PRIORITIES.includes(p));
  if (priorities.length) and.push({ priority: { $in: priorities } });

  if (query.blocked === '1') and.push({ blocked: true });
  if (query.label) and.push({ labels: query.label });

  switch (query.due) {
    case 'overdue':
      and.push({ dueDate: { $lt: today }, status: { $ne: 'done' } });
      break;
    case 'today':
      and.push({ dueDate: { $gte: today, $lt: new Date(today.getTime() + DAY) } });
      break;
    case 'week':
      and.push({ dueDate: { $gte: today, $lt: new Date(today.getTime() + 7 * DAY) } });
      break;
    case 'none':
      and.push({ dueDate: null });
      break;
    default:
      break;
  }
  if (query.due_from || query.due_to) {
    const range = {};
    if (query.due_from) range.$gte = new Date(query.due_from);
    if (query.due_to) range.$lte = new Date(query.due_to);
    and.push({ dueDate: range });
  }
  if (query.completed_from || query.completed_to) {
    const range = {};
    if (query.completed_from) range.$gte = startOfDay(new Date(query.completed_from));
    if (query.completed_to) range.$lt = new Date(startOfDay(new Date(query.completed_to)).getTime() + DAY);
    and.push({ completedAt: range });
  }

  if (query.q && String(query.q).trim()) {
    const q = String(query.q).trim();
    const keyMatch = q.match(/^([A-Za-z][A-Za-z0-9]{1,9})-(\d+)$/);
    if (keyMatch) {
      const project = await Project.findOne({ key: keyMatch[1].toUpperCase() }).select('_id');
      and.push(project ? { project: project._id, number: Number(keyMatch[2]) } : { _id: null });
    } else {
      const rx = new RegExp(escapeRegex(q), 'i');
      const or = [{ title: rx }, { description: rx }];
      if (/^\d+$/.test(q)) or.push({ number: Number(q) });
      and.push({ $or: or });
    }
  }

  if (query.include_archived !== '1') {
    const archived = await Project.find({ status: 'archived' }).select('_id');
    if (archived.length) and.push({ project: { $nin: archived.map((p) => p._id) } });
  }

  return and.length === 1 ? and[0] : { $and: and };
}

function sortTasks(tasks, sort = 'updated', dir = 'desc') {
  const mult = dir === 'asc' ? 1 : -1;
  const val = {
    updated: (t) => new Date(t.updatedAt).getTime(),
    created: (t) => new Date(t.createdAt).getTime(),
    due: (t) => (t.dueDate ? new Date(t.dueDate).getTime() : null),
    priority: (t) => PRIORITY_RANK[t.priority] ?? 9,
    title: (t) => (t.title || '').toLowerCase(),
  }[sort] || ((t) => new Date(t.updatedAt).getTime());

  return tasks.sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    // Tasks without a due date always go last regardless of direction.
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va < vb) return -1 * mult;
    if (va > vb) return 1 * mult;
    return 0;
  });
}

const TASK_POPULATE = [
  { path: 'assignee', select: USER_FIELDS },
  { path: 'reporter', select: USER_FIELDS },
  { path: 'project', select: PROJECT_FIELDS },
];

module.exports = {
  buildTaskFilter,
  sortTasks,
  startOfDay,
  escapeRegex,
  TASK_POPULATE,
  USER_FIELDS,
  PROJECT_FIELDS,
  DAY,
};
