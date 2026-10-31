const Project = require('../models/Project');
const Task = require('../models/Task');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { visibleProjectFilter, assertCanViewProject } = require('../utils/access');
const { USER_FIELDS, startOfDay } = require('../utils/taskQuery');
const { buildFeed } = require('./activityController');

const PROJECT_POPULATE = [
  { path: 'members', select: USER_FIELDS },
  { path: 'owner', select: USER_FIELDS },
];

function parseDate(v) {
  if (v === undefined) return undefined;
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, 'Invalid date');
  return d;
}

// Adds done/total/overdue counts so cards and reports can show progress.
async function withProgress(projects) {
  const ids = projects.map((p) => p._id);
  const today = startOfDay();
  const rows = await Task.aggregate([
    { $match: { project: { $in: ids } } },
    {
      $group: {
        _id: '$project',
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        overdue: {
          $sum: {
            $cond: [
              { $and: [{ $ne: ['$status', 'done'] }, { $ne: ['$dueDate', null] }, { $lt: ['$dueDate', today] }] },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);
  const byId = new Map(rows.map((r) => [r._id.toString(), r]));
  return projects.map((p) => {
    const json = p.toObject ? p.toObject() : p;
    const r = byId.get(p._id.toString()) || { total: 0, done: 0, overdue: 0 };
    return { ...json, taskCount: r.total, doneCount: r.done, overdueCount: r.overdue };
  });
}

const createProject = catchAsync(async (req, res) => {
  const { name, description, key, startDate, targetDate, visibility, owner, members } = req.body;
  if (!name || !key) {
    throw new ApiError(400, 'name and key are required');
  }

  const memberIds = new Set([req.user._id.toString(), ...(Array.isArray(members) ? members : [])]);
  if (owner) memberIds.add(owner);

  const project = await Project.create({
    name,
    description,
    key,
    createdBy: req.user._id,
    owner: owner || req.user._id,
    members: [...memberIds],
    startDate: parseDate(startDate) || null,
    targetDate: parseDate(targetDate) || null,
    visibility: visibility === 'workspace' ? 'workspace' : 'private',
  });

  res.status(201).json({ project });
});

const listProjects = catchAsync(async (req, res) => {
  // Admins/managers see every project; employees see their own and workspace-visible ones.
  const filter = { ...visibleProjectFilter(req.user) };
  if (req.query.status === 'active' || req.query.status === 'archived') filter.status = req.query.status;
  const projects = await Project.find(filter).populate(PROJECT_POPULATE).sort('-createdAt');
  res.status(200).json({ projects: await withProgress(projects) });
});

const getProject = catchAsync(async (req, res) => {
  const project = await Project.findById(req.params.id).populate(PROJECT_POPULATE);
  if (!project) throw new ApiError(404, 'Project not found');
  assertCanViewProject(req.user, project);
  const [withCounts] = await withProgress([project]);
  res.status(200).json({ project: withCounts });
});

const updateProject = catchAsync(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) throw new ApiError(404, 'Project not found');

  const { name, description, status, visibility, owner } = req.body;
  if (name !== undefined) project.name = name;
  if (description !== undefined) project.description = description;
  if (status === 'active' || status === 'archived') project.status = status;
  if (visibility === 'private' || visibility === 'workspace') project.visibility = visibility;
  if (owner !== undefined) {
    project.owner = owner || null;
    if (owner && !project.members.some((m) => m.toString() === owner)) project.members.push(owner);
  }
  const startDate = parseDate(req.body.startDate);
  const targetDate = parseDate(req.body.targetDate);
  if (startDate !== undefined) project.startDate = startDate;
  if (targetDate !== undefined) project.targetDate = targetDate;

  await project.save();
  await project.populate(PROJECT_POPULATE);
  const [withCounts] = await withProgress([project]);
  res.status(200).json({ project: withCounts });
});

const deleteProject = catchAsync(async (req, res) => {
  const project = await Project.findByIdAndDelete(req.params.id);
  if (!project) throw new ApiError(404, 'Project not found');
  await Task.deleteMany({ project: project._id });
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

  const populated = await project.populate(PROJECT_POPULATE);
  res.status(200).json({ project: populated });
});

const removeMember = catchAsync(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) throw new ApiError(404, 'Project not found');
  project.members = project.members.filter((m) => m.toString() !== req.params.userId);
  if (project.owner && project.owner.toString() === req.params.userId) project.owner = null;
  await project.save();
  const populated = await project.populate(PROJECT_POPULATE);
  res.status(200).json({ project: populated });
});

// Aggregates activityLog entries across every task in the project into one
// chronological feed, most recent first.
const getActivityFeed = catchAsync(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) throw new ApiError(404, 'Project not found');
  assertCanViewProject(req.user, project);

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const feed = await buildFeed({ project: project._id }, limit);
  res.status(200).json({ feed });
});

module.exports = {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  addMember,
  removeMember,
  getActivityFeed,
};
