const mongoose = require('mongoose');
const RecurringTask = require('../models/RecurringTask');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { sameId } = require('../utils/teams');
const recurring = require('../services/recurringService');
const { istDay } = require('../utils/istDate');

function present(rt, user) {
  return {
    _id: rt._id,
    title: rt.title,
    schedule: rt.schedule,
    dueInDays: rt.dueInDays,
    nextRunAt: rt.active ? rt.nextRunAt : null,
    lastRunAt: rt.lastRunAt,
    runs: rt.runs,
    active: rt.active,
    createdBy: rt.createdBy,
    canManage: recurring.canManage(user, rt),
  };
}

async function load(req) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new ApiError(400, 'Invalid id format');
  const rt = await RecurringTask.findById(req.params.id).populate('createdBy', 'name');
  if (!rt) throw new ApiError(404, 'Repeating task not found');
  return rt;
}

// GET /api/recurring/:id : schedule details for the task modal. Anyone who
// can manage it, or the person it is assigned to.
const getRecurring = catchAsync(async (req, res) => {
  const rt = await load(req);
  if (!recurring.canManage(req.user, rt) && !sameId(rt.assignee, req.user._id)) throw new ApiError(404, 'Repeating task not found');
  res.status(200).json({ recurring: present(rt, req.user) });
});

// PATCH /api/recurring/:id { active } : stop or restart the schedule.
const updateRecurring = catchAsync(async (req, res) => {
  const rt = await load(req);
  if (!recurring.canManage(req.user, rt)) throw new ApiError(403, 'Only the person who set it up, the team head or a Super Admin can change this');
  if (req.body.active !== undefined) {
    const on = Boolean(req.body.active);
    if (on && !rt.active) rt.nextRunAt = recurring.nextRunAt(rt.schedule, istDay());
    rt.active = on;
    rt.stoppedBy = on ? null : req.user._id;
  }
  req.audit = { entity: 'task', entityId: rt._id, entityLabel: rt.title, changes: { repeating: { from: !rt.active, to: rt.active } } };
  await rt.save();
  res.status(200).json({ recurring: present(rt, req.user) });
});

module.exports = { getRecurring, updateRecurring };
