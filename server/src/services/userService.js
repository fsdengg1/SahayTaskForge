const bcrypt = require('bcryptjs');
const { prisma } = require('../prisma');
const { AppError } = require('../utils/errors');
const { parsePagination, paginated } = require('../utils/pagination');
const { logActivity } = require('../utils/activity');
const { includeUser, shapeUser } = require('./authService');

async function listUsers(query) {
  const { skip, take, page, pageSize } = parsePagination(query);
  const where = {
    ...(query.active === 'false' ? {} : { active: query.active === 'all' ? undefined : true }),
    ...(query.role ? { roles: { some: { role: { code: query.role } } } } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.q
      ? {
          OR: [
            { fullName: { contains: query.q, mode: 'insensitive' } },
            { username: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, include: includeUser, skip, take, orderBy: { fullName: 'asc' } }),
    prisma.user.count({ where }),
  ]);
  return paginated(items.map(shapeUser), total, page, pageSize);
}

async function salesUsers() {
  const roleUsers = await prisma.user.findMany({
    where: {
      active: true,
      roles: { some: { role: { code: { in: ['SALES_MANAGER', 'SALES_EXEC', 'SALES_COORD', 'ADMIN'] } } } },
    },
    select: { id: true, fullName: true, username: true, email: true },
    orderBy: { fullName: 'asc' },
  });
  let leadOwners = [];
  try {
    leadOwners = await prisma.$queryRaw`
      SELECT DISTINCT u.id::text AS id, u.full_name AS "fullName"
      FROM users u
      WHERE u.full_name IS NOT NULL AND btrim(u.full_name) <> ''
        AND EXISTS (SELECT 1 FROM leads l WHERE l.owner_id = u.id)
      ORDER BY u.full_name ASC
    `;
  } catch {
    leadOwners = [];
  }
  const people = new Map();
  for (const user of leadOwners) {
    const key = String(user.fullName || '').trim().toLowerCase();
    if (!user?.id || !key) continue;
    people.set(key, { id: user.id, fullName: user.fullName, username: null, email: null });
  }
  for (const user of roleUsers) {
    const key = String(user.fullName || '').trim().toLowerCase();
    if (!user?.id || !key || people.has(key)) continue;
    people.set(key, {
      id: user.id,
      fullName: user.fullName,
      username: user.username || null,
      email: user.email || null,
    });
  }
  return [...people.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

async function createUser(data, actor) {
  if (!data.username || !data.email || !data.password || !data.fullName) {
    throw new AppError(400, 'Username, email, name and password are needed.');
  }
  const exists = await prisma.user.findFirst({
    where: { OR: [{ username: data.username }, { email: data.email }] },
  });
  if (exists) throw new AppError(400, 'Username or email already exists.');
  const user = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      fullName: data.fullName,
      phone: data.phone || null,
      passwordHash: await bcrypt.hash(data.password, 12),
      departmentId: data.departmentId || null,
      roles: data.roleIds?.length
        ? { create: data.roleIds.map((roleId) => ({ roleId })) }
        : undefined,
    },
    include: includeUser,
  });
  await logActivity({ userId: actor.id, action: 'USER_CREATED', entity: 'User', entityId: user.id, description: user.username });
  return shapeUser(user);
}

async function updateUser(id, data, actor) {
  const user = await prisma.user.update({
    where: { id },
    data: {
      fullName: data.fullName ?? undefined,
      email: data.email ?? undefined,
      phone: data.phone ?? undefined,
      active: data.active ?? undefined,
      departmentId: data.departmentId ?? undefined,
      ...(data.password ? { passwordHash: await bcrypt.hash(data.password, 12) } : {}),
    },
    include: includeUser,
  });
  if (data.roleIds) {
    await prisma.userRole.deleteMany({ where: { userId: id } });
    if (data.roleIds.length) {
      await prisma.userRole.createMany({ data: data.roleIds.map((roleId) => ({ userId: id, roleId })) });
    }
  }
  await logActivity({ userId: actor.id, action: 'USER_UPDATED', entity: 'User', entityId: id, description: user.username });
  return meUser(id);
}

async function meUser(id) {
  const user = await prisma.user.findUnique({ where: { id }, include: includeUser });
  if (!user) throw new AppError(404, 'User not found.');
  return shapeUser(user);
}

async function listRoles() {
  return prisma.role.findMany({
    include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    orderBy: { name: 'asc' },
  });
}

async function createRole(data, actor) {
  if (!data.code || !data.name) throw new AppError(400, 'Role code and name are needed.');
  const role = await prisma.role.create({
    data: {
      code: data.code,
      name: data.name,
      description: data.description || null,
      isManagement: Boolean(data.isManagement),
      permissions: data.permissionIds?.length
        ? { create: data.permissionIds.map((permissionId) => ({ permissionId })) }
        : undefined,
    },
    include: { permissions: { include: { permission: true } } },
  });
  await logActivity({ userId: actor.id, action: 'ROLE_CREATED', entity: 'Role', entityId: role.id, description: role.name });
  return role;
}

async function updateRole(id, data, actor) {
  await prisma.role.update({
    where: { id },
    data: {
      name: data.name ?? undefined,
      description: data.description ?? undefined,
      isManagement: data.isManagement ?? undefined,
    },
  });
  if (data.permissionIds) {
    await prisma.rolePermission.deleteMany({ where: { roleId: id } });
    if (data.permissionIds.length) {
      await prisma.rolePermission.createMany({
        data: data.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
      });
    }
  }
  await logActivity({ userId: actor.id, action: 'ROLE_UPDATED', entity: 'Role', entityId: id, description: 'Role permissions updated' });
  return prisma.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } });
}

async function listPermissions() {
  return prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { name: 'asc' }] });
}

module.exports = {
  listUsers,
  salesUsers,
  createUser,
  updateUser,
  listRoles,
  createRole,
  updateRole,
  listPermissions,
};
