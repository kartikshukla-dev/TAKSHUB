const mongoose = require('mongoose');

const FREQUENCIES = ['daily', 'weekdays', 'weekly', 'monthly'];

// A task that is created again on a schedule (e.g. "weekly report every
// Monday"). Holds a copy of the task fields; the scheduler makes a new task
// from it at 9:00 IST on each matching day.
const recurringTaskSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    toTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    fromTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, default: '' },
    priority: { type: String, default: 'medium' },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    labels: [{ type: String, trim: true }],
    subtasks: [{ type: String, trim: true, maxlength: 300 }],
    // Deadline = day it is created + this many days (null = no deadline).
    dueInDays: { type: Number, default: null, min: 0, max: 365 },
    schedule: {
      freq: { type: String, enum: FREQUENCIES, required: true },
      weekday: { type: Number, min: 0, max: 6, default: null }, // weekly: 0 = Sunday
      dayOfMonth: { type: Number, min: 1, max: 31, default: null }, // monthly
    },
    nextRunAt: { type: Date, required: true, index: true },
    lastRunAt: { type: Date, default: null },
    runs: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true },
    stoppedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

recurringTaskSchema.statics.FREQUENCIES = FREQUENCIES;

module.exports = mongoose.model('RecurringTask', recurringTaskSchema);
