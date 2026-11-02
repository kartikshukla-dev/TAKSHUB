const mongoose = require('mongoose');
const Department = require('../models/Department');
const User = require('../models/User');
const Task = require('../models/Task');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { startOfDay } = require('../utils/taskQuery');
const { isSuperAdmin, isHeadOf } = require('../utils/teams');

const PERSON_FIELDS = 'name email role status jobTitle avatar department lastLoginAt';

// Task numbers for a team: tasks sent to it plus tasks assigned to its members.
async function teamTaskStats(teamIds) {
  const today = startOfDay();
  const members = await User.find({ department: { $in: teamIds } }).select('_id department').lean();
  const teamOfUser = new Map(members.map((m) => [String(m._id), String(m.department)]));
  const tasks = await Task.find({
    status: { $ne: 'done' },
    $or: [{ toTeam: { $in: teamIds } }, { assignee: { $in: members.map((m) => m._id) } }],
  })
    .select('toTeam assignee dueDate')
    .lean();

  const stats = new Map(teamIds.map((id) => [String(id), { open: 0, overdue: 0, unassigned: 0 }]));
  tasks.forEach((t) => {
    const team = t.toTeam ? String(t.toTeam) : teamOfUser.get(String(t.assignee));
    const s = stats.get(team);
    if (!s) return;
    s.open += 1;
    if (t.dueDate && new Date(t.dueDate) < today) s.overdue += 1;
    if (t.toTeam && !t.assignee) s.unassigned += 1;
  });
  return stats;
}

// GET /api/teams (Super Admin): every team with its heads and numbers.
const listTeams = catchAsync(async (req, res) => {
  if (!isSuperAdmin(req.user)) throw new ApiError(403, 'Only Super Admins can see all teams');
  const teams = await Department.find().sort('name').lean();
  const ids = teams.map((t) => t._id);
  const people = await User.find({ department: { $in: ids }, status: { $ne: 'disabled' } }).select(PERSON_FIELDS).sort('name').lean();
  const stats = await teamTaskStats(ids);
  res.status(200).json({
    teams: teams.map((t) => {
      const mine = people.filter((p) => String(p.department) === String(t._id));
      return {
        ...t,
        heads: mine.filter((p) => p.role === 'manager'),
        memberCount: mine.length,
        pendingInvites: mine.filter((p) => p.status === 'invited').length,
        ...stats.get(String(t._id)),
      };
    }),
  });
});

// GET /api/teams/:id : a Super Admin, or the team's own head.
const getTeam = catchAsync(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new ApiError(400, 'Invalid id format');
  if (!isSuperAdmin(req.user) && !isHeadOf(req.user, req.params.id)) throw new ApiError(403, 'Only this team’s head or a Super Admin can open this page');
  const team = await Department.findById(req.params.id).lean();
  if (!team) throw new ApiError(404, 'Team not found');

  const today = startOfDay();
  const members = await User.find({ department: team._id, status: { $ne: 'disabled' } }).select(PERSON_FIELDS).sort('name').lean();
  const open = await Task.aggregate([
    { $match: { assignee: { $in: members.map((m) => m._id) }, status: { $ne: 'done' } } },
    {
      $group: {
        _id: '$assignee',
        open: { $sum: 1 },
        overdue: { $sum: { $cond: [{ $and: [{ $ne: ['$dueDate', null] }, { $lt: ['$dueDate', today] }] }, 1, 0] } },
      },
    },
  ]);
  const byUser = new Map(open.map((r) => [String(r._id), r]));
  const stats = (await teamTaskStats([team._id])).get(String(team._id));

  res.status(200).json({
    team: {
      ...team,
      ...stats,
      heads: members.filter((m) => m.role === 'manager'),
      members: members.map((m) => ({ ...m, openCount: byUser.get(String(m._id))?.open || 0, overdueCount: byUser.get(String(m._id))?.overdue || 0 })),
    },
  });
});

module.exports = { listTeams, getTeam };
