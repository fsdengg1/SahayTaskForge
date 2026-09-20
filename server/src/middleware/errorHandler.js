function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const message = status >= 500 ? 'Something went wrong.' : err.message || 'Unable to process request.';
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({
    error: message,
    details: status < 500 ? err.details : undefined,
    ...(isProd ? {} : null),
  });
}

module.exports = { errorHandler };
