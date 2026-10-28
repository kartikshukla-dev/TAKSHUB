// Centralized error handler. Any `next(err)` call ends up here.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error('[error]', err.message);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid id format' });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: 'Duplicate value', field: Object.keys(err.keyPattern || {})[0] });
  }

  const status = err.statusCode || 500;
  res.status(status).json({ message: err.message || 'Internal server error' });
}

module.exports = errorHandler;
