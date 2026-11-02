const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const { findSignInUser } = require('../services/accountService');

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

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// Invite-only: Google can sign in an account that already exists (matched
// by Google id, then by email) or a SUPERADMIN_EMAIL address. Anyone else
// is turned away with NOT_INVITED.
async function findOrCreateGoogleUser(profile) {
  const rawEmail = profile.emails && profile.emails[0] && profile.emails[0].value;
  const email = rawEmail ? rawEmail.trim().toLowerCase() : null;
  const photo = (profile.photos && profile.photos[0] && profile.photos[0].value) || '';

  let user = await User.findOne({ googleId: profile.id });
  if (!user) {
    if (!email) throw fail('NO_EMAIL', 'Google did not share an email address for this account');
    user = await findSignInUser(email, { name: profile.displayName || undefined, avatar: photo });
    if (!user) throw fail('NOT_INVITED', `${email} has not been invited`);
    user.googleId = profile.id;
    if (!user.avatar && photo) user.avatar = photo;
    // Invited accounts get their real Google name on first sign-in.
    if (user.status === 'invited' && profile.displayName) user.name = profile.displayName;
    await user.save();
  }
  if (user.status === 'disabled') throw fail('DISABLED', 'This account is disabled');
  return user;
}

module.exports.findOrCreateGoogleUser = findOrCreateGoogleUser;
