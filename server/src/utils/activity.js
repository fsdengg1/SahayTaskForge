const { prisma } = require('../prisma');

async function logActivity({ userId, action, entity, entityId, oldValue, newValue, description }) {
  return prisma.activityLog.create({
    data: {
      userId: userId || null,
      action,
      entity,
      entityId: String(entityId),
      oldValue: oldValue != null ? String(oldValue) : null,
      newValue: newValue != null ? String(newValue) : null,
      description,
    },
  });
}

async function logAudit({ userId, ip, entity, entityId, action, previous, next }) {
  return prisma.auditLog.create({
    data: {
      userId: userId || null,
      ip: ip || null,
      entity,
      entityId: String(entityId),
      action,
      previous: previous || undefined,
      next: next || undefined,
    },
  });
}

module.exports = { logActivity, logAudit };
