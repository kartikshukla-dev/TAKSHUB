const mongoose = require('mongoose');
const User = require('../models/User');
const Task = require('../models/Task');
const Department = require('../models/Department');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { startOfDay } = require('../utils/taskQuery');
const { sameId, isSuperAdmin, isHeadOf } = require('../utils/teams');
const { isSuperAdminEmail } = require('../services/accountService');
const { sendInviteEmail, sendRoleChangedEmail } = require('../services/emailService');

const PUBLIC_FIELDS = 'name email role status avatar jobTitle department lastLoginAt invitedAt';
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Open and overdue assigned-task counts per user.
async function workloadByUser(userIds) {
  const today = startOfDay();
  const rows = await Task.aggregate([
    { $match: { assignee: { $in: userIds }, status: { $ne: 'done' } } },
    {
      $group: {
        _id: '$assignee',
        open: { $sum: 1 },
        overdue: { $sum: { $cond: [{ $and: [{ $ne: ['$dueDate', null] }, { $lt: ['$dueDate', today] }] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r]));
}

function withCounts(users, counts) {
  return users.map((u) => {
    const c = counts.get(u._id.toString());
    return { ...u, openCount: c ? c.open : 0, overdueCount: c ? c.overdue : 0 };
  });
}

// Directory listing for pickers, the Team page and chat. Disabled people are
// hidden unless a Super Admin asks for ?all=1 (the Users page).
const listUsers = catchAsync(async (req, res) => {
  const filter = {};
  if (!(isSuperAdmin(req.user) && req.query.all === '1')) filter.status = { $ne: 'disabled' };
  if (req.query.department && mongoose.Types.ObjectId.isValid(req.query.department)) filter.department = req.query.department;
  const users = await User.find(filter).select(PUBLIC_FIELDS).populate('department', 'name').sort('name').lean();
  res.status(200).json({ users: withCounts(users, await workloadByUser(users.map((u) => u._id))) });
});

const getUser = catchAsync(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new ApiError(400, 'Invalid id format');
  const user = await User.findById(req.params.id).select(PUBLIC_FIELDS).populate('department', 'name').lean();
  if (!user) throw new ApiError(404, 'User not found');
  res.status(200).json({ user: withCounts([user], await workloadByUser([user._id]))[0] });
});

async function resolveDepartment(value) {
  if (value === undefined) return undefined;
  if (!value) return null;
  if (!mongoose.Types.ObjectId.isValid(value)) throw new ApiError(400, 'Invalid department');
  const dept = await Department.findById(value);
  if (!dept) throw new ApiError(400, 'Department not found');
  return dept;
}

// PATCH /api/users/:id (Super Admin): role, team, job title, status.
// The person gets an email whenever their role or team changes.
const updateUser = catchAsync(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new ApiError(400, 'Invalid id format');
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  const self = user._id.equals(req.user._id);
  const previousRole = user.role;
  const previousDept = user.department ? String(user.department) : null;

  const { role, jobTitle, name, status } = req.body;
  if (role !== undefined) {
    if (!User.ROLES.includes(role)) throw new ApiError(400, 'Invalid role');
    if (self && role !== 'admin') throw new ApiError(400, 'You cannot remove your own Super Admin role');
    user.role = role;
  }
  if (status !== undefined) {
    if (!['active', 'disabled'].includes(status)) throw new ApiError(400, 'Invalid status');
    if (self && status === 'disabled') throw new ApiError(400, 'You cannot disable your own account');
    if (status === 'disabled' && isSuperAdminEmail(user.email)) throw new ApiError(400, 'This Super Admin is set in the server config and cannot be disabled');
    // Re-enabling someone who never signed in puts them back to "invited".
    user.status = status === 'active' && !user.lastLoginAt ? 'invited' : status;
  }
  if (jobTitle !== undefined) user.jobTitle = jobTitle;
  if (name !== undefined && name.trim()) user.name = name.trim();
  const dept = await resolveDepartment(req.body.department);
  if (dept !== undefined) user.department = dept ? dept._id : null;
  if (user.role === 'manager' && !user.department) throw new ApiError(400, 'A Team Head needs a team. Pick a department first.');

  await user.save();
  await user.populate('department', 'name');

  const roleChanged = user.role !== previousRole;
  const teamChanged = (user.department ? String(user.department._id) : null) !== previousDept;
  if ((roleChanged || teamChanged) && !self && user.status !== 'disabled') {
    sendRoleChangedEmail({ user, changedBy: req.user, team: user.department, previousRole }).catch((err) =>
      console.error('[email] role-changed failed:', err.message)
    );
  }
  res.status(200).json({ user: user.toSafeJSON() });
});

// PATCH /api/users/me : own profile.
const updateMe = catchAsync(async (req, res) => {
  const { name, jobTitle, emailNotifications } = req.body;
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'Name cannot be empty');
    req.user.name = name.trim();
  }
  if (jobTitle !== undefined) req.user.jobTitle = jobTitle;
  if (emailNotifications !== undefined) req.user.emailNotifications = Boolean(emailNotifications);
  await req.user.save();
  await req.user.populate('department', 'name');
  res.status(200).json({ user: req.user.toSafeJSON() });
});

/**
 * POST /api/invites { name, email, role?, department?, jobTitle? }
 *  - Super Admin: any team and role.
 *  - Team Head: always a Member of their own team.
 * Creates the account in "invited" state and emails the person. Inviting an
 * email that is still pending just re-sends the invite.
 */
const invite = catchAsync(async (req, res) => {
  const admin = isSuperAdmin(req.user);
  if (!admin && req.user.role !== 'manager') throw new ApiError(403, 'Only Super Admins and Team Heads can invite people');

  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  if (!EMAIL_RX.test(email)) throw new ApiError(400, 'Enter a valid email address');
  if (!name) throw new ApiError(400, 'Enter their name');

  let role = 'member';
  let dept;
  if (admin) {
    if (req.body.role && !User.ROLES.includes(req.body.role)) throw new ApiError(400, 'Invalid role');
    role = req.body.role || 'member';
    dept = await resolveDepartment(req.body.department || null);
  } else {
    if (!req.user.department) throw new ApiError(400, 'You are not assigned to a team yet');
    dept = await Department.findById(req.user.department);
  }
  if (role === 'manager' && !dept) throw new ApiError(400, 'A Team Head needs a team');

  let user = await User.findOne({ email });
  if (user && user.status !== 'invited') {
    throw new ApiError(409, user.status === 'disabled' ? 'This person exists but is disabled. A Super Admin can re-enable them.' : 'This person already has an account');
  }
  let status = 201;
  if (user) {
    status = 200;
    // A head can only re-send invites for their own team.
    if (!admin && !sameId(user.department, req.user.department)) throw new ApiError(409, 'This email was already invited to another team');
    if (admin) {
      user.role = role;
      user.department = dept ? dept._id : null;
    }
    user.name = name;
  } else {
    user = new User({ name, email, role, department: dept ? dept._id : null, status: 'invited' });
  }
  if (req.body.jobTitle !== undefined) user.jobTitle = req.body.jobTitle;
  user.invitedBy = req.user._id;
  user.invitedAt = new Date();
  await user.save();

  // sendMail returns null when no email provider is configured.
  let emailed = false;
  try {
    emailed = (await sendInviteEmail({ user, invitedBy: req.user, team: dept, role: user.role })) !== null;
  } catch (err) {
    console.error('[email] invite failed:', err.message);
  }
  await user.populate('department', 'name');
  res.status(status).json({ user: user.toSafeJSON(), emailed });
});

// POST /api/invites/:id/resend
const resendInvite = catchAsync(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new ApiError(400, 'Invalid id format');
  const user = await User.findById(req.params.id).populate('department', 'name');
  if (!user || user.status !== 'invited') throw new ApiError(404, 'No pending invite for this person');
  if (!isSuperAdmin(req.user) && !isHeadOf(req.user, user.department?._id)) throw new ApiError(403, 'You can only manage invites for your own team');
  user.invitedAt = new Date();
  await user.save();
  const sent = await sendInviteEmail({ user, invitedBy: req.user, team: user.department, role: user.role }).catch((err) => {
    throw new ApiError(502, `Could not send the invite email: ${err.message}`);
  });
  if (sent === null) throw new ApiError(400, 'Email is not set up on the server, so the invite could not be sent');
  res.status(200).json({ ok: true });
});

// DELETE /api/invites/:id : cancels a pending invite (the person can't sign in).
const revokeInvite = catchAsync(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new ApiError(400, 'Invalid id format');
  const user = await User.findById(req.params.id);
  if (!user || user.status !== 'invited') throw new ApiError(404, 'No pending invite for this person');
  if (!isSuperAdmin(req.user) && !isHeadOf(req.user, user.department)) throw new ApiError(403, 'You can only manage invites for your own team');
  user.status = 'disabled';
  await user.save();
  res.status(200).json({ ok: true });
});

module.exports = { listUsers, getUser, updateUser, updateMe, invite, resendInvite, revokeInvite };
