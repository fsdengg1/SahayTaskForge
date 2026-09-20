const { prisma } = require('../prisma');

async function notifyUsers(userIds, payload) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  if (!unique.length) return;
  await prisma.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      title: payload.title,
      message: payload.message,
      type: payload.type || 'INFO',
      entityType: payload.entityType || null,
      entityId: payload.entityId || null,
      link: payload.link || null,
    })),
  });
}

async function notifyByPermission(permissionCode, payload) {
  const users = await prisma.user.findMany({
    where: {
      active: true,
      roles: {
        some: {
          role: {
            permissions: { some: { permission: { code: permissionCode } } },
          },
        },
      },
    },
    select: { id: true },
  });
  await notifyUsers(users.map((u) => u.id), payload);
}

async function notifyOnce(userIds, payload) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  for (const userId of unique) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        title: payload.title,
        entityType: payload.entityType || undefined,
        entityId: payload.entityId || undefined,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.notification.create({
      data: {
        userId,
        title: payload.title,
        message: payload.message,
        type: payload.type || 'INFO',
        entityType: payload.entityType || null,
        entityId: payload.entityId || null,
        link: payload.link || null,
      },
    });
  }
}

module.exports = { notifyUsers, notifyByPermission, notifyOnce };
