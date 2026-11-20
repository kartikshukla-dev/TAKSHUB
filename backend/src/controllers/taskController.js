const mongoose = require('mongoose');
const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const Department = require('../models/Department');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { diffTaskFields } = require('../utils/taskDiff');
const { canViewTask, assertCanViewProject } = require('../utils/access');
const { idStr, sameId, isSuperAdmin, isHeadOf, canPlanTeamTask, headsOf } = require('../utils/teams');
const { buildTaskFilter, sortTasks, TASK_POPULATE, USER_FIELDS } = require('../utils/taskQuery');
const emails = require('../services/emailService');
const { formatDate } = require('../services/emailTemplates');
const { emitTaskEvent } = require('../services/socketService');
const { notify } = require('../services/notificationService');
const gridfs = require('../services/gridfsService');
const RecurringTask = require('../models/RecurringTask');
const recurring = require('../services/recurringService');
const { istDay, daysBetween, deadlineDay } = require('../utils/istDate');

const STATUS_LABELS = { todo: 'To do', 'in-progress': 'In progress', 'in-review': 'In review', done: 'Done', 'not-approved': 'Not approved' };
const NOT_APPROVED = 'not-approved';

// Who may mark a task Not approved, or move it out of Not approved:
// a Super Admin, the head of the team the task was sent to, or (for tasks
// without a team) the head of the assignee's team.
async function canApproveTask(user, task) {
  if (isSuperAdmin(user)) return true;
  if (task.toTeam) return isHeadOf(user, task.toTeam);
  if (!task.assignee || user.role !== 'manager') return false;
  const person = await User.findById(idStr(task.assignee)).select('department');
  return Boolean(person && person.department && isHeadOf(user, person.department));
}
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };

const logEmailError = (label) => (err) => console.error(`[email] ${label} failed:`, err.message);

async function loadProject(projectId, user) {
  if (!mongoose.Types.ObjectId.isValid(projectId)) throw new ApiError(400, 'Invalid id format');
  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, 'Project not found');
  if (user) assertCanViewProject(user, project);
  return project;
}

// The built-in project for tasks raised to a team without a project.
async function requestsProject(user) {
  const existing = await Project.findOne({ system: true });
  if (existing) return existing;
  for (const key of ['REQ', 'REQS', 'TREQ']) {
    // eslint-disable-next-line no-await-in-loop
    const taken = await Project.exists({ key });
    if (!taken) {
      return Project.create({
        name: 'Team requests',
        key,
        description: 'Tasks raised to a team without a project.',
        system: true,
        visibility: 'private',
        createdBy: user._id,
        members: [],
      });
    }
  }
  throw new ApiError(500, 'Could not create the Team requests project');
}

async function loadTask(req, project) {
  const task = await Task.findOne({ _id: req.params.id, project: req.params.projectId });
  if (!task) throw new ApiError(404, 'Task not found');
  if (!canViewTask(req.user, task, project)) throw new ApiError(403, 'You do not have access to this task');
  return task;
}

async function loadTeam(id) {
  if (!id) return null;
  if (!mongoose.Types.ObjectId.isValid(String(id))) throw new ApiError(400, 'Invalid team');
  const team = await Department.findById(id);
  if (!team) throw new ApiError(400, 'Team not found');
  return team;
}

async function assertAssigneeInTeam(assigneeId, team) {
  if (!assigneeId || !team) return;
  const person = await User.findById(assigneeId).select('department status name');
  if (!person || person.status === 'disabled') throw new ApiError(400, 'Assignee not found');
  if (!sameId(person.department, team._id)) {
    throw new ApiError(400, `${person.name} is not in the ${team.name} team`);
  }
}

// Runs notification / email work after the HTTP reply has gone out. Errors
// are logged only; they must never reach Express (headers are already sent).
function afterResponse(label, fn) {
  Promise.resolve()
    .then(fn)
    .catch((err) => console.error(`[${label}] follow-up failed:`, err.message));
}

function taskRef(task, project) {
  return task.number ? `${project.key}-${task.number}` : project.key;
}

function taskLink(task, project) {
  return `/projects/${project._id}?task=${task._id}`;
}

// Reporter, assignee and the heads of both teams.
async function watcherIds(task) {
  const ids = new Set([idStr(task.reporter), idStr(task.assignee)].filter(Boolean));
  const heads = await headsOf([task.fromTeam, task.toTeam]);
  heads.forEach((h) => ids.add(idStr(h._id)));
  return [...ids];
}

// People among `ids` who should get notification emails (opted in, active).
async function emailable(ids, exclude = []) {
  const skip = new Set(exclude.filter(Boolean).map(idStr));
  const wanted = ids.filter((id) => id && !skip.has(idStr(id)));
  if (!wanted.length) return [];
  return User.find({ _id: { $in: wanted }, emailNotifications: { $ne: false }, status: { $ne: 'disabled' } }).select(
    'name email'
  );
}

const sameDate = (a, b) =>
  (a ? new Date(a).toISOString().slice(0, 10) : '') === (b ? new Date(b).toISOString().slice(0, 10) : '');

// GET /api/tasks : workspace-wide task list with filters (see taskQuery).
const listAllTasks = catchAsync(async (req, res) => {
  const filter = await buildTaskFilter(req.user, req.query);
  const limit = Math.min(Number(req.query.limit) || 500, 1000);
  const tasks = await Task.find(filter)
    .select('-activityLog -comments.text')
    .populate(TASK_POPULATE)
    .limit(limit)
    .lean();
  sortTasks(tasks, req.query.sort, req.query.dir);
  res.status(200).json({ tasks });
});

// POST /api/projects/:projectId/tasks   or   POST /api/tasks { project?, toTeam? }
// With toTeam set the task is "raised" to that team: only its head (or a
// Super Admin) may set the deadline and assignee.
const createTask = catchAsync(async (req, res) => {
  const { title, description, priority, assignee, labels, dueDate, status, blocked, toTeam } = req.body;
  if (!title || !String(title).trim()) throw new ApiError(400, 'title is required');
  if (status === NOT_APPROVED) throw new ApiError(400, 'A new task cannot start as Not approved');

  const projectId = req.params.projectId || req.body.project;
  const team = await loadTeam(toTeam);
  if (!projectId && !team) throw new ApiError(400, 'Pick a project or a team to send this task to');
  const project = projectId ? await loadProject(projectId, req.user) : await requestsProject(req.user);

  // A task the creator's own team keeps can be assigned directly; one sent
  // to another team waits for that team's head.
  if (team && !canPlanTeamTask(req.user, team._id, req.user.department)) {
    if (assignee) throw new ApiError(403, `Only the ${team.name} head can assign this task`);
    if (dueDate) throw new ApiError(403, `Only the ${team.name} head can set the deadline`);
  }
  await assertAssigneeInTeam(assignee, team);

  // Optional checklist on create: ["title", ...] or [{ title }].
  const subtasks = (Array.isArray(req.body.subtasks) ? req.body.subtasks : [])
    .map((s) => String((s && s.title) || s || '').trim())
    .filter(Boolean)
    .slice(0, Task.SUBTASK_MAX);
  if (subtasks.some((t) => t.length > 300)) throw new ApiError(400, 'Subtask title is too long');

  // Optional repeat: { freq: daily | weekdays | weekly | monthly, weekday?, dayOfMonth? }
  let schedule = null;
  if (req.body.repeat && req.body.repeat.freq) {
    try {
      schedule = recurring.parseSchedule(req.body.repeat);
    } catch (err) {
      throw new ApiError(400, err.message);
    }
  }

  const seq = await Project.findByIdAndUpdate(project._id, { $inc: { taskSeq: 1 } }, { new: true });

  const task = await Task.create({
    title: String(title).trim(),
    description,
    priority,
    status: status || 'todo',
    blocked: Boolean(blocked),
    number: seq.taskSeq,
    assignee: assignee || null,
    labels,
    dueDate: dueDate || null,
    project: project._id,
    reporter: req.user._id,
    fromTeam: req.user.department || null,
    toTeam: team ? team._id : null,
    completedAt: status === 'done' ? new Date() : null,
    subtasks: subtasks.map((t, i) => ({ title: t, order: i, createdBy: req.user._id })),
    activityLog: [
      { field: 'created', oldValue: null, newValue: title, changedBy: req.user._id },
      ...(team ? [{ field: 'toTeam', oldValue: null, newValue: team.name, changedBy: req.user._id }] : []),
    ],
  });

  // This task is the first one; the schedule makes the next ones.
  if (schedule) {
    const today = istDay();
    const rt = await RecurringTask.create({
      createdBy: req.user._id,
      project: project._id,
      toTeam: task.toTeam,
      fromTeam: task.fromTeam,
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      assignee: task.assignee,
      labels: task.labels,
      subtasks,
      dueInDays: task.dueDate ? Math.max(0, daysBetween(today, deadlineDay(task.dueDate))) : null,
      schedule,
      nextRunAt: recurring.nextRunAt(schedule, today),
    });
    task.recurring = rt._id;
    await Task.updateOne({ _id: task._id }, { recurring: rt._id }, { timestamps: false });
  }

  const populated = await task.populate(TASK_POPULATE);
  emitTaskEvent(project, populated, 'task:created', populated);
  req.audit = {
    entity: 'task',
    entityId: task._id,
    entityLabel: `${taskRef(task, project)} ${task.title}`,
    changes: {
      created: {
        title: task.title,
        priority: task.priority,
        status: task.status,
        toTeam: team ? team.name : null,
        assignee: populated.assignee ? populated.assignee.name : null,
        dueDate: task.dueDate,
        project: project.name,
      },
    },
  };

  res.status(201).json({ task: populated });
  afterResponse('task-created', async () => {
  const ref = taskRef(task, project);
  const link = taskLink(task, project);

  if (team) {
    const heads = await headsOf([team._id]);
    const headIds = heads.map((h) => h._id).filter((id) => !sameId(id, req.user._id));
    // Assigned inside the team without the head: tell the head who got it.
    const direct = Boolean(populated.assignee) && sameId(populated.fromTeam, team._id);
    notify(headIds, {
      actor: req.user._id,
      type: direct ? 'task_assigned_in_team' : 'task_request',
      text: direct
        ? `${req.user.name} assigned ${ref} to ${populated.assignee.name} (${team.name}): ${task.title}`
        : `${req.user.name} raised ${ref} for ${team.name}: ${task.title}`,
      link,
    });
    const to = await emailable(headIds);
    emails
      .sendTaskRequestEmail({ task: populated, project, actor: req.user, recipients: to, direct })
      .catch(logEmailError('team-request'));
  }

  if (populated.assignee && !sameId(populated.assignee._id, req.user._id)) {
    notify([populated.assignee._id], {
      actor: req.user._id,
      type: 'task_assigned',
      text: `${req.user.name} assigned you ${ref}: ${task.title}`,
      link,
    });
    if ((await emailable([populated.assignee._id])).length) {
      emails
        .sendTaskCreatedEmail({ task: populated, project, assignee: populated.assignee, reporter: populated.reporter, actor: req.user })
        .catch(logEmailError('task-created'));
    }
  }
  });
});

const listTasks = catchAsync(async (req, res) => {
  const project = await loadProject(req.params.projectId, req.user);
  const tasks = await Task.find({ project: req.params.projectId }).populate(TASK_POPULATE).sort('-createdAt');
  res.status(200).json({ tasks: tasks.filter((t) => canViewTask(req.user, t, project)) });
});

const getTask = catchAsync(async (req, res) => {
  const project = await loadProject(req.params.projectId);
  const found = await loadTask(req, project);
  // Opening a task marks its comments as seen. The previous time comes back
  // as `commentsSeenAt` so the modal can tag the comments that are new.
  const previous = (found.commentReads || []).find((r) => sameId(r.user, req.user._id));
  await markCommentsSeen(found._id, req.user._id);
  const task = await Task.findById(req.params.id).populate([
    ...TASK_POPULATE,
    { path: 'comments.author', select: USER_FIELDS },
    { path: 'activityLog.changedBy', select: USER_FIELDS },
  ]);
  res.status(200).json({ task, commentsSeenAt: previous ? previous.at : null });
});

// Records that `userId` has seen every comment on the task up to now.
// Doesn't touch updatedAt, so lists sorted by "last updated" don't jump.
async function markCommentsSeen(taskId, userId, at = new Date()) {
  await Task.updateOne({ _id: taskId }, { $pull: { commentReads: { user: userId } } }, { timestamps: false });
  await Task.updateOne({ _id: taskId }, { $push: { commentReads: { user: userId, at } } }, { timestamps: false });
}

// Human-readable "from -> to" for the update email.
async function describeChanges(entries) {
  const userIds = [];
  const teamIds = [];
  entries.forEach((e) => {
    if (e.field === 'assignee') userIds.push(e.oldValue, e.newValue);
    if (e.field === 'toTeam') teamIds.push(e.oldValue, e.newValue);
  });
  const [people, teams] = await Promise.all([
    User.find({ _id: { $in: userIds.filter(Boolean) } }).select('name'),
    Department.find({ _id: { $in: teamIds.filter((v) => v && mongoose.Types.ObjectId.isValid(String(v))) } }).select('name'),
  ]);
  const nameOf = (list, id, empty) => (id ? list.find((x) => sameId(x._id, id))?.name || empty : empty);

  const fmt = {
    status: (v) => STATUS_LABELS[v] || v,
    priority: (v) => PRIORITY_LABELS[v] || v,
    dueDate: (v) => (v ? formatDate(v, false) : 'Not set'),
    assignee: (v) => nameOf(people, v, 'Unassigned'),
    toTeam: (v) => nameOf(teams, v, 'No team'),
    blocked: (v) => (v ? 'Blocked' : 'Not blocked'),
    title: (v) => v || '—',
    notApprovedReason: (v) => v || '—',
  };
  const labels = { status: 'Status', priority: 'Priority', dueDate: 'Deadline', assignee: 'Assignee', toTeam: 'Team', blocked: 'Blocked', title: 'Title', notApprovedReason: 'Reason' };
  // Deadline first: it's the change people care about most.
  const order = ['dueDate', 'assignee', 'status', 'notApprovedReason', 'toTeam', 'priority', 'blocked', 'title'];
  return entries
    .filter((e) => fmt[e.field])
    .sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field))
    .map((e) => ({ field: e.field, label: labels[e.field], from: String(fmt[e.field](e.oldValue)), to: String(fmt[e.field](e.newValue)) }));
}

const updateTask = catchAsync(async (req, res) => {
  const project = await loadProject(req.params.projectId);
  const task = await loadTask(req, project);
  const user = req.user;

  const updates = { ...req.body };
  delete updates.fromTeam;
  if ('assignee' in updates && !updates.assignee) updates.assignee = null;
  if ('dueDate' in updates && !updates.dueDate) updates.dueDate = null;
  if ('toTeam' in updates && !updates.toTeam) updates.toTeam = null;
  if ('blocked' in updates) updates.blocked = Boolean(updates.blocked);

  // Re-routing to another team: the reporter or a Super Admin.
  let team = task.toTeam ? await Department.findById(task.toTeam) : null;
  if ('toTeam' in updates && !sameId(updates.toTeam, task.toTeam)) {
    if (!isSuperAdmin(user) && !sameId(task.reporter, user._id) && !isHeadOf(user, task.toTeam)) {
      throw new ApiError(403, 'Only the person who raised it, the team head or a Super Admin can change the team');
    }
    team = await loadTeam(updates.toTeam);
    updates.toTeam = team ? team._id : null;
    // A new team means its head decides who works on it.
    if (team && task.assignee && !('assignee' in updates)) {
      const current = await User.findById(task.assignee).select('department');
      if (!current || !sameId(current.department, team._id)) updates.assignee = null;
    }
  } else {
    delete updates.toTeam;
  }

  if (team) {
    // fromTeam never changes, so "stays inside the team" is checked on the
    // (possibly new) target team.
    const canManage = canPlanTeamTask(user, team._id, task.fromTeam);
    const assigneeChanged = 'assignee' in updates && !sameId(updates.assignee, task.assignee) && !(updates.assignee === null && !task.assignee);
    const deadlineChanged = 'dueDate' in updates && !sameDate(updates.dueDate, task.dueDate);
    // Clearing the assignee as part of a re-route is allowed.
    const rerouteClear = 'toTeam' in updates && updates.assignee === null;
    if (assigneeChanged && !canManage && !rerouteClear) throw new ApiError(403, `Only the ${team.name} head can assign this task`);
    if (deadlineChanged && !canManage) throw new ApiError(403, `Only the ${team.name} head can set the deadline`);
    if (assigneeChanged && updates.assignee) await assertAssigneeInTeam(updates.assignee, team);
    if (!deadlineChanged) delete updates.dueDate;
  }

  // Not approved: only the team head (or a Super Admin) sets it or lifts it.
  if ('status' in updates && updates.status !== task.status && (updates.status === NOT_APPROVED || task.status === NOT_APPROVED)) {
    if (!(await canApproveTask(user, task))) {
      throw new ApiError(
        403,
        task.status === NOT_APPROVED
          ? 'This task is Not approved. Only the team head can change its status.'
          : 'Only the team head can mark a task as Not approved'
      );
    }
  }
  // Marking Not approved needs a reason, so the assignee knows what to fix.
  let notApprovedReason = null;
  const markingNotApproved = 'status' in updates && updates.status === NOT_APPROVED && task.status !== NOT_APPROVED;
  if (markingNotApproved) {
    notApprovedReason = String(updates.notApprovedReason || '').trim();
    if (notApprovedReason.length < 3) throw new ApiError(400, 'Add a reason so the team knows what to fix');
    if (notApprovedReason.length > 1000) throw new ApiError(400, 'Reason is too long (1000 characters max)');
  }
  delete updates.notApprovedReason;

  const wasAlreadyDone = task.status === 'done';
  const previousAssignee = idStr(task.assignee);
  const logEntries = diffTaskFields(task, updates, user._id);
  const auditChanges = Object.fromEntries(logEntries.map((e) => [e.field, { from: e.oldValue, to: e.newValue }]));
  if ('description' in updates && updates.description !== task.description) {
    auditChanges.description = { from: task.description || '', to: updates.description || '' };
  }
  // Show people and teams by name, not id.
  const personIds = ['assignee'].flatMap((f) => (auditChanges[f] ? [auditChanges[f].from, auditChanges[f].to] : [])).filter(Boolean);
  const teamIds = auditChanges.toTeam ? [auditChanges.toTeam.from, auditChanges.toTeam.to].filter((v) => v && mongoose.Types.ObjectId.isValid(String(v))) : [];
  if (personIds.length || teamIds.length) {
    const [people, teams] = await Promise.all([
      personIds.length ? User.find({ _id: { $in: personIds } }).select('name') : [],
      teamIds.length ? Department.find({ _id: { $in: teamIds } }).select('name') : [],
    ]);
    const nameOf = (list, id) => (id ? list.find((x) => sameId(x._id, id))?.name || String(id) : null);
    if (auditChanges.assignee) auditChanges.assignee = { from: nameOf(people, auditChanges.assignee.from), to: nameOf(people, auditChanges.assignee.to) };
    if (auditChanges.toTeam) auditChanges.toTeam = { from: nameOf(teams, auditChanges.toTeam.from), to: nameOf(teams, auditChanges.toTeam.to) };
  }
  req.audit = { entity: 'task', entityId: task._id, entityLabel: `${taskRef(task, project)} ${task.title}`, changes: auditChanges };

  Task.TRACKED_FIELDS.forEach((field) => {
    if (field in updates) task[field] = updates[field];
  });
  if ('description' in updates) task.description = updates.description;
  if (markingNotApproved) {
    task.notApproved = { reason: notApprovedReason, by: user._id, at: new Date() };
    logEntries.push({ field: 'notApprovedReason', oldValue: null, newValue: notApprovedReason, changedBy: user._id, changedAt: new Date() });
    auditChanges.notApprovedReason = { from: null, to: notApprovedReason };
  } else if (task.status !== NOT_APPROVED && task.notApproved) {
    task.notApproved = null;
  }

  const transitioningToDone = !wasAlreadyDone && task.status === 'done';
  if (transitioningToDone) task.completedAt = new Date();
  else if (task.status !== 'done') task.completedAt = null;

  task.activityLog.push(...logEntries);
  await task.save();

  // Full detail (comment authors + activity names) so the task modal can
  // show the change without a second GET.
  const populated = await task.populate([
    ...TASK_POPULATE,
    { path: 'comments.author', select: USER_FIELDS },
    { path: 'activityLog.changedBy', select: USER_FIELDS },
  ]);
  emitTaskEvent(project, populated, 'task:updated', populated);

  // Reply now; notifications and emails don't need to hold up the person
  // making the change.
  res.status(200).json({ task: populated });
  afterResponse('task-updated', async () => {
  const ref = taskRef(task, project);
  const link = taskLink(task, project);
  const newAssignee = idStr(populated.assignee);
  const assignedNow = newAssignee && newAssignee !== previousAssignee && newAssignee !== idStr(user._id);
  const changes = await describeChanges(logEntries);
  const watchers = await watcherIds(populated);

  // 1. The new assignee gets a dedicated "assigned to you" message.
  if (assignedNow) {
    notify([newAssignee], { actor: user._id, type: 'task_assigned', text: `${user.name} assigned you ${ref}: ${task.title}`, link });
    if ((await emailable([newAssignee])).length) {
      emails
        .sendTaskCreatedEmail({ task: populated, project, assignee: populated.assignee, reporter: populated.reporter, actor: user, reassigned: true })
        .catch(logEmailError('task-assigned'));
    }
  }

  // 2. A new team's heads get the "new request" message.
  const teamEntry = logEntries.find((e) => e.field === 'toTeam');
  if (teamEntry && populated.toTeam) {
    const heads = (await headsOf([populated.toTeam._id])).map((h) => h._id).filter((id) => !sameId(id, user._id));
    notify(heads, { actor: user._id, type: 'task_request', text: `${user.name} sent ${ref} to ${populated.toTeam.name}: ${task.title}`, link });
    emails
      .sendTaskRequestEmail({ task: populated, project, actor: user, recipients: await emailable(heads) })
      .catch(logEmailError('team-request'));
  }

  // 3. Everyone else following the task hears about the changes.
  if (changes.length) {
    const others = watchers.filter((id) => id !== idStr(user._id) && !(assignedNow && id === newAssignee));
    const summary = changes
      .filter((c) => c.field !== 'notApprovedReason')
      .map((c) => (c.field === 'dueDate' ? `deadline ${c.to}` : `${c.label.toLowerCase()} ${c.to}`))
      .join(', ');
    const text = markingNotApproved
      ? `${user.name} marked ${ref} Not approved: “${notApprovedReason.slice(0, 160)}”`
      : `${user.name} updated ${ref}: ${summary}`;
    notify(others, { actor: user._id, type: markingNotApproved ? 'task_not_approved' : 'task_updated', text, link });

    if (transitioningToDone) {
      const people = await emailable(watchers, [user._id]);
      if (people.length) {
        const [a, r] = [populated.assignee, populated.reporter];
        emails
          .sendTaskCompletedEmail({
            task: populated,
            project,
            assignee: people.find((p) => sameId(p._id, a?._id)) ? a : null,
            reporter: people.find((p) => sameId(p._id, r?._id)) ? r : null,
            others: people.filter((p) => !sameId(p._id, a?._id) && !sameId(p._id, r?._id)),
            actor: user,
          })
          .catch(logEmailError('task-completed'));
      }
    } else {
      emails
        .sendTaskUpdatedEmail({ task: populated, project, actor: user, changes, recipients: await emailable(others) })
        .catch(logEmailError('task-updated'));
    }
  }
  });
});

const deleteTask = catchAsync(async (req, res) => {
  const project = await loadProject(req.params.projectId);
  const task = await loadTask(req, project);
  const allowed =
    isSuperAdmin(req.user) || sameId(task.reporter, req.user._id) || isHeadOf(req.user, task.toTeam) || isHeadOf(req.user, task.fromTeam);
  if (!allowed) throw new ApiError(403, 'Only the person who raised it, a team head or a Super Admin can delete this task');
  req.audit = {
    entity: 'task',
    entityId: task._id,
    entityLabel: `${taskRef(task, project)} ${task.title}`,
    changes: { deleted: { title: task.title, status: task.status, assignee: idStr(task.assignee), comments: task.comments.length } },
  };
  await task.deleteOne();
  emitTaskEvent(project, task, 'task:deleted', { id: task._id });
  res.status(204).send();
});

// POST /api/projects/:projectId/tasks/:id/seen : sent when the task modal
// closes, so comments that arrived while it was open count as seen too.
const markTaskSeen = catchAsync(async (req, res) => {
  const project = await loadProject(req.params.projectId);
  const task = await loadTask(req, project);
  const at = new Date();
  await markCommentsSeen(task._id, req.user._id, at);
  req.audit = { skip: true }; // a read receipt, not a change
  res.status(200).json({ commentReads: [...(task.commentReads || []).filter((r) => !sameId(r.user, req.user._id)), { user: req.user._id, at }] });
});

const COMMENT_MAX = 5000;

// Of the @mentioned ids, the active people who can open this task. Others
// are reported back so the writer knows they weren't told.
async function resolveMentions(ids, task, project, author) {
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(String))]
    .filter((id) => mongoose.Types.ObjectId.isValid(id) && id !== idStr(author._id))
    .slice(0, 20);
  if (!wanted.length) return { mentioned: [], skipped: [] };
  const people = await User.find({ _id: { $in: wanted }, status: { $ne: 'disabled' } }).select('name role department');
  const mentioned = [];
  const skipped = [];
  people.forEach((p) => (canViewTask(p, task, project) ? mentioned : skipped).push(p));
  return { mentioned, skipped };
}

const addComment = catchAsync(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) throw new ApiError(400, 'text is required');
  if (text.length > COMMENT_MAX) throw new ApiError(400, `Comment is too long (${COMMENT_MAX} characters max)`);

  const project = await loadProject(req.params.projectId);
  const task = await loadTask(req, project);
  const { mentioned, skipped } = await resolveMentions(req.body.mentions, task, project, req.user);

  task.comments.push({ author: req.user._id, text, mentions: mentioned.map((p) => p._id) });
  task.activityLog.push({ field: 'comment', oldValue: null, newValue: text, changedBy: req.user._id, changedAt: new Date() });
  // The writer has obviously seen their own comment.
  task.commentReads = [...(task.commentReads || []).filter((r) => !sameId(r.user, req.user._id)), { user: req.user._id, at: new Date() }];
  await task.save();

  const populated = await task.populate([
    ...TASK_POPULATE,
    { path: 'comments.author', select: USER_FIELDS },
    { path: 'activityLog.changedBy', select: USER_FIELDS },
  ]);
  emitTaskEvent(project, populated, 'task:commented', populated);

  res.status(201).json({ task: populated, skippedMentions: skipped.map((p) => p.name) });
  afterResponse('task-comment', async () => {
  const ref = taskRef(task, project);
  const link = taskLink(task, project);
  const mentionedIds = mentioned.map((p) => idStr(p._id));
  // @mentioned people get "mentioned you"; everyone else following gets "commented".
  notify(mentionedIds, {
    actor: req.user._id,
    type: 'task_mention',
    text: `${req.user.name} mentioned you on ${ref}: “${text.slice(0, 140)}”`,
    link,
  });
  const others = (await watcherIds(populated)).filter((id) => id !== idStr(req.user._id) && !mentionedIds.includes(id));
  notify(others, {
    actor: req.user._id,
    type: 'task_comment',
    text: `${req.user.name} commented on ${ref}: ${task.title}`,
    link,
  });
  const people = await emailable([...others, ...mentionedIds]);
  if (people.length) {
    emails
      .sendTaskCommentEmail({ task: populated, project, recipients: people, actor: req.user, comment: text })
      .catch(logEmailError('task-comment'));
  }
  });
});

async function loadOwnComment(req) {
  const project = await loadProject(req.params.projectId);
  const task = await loadTask(req, project);
  const comment = task.comments.id(req.params.cid);
  if (!comment) throw new ApiError(404, 'Comment not found');
  return { project, task, comment };
}

async function replyWithTask(res, project, task, status = 200) {
  const populated = await task.populate([
    ...TASK_POPULATE,
    { path: 'comments.author', select: USER_FIELDS },
    { path: 'activityLog.changedBy', select: USER_FIELDS },
  ]);
  emitTaskEvent(project, populated, 'task:commented', populated);
  res.status(status).json({ task: populated });
}

// PATCH /api/projects/:projectId/tasks/:id/comments/:cid { text } : your own comments only.
const editComment = catchAsync(async (req, res) => {
  const { project, task, comment } = await loadOwnComment(req);
  if (!sameId(comment.author, req.user._id)) throw new ApiError(403, 'You can only edit your own comments');
  const text = String(req.body.text || '').trim();
  if (!text) throw new ApiError(400, 'Comment cannot be empty');
  if (text.length > COMMENT_MAX) throw new ApiError(400, `Comment is too long (${COMMENT_MAX} characters max)`);
  if (text !== comment.text) {
    req.audit = { entity: 'task', entityId: task._id, entityLabel: `${taskRef(task, project)} ${task.title}`, changes: { comment: { from: comment.text, to: text } } };
    comment.text = text;
    comment.editedAt = new Date();
    // Keep only mentions whose name is still in the text; people newly
    // mentioned while editing are not notified again.
    await task.populate({ path: 'comments.mentions', select: 'name' });
    comment.mentions = (comment.mentions || []).filter((m) => m && text.includes(`@${m.name}`)).map((m) => m._id);
    await task.save();
  }
  await replyWithTask(res, project, task);
});

// DELETE /api/projects/:projectId/tasks/:id/comments/:cid : the author or a Super Admin.
const deleteComment = catchAsync(async (req, res) => {
  const { project, task, comment } = await loadOwnComment(req);
  if (!sameId(comment.author, req.user._id) && !isSuperAdmin(req.user)) throw new ApiError(403, 'You can only delete your own comments');
  req.audit = { entity: 'task', entityId: task._id, entityLabel: `${taskRef(task, project)} ${task.title}`, changes: { deletedComment: { from: comment.text, to: null } } };
  comment.deleteOne();
  task.activityLog.push({ field: 'commentDeleted', oldValue: null, newValue: null, changedBy: req.user._id, changedAt: new Date() });
  await task.save();
  await replyWithTask(res, project, task);
});

const uploadAttachment = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'file is required');

  const project = await loadProject(req.params.projectId);
  const task = await loadTask(req, project);

  const fileId = await gridfs.uploadBuffer({
    buffer: req.file.buffer,
    filename: req.file.originalname,
    contentType: req.file.mimetype,
  });

  task.attachments.push({
    fileId,
    filename: req.file.originalname,
    contentType: req.file.mimetype,
    size: req.file.size,
    uploadedBy: req.user._id,
  });
  await task.save();

  const populated = await task.populate([
    ...TASK_POPULATE,
    { path: 'comments.author', select: USER_FIELDS },
    { path: 'activityLog.changedBy', select: USER_FIELDS },
  ]);
  res.status(201).json({ task: populated });
});

const downloadAttachment = catchAsync(async (req, res) => {
  const project = await loadProject(req.params.projectId);
  const task = await loadTask(req, project);

  const attachment = task.attachments.find((a) => a.fileId.toString() === req.params.fileId);
  if (!attachment) throw new ApiError(404, 'Attachment not found');

  res.set('Content-Type', attachment.contentType);
  res.set('Content-Disposition', `attachment; filename="${attachment.filename}"`);

  const stream = gridfs.downloadStream(attachment.fileId);
  stream.on('error', () => {
    res.status(404).json({ message: 'File not found in storage' });
  });
  stream.pipe(res);
});

// ---------- subtasks ----------
// Anyone who can see the task can manage its checklist. On a team task the
// assignee of a subtask must belong to that team (same rule as the task).

const FULL_POPULATE = [
  ...TASK_POPULATE,
  { path: 'comments.author', select: USER_FIELDS },
  { path: 'activityLog.changedBy', select: USER_FIELDS },
];

async function loadSubtaskTask(req) {
  const project = await loadProject(req.params.projectId);
  const task = await loadTask(req, project);
  return { project, task };
}

function findSubtask(task, sid) {
  const sub = task.subtasks.id(sid);
  if (!sub) throw new ApiError(404, 'Subtask not found');
  return sub;
}

async function checkSubtaskAssignee(assignee, task) {
  if (!assignee) return null;
  if (!mongoose.Types.ObjectId.isValid(String(assignee))) throw new ApiError(400, 'Invalid assignee');
  const person = await User.findById(assignee).select('name department status');
  if (!person || person.status === 'disabled') throw new ApiError(400, 'Assignee not found');
  if (task.toTeam && !sameId(person.department, task.toTeam)) {
    const team = await Department.findById(task.toTeam).select('name');
    throw new ApiError(400, `${person.name} is not in the ${team ? team.name : 'task'} team`);
  }
  return person;
}

function parseDue(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, 'Invalid deadline');
  return d;
}

// Saves, broadcasts, replies, then notifies a newly assigned person.
async function finishSubtaskChange(req, res, { task, project, assignedTo, subTitle, status = 200 }) {
  await task.save();
  const populated = await task.populate(FULL_POPULATE);
  emitTaskEvent(project, populated, 'task:updated', populated);
  res.status(status).json({ task: populated });
  if (assignedTo && !sameId(assignedTo, req.user._id)) {
    afterResponse('subtask-assigned', async () => {
      notify([assignedTo], {
        actor: req.user._id,
        type: 'subtask_assigned',
        text: `${req.user.name} assigned you a subtask on ${taskRef(task, project)}: ${subTitle}`,
        link: taskLink(task, project),
      });
    });
  }
}

// POST /api/projects/:projectId/tasks/:id/subtasks { title, assignee?, dueDate? }
const addSubtask = catchAsync(async (req, res) => {
  const { project, task } = await loadSubtaskTask(req);
  const title = String(req.body.title || '').trim();
  if (!title) throw new ApiError(400, 'Subtask title is required');
  if (title.length > 300) throw new ApiError(400, 'Subtask title is too long');
  if (task.subtasks.length >= Task.SUBTASK_MAX) throw new ApiError(400, `A task can have up to ${Task.SUBTASK_MAX} subtasks`);
  const person = await checkSubtaskAssignee(req.body.assignee, task);
  const order = task.subtasks.reduce((m, s) => Math.max(m, s.order), -1) + 1;
  task.subtasks.push({ title, assignee: person ? person._id : null, dueDate: parseDue(req.body.dueDate), order, createdBy: req.user._id });
  task.activityLog.push({ field: 'subtask', oldValue: null, newValue: `added: ${title}`, changedBy: req.user._id });
  await finishSubtaskChange(req, res, { task, project, assignedTo: person && person._id, subTitle: title, status: 201 });
});

// PATCH /api/projects/:projectId/tasks/:id/subtasks/:sid { title?, done?, assignee?, dueDate? }
const updateSubtask = catchAsync(async (req, res) => {
  const { project, task } = await loadSubtaskTask(req);
  const sub = findSubtask(task, req.params.sid);
  const log = (text) => task.activityLog.push({ field: 'subtask', oldValue: null, newValue: text, changedBy: req.user._id });
  let assignedTo = null;

  if (req.body.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) throw new ApiError(400, 'Subtask title is required');
    if (title.length > 300) throw new ApiError(400, 'Subtask title is too long');
    if (title !== sub.title) {
      log(`renamed: ${sub.title} → ${title}`);
      sub.title = title;
    }
  }
  if (req.body.done !== undefined) {
    const done = Boolean(req.body.done);
    if (done !== sub.done) {
      sub.done = done;
      sub.completedAt = done ? new Date() : null;
      sub.completedBy = done ? req.user._id : null;
      log(`${done ? 'completed' : 'reopened'}: ${sub.title}`);
    }
  }
  if (req.body.assignee !== undefined) {
    const person = await checkSubtaskAssignee(req.body.assignee || null, task);
    if (!sameId(person && person._id, sub.assignee)) {
      sub.assignee = person ? person._id : null;
      log(person ? `assigned ${person.name}: ${sub.title}` : `unassigned: ${sub.title}`);
      assignedTo = person && person._id;
    }
  }
  if (req.body.dueDate !== undefined) {
    const due = parseDue(req.body.dueDate);
    if (!sameDate(due, sub.dueDate)) {
      sub.dueDate = due;
      log(due ? `deadline ${due.toISOString().slice(0, 10)}: ${sub.title}` : `deadline cleared: ${sub.title}`);
    }
  }
  await finishSubtaskChange(req, res, { task, project, assignedTo, subTitle: sub.title });
});

// DELETE /api/projects/:projectId/tasks/:id/subtasks/:sid
const deleteSubtask = catchAsync(async (req, res) => {
  const { project, task } = await loadSubtaskTask(req);
  const sub = findSubtask(task, req.params.sid);
  task.activityLog.push({ field: 'subtask', oldValue: null, newValue: `removed: ${sub.title}`, changedBy: req.user._id });
  sub.deleteOne();
  await finishSubtaskChange(req, res, { task, project });
});

// PUT /api/projects/:projectId/tasks/:id/subtasks/order { ids: [sid, ...] }
const reorderSubtasks = catchAsync(async (req, res) => {
  const { project, task } = await loadSubtaskTask(req);
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  const known = new Set(task.subtasks.map((s) => String(s._id)));
  if (ids.length !== known.size || !ids.every((id) => known.has(id))) throw new ApiError(400, 'Send every subtask id once');
  ids.forEach((id, i) => {
    task.subtasks.id(id).order = i;
  });
  task.subtasks.sort((a, b) => a.order - b.order);
  await finishSubtaskChange(req, res, { task, project });
});

module.exports = {
  addSubtask,
  updateSubtask,
  deleteSubtask,
  reorderSubtasks,
  listAllTasks,
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  addComment,
  editComment,
  deleteComment,
  markTaskSeen,
  uploadAttachment,
  downloadAttachment,
};
