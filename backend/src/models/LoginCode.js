const mongoose = require('mongoose');

// One-time sign-in code. Only a hash is stored; MongoDB deletes the
// document automatically once expiresAt passes (TTL index).
const loginCodeSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('LoginCode', loginCodeSchema);
