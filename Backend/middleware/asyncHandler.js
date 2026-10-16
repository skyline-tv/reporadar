/**
 * Wraps async route handlers so rejected promises are forwarded to Express
 * error-handling middleware via next(err).
 */
module.exports = function asyncHandler(fn) {
  return function wrappedAsyncHandler(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
