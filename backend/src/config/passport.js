const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

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
        callbackURL: GOOGLE_CALLBACK_URL,
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
  const email = profile.emails && profile.emails[0] && profile.emails[0].value;

  let user = await User.findOne({ googleId: profile.id });
  if (user) return user;

  if (email) {
    user = await User.findOne({ email });
    if (user) {
      user.googleId = profile.id;
      await user.save();
      return user;
    }
  }

  user = await User.create({
    name: profile.displayName || 'Google User',
    email,
    googleId: profile.id,
    avatar: (profile.photos && profile.photos[0] && profile.photos[0].value) || '',
  });
  return user;
}

module.exports.findOrCreateGoogleUser = findOrCreateGoogleUser;
