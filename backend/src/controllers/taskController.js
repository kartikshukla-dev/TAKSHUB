const mongoose = require('mongoose');
const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const Department = require('../models/Department');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { diffTaskFields } = require('../utils/taskDiff');
const { canViewTask, assertCanViewProject } = require('../utils/access');
const { idStr, sameId, isSuperAdmin, isHeadOf, canManageTeamTask, headsOf } = require('../utils/teams');
const { buildTaskFilter, sortTasks, TASK_POPULATE, USER_FIELDS } = require('../utils/taskQuery');
const emails = require('../services/emailService');
const { formatDate } = require('../services/emailTemplates');
const { emitTaskEvent } = require('../services/socketService');
const { notify } = require('../services/notificationService');
const gridfs = require('../services/gridfsService');

const STATUS_LABELS = { todo: 'To do', 'in-progress': 'In progress', 'in-review': 'In review', done: 'Done' };
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

  const projectId = req.params.projectId || req.body.project;
  const team = await loadTeam(toTeam);
  if (!projectId && !team) throw new ApiError(400, 'Pick a project or a team to send this task to');
  const project = projectId ? await loadProject(projectId, req.user) : await requestsProject(req.user);

  if (team && !canManageTeamTask(req.user, team._id)) {
    if (assignee) throw new ApiError(403, `Only the ${team.name} head can assign this task`);
    if (dueDate) throw new ApiError(403, `Only the ${team.name} head can set the deadline`);
  }
  await assertAssigneeInTeam(assignee, team);

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
    activityLog: [
      { field: 'created', oldValue: null, newValue: title, changedBy: req.user._id },
      ...(team ? [{ field: 'toTeam', oldValue: null, newValue: team.name, changedBy: req.user._id }] : []),
    ],
  });

  const populated = await task.populate(TASK_POPULATE);
  emitTaskEvent(project, populated, 'task:created', populated);

  res.status(201).json({ task: populated });
  afterResponse('task-created', async () => {
  const ref = taskRef(task, project);
  const link = taskLink(task, project);

  if (team) {
    const heads = await headsOf([team._id]);
    const headIds = heads.map((h) => h._id).filter((id) => !sameId(id, req.user._id));
    notify(headIds, {
      actor: req.user._id,
      type: 'task_request',
      text: `${req.user.name} raised ${ref} for ${team.name}: ${task.title}`,
      link,
    });
    const to = await emailable(headIds);
    emails.sendTaskRequestEmail({ task: populated, project, actor: req.user, recipients: to }).catch(logEmailError('team-request'));
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
  await loadTask(req, project);
  const task = await Task.findById(req.params.id).populate([
    ...TASK_POPULATE,
    { path: 'comments.author', select: USER_FIELDS },
    { path: 'activityLog.changedBy', select: USER_FIELDS },
  ]);
  res.status(200).json({ task });
});

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
  };
  const labels = { status: 'Status', priority: 'Priority', dueDate: 'Deadline', assignee: 'Assignee', toTeam: 'Team', blocked: 'Blocked', title: 'Title' };
  // Deadline first: it's the change people care about most.
  const order = ['dueDate', 'assignee', 'status', 'toTeam', 'priority', 'blocked', 'title'];
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
    const canManage = canManageTeamTask(user, team._id);
    const assigneeChanged = 'assignee' in updates && !sameId(updates.assignee, task.assignee) && !(updates.assignee === null && !task.assignee);
    const deadlineChanged = 'dueDate' in updates && !sameDate(updates.dueDate, task.dueDate);
    // Clearing the assignee as part of a re-route is allowed.
    const rerouteClear = 'toTeam' in updates && updates.assignee === null;
    if (assigneeChanged && !canManage && !rerouteClear) throw new ApiError(403, `Only the ${team.name} head can assign this task`);
    if (deadlineChanged && !canManage) throw new ApiError(403, `Only the ${team.name} head can set the deadline`);
    if (assigneeChanged && updates.assignee) await assertAssigneeInTeam(updates.assignee, team);
    if (!deadlineChanged) delete updates.dueDate;
  }

  const wasAlreadyDone = task.status === 'done';
  const previousAssignee = idStr(task.assignee);
  const logEntries = diffTaskFields(task, updates, user._id);

  Task.TRACKED_FIELDS.forEach((field) => {
    if (field in updates) task[field] = updates[field];
  });
  if ('description' in updates) task.description = updates.description;

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
    const summary = changes.map((c) => (c.field === 'dueDate' ? `deadline ${c.to}` : `${c.label.toLowerCase()} ${c.to}`)).join(', ');
    notify(others, { actor: user._id, type: 'task_updated', text: `${user.name} updated ${ref}: ${summary}`, link });

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
  await task.deleteOne();
  emitTaskEvent(project, task, 'task:deleted', { id: task._id });
  res.status(204).send();
});

const addComment = catchAsync(async (req, res) => {
  const { text } = req.body;
  if (!text || !String(text).trim()) throw new ApiError(400, 'text is required');

  const project = await loadProject(req.params.projectId);
  const task = await loadTask(req, project);

  task.comments.push({ author: req.user._id, text });
  task.activityLog.push({ field: 'comment', oldValue: null, newValue: text, changedBy: req.user._id, changedAt: new Date() });
  await task.save();

  const populated = await task.populate([
    ...TASK_POPULATE,
    { path: 'comments.author', select: USER_FIELDS },
    { path: 'activityLog.changedBy', select: USER_FIELDS },
  ]);
  emitTaskEvent(project, populated, 'task:commented', populated);

  res.status(201).json({ task: populated });
  afterResponse('task-comment', async () => {
  const others = (await watcherIds(populated)).filter((id) => id !== idStr(req.user._id));
  notify(others, {
    actor: req.user._id,
    type: 'task_comment',
    text: `${req.user.name} commented on ${taskRef(task, project)}: ${task.title}`,
    link: taskLink(task, project),
  });
  const people = await emailable(others);
  if (people.length) {
    emails
      .sendTaskCommentEmail({ task: populated, project, recipients: people, actor: req.user, comment: text })
      .catch(logEmailError('task-comment'));
  }
  });
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

module.exports = {
  listAllTasks,
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  addComment,
  uploadAttachment,
  downloadAttachment,
};
