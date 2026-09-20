const { AppError } = require('../utils/errors');

function authorize(...codes) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError(401, 'Session expired. Please sign in again.'));
    if (req.user.roles.some((r) => r.code === 'ADMIN')) return next();
    const ok = codes.some((code) => req.user.permissions.includes(code));
    if (!ok) return next(new AppError(403, 'Access denied.'));
    next();
  };
}

function can(user, ...codes) {
  if (!user) return false;
  if (user.roles?.some((r) => r.code === 'ADMIN')) return true;
  return codes.some((code) => user.permissions?.includes(code));
}

module.exports = { authorize, can };
