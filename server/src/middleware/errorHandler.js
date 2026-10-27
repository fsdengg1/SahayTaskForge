const { mapPrismaError } = require('../utils/errors');

function errorHandler(err, req, res, next) {
  const mapped = mapPrismaError(err) || err;
  const status = mapped.status || 500;
  const message = status === 503
    ? (mapped.message || 'Database is temporarily unavailable. Please try again.')
    : status >= 500
      ? 'Something went wrong.'
      : mapped.message || 'Unable to process request.';
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({
    error: message,
    details: status < 500 ? mapped.details : undefined,
  });
}

module.exports = { errorHandler };
