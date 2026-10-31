const mongoose = require('mongoose');
const User = require('../models/User');
const Task = require('../models/Task');
const Department = require('../models/Department');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { startOfDay } = require('../utils/taskQuery');

const PUBLIC_FIELDS = 'name email role avatar jobTitle department';

// Open and overdue assigned-task counts per user, used by the Team table.
async function workloadByUser(userIds) {
  const today = startOfDay();
  const rows = await Task.aggregate([
    { $match: { assignee: { $in: userIds }, status: { $ne: 'done' } } },
    {
      $group: {
        _id: '$assignee',
        open: { $sum: 1 },
        overdue: {
          $sum: { $cond: [{ $and: [{ $ne: ['$dueDate', null] }, { $lt: ['$dueDate', today] }] }, 1, 0] },
        },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r]));
}

// Directory listing: assignee pickers, the Team page and chat.
const listUsers = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.department && mongoose.Types.ObjectId.isValid(req.query.department)) {
    filter.department = req.query.department;
  }
  const users = await User.find(filter).select(PUBLIC_FIELDS).populate('department', 'name').sort('name').lean();
  const counts = await workloadByUser(users.map((u) => u._id));
  res.status(200).json({
    users: users.map((u) => {
      const c = counts.get(u._id.toString());
      return { ...u, openCount: c ? c.open : 0, overdueCount: c ? c.overdue : 0 };
    }),
  });
});

const getUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id).select(PUBLIC_FIELDS).populate('department', 'name').lean();
  if (!user) throw new ApiError(404, 'User not found');
  const counts = await workloadByUser([user._id]);
  const c = counts.get(user._id.toString());
  res.status(200).json({ user: { ...user, openCount: c ? c.open : 0, overdueCount: c ? c.overdue : 0 } });
});

async function resolveDepartment(value) {
  if (value === undefined) return undefined;
  if (!value) return null;
  if (!mongoose.Types.ObjectId.isValid(value)) throw new ApiError(400, 'Invalid department');
  const dept = await Department.findById(value);
  if (!dept) throw new ApiError(400, 'Department not found');
  return dept._id;
}

// PATCH /api/users/:id (admin): role, department, job title.
const updateUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  const { role, jobTitle, name } = req.body;
  if (role !== undefined) {
    if (!User.ROLES.includes(role)) throw new ApiError(400, 'Invalid role');
    if (user._id.equals(req.user._id) && role !== 'admin') {
      throw new ApiError(400, 'You cannot remove your own admin role');
    }
    user.role = role;
  }
  if (jobTitle !== undefined) user.jobTitle = jobTitle;
  if (name !== undefined && name.trim()) user.name = name.trim();
  const dept = await resolveDepartment(req.body.department);
  if (dept !== undefined) user.department = dept;
  await user.save();
  await user.populate('department', 'name');
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

// POST /api/users/me/password
const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    throw new ApiError(400, 'New password must be at least 6 characters');
  }
  const user = await User.findById(req.user._id).select('+passwordHash');
  // Google-only accounts have no password yet and may set one directly.
  if (user.passwordHash && !(await user.comparePassword(currentPassword || ''))) {
    throw new ApiError(400, 'Current password is incorrect');
  }
  user.passwordHash = newPassword;
  await user.save();
  res.status(200).json({ message: 'Password updated' });
});

module.exports = { listUsers, getUser, updateUser, updateMe, changePassword };
