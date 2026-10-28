const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');

// Minimal directory listing used to populate assignee pickers on the frontend.
const listUsers = catchAsync(async (req, res) => {
  const users = await User.find().select('name email role avatar').sort('name');
  res.status(200).json({ users });
});

module.exports = { listUsers };
