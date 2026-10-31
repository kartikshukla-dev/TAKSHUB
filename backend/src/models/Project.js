const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    key: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      unique: true,
      minlength: 2,
      maxlength: 10,
    },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    startDate: { type: Date, default: null },
    targetDate: { type: Date, default: null },
    // 'private': only members (and admins/managers) can see it.
    // 'workspace': everyone in the workspace can see it.
    visibility: { type: String, enum: ['private', 'workspace'], default: 'private' },
    // Running counter used to give tasks human-readable ids like ENG-12.
    taskSeq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);
