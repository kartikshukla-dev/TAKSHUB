const mongoose = require('mongoose');

// Limits shared with the controller and the frontend composer.
const TEXT_MAX = 4000;
const SNIPPET_MAX = 200000; // ~1000+ lines of code

const fileSchema = new mongoose.Schema(
  {
    fileId: { type: mongoose.Schema.Types.ObjectId, required: true }, // GridFS
    filename: { type: String, required: true },
    contentType: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
  },
  { _id: false }
);

const reactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { _id: false }
);

// Long text / code sent from the snippet box instead of the one-line composer.
const snippetSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true, maxlength: 200 },
    language: { type: String, default: 'text', trim: true, maxlength: 40 },
    code: { type: String, required: true, maxlength: SNIPPET_MAX },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Empty when the message is only a snippet / files, or after delete.
    text: { type: String, default: '', trim: true, maxlength: TEXT_MAX },
    snippet: { type: snippetSchema, default: null },
    files: [fileSchema],
    // Thread: replies point at their parent; parents keep a counter.
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null, index: true },
    replyCount: { type: Number, default: 0 },
    lastReplyAt: { type: Date, default: null },
    reactions: [reactionSchema],
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    mentionAll: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    pinnedAt: { type: Date, default: null },
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Per-person bookmarks ("Saved items").
    savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ conversation: 1, parent: 1, createdAt: -1 });

messageSchema.statics.TEXT_MAX = TEXT_MAX;
messageSchema.statics.SNIPPET_MAX = SNIPPET_MAX;

module.exports = mongoose.model('Message', messageSchema);
