const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

// Verifies the Bearer JWT and attaches the authenticated user to req.user.
const requireAuth = catchAsync(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'Missing or malformed Authorization header');
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired token');
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    throw new ApiError(401, 'User no longer exists');
  }

  req.user = user;
  next();
});

module.exports = { requireAuth };
