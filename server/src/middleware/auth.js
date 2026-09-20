const jwt = require('jsonwebtoken');
const { prisma } = require('../prisma');
const { AppError } = require('../utils/errors');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError(401, 'Session expired. Please sign in again.');

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      throw new AppError(401, 'Session expired. Please sign in again.');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        department: true,
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });
    if (!user || !user.active) throw new AppError(401, 'Account is inactive.');

    const roles = user.roles.map((r) => r.role);
    const permissions = [...new Set(roles.flatMap((r) => r.permissions.map((p) => p.permission.code)))];

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      departmentId: user.departmentId,
      department: user.department,
      roles: roles.map((r) => ({ id: r.id, code: r.code, name: r.name, isManagement: r.isManagement })),
      permissions,
    };
    next();
  } catch (err) {
    next(err);
  }
}

function optionalAuth(req, res, next) {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, next);
}

module.exports = { authenticate, optionalAuth };
