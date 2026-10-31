const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const { isStaff, visibleTaskFilter, visibleProjectFilter } = require('../utils/access');
const { startOfDay, TASK_POPULATE, USER_FIELDS, DAY } = require('../utils/taskQuery');
const { buildFeed } = require('./activityController');

const idOf = (v) => (v ? (v._id || v).toString() : null);

function rangeDays(query) {
  const n = Number(query.days);
  return [7, 14, 30, 90].includes(n) ? n : 30;
}

// One bucket per day, oldest first: [{ date: 'YYYY-MM-DD', created, completed }]
function dailySeries(tasks, days) {
  const end = startOfDay();
  const start = new Date(end.getTime() - (days - 1) * DAY);
  const buckets = [];
  const index = new Map();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start.getTime() + i * DAY);
    const key = localKey(d);
    index.set(key, buckets.length);
    buckets.push({ date: key, created: 0, completed: 0 });
  }
  tasks.forEach((t) => {
    const c = index.get(localKey(new Date(t.createdAt)));
    if (c !== undefined) buckets[c].created += 1;
    if (t.completedAt) {
      const k = index.get(localKey(new Date(t.completedAt)));
      if (k !== undefined) buckets[k].completed += 1;
    }
  });
  return buckets;
}

function localKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isOpen(t) {
  return t.status !== 'done';
}

function isOverdue(t, today) {
  return isOpen(t) && t.dueDate && new Date(t.dueDate) < today;
}

async function archivedProjectIds() {
  const archived = await Project.find({ status: 'archived' }).select('_id').lean();
  return archived.map((p) => p._id);
}

async function scopedTasks(user, { personal }) {
  const and = [await visibleTaskFilter(user)];
  if (personal) and.push({ $or: [{ assignee: user._id }, { reporter: user._id }] });
  const archived = await archivedProjectIds();
  if (archived.length) and.push({ project: { $nin: archived } });
  return Task.find(and.length === 1 ? and[0] : { $and: and })
    .select('-activityLog -comments -attachments')
    .populate(TASK_POPULATE)
    .lean();
}

// Per-employee open workload. Only users that have at least one task in
// scope are listed (plus, for reports, everyone when the caller is staff).
async function workloadRows(tasks, from, today, includeAll) {
  const rows = new Map();
  const ensure = (u) => {
    const id = idOf(u);
    if (!rows.has(id)) {
      rows.set(id, {
        user: { _id: u._id, name: u.name, jobTitle: u.jobTitle, department: u.department || null },
        open: 0,
        inProgress: 0,
        inReview: 0,
        urgent: 0,
        overdue: 0,
        completed: 0,
      });
    }
    return rows.get(id);
  };
  if (includeAll) {
    const users = await User.find().select(`${USER_FIELDS} department`).populate('department', 'name').lean();
    users.forEach(ensure);
  }
  tasks.forEach((t) => {
    if (!t.assignee) return;
    const r = ensure(t.assignee);
    if (isOpen(t)) {
      r.open += 1;
      if (t.status === 'in-progress') r.inProgress += 1;
      if (t.status === 'in-review') r.inReview += 1;
      if (t.priority === 'urgent') r.urgent += 1;
      if (isOverdue(t, today)) r.overdue += 1;
    } else if (t.completedAt && new Date(t.completedAt) >= from) {
      r.completed += 1;
    }
  });
  if (!includeAll) {
    // Department names for rows built from task assignees.
    const ids = [...rows.keys()];
    const users = await User.find({ _id: { $in: ids } }).select('department').populate('department', 'name').lean();
    users.forEach((u) => {
      const r = rows.get(u._id.toString());
      if (r) r.user.department = u.department || null;
    });
  }
  return [...rows.values()].sort((a, b) => b.open - a.open || a.user.name.localeCompare(b.user.name));
}

async function projectRows(user, tasks, today) {
  const projects = await Project.find({ ...visibleProjectFilter(user), status: 'active' })
    .select('name key status targetDate')
    .sort('name')
    .lean();
  const counts = new Map(projects.map((p) => [p._id.toString(), { total: 0, done: 0, overdue: 0 }]));
  tasks.forEach((t) => {
    const c = counts.get(idOf(t.project));
    if (!c) return;
    c.total += 1;
    if (t.status === 'done') c.done += 1;
    if (isOverdue(t, today)) c.overdue += 1;
  });
  return projects.map((p) => ({ ...p, ...counts.get(p._id.toString()) }));
}

// GET /api/stats/dashboard?days=30 : the signed-in user's own numbers.
const dashboard = catchAsync(async (req, res) => {
  const days = rangeDays(req.query);
  const today = startOfDay();
  const tomorrow = new Date(today.getTime() + DAY);
  const from = new Date(today.getTime() - (days - 1) * DAY);
  const me = req.user._id.toString();

  const involved = await scopedTasks(req.user, { personal: true });
  const mine = involved.filter((t) => idOf(t.assignee) === me);
  const openMine = mine.filter(isOpen);

  const cards = {
    open: involved.filter(isOpen).length,
    assignedToMe: openMine.length,
    inProgress: openMine.filter((t) => t.status === 'in-progress').length,
    inReview: openMine.filter((t) => t.status === 'in-review').length,
    overdue: openMine.filter((t) => isOverdue(t, today)).length,
    dueToday: openMine.filter((t) => t.dueDate && new Date(t.dueDate) >= today && new Date(t.dueDate) < tomorrow)
      .length,
    blocked: openMine.filter((t) => t.blocked).length,
    completed: mine.filter((t) => t.completedAt && new Date(t.completedAt) >= from).length,
  };

  const series = dailySeries(involved, days);
  const in14 = new Date(today.getTime() + 14 * DAY);
  const upcoming = involved
    .filter((t) => isOpen(t) && t.dueDate && new Date(t.dueDate) < in14)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 8);
  const recentlyUpdated = [...involved]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 6);

  // Workload / project progress use everything the user can see, so a
  // manager gets a team view while an employee sees their own slice.
  const visible = await scopedTasks(req.user, { personal: false });
  const workload = (await workloadRows(visible, from, today, false)).filter((r) => r.open > 0).slice(0, 8);
  const projects = (await projectRows(req.user, visible, today)).filter((p) => p.total > 0).slice(0, 8);

  const activityFilter = {
    $and: [await visibleTaskFilter(req.user), { $or: [{ assignee: req.user._id }, { reporter: req.user._id }] }],
  };
  const activity = await buildFeed(activityFilter, 8);

  res.status(200).json({
    days,
    totalInvolved: involved.length,
    cards,
    series,
    upcoming,
    recentlyUpdated,
    workload,
    projects,
    activity,
  });
});

// GET /api/stats/reports?days=30
// Staff see the whole workspace; employees see tasks they're involved in.
const reports = catchAsync(async (req, res) => {
  const days = rangeDays(req.query);
  const today = startOfDay();
  const from = new Date(today.getTime() - (days - 1) * DAY);
  const staff = isStaff(req.user);

  const tasks = await scopedTasks(req.user, { personal: !staff });
  const open = tasks.filter(isOpen);
  const completedInRange = tasks.filter((t) => t.completedAt && new Date(t.completedAt) >= from);

  const durations = completedInRange.map((t) => new Date(t.completedAt) - new Date(t.createdAt)).filter((ms) => ms >= 0);
  const avgCompleteMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

  const byStatus = { todo: 0, 'in-progress': 0, 'in-review': 0 };
  const byPriority = { urgent: 0, high: 0, medium: 0, low: 0 };
  open.forEach((t) => {
    if (t.status in byStatus) byStatus[t.status] += 1;
    if (t.priority in byPriority) byPriority[t.priority] += 1;
  });

  res.status(200).json({
    days,
    scope: staff ? 'workspace' : 'personal',
    cards: {
      created: tasks.filter((t) => new Date(t.createdAt) >= from).length,
      completed: completedInRange.length,
      avgCompleteMs,
      openNow: open.length,
      unassigned: open.filter((t) => !t.assignee).length,
      overdueNow: open.filter((t) => isOverdue(t, today)).length,
      blocked: open.filter((t) => t.blocked).length,
    },
    series: dailySeries(tasks, days),
    byStatus,
    byPriority,
    workload: await workloadRows(tasks, from, today, staff),
    projects: await projectRows(req.user, tasks, today),
  });
});

module.exports = { dashboard, reports };
