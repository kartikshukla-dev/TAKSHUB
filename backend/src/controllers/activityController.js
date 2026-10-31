const mongoose = require('mongoose');
const Task = require('../models/Task');
const catchAsync = require('../utils/catchAsync');
const { visibleTaskFilter } = require('../utils/access');
const { USER_FIELDS } = require('../utils/taskQuery');

// Flattens activityLog entries of all tasks matching `taskFilter` into one
// list, newest first. Uses an aggregation so only the newest `limit`
// entries are materialised.
async function buildFeed(taskFilter, limit = 50) {
  const rows = await Task.aggregate([
    { $match: taskFilter },
    { $project: { title: 1, number: 1, project: 1, activityLog: 1 } },
    { $unwind: '$activityLog' },
    { $sort: { 'activityLog.changedAt': -1 } },
    { $limit: limit },
    { $lookup: { from: 'projects', localField: 'project', foreignField: '_id', as: 'projectDoc' } },
  ]);

  const userIds = [...new Set(rows.map((r) => r.activityLog.changedBy && r.activityLog.changedBy.toString()))];
  const users = await mongoose
    .model('User')
    .find({ _id: { $in: userIds.filter(Boolean) } })
    .select(USER_FIELDS)
    .lean();
  const userById = new Map(users.map((u) => [u._id.toString(), u]));

  return rows.map((r) => {
    const project = r.projectDoc[0];
    return {
      taskId: r._id,
      taskTitle: r.title,
      taskKey: project && r.number ? `${project.key}-${r.number}` : null,
      projectId: r.project,
      projectName: project ? project.name : '',
      field: r.activityLog.field,
      oldValue: r.activityLog.oldValue,
      newValue: r.activityLog.newValue,
      changedBy: userById.get(String(r.activityLog.changedBy)) || null,
      changedAt: r.activityLog.changedAt,
    };
  });
}

// GET /api/activity?person=me|<id>&limit=
// person=me: activity on tasks I'm assigned to or reported.
// person=<id>: changes made by that person (within what I can see).
const listActivity = catchAsync(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const and = [await visibleTaskFilter(req.user)];
  if (req.query.person === 'me') {
    and.push({ $or: [{ assignee: req.user._id }, { reporter: req.user._id }] });
  } else if (req.query.person && mongoose.Types.ObjectId.isValid(req.query.person)) {
    and.push({ 'activityLog.changedBy': new mongoose.Types.ObjectId(req.query.person) });
  }
  const feed = await buildFeed(and.length === 1 ? and[0] : { $and: and }, limit);
  res.status(200).json({ feed });
});

module.exports = { buildFeed, listActivity };
