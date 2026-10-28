const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, select: false }, // absent for Google-only accounts
    googleId: { type: String, index: true, sparse: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    avatar: { type: String, default: '' },
  },
  { timestamps: true }
);

// Hash password before saving, only when it was actually modified.
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('passwordHash') || !this.passwordHash) return next();
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

userSchema.methods.comparePassword = async function comparePassword(candidate) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    avatar: this.avatar,
  };
};

module.exports = mongoose.model('User', userSchema);
