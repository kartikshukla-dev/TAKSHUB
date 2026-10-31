const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const { visibleProjectFilter } = require('../utils/access');
const { buildTaskFilter, escapeRegex } = require('../utils/taskQuery');

// GET /api/search?q= : quick results for the ⌘K palette.
const search = catchAsync(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(200).json({ tasks: [], projects: [], people: [] });

  const rx = new RegExp(escapeRegex(q), 'i');
  const taskFilter = await buildTaskFilter(req.user, { q, include_archived: '1' });

  const [tasks, projects, people] = await Promise.all([
    Task.find(taskFilter)
      .select('title number status priority project updatedAt')
      .populate('project', 'name key')
      .sort('-updatedAt')
      .limit(8)
      .lean(),
    Project.find({ $and: [visibleProjectFilter(req.user), { $or: [{ name: rx }, { key: rx }] }] })
      .select('name key status')
      .limit(5)
      .lean(),
    User.find({ $or: [{ name: rx }, { email: rx }, { jobTitle: rx }] })
      .select('name email jobTitle avatar')
      .limit(5)
      .lean(),
  ]);

  res.status(200).json({ tasks, projects, people });
});

module.exports = { search };
