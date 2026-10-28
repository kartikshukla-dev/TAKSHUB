// Wraps an async route handler so rejected promises are forwarded to next(err)
// instead of crashing the process / hanging the request.
function catchAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = catchAsync;
