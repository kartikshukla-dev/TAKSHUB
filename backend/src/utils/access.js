const Project = require('../models/Project');
const ApiError = require('./ApiError');
const { idStr, isSuperAdmin } = require('./teams');

/*
 * Visibility rules
 *  - Super Admin: everything.
 *  - Everyone else (Team Heads and Members) sees a task when any of these hold:
 *      they are its assignee or reporter;
 *      it was raised by, or sent to, their team (department);
 *      it belongs to a normal project they can see (member, or workspace-visible).
 *  - The built-in "Team requests" project is open to everyone for creating
 *    tasks, but its tasks are only visible through the rules above.
 */

// Kept for older callers: "staff" now means Super Admin only for visibility.
function isStaff(user) {
  return isSuperAdmin(user);
}

function visibleProjectFilter(user) {
  if (isSuperAdmin(user)) return {};
  return { $or: [{ members: user._id }, { visibility: 'workspace' }, { system: true }] };
}

async function membershipProjectIds(user) {
  const projects = await Project.find({
    system: { $ne: true },
    $or: [{ members: user._id }, { visibility: 'workspace' }],
  }).select('_id');
  return projects.map((p) => p._id);
}

async function visibleTaskFilter(user) {
  if (isSuperAdmin(user)) return {};
  const projectIds = await membershipProjectIds(user);
  const or = [{ assignee: user._id }, { reporter: user._id }, { project: { $in: projectIds } }];
  if (user.department) {
    or.push({ fromTeam: user.department }, { toTeam: user.department });
  }
  return { $or: or };
}

function canViewProject(user, project) {
  if (isSuperAdmin(user)) return true;
  if (project.system) return true;
  if (project.visibility === 'workspace') return true;
  return project.members.some((m) => idStr(m) === idStr(user._id));
}

function canViewTask(user, task, project) {
  if (isSuperAdmin(user)) return true;
  const uid = idStr(user._id);
  if (idStr(task.assignee) === uid || idStr(task.reporter) === uid) return true;
  const dept = idStr(user.department);
  if (dept && (idStr(task.fromTeam) === dept || idStr(task.toTeam) === dept)) return true;
  if (!project || project.system) return false;
  return canViewProject(user, project);
}

function assertCanViewProject(user, project) {
  if (!canViewProject(user, project)) throw new ApiError(403, 'You do not have access to this project');
}

module.exports = {
  isStaff,
  visibleProjectFilter,
  visibleProjectIds: membershipProjectIds,
  visibleTaskFilter,
  canViewProject,
  canViewTask,
  assertCanViewProject,
};
