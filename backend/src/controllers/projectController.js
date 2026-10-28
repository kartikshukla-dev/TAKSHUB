const Project = require('../models/Project');
const Task = require('../models/Task');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const createProject = catchAsync(async (req, res) => {
  const { name, description, key } = req.body;
  if (!name || !key) {
    throw new ApiError(400, 'name and key are required');
  }

  const project = await Project.create({
    name,
    description,
    key,
    createdBy: req.user._id,
    members: [req.user._id],
  });

  res.status(201).json({ project });
});

const listProjects = catchAsync(async (req, res) => {
  // Admins see every project, members only see projects they belong to.
  const filter = req.user.role === 'admin' ? {} : { members: req.user._id };
  const projects = await Project.find(filter).populate('members', 'name email avatar').sort('-createdAt');
  res.status(200).json({ projects });
});

const getProject = catchAsync(async (req, res) => {
  const project = await Project.findById(req.params.id).populate('members', 'name email avatar');
  if (!project) throw new ApiError(404, 'Project not found');
  res.status(200).json({ project });
});

const updateProject = catchAsync(async (req, res) => {
  const { name, description } = req.body;
  const project = await Project.findById(req.params.id);
  if (!project) throw new ApiError(404, 'Project not found');

  if (name !== undefined) project.name = name;
  if (description !== undefined) project.description = description;
  await project.save();

  res.status(200).json({ project });
});

const deleteProject = catchAsync(async (req, res) => {
  const project = await Project.findByIdAndDelete(req.params.id);
  if (!project) throw new ApiError(404, 'Project not found');
  res.status(204).send();
});

const addMember = catchAsync(async (req, res) => {
  const { userId } = req.body;
  if (!userId) throw new ApiError(400, 'userId is required');

  const project = await Project.findById(req.params.id);
  if (!project) throw new ApiError(404, 'Project not found');

  if (!project.members.some((m) => m.toString() === userId)) {
    project.members.push(userId);
    await project.save();
  }

  const populated = await project.populate('members', 'name email avatar');
  res.status(200).json({ project: populated });
});

// Aggregates activityLog entries across every task in the project into one
// chronological feed, most recent first.
const getActivityFeed = catchAsync(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) throw new ApiError(404, 'Project not found');

  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const tasks = await Task.find({ project: project._id })
    .select('title activityLog')
    .populate('activityLog.changedBy', 'name email avatar');

  const feed = tasks
    .flatMap((task) =>
      task.activityLog.map((entry) => ({
        taskId: task._id,
        taskTitle: task.title,
        field: entry.field,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        changedBy: entry.changedBy,
        changedAt: entry.changedAt,
      }))
    )
    .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))
    .slice(0, limit);

  res.status(200).json({ feed });
});

module.exports = {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  addMember,
  getActivityFeed,
};
