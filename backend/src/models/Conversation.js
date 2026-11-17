const mongoose = require('mongoose');

const readStateSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

// direct  = exactly two members
// group   = private, named, members added by members
// channel = public, named: anyone in the workspace can find and join it
// Only members can read or post; admins get no special access.
const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['direct', 'group', 'channel'], required: true },
    name: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lastMessageAt: { type: Date, default: null },
    lastMessageText: { type: String, default: '' },
    reads: [readStateSchema],
    // Per-person preferences.
    mutedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Conversation', conversationSchema);
