// Centralized error handler. Any `next(err)` call ends up here.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error('[error]', err.message);
  // Picked up by the audit log for failed actions.
  res.locals.errorMessage = String(err.message || '').slice(0, 300);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid id format' });
  }
  if (err.name === 'MulterError') {
    const messages = {
      LIMIT_FILE_SIZE: 'Each file must be 10 MB or smaller',
      LIMIT_FILE_COUNT: 'You can attach up to 5 files at once',
      LIMIT_FIELD_VALUE: 'Message is too long',
    };
    return res.status(400).json({ message: messages[err.code] || 'Upload failed' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Message is too large' });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: 'Duplicate value', field: Object.keys(err.keyPattern || {})[0] });
  }

  const status = err.statusCode || 500;
  res.status(status).json({ message: err.message || 'Internal server error' });
}

module.exports = errorHandler;
