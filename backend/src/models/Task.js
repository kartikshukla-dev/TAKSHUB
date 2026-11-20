const mongoose = require('mongoose');

// 'not-approved' can only be set (and cleared) by the team head or a Super Admin.
const STATUSES = ['todo', 'in-progress', 'in-review', 'done', 'not-approved'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const activityLogSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const attachmentSchema = new mongoose.Schema(
  {
    fileId: { type: mongoose.Schema.Types.ObjectId, required: true }, // GridFS file id
    filename: { type: String, required: true },
    contentType: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Checklist items inside a task. Optional assignee / deadline per item.
const subtaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 300 },
    done: { type: Boolean, default: false },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dueDate: { type: Date, default: null },
    order: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    completedAt: { type: Date, default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: { type: String, enum: STATUSES, default: 'todo' },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    blocked: { type: Boolean, default: false },
    // Per-project sequence number; shown as `${project.key}-${number}`.
    number: { type: Number, default: null },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    // Team that raised the task (the reporter's department at creation) and
    // the team it was sent to. When toTeam is set, only that team's head
    // (or a Super Admin) sets the deadline and assignee.
    fromTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    toTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    labels: [{ type: String, trim: true }],
    dueDate: { type: Date, default: null },
    comments: [commentSchema],
    // When each person last opened the task, so lists can show
    // "2 new comments" to everyone except the one who wrote them.
    commentReads: {
      type: [
        new mongoose.Schema(
          {
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            at: { type: Date, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    activityLog: [activityLogSchema],
    attachments: [attachmentSchema],
    subtasks: [subtaskSchema],
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Fields we track in the activity log when changed via the "diff & update" helper.
taskSchema.statics.TRACKED_FIELDS = ['status', 'priority', 'assignee', 'labels', 'dueDate', 'title', 'blocked', 'toTeam'];
taskSchema.statics.STATUSES = STATUSES;
taskSchema.statics.SUBTASK_MAX = 100;
taskSchema.statics.PRIORITIES = PRIORITIES;

module.exports = mongoose.model('Task', taskSchema);
