const User = require('../models/User');

// Emails listed in SUPERADMIN_EMAIL (comma separated) can always sign in
// and are made Super Admin. This is how the first account gets created.
function superAdminEmails() {
  return (process.env.SUPERADMIN_EMAIL || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isSuperAdminEmail(email) {
  return superAdminEmails().includes(String(email || '').toLowerCase());
}

// Finds the account allowed to sign in with this email, creating or
// promoting the Super Admin account if needed. Returns null when the
// email has not been invited.
// "kartik.shukla@x.com" -> "Kartik Shukla"
function nameFromEmail(email) {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');
}

async function findSignInUser(email, extra = {}) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  let user = await User.findOne({ email: normalized });
  if (isSuperAdminEmail(normalized)) {
    if (!user) {
      user = await User.create({ email: normalized, role: 'admin', status: 'active', ...extra, name: extra.name || nameFromEmail(normalized) });
    } else if (user.role !== 'admin' || user.status === 'disabled') {
      user.role = 'admin';
      user.status = 'active';
      await user.save();
    }
  }
  return user;
}

async function markSignedIn(user) {
  user.lastLoginAt = new Date();
  if (user.status === 'invited') user.status = 'active';
  await user.save();
  return user;
}

module.exports = { findSignInUser, markSignedIn, isSuperAdminEmail, superAdminEmails };
