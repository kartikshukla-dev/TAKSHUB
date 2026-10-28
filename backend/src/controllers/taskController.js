const Task = require('../models/Task');
const Project = require('../models/Project');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { diffTaskFields } = require('../utils/taskDiff');
const { sendTaskCreatedEmail, sendTaskCompletedEmail } = require('../services/emailService');
const { emitToProject } = require('../services/socketService');
const gridfs = require('../services/gridfsService');

async function assertProjectExists(projectId) {
  const project = await Project.findById(projectId);
  if (!project) throw new ApiError(404, 'Project not found');
  return project;
}

const createTask = catchAsync(async (req, res) => {
  const project = await assertProjectExists(req.params.projectId);
  const { title, description, priority, assignee, labels, dueDate } = req.body;

  if (!title) throw new ApiError(400, 'title is required');

  const task = await Task.create({
    title,
    description,
    priority,
    assignee: assignee || null,
    labels,
    dueDate,
    project: project._id,
    reporter: req.user._id,
  });

  const populated = await task.populate([
    { path: 'assignee', select: 'name email avatar' },
    { path: 'reporter', select: 'name email avatar' },
  ]);

  emitToProject(project._id, 'task:created', populated);

  if (populated.assignee) {
    sendTaskCreatedEmail({
      task: populated,
      project,
      assignee: populated.assignee,
      reporter: populated.reporter,
    }).catch((err) => console.error('[email] task-created failed:', err.message));
  }

  res.status(201).json({ task: populated });
});

const listTasks = catchAsync(async (req, res) => {
  await assertProjectExists(req.params.projectId);
  const tasks = await Task.find({ project: req.params.projectId })
    .populate('assignee', 'name email avatar')
    .populate('reporter', 'name email avatar')
    .sort('-createdAt');
  res.status(200).json({ tasks });
});

const getTask = catchAsync(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, project: req.params.projectId })
    .populate('assignee', 'name email avatar')
    .populate('reporter', 'name email avatar')
    .populate('comments.author', 'name email avatar')
    .populate('activityLog.changedBy', 'name email avatar');
  if (!task) throw new ApiError(404, 'Task not found');
  res.status(200).json({ task });
});

const updateTask = catchAsync(async (req, res) => {
  const project = await assertProjectExists(req.params.projectId);
  const task = await Task.findOne({ _id: req.params.id, project: req.params.projectId });
  if (!task) throw new ApiError(404, 'Task not found');

  const updates = req.body;
  const wasAlreadyDone = task.status === 'done';

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

  const populated = await task.populate([
    { path: 'assignee', select: 'name email avatar' },
    { path: 'reporter', select: 'name email avatar' },
  ]);

  emitToProject(project._id, 'task:updated', populated);

  if (transitioningToDone) {
    sendTaskCompletedEmail({
      task: populated,
      project,
      assignee: populated.assignee,
      reporter: populated.reporter,
    }).catch((err) => console.error('[email] task-completed failed:', err.message));
  }

  res.status(200).json({ task: populated });
});

const deleteTask = catchAsync(async (req, res) => {
  const task = await Task.findOneAndDelete({ _id: req.params.id, project: req.params.projectId });
  if (!task) throw new ApiError(404, 'Task not found');
  emitToProject(req.params.projectId, 'task:deleted', { id: task._id });
  res.status(204).send();
});

const addComment = catchAsync(async (req, res) => {
  const { text } = req.body;
  if (!text) throw new ApiError(400, 'text is required');

  const task = await Task.findOne({ _id: req.params.id, project: req.params.projectId });
  if (!task) throw new ApiError(404, 'Task not found');

  task.comments.push({ author: req.user._id, text });
  task.activityLog.push({
    field: 'comment',
    oldValue: null,
    newValue: text,
    changedBy: req.user._id,
    changedAt: new Date(),
  });
  await task.save();

  const populated = await task.populate('comments.author', 'name email avatar');
  emitToProject(req.params.projectId, 'task:commented', populated);

  res.status(201).json({ task: populated });
});

const uploadAttachment = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'file is required');

  const task = await Task.findOne({ _id: req.params.id, project: req.params.projectId });
  if (!task) throw new ApiError(404, 'Task not found');

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

  res.status(201).json({ task });
});

const downloadAttachment = catchAsync(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, project: req.params.projectId });
  if (!task) throw new ApiError(404, 'Task not found');

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
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  addComment,
  uploadAttachment,
  downloadAttachment,
};
