// Deadline reminders (India time):
//  - the day before a deadline: "due tomorrow" to the assignee;
//  - once a deadline has passed and the task isn't done: "overdue" to the
//    assignee and the head of the task's team (or of the assignee's team).
// Each reminder is sent once per deadline (moving the deadline re-arms it)
// and only between 9:00 and 21:00, so nobody gets pinged at night.
// Overdue reminders only go out for deadlines in the last 3 days, so old
// overdue tasks don't flood everyone the day this goes live.
const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const { istDay, istHour, addDays, dayToDeadline } = require('../utils/istDate');
const { notify } = require('./notificationService');
const { headsOf, idStr } = require('../utils/teams');
const emails = require('./emailService');
const templates = require('./emailTemplates');

const START_HOUR = 9;
const END_HOUR = 21;
const OVERDUE_LOOKBACK_DAYS = 3;

const taskRef = (task, project) => (task.number ? `${project.key}-${task.number}` : project.key);
const taskLink = (task, project) => `/projects/${project._id}?task=${task._id}`;

// Claims the reminder with an atomic update, so it is sent once even if two
// processes run at the same time. Returns true when this call won.
async function claim(taskId, field, dueDate) {
  const res = await Task.updateOne(
    { _id: taskId, dueDate, [`reminders.${field}`]: { $ne: dueDate } },
    { $set: { [`reminders.${field}`]: dueDate } },
    { timestamps: false }
  );
  return res.modifiedCount === 1;
}

async function emailPeople(ids, build) {
  const people = await User.find({ _id: { $in: ids }, emailNotifications: { $ne: false }, status: { $ne: 'disabled' } }).select('name email');
  await Promise.all(people.map((p) => emails.sendQuietly('reminder', { to: p.email, ...build(p) })));
}

async function runReminders(now = new Date(), { ignoreHours = false } = {}) {
  const hour = istHour(now);
  if (!ignoreHours && (hour < START_HOUR || hour >= END_HOUR)) return { dueSoon: 0, overdue: 0 };
  const today = istDay(now);
  const tomorrow = dayToDeadline(addDays(today, 1));
  const archived = (await Project.find({ status: 'archived' }).select('_id')).map((p) => p._id);
  const open = { status: { $ne: 'done' }, project: { $nin: archived } };
  let dueSoon = 0;
  let overdue = 0;

  // 1. Due tomorrow -> assignee.
  const soon = await Task.find({ ...open, assignee: { $ne: null }, dueDate: tomorrow, 'reminders.dueSoonFor': { $ne: tomorrow } })
    .populate('project', 'name key')
    .populate('assignee', 'name email')
    .limit(500);
  for (const task of soon) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await claim(task._id, 'dueSoonFor', task.dueDate))) continue;
    const ref = taskRef(task, task.project);
    const link = taskLink(task, task.project);
    notify([task.assignee._id], { actor: null, type: 'task_due_soon', text: `⏰ ${ref} is due tomorrow: ${task.title}`, link });
    // eslint-disable-next-line no-await-in-loop
    await emailPeople([task.assignee._id], (p) => templates.taskReminder({ task, project: task.project, recipient: p, kind: 'due-soon' }));
    dueSoon += 1;
  }

  // 2. Overdue (deadline was before today, within the look-back) -> assignee + team head.
  const late = await Task.find({
    ...open,
    dueDate: { $lt: dayToDeadline(today), $gte: dayToDeadline(addDays(today, -OVERDUE_LOOKBACK_DAYS)) },
  })
    .populate('project', 'name key')
    .populate('assignee', 'name email department')
    .limit(500);
  for (const task of late) {
    if (task.reminders && task.reminders.overdueFor && +task.reminders.overdueFor === +task.dueDate) continue;
    // eslint-disable-next-line no-await-in-loop
    if (!(await claim(task._id, 'overdueFor', task.dueDate))) continue;
    const team = task.toTeam || (task.assignee && task.assignee.department);
    // eslint-disable-next-line no-await-in-loop
    const heads = team ? (await headsOf([team])).map((h) => idStr(h._id)) : [];
    const assigneeId = task.assignee ? idStr(task.assignee._id) : null;
    const ref = taskRef(task, task.project);
    const link = taskLink(task, task.project);
    if (assigneeId) notify([assigneeId], { actor: null, type: 'task_overdue', text: `🚨 ${ref} is overdue: ${task.title}`, link });
    const forHeads = heads.filter((h) => h !== assigneeId);
    if (forHeads.length) {
      const who = task.assignee ? task.assignee.name : 'nobody yet';
      notify(forHeads, { actor: null, type: 'task_overdue', text: `🚨 ${ref} is overdue (assigned to ${who}): ${task.title}`, link });
    }
    // eslint-disable-next-line no-await-in-loop
    await emailPeople([assigneeId, ...forHeads].filter(Boolean), (p) => templates.taskReminder({ task, project: task.project, recipient: p, kind: 'overdue' }));
    overdue += 1;
  }
  return { dueSoon, overdue };
}

module.exports = { runReminders, START_HOUR, END_HOUR, OVERDUE_LOOKBACK_DAYS };
