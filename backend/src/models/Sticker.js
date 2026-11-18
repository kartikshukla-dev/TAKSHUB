const mongoose = require('mongoose');

// A custom sticker someone uploaded. Private to the owner until they (or a
// Super Admin) mark it global; global stickers show in everyone's
// "Office stickers" collection.
const stickerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ownerName: { type: String, default: '' },
    global: { type: Boolean, default: false, index: true },
    fileId: { type: mongoose.Schema.Types.ObjectId, required: true }, // GridFS
    contentType: { type: String, required: true },
    size: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Sticker', stickerSchema);
