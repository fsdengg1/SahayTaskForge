const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../prisma');
const { AppError } = require('../utils/errors');
const { logActivity, logAudit } = require('../utils/activity');

function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  });
}

function shapeUser(user, extras = {}) {
  const roles = user.roles.map((r) => r.role);
  const permissions = [...new Set(roles.flatMap((r) => r.permissions.map((p) => p.permission.code)))];
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    department: user.department,
    mustChangePassword: extras.mustChangePassword ?? Boolean(user.mustChangePassword),
    roles: roles.map((r) => ({ id: r.id, code: r.code, name: r.name, isManagement: r.isManagement })),
    permissions,
  };
}

const includeUser = {
  department: true,
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
};

async function passwordChangeRequired(userId) {
  try {
    const rows = await prisma.$queryRaw`SELECT "mustChangePassword" AS flag FROM "User" WHERE id = ${userId}`;
    return Boolean(rows[0]?.flag);
  } catch {
    return false;
  }
}

async function login(usernameOrEmail, password, ip) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: usernameOrEmail, mode: 'insensitive' } },
        { email: { equals: usernameOrEmail, mode: 'insensitive' } },
      ],
    },
    include: includeUser,
  });
  if (!user || !user.active) throw new AppError(401, 'Invalid username or password.');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new AppError(401, 'Invalid username or password.');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logActivity({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, description: 'User signed in' });
  await logAudit({ userId: user.id, ip, entity: 'User', entityId: user.id, action: 'LOGIN', next: { lastLoginAt: new Date() } });

  return { token: signToken(user), user: shapeUser(user, { mustChangePassword: await passwordChangeRequired(user.id) }) };
}

async function me(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: includeUser });
  if (!user) throw new AppError(401, 'Session expired. Please sign in again.');
  return shapeUser(user, { mustChangePassword: await passwordChangeRequired(userId) });
}

async function changePassword(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) throw new AppError(400, 'Current and new passwords are needed.');
  if (String(newPassword).length < 8) throw new AppError(400, 'New password must be at least 8 characters.');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) throw new AppError(401, 'Session expired. Please sign in again.');
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new AppError(400, 'Current password is incorrect.');
  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
  await prisma.$executeRaw`UPDATE "User" SET "mustChangePassword" = false WHERE id = ${userId}`;
  await logActivity({ userId, action: 'PASSWORD_CHANGED', entity: 'User', entityId: userId, description: 'Password updated' });
  return me(userId);
}

module.exports = { login, me, changePassword, shapeUser, includeUser };
