const passport = require('passport');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { signToken } = require('../utils/jwt');

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

// Kicks off the Google OAuth redirect.
const googleAuth = passport.authenticate('google', { scope: ['profile', 'email'], session: false });

// Handles the Google OAuth callback, issues a JWT, and redirects to the frontend with it.
const googleCallback = [
  passport.authenticate('google', { session: false, failureRedirect: '/api/auth/google/failure' }),
  (req, res) => {
    const token = signToken(req.user);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/oauth/callback?token=${token}`);
  },
];

const googleFailure = (req, res) => {
  res.status(401).json({ message: 'Google authentication failed' });
};

module.exports = { register, login, me, googleAuth, googleCallback, googleFailure };
