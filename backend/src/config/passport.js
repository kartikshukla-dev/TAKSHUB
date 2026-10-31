const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const { sendWelcomeEmail } = require('../services/emailService');

/**
 * Registers the Google OAuth2 strategy with Passport.
 * On success, finds an existing user by googleId or email, or creates one.
 * Only registers the strategy when credentials are present so the app can
 * still boot (e.g. in tests) without Google OAuth configured.
 */
module.exports = function configurePassport(passport) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn('[passport] Google OAuth not configured, skipping strategy registration');
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL || `http://localhost:${process.env.PORT || 5000}/api/auth/google/callback`,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await findOrCreateGoogleUser(profile);
          done(null, user);
        } catch (err) {
          done(err, null);
        }
      }
    )
  );
};

async function findOrCreateGoogleUser(profile) {
  const rawEmail = profile.emails && profile.emails[0] && profile.emails[0].value;
  const email = rawEmail ? rawEmail.trim().toLowerCase() : null;

  let user = await User.findOne({ googleId: profile.id });
  if (user) return user;

  if (!email) {
    const err = new Error('Google did not share an email address for this account');
    err.code = 'NO_EMAIL';
    throw err;
  }

  // Link Google to an existing email/password account with the same email.
  user = await User.findOne({ email });
  if (user) {
    user.googleId = profile.id;
    if (!user.avatar && profile.photos && profile.photos[0]) user.avatar = profile.photos[0].value;
    await user.save();
    return user;
  }

  user = await User.create({
    name: profile.displayName || email.split('@')[0],
    email,
    googleId: profile.id,
    avatar: (profile.photos && profile.photos[0] && profile.photos[0].value) || '',
  });
  sendWelcomeEmail({ user, viaGoogle: true }).catch((e) => console.error('[email] welcome failed:', e.message));
  return user;
}

module.exports.findOrCreateGoogleUser = findOrCreateGoogleUser;
