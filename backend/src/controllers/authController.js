const passport = require('passport');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { signToken } = require('../utils/jwt');
const { sendWelcomeEmail } = require('../services/emailService');

function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function frontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

const register = catchAsync(async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, 'name, email and password are required');
  }
  if (password.length < 6) {
    throw new ApiError(400, 'password must be at least 6 characters');
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new ApiError(409, 'Email already registered');
  }

  const user = await User.create({
    name,
    email,
    passwordHash: password,
    role: ['admin', 'manager'].includes(role) ? role : 'member',
  });

  const token = signToken(user);
  sendWelcomeEmail({ user }).catch((err) => console.error('[email] welcome failed:', err.message));
  res.status(201).json({ token, user: user.toSafeJSON() });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new ApiError(400, 'email and password are required');
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const token = signToken(user);
  res.status(200).json({ token, user: user.toSafeJSON() });
});

const me = catchAsync(async (req, res) => {
  await req.user.populate('department', 'name');
  res.status(200).json({ user: req.user.toSafeJSON() });
});

// GET /api/auth/providers : lets the login page hide the Google button
// when the server has no Google credentials.
const providers = (req, res) => {
  res.status(200).json({ google: googleConfigured() });
};

function loginError(res, code) {
  res.redirect(`${frontendUrl()}/login?error=${encodeURIComponent(code)}`);
}

// Kicks off the Google OAuth redirect.
const googleAuth = (req, res, next) => {
  if (!googleConfigured()) return loginError(res, 'google_not_configured');
  return passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    prompt: 'select_account',
  })(req, res, next);
};

// Handles the Google OAuth callback, issues a JWT and hands it to the
// frontend in the URL fragment (fragments are never sent to servers or
// written to access logs, unlike query strings).
const googleCallback = (req, res, next) => {
  if (!googleConfigured()) return loginError(res, 'google_not_configured');
  return passport.authenticate('google', { session: false }, (err, user) => {
    if (err) {
      console.error('[auth] Google login failed:', err.message);
      return loginError(res, err.code === 'NO_EMAIL' ? 'google_no_email' : 'google_failed');
    }
    if (!user) return loginError(res, 'google_cancelled');
    const token = signToken(user);
    return res.redirect(`${frontendUrl()}/oauth/callback#token=${encodeURIComponent(token)}`);
  })(req, res, next);
};

const googleFailure = (req, res) => loginError(res, 'google_failed');

module.exports = { register, login, me, providers, googleAuth, googleCallback, googleFailure };
