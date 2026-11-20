// Repeating tasks: works out the next day a schedule fires and creates the
// task from the saved template. All days are India time; tasks are created
// at 9:00 IST.
const RecurringTask = require('../models/RecurringTask');
const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const { istDay, addDays, istTime, weekdayOf, dayToDeadline } = require('../utils/istDate');
const { TASK_POPULATE } = require('../utils/taskQuery');
const { emitTaskEvent } = require('./socketService');
const { notify } = require('./notificationService');
const { headsOf, idStr, sameId } = require('../utils/teams');
const emails = require('./emailService');

const RUN_HOUR = 9;
const FREQS = RecurringTask.FREQUENCIES;

const daysInMonth = (day) => {
  const [y, m] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

function matches(schedule, day) {
  const wd = weekdayOf(day);
  switch (schedule.freq) {
    case 'daily':
      return true;
    case 'weekdays':
      return wd >= 1 && wd <= 5;
    case 'weekly':
      return wd === schedule.weekday;
    case 'monthly':
      // "31st" falls on the last day in shorter months.
      return Number(day.slice(8, 10)) === Math.min(schedule.dayOfMonth, daysInMonth(day));
    default:
      return false;
  }
}

// First matching day strictly after `afterDay` ("YYYY-MM-DD").
function nextRunDay(schedule, afterDay) {
  for (let i = 1; i <= 400; i += 1) {
    const day = addDays(afterDay, i);
    if (matches(schedule, day)) return day;
  }
  return null;
}

const nextRunAt = (schedule, afterDay) => {
  const day = nextRunDay(schedule, afterDay);
  return day ? istTime(day, RUN_HOUR) : null;
};

// Checks { freq, weekday?, dayOfMonth? } from the client. Returns a clean
// schedule or throws a message.
function parseSchedule(input) {
  if (!input || typeof input !== 'object') throw new Error('Pick how often it repeats');
  const freq = String(input.freq || '');
  if (!FREQS.includes(freq)) throw new Error('Pick how often it repeats');
  const schedule = { freq, weekday: null, dayOfMonth: null };
  if (freq === 'weekly') {
    const wd = Number(input.weekday);
    if (!Number.isInteger(wd) || wd < 0 || wd > 6) throw new Error('Pick a day of the week');
    schedule.weekday = wd;
  }
  if (freq === 'monthly') {
    const dom = Number(input.dayOfMonth);
    if (!Number.isInteger(dom) || dom < 1 || dom > 31) throw new Error('Pick a day of the month (1-31)');
    schedule.dayOfMonth = dom;
  }
  return schedule;
}

const taskRef = (task, project) => (task.number ? `${project.key}-${task.number}` : project.key);
const taskLink = (task, project) => `/projects/${project._id}?task=${task._id}`;

async function stop(rt, reason) {
  rt.active = false;
  await rt.save();
  console.log(`[recurring] stopped ${rt._id}: ${reason}`);
}

// Makes one task from the template, as if its creator had raised it.
async function createFromTemplate(rt, runDay = istDay()) {
  const [creator, project] = await Promise.all([User.findById(rt.createdBy), Project.findById(rt.project)]);
  if (!creator || creator.status === 'disabled') return stop(rt, 'creator no longer active');
  if (!project || project.status === 'archived') return stop(rt, 'project gone or archived');

  let assignee = rt.assignee ? await User.findById(rt.assignee).select('status department') : null;
  if (assignee && (assignee.status === 'disabled' || (rt.toTeam && !sameId(assignee.department, rt.toTeam)))) assignee = null;

  const seq = await Project.findByIdAndUpdate(project._id, { $inc: { taskSeq: 1 } }, { new: true });
  const task = await Task.create({
    title: rt.title,
    description: rt.description,
    priority: rt.priority,
    status: 'todo',
    number: seq.taskSeq,
    assignee: assignee ? assignee._id : null,
    labels: rt.labels,
    dueDate: rt.dueInDays === null || rt.dueInDays === undefined ? null : dayToDeadline(addDays(runDay, rt.dueInDays)),
    project: project._id,
    reporter: creator._id,
    fromTeam: rt.fromTeam,
    toTeam: rt.toTeam,
    recurring: rt._id,
    subtasks: (rt.subtasks || []).map((title, i) => ({ title, order: i, createdBy: creator._id })),
    activityLog: [{ field: 'created', oldValue: null, newValue: rt.title, changedBy: creator._id }],
  });
  const populated = await task.populate(TASK_POPULATE);
  emitTaskEvent(project, populated, 'task:created', populated);

  const ref = taskRef(task, project);
  const link = taskLink(task, project);
  if (populated.assignee && !sameId(populated.assignee._id, creator._id)) {
    notify([populated.assignee._id], { actor: creator._id, type: 'task_assigned', text: `🔁 Repeating task ${ref} is ready for you: ${task.title}`, link });
    if (populated.assignee.email) {
      const person = await User.findById(populated.assignee._id).select('emailNotifications status');
      if (person && person.emailNotifications !== false && person.status !== 'disabled') {
        emails
          .sendTaskCreatedEmail({ task: populated, project, assignee: populated.assignee, reporter: populated.reporter, actor: creator })
          .catch((err) => console.error('[recurring] email failed:', err.message));
      }
    }
  } else if (!populated.assignee && rt.toTeam) {
    const heads = (await headsOf([rt.toTeam])).map((h) => h._id).filter((id) => !sameId(id, creator._id));
    notify(heads, { actor: creator._id, type: 'task_request', text: `🔁 Repeating task ${ref} raised for your team: ${task.title}`, link });
  }
  return task;
}

/**
 * Creates every repeating task that is due. Each schedule is claimed with an
 * atomic update first, so it fires once even if two processes run this.
 * If the server was down for a few days, it catches up with one task.
 */
async function runDueRecurring(now = new Date()) {
  const due = await RecurringTask.find({ active: true, nextRunAt: { $lte: now } }).limit(100);
  const today = istDay(now);
  let created = 0;
  for (const rt of due) {
    const next = nextRunAt(rt.schedule, today);
    // eslint-disable-next-line no-await-in-loop
    const claimed = await RecurringTask.findOneAndUpdate(
      { _id: rt._id, active: true, nextRunAt: rt.nextRunAt },
      { $set: { nextRunAt: next, lastRunAt: now }, $inc: { runs: 1 } },
      { new: true }
    );
    if (!claimed) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      if (await createFromTemplate(claimed, today)) created += 1;
    } catch (err) {
      console.error(`[recurring] ${rt._id} failed:`, err.message);
    }
  }
  return created;
}

// Who can see / stop a schedule: its creator, the head of its team, a Super Admin.
function canManage(user, rt) {
  if (!user || !rt) return false;
  if (user.role === 'admin' || sameId(rt.createdBy, user._id)) return true;
  return user.role === 'manager' && rt.toTeam && idStr(user.department) === idStr(rt.toTeam);
}

module.exports = { matches, nextRunDay, nextRunAt, parseSchedule, createFromTemplate, runDueRecurring, canManage, RUN_HOUR };
