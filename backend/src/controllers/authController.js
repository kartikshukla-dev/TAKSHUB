const crypto = require('crypto');
const passport = require('passport');
const LoginCode = require('../models/LoginCode');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { signToken } = require('../utils/jwt');
const { sendLoginCodeEmail } = require('../services/emailService');
const { findSignInUser, markSignedIn } = require('../services/accountService');

const CODE_TTL_MIN = 10;
const RESEND_AFTER_MS = 45 * 1000;
const MAX_ATTEMPTS = 5;
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same response whether or not the email exists, so the form can't be used
// to discover who has an account.
const GENERIC_SENT = 'If this email has access to TaskHub, a sign-in code is on its way.';

function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function frontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function hashCode(email, code) {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'dev-secret')
    .update(`${email}:${code}`)
    .digest('hex');
}

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!EMAIL_RX.test(email)) throw new ApiError(400, 'Enter a valid email address');
  return email;
}

// POST /api/auth/otp/request { email }
const requestCode = catchAsync(async (req, res) => {
  const email = normalizeEmail(req.body.email);

  const recent = await LoginCode.findOne({ email }).sort({ createdAt: -1 });
  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_AFTER_MS) {
    const wait = Math.ceil((RESEND_AFTER_MS - (Date.now() - recent.createdAt.getTime())) / 1000);
    throw new ApiError(429, `Please wait ${wait}s before asking for another code`);
  }

  const user = await findSignInUser(email);
  if (!user || user.status === 'disabled') {
    return res.status(200).json({ message: GENERIC_SENT });
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await LoginCode.deleteMany({ email });
  await LoginCode.create({ email, codeHash: hashCode(email, code), expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60000) });

  let sent = false;
  try {
    sent = await sendLoginCodeEmail({ user, code });
  } catch (err) {
    console.error('[auth] could not email login code:', err.message);
    throw new ApiError(502, 'Could not send the code email. Check the email settings on the server.');
  }
  // With no email provider configured, print the code so local demos work.
  if (!sent) console.log(`[auth] Sign-in code for ${email}: ${code} (no email provider configured)`);

  return res.status(200).json({ message: GENERIC_SENT });
});

// POST /api/auth/otp/verify { email, code }
const verifyCode = catchAsync(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = String(req.body.code || '').replace(/\D/g, '');
  if (code.length !== 6) throw new ApiError(400, 'Enter the 6-digit code');

  const record = await LoginCode.findOne({ email }).sort({ createdAt: -1 });
  if (!record || record.expiresAt < new Date()) throw new ApiError(400, 'This code has expired. Ask for a new one.');
  if (record.attempts >= MAX_ATTEMPTS) {
    await record.deleteOne();
    throw new ApiError(429, 'Too many wrong attempts. Ask for a new code.');
  }
  if (!safeEqual(record.codeHash, hashCode(email, code))) {
    record.attempts += 1;
    await record.save();
    throw new ApiError(400, 'That code is not right. Check the email and try again.');
  }

  await record.deleteOne();
  const user = await findSignInUser(email);
  if (!user || user.status === 'disabled') throw new ApiError(403, 'This account does not have access');
  await markSignedIn(user);
  await user.populate('department', 'name');
  res.status(200).json({ token: signToken(user), user: user.toSafeJSON() });
});

const me = catchAsync(async (req, res) => {
  await req.user.populate('department', 'name');
  res.status(200).json({ user: req.user.toSafeJSON() });
});

// GET /api/auth/providers : lets the login page hide the Google button
// when the server has no Google credentials.
const providers = (req, res) => {
  res.status(200).json({ google: googleConfigured(), otp: true });
};

function loginError(res, code) {
  res.redirect(`${frontendUrl()}/login?error=${encodeURIComponent(code)}`);
}

const googleAuth = (req, res, next) => {
  if (!googleConfigured()) return loginError(res, 'google_not_configured');
  return passport.authenticate('google', { scope: ['profile', 'email'], session: false, prompt: 'select_account' })(req, res, next);
};

// Hands the JWT to the frontend in the URL fragment, which browsers never
// send to servers or write to access logs.
const googleCallback = (req, res, next) => {
  if (!googleConfigured()) return loginError(res, 'google_not_configured');
  return passport.authenticate('google', { session: false }, async (err, user) => {
    if (err) {
      const known = { NO_EMAIL: 'google_no_email', NOT_INVITED: 'google_not_invited', DISABLED: 'google_disabled' };
      if (!known[err.code]) console.error('[auth] Google login failed:', err.message);
      return loginError(res, known[err.code] || 'google_failed');
    }
    if (!user) return loginError(res, 'google_cancelled');
    try {
      await markSignedIn(user);
    } catch (e) {
      return next(e);
    }
    return res.redirect(`${frontendUrl()}/oauth/callback#token=${encodeURIComponent(signToken(user))}`);
  })(req, res, next);
};

const googleFailure = (req, res) => loginError(res, 'google_failed');

module.exports = { requestCode, verifyCode, me, providers, googleAuth, googleCallback, googleFailure };
