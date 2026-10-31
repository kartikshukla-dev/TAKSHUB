const Project = require('../models/Project');
const ApiError = require('./ApiError');

// Admins and managers see the whole workspace. Employees ('member') see
// projects they belong to plus workspace-visible projects, and tasks in
// those projects or tasks they're assigned to / reported.
function isStaff(user) {
  return user.role === 'admin' || user.role === 'manager';
}

function visibleProjectFilter(user) {
  if (isStaff(user)) return {};
  return { $or: [{ members: user._id }, { visibility: 'workspace' }] };
}

async function visibleProjectIds(user) {
  const projects = await Project.find(visibleProjectFilter(user)).select('_id');
  return projects.map((p) => p._id);
}

async function visibleTaskFilter(user) {
  if (isStaff(user)) return {};
  const projectIds = await visibleProjectIds(user);
  return {
    $or: [{ assignee: user._id }, { reporter: user._id }, { project: { $in: projectIds } }],
  };
}

function canViewProject(user, project) {
  if (isStaff(user)) return true;
  if (project.visibility === 'workspace') return true;
  return project.members.some((m) => (m._id || m).toString() === user._id.toString());
}

function canViewTask(user, task, project) {
  if (isStaff(user)) return true;
  const uid = user._id.toString();
  const idOf = (v) => (v && (v._id || v).toString()) || null;
  if (idOf(task.assignee) === uid || idOf(task.reporter) === uid) return true;
  return project ? canViewProject(user, project) : false;
}

function assertCanViewProject(user, project) {
  if (!canViewProject(user, project)) throw new ApiError(403, 'You do not have access to this project');
}

module.exports = {
  isStaff,
  visibleProjectFilter,
  visibleProjectIds,
  visibleTaskFilter,
  canViewProject,
  canViewTask,
  assertCanViewProject,
};
