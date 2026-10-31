const mongoose = require('mongoose');

// Personal checklist item. `repeat` controls whether it resets daily:
// - once: a single item, `done` flips permanently
// - daily / weekdays: `lastDoneOn` (YYYY-MM-DD) marks it done for that day only
const todoSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, required: true, trim: true, maxlength: 500 },
    repeat: { type: String, enum: ['once', 'daily', 'weekdays'], default: 'once' },
    dueDate: { type: Date, default: null },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    lastDoneOn: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Todo', todoSchema);
