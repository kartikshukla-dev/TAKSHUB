const mongoose = require('mongoose');

// Stored role values -> what the UI shows:
//   admin   = Super Admin (sees and manages everything, assigns roles)
//   manager = Team Head   (head of their department: assigns its tasks, invites members)
//   member  = Member
const ROLES = ['admin', 'manager', 'member'];

// invited  = added by an admin/head, has not signed in yet
// active   = has signed in at least once
// disabled = cannot sign in
const STATUSES = ['invited', 'active', 'disabled'];

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
    googleId: { type: String, index: true, sparse: true },
    role: { type: String, enum: ROLES, default: 'member' },
    status: { type: String, enum: STATUSES, default: 'active' },
    avatar: { type: String, default: '' },
    jobTitle: { type: String, default: '', trim: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    emailNotifications: { type: Boolean, default: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    invitedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    _id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    status: this.status,
    avatar: this.avatar,
    jobTitle: this.jobTitle,
    department: this.department,
    emailNotifications: this.emailNotifications,
  };
};

userSchema.statics.ROLES = ROLES;
userSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('User', userSchema);
