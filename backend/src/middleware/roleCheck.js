const ApiError = require('../utils/ApiError');

// Usage: requireRole('admin')
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Not authenticated'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'Insufficient permissions'));
    }
    next();
  };
}

module.exports = { requireRole };
