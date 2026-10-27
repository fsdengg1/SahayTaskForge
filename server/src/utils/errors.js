class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function mapPrismaError(err) {
  if (!err) return null;
  const text = String(err.message || '');
  const unreachable = err.name === 'PrismaClientInitializationError'
    || text.includes("Can't reach database server")
    || text.includes('ECONNREFUSED');
  if (unreachable || ['P1001', 'P1002', 'P1017'].includes(err.code)) {
    return new AppError(503, 'Database is temporarily unavailable. Please try again.');
  }
  if (typeof err.code !== 'string' || !err.code.startsWith('P')) return null;
  if (err.code === 'P2002') {
    return new AppError(400, 'That record already exists.');
  }
  return null;
}

module.exports = { AppError, mapPrismaError };
