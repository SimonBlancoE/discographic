// Forwards rejected async route handlers to Express's error middleware
// (Express 4 doesn't auto-await). Lets routes drop the boilerplate
// try/catch -> res.status(500) wrapper since the global handler in
// server/index.js already turns errors into 500 JSON responses.

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
