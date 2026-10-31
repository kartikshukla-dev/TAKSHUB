const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { diffTaskFields } = require('../utils/taskDiff');
const { canViewTask, assertCanViewProject } = require('../utils/access');
const { buildTaskFilter, sortTasks, TASK_POPULATE, USER_FIELDS } = require('../utils/taskQuery');
const {
  sendTaskCreatedEmail,
  sendTaskCompletedEmail,
  sendTaskCommentEmail,
} = require('../services/emailService');
const { emitTaskEvent } = require('../services/socketService');
const { notify } = require('../services/notificationService');
const gridfs = require('../services/gridfsService');

const STATUS_LABELS = { todo: 'To do', 'in-progress': 'In progress', 'in-review': 'In review', done: 'Done' };

async function loadProject(projectId, user) {
  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, 'Project not found');
  if (user) assertCanViewProject(user, project);
  return project;
}

async function loadTask(req, project) {
  const task = await Task.findOne({ _id: req.params.id, project: req.params.projectId });
  if (!task) throw new ApiError(404, 'Task not found');
  if (!canViewTask(req.user, task, project)) throw new ApiError(403, 'You do not have access to this task');
  return task;
}

function taskRef(task, project) {
  return task.number ? `${project.key}-${task.number}` : project.key;
}

function taskLink(task, project) {
  return `/projects/${project._id}?task=${task._id}`;
}

// Users who opted out of email are filtered here, so the email service
// itself stays a pure "send this" helper.
async function wantsEmail(user) {
  if (!user) return false;
  const fresh = await User.findById(user._id || user).select('emailNotifications');
  return Boolean(fresh && fresh.emailNotifications !== false);
}

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

const createTask = catchAsync(async (req, res) => {
  const project = await loadProject(req.params.projectId, req.user);
  const { title, description, priority, assignee, labels, dueDate, status, blocked } = req.body;
  if (!title) throw new ApiError(400, 'title is required');

  const seq = await Project.findByIdAndUpdate(project._id, { $inc: { taskSeq: 1 } }, { new: true });

  const task = await Task.create({
    title,
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
    completedAt: status === 'done' ? new Date() : null,
    activityLog: [{ field: 'created', oldValue: null, newValue: title, changedBy: req.user._id }],
  });

  const populated = await task.populate(TASK_POPULATE);
  emitTaskEvent(project, populated, 'task:created', populated);

  if (populated.assignee) {
    notify([populated.assignee._id], {
      actor: req.user._id,
      type: 'task_assigned',
      text: `${req.user.name} assigned you ${taskRef(task, project)}: ${task.title}`,
      link: taskLink(task, project),
    });
    if (await wantsEmail(populated.assignee)) {
      sendTaskCreatedEmail({
        task: populated,
        project,
        assignee: populated.assignee,
        reporter: populated.reporter,
        actor: req.user,
      }).catch((err) => console.error('[email] task-created failed:', err.message));
    }
  }

  res.status(201).json({ task: populated });
});

const listTasks = catchAsync(async (req, res) => {
  await loadProject(req.params.projectId, req.user);
  const tasks = await Task.find({ project: req.params.projectId }).populate(TASK_POPULATE).sort('-createdAt');
  res.status(200).json({ tasks });
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

const updateTask = catchAsync(async (req, res) => {
  const project = await loadProject(req.params.projectId);
  const task = await loadTask(req, project);

  const updates = { ...req.body };
  if ('assignee' in updates && !updates.assignee) updates.assignee = null;
  if ('dueDate' in updates && !updates.dueDate) updates.dueDate = null;
  if ('blocked' in updates) updates.blocked = Boolean(updates.blocked);

  const wasAlreadyDone = task.status === 'done';
  const previousStatus = task.status;
  const previousAssignee = task.assignee ? task.assignee.toString() : null;
  const logEntries = diffTaskFields(task, updates, req.user._id);

  Task.TRACKED_FIELDS.forEach((field) => {
    if (field in updates) task[field] = updates[field];
  });
  if ('description' in updates) task.description = updates.description;

  const transitioningToDone = !wasAlreadyDone && task.status === 'done';
  if (transitioningToDone) {
    task.completedAt = new Date();
  } else if (task.status !== 'done') {
    task.completedAt = null;
  }

  task.activityLog.push(...logEntries);
  await task.save();

  const populated = await task.populate(TASK_POPULATE);
  emitTaskEvent(project, populated, 'task:updated', populated);

  const ref = taskRef(task, project);
  const link = taskLink(task, project);
  // task.assignee is populated at this point, so read its _id.
  const newAssignee = task.assignee ? (task.assignee._id || task.assignee).toString() : null;
  if (newAssignee && newAssignee !== previousAssignee) {
    notify([newAssignee], {
      actor: req.user._id,
      type: 'task_assigned',
      text: `${req.user.name} assigned you ${ref}: ${task.title}`,
      link,
    });
    // No email when you assign a task to yourself.
    if (newAssignee !== req.user._id.toString() && (await wantsEmail(populated.assignee))) {
      sendTaskCreatedEmail({
        task: populated,
        project,
        assignee: populated.assignee,
        reporter: populated.reporter,
        actor: req.user,
        reassigned: true,
      }).catch((err) => console.error('[email] task-assigned failed:', err.message));
    }
  }
  if (task.status !== previousStatus) {
    notify([task.assignee, task.reporter], {
      actor: req.user._id,
      type: 'task_status',
      text: `${req.user.name} moved ${ref} to ${STATUS_LABELS[task.status]}`,
      link,
    });
  }

  if (transitioningToDone) {
    const [assigneeOk, reporterOk] = await Promise.all([
      wantsEmail(populated.assignee),
      wantsEmail(populated.reporter),
    ]);
    sendTaskCompletedEmail({
      task: populated,
      project,
      assignee: assigneeOk ? populated.assignee : null,
      reporter: reporterOk ? populated.reporter : null,
      actor: req.user,
    }).catch((err) => console.error('[email] task-completed failed:', err.message));
  }

  res.status(200).json({ task: populated });
});

const deleteTask = catchAsync(async (req, res) => {
  const project = await loadProject(req.params.projectId);
  const task = await loadTask(req, project);
  const isOwner = task.reporter.toString() === req.user._id.toString();
  if (!isOwner && !['admin', 'manager'].includes(req.user.role)) {
    throw new ApiError(403, 'Only the reporter, a manager or an admin can delete this task');
  }
  await task.deleteOne();
  emitTaskEvent(project, task, 'task:deleted', { id: task._id });
  res.status(204).send();
});

const addComment = catchAsync(async (req, res) => {
  const { text } = req.body;
  if (!text) throw new ApiError(400, 'text is required');

  const project = await loadProject(req.params.projectId);
  const task = await loadTask(req, project);

  task.comments.push({ author: req.user._id, text });
  task.activityLog.push({
    field: 'comment',
    oldValue: null,
    newValue: text,
    changedBy: req.user._id,
    changedAt: new Date(),
  });
  await task.save();

  const populated = await task.populate([
    ...TASK_POPULATE,
    { path: 'comments.author', select: USER_FIELDS },
    { path: 'activityLog.changedBy', select: USER_FIELDS },
  ]);
  emitTaskEvent(project, populated, 'task:commented', populated);
  notify([task.assignee, task.reporter], {
    actor: req.user._id,
    type: 'task_comment',
    text: `${req.user.name} commented on ${taskRef(task, project)}: ${task.title}`,
    link: taskLink(task, project),
  });

  // Email the assignee and reporter (not the commenter), if they opted in.
  const me = req.user._id.toString();
  const people = [populated.assignee, populated.reporter].filter(
    (p, i, arr) => p && p._id.toString() !== me && arr.findIndex((q) => q && q._id.equals(p._id)) === i
  );
  const optedIn = (await Promise.all(people.map(async (p) => ((await wantsEmail(p)) ? p : null)))).filter(Boolean);
  if (optedIn.length) {
    sendTaskCommentEmail({ task: populated, project, recipients: optedIn, actor: req.user, comment: text }).catch((err) =>
      console.error('[email] task-comment failed:', err.message)
    );
  }

  res.status(201).json({ task: populated });
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
