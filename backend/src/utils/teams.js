const mongoose = require('mongoose');

const idStr = (v) => (v ? String(v._id || v) : null);
const sameId = (a, b) => Boolean(a && b && idStr(a) === idStr(b));

function isSuperAdmin(user) {
  return user && user.role === 'admin';
}

// A Team Head is a 'manager' whose department is the team.
function isHeadOf(user, teamId) {
  return Boolean(user && user.role === 'manager' && teamId && sameId(user.department, teamId));
}

// Super Admin, or head of the task's target team.
function canManageTeamTask(user, toTeam) {
  return isSuperAdmin(user) || isHeadOf(user, toTeam);
}

async function headsOf(teamIds) {
  const ids = [...new Set(teamIds.filter(Boolean).map(idStr))];
  if (!ids.length) return [];
  return mongoose
    .model('User')
    .find({ role: 'manager', status: { $ne: 'disabled' }, department: { $in: ids } })
    .select('name email department emailNotifications');
}

module.exports = { idStr, sameId, isSuperAdmin, isHeadOf, canManageTeamTask, headsOf };
