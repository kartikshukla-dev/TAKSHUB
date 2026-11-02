// FRONTEND_URL may list several origins, comma separated, e.g.
//   FRONTEND_URL=https://taskhub.vercel.app,http://localhost:5173
// All are allowed by CORS. The first one is the "main" URL used in email
// links and the Google sign-in redirect. Trailing slashes are ignored.
const DEFAULT = 'http://localhost:5173';

function frontendUrls() {
  const list = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((u) => u.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return list.length ? list : [DEFAULT];
}

function primaryFrontendUrl() {
  return frontendUrls()[0];
}

// CORS origin option for express `cors` and socket.io. With FRONTEND_URL
// unset (local dev) any origin is allowed, as before.
function corsOrigin() {
  if (!process.env.FRONTEND_URL) return '*';
  const allowed = frontendUrls();
  return (origin, cb) => {
    if (!origin || allowed.includes(origin.replace(/\/+$/, ''))) return cb(null, true);
    return cb(null, false);
  };
}

module.exports = { frontendUrls, primaryFrontendUrl, corsOrigin };
