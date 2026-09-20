const { prisma } = require('../prisma');
const { nextNumber } = require('../utils/numbering');
const { parsePagination, paginated } = require('../utils/pagination');
const { AppError } = require('../utils/errors');
const { logActivity } = require('../utils/activity');
const { notifyUsers } = require('../utils/notifications');
const { delayDays } = require('../utils/progress');

const include = {
  project: { select: { id: true, projectId: true, name: true } },
  department: true,
  assignedTo: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  blockers: { include: { dependsOn: { select: { id: true, taskId: true, name: true, statusCode: true } } } },
  blocking: { include: { task: { select: { id: true, taskId: true, name: true } } } },
  updates: { orderBy: { createdAt: 'desc' }, take: 20 },
};

async function createTask(data, user) {
  if (!data.name) throw new AppError(400, 'Task name is needed.', { field: 'name' });
  const taskId = await nextNumber('TASK');
  const task = await prisma.task.create({
    data: {
      taskId,
      projectId: data.projectId || null,
      name: data.name,
      departmentId: data.departmentId || null,
      assignedToId: data.assignedToId || null,
      createdById: user?.id || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      statusCode: data.statusCode || 'NOT_STARTED',
      priorityCode: data.priorityCode || 'MEDIUM',
      remarks: data.remarks || null,
      module: data.module || null,
      sourceType: data.sourceType || null,
      sourceId: data.sourceId || null,
    },
    include,
  });
  if (data.dependsOnTaskId) {
    await prisma.taskDependency.create({ data: { taskId: task.id, dependsOnTaskId: data.dependsOnTaskId } });
  }
  if (Array.isArray(data.dependsOn) && data.dependsOn.length) {
    await prisma.taskDependency.createMany({
      data: data.dependsOn.map((dependsOnTaskId) => ({ taskId: task.id, dependsOnTaskId })),
      skipDuplicates: true,
    });
  }
  await refreshBlocked(task.id);
  await logActivity({
    userId: user?.id,
    action: 'TASK_CREATED',
    entity: data.projectId ? 'Project' : 'Task',
    entityId: data.projectId || task.id,
    description: `${taskId} ${data.name} created`,
  });
  if (task.assignedToId) {
    await notifyUsers([task.assignedToId], {
      title: 'Task assigned',
      message: `${task.taskId}: ${task.name}`,
      type: 'TASK',
      entityType: 'Task',
      entityId: task.id,
      link: `/tasks?id=${task.id}`,
    });
    await logActivity({
      userId: user?.id,
      action: 'TASK_ASSIGNED',
      entity: 'Task',
      entityId: task.id,
      description: `Assigned ${task.taskId}`,
    });
  }
  return prisma.task.findUnique({ where: { id: task.id }, include });
}

async function refreshBlocked(taskId) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { blockers: { include: { dependsOn: true } } },
  });
  if (!task) return;
  const incomplete = task.blockers.filter((b) => b.dependsOn.statusCode !== 'COMPLETED');
  if (incomplete.length && task.statusCode !== 'CANCELLED') {
    await prisma.task.update({ where: { id: taskId }, data: { statusCode: 'BLOCKED' } });
  } else if (task.statusCode === 'BLOCKED' && incomplete.length === 0) {
    await prisma.task.update({ where: { id: taskId }, data: { statusCode: 'NOT_STARTED' } });
  }
}

function taskWhere(query, user) {
  const where = {};
  if (query.scope === 'mine' && user) where.assignedToId = user.id;
  if (query.assignedToId) where.assignedToId = query.assignedToId;
  if (query.projectId) where.projectId = query.projectId;
  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.status) where.statusCode = query.status;
  if (query.priority) where.priorityCode = query.priority;
  if (query.module) where.module = query.module;
  if (query.q) {
    where.OR = [
      { taskId: { contains: query.q, mode: 'insensitive' } },
      { name: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endToday = new Date(startToday.getTime() + 86400000);
  if (query.bucket === 'overdue') {
    where.dueDate = { lt: startToday };
    where.statusCode = { notIn: ['COMPLETED', 'CANCELLED'] };
  }
  if (query.bucket === 'today') {
    where.dueDate = { gte: startToday, lt: endToday };
  }
  if (query.bucket === 'week') {
    where.dueDate = { gte: startToday, lt: new Date(startToday.getTime() + 7 * 86400000) };
  }
  if (query.bucket === 'completed') where.statusCode = 'COMPLETED';
  return where;
}

async function listTasks(query, user) {
  const { skip, take, page, pageSize } = parsePagination(query);
  const where = taskWhere(query, user);
  const [items, total, pending, inProgress, overdue, completed] = await Promise.all([
    prisma.task.findMany({ where, include, skip, take, orderBy: { dueDate: 'asc' } }),
    prisma.task.count({ where }),
    prisma.task.count({ where: { ...where, statusCode: 'NOT_STARTED' } }),
    prisma.task.count({ where: { ...where, statusCode: 'IN_PROGRESS' } }),
    prisma.task.count({
      where: { ...where, dueDate: { lt: new Date() }, statusCode: { notIn: ['COMPLETED', 'CANCELLED'] } },
    }),
    prisma.task.count({ where: { ...where, statusCode: 'COMPLETED' } }),
  ]);
  const mapped = items.map((t) => ({
    ...t,
    delayDays: ['COMPLETED', 'CANCELLED'].includes(t.statusCode) ? 0 : delayDays(t.dueDate),
    blockedBy: t.blockers.filter((b) => b.dependsOn.statusCode !== 'COMPLETED').map((b) => b.dependsOn),
  }));
  return { ...paginated(mapped, total, page, pageSize), cards: { pending, inProgress, overdue, completed } };
}

async function getTask(id) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: { ...include, comments: { include: { user: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } } },
  });
  if (!task) throw new AppError(404, 'Task not found.');
  return {
    ...task,
    delayDays: delayDays(task.dueDate, task.completedDate),
    blockedBy: task.blockers.filter((b) => b.dependsOn.statusCode !== 'COMPLETED').map((b) => b.dependsOn),
  };
}

async function updateTask(id, data, user) {
  const existing = await prisma.task.findUnique({ where: { id }, include: { blockers: { include: { dependsOn: true } } } });
  if (!existing) throw new AppError(404, 'Task not found.');
  if (data.statusCode === 'IN_PROGRESS' || data.statusCode === 'COMPLETED') {
    const incomplete = existing.blockers.filter((b) => b.dependsOn.statusCode !== 'COMPLETED');
    if (incomplete.length) {
      throw new AppError(400, `Blocked by: ${incomplete.map((b) => b.dependsOn.name).join(', ')}`);
    }
  }
  const task = await prisma.task.update({
    where: { id },
    data: {
      name: data.name ?? undefined,
      assignedToId: data.assignedToId ?? undefined,
      departmentId: data.departmentId ?? undefined,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      statusCode: data.statusCode ?? undefined,
      priorityCode: data.priorityCode ?? undefined,
      delayReason: data.delayReason ?? undefined,
      delayCategory: data.delayCategory ?? undefined,
      remarks: data.remarks ?? undefined,
      completedDate: data.statusCode === 'COMPLETED' ? new Date() : undefined,
    },
    include,
  });
  if (data.statusCode && data.statusCode !== existing.statusCode) {
    await prisma.taskUpdate.create({
      data: {
        taskId: id,
        userId: user.id,
        message: data.remarks || `Status ${existing.statusCode} → ${data.statusCode}`,
        oldStatus: existing.statusCode,
        newStatus: data.statusCode,
      },
    });
    await logActivity({
      userId: user.id,
      action: data.statusCode === 'COMPLETED' ? 'TASK_COMPLETED' : 'TASK_UPDATED',
      entity: 'Task',
      entityId: id,
      oldValue: existing.statusCode,
      newValue: data.statusCode,
      description: `${existing.taskId} ${existing.statusCode} → ${data.statusCode}`,
    });
    if (data.statusCode === 'COMPLETED') {
      const dependents = await prisma.taskDependency.findMany({ where: { dependsOnTaskId: id } });
      for (const d of dependents) await refreshBlocked(d.taskId);
    }
  }
  if (data.assignedToId && data.assignedToId !== existing.assignedToId) {
    await notifyUsers([data.assignedToId], {
      title: 'Task assigned',
      message: `${existing.taskId}: ${existing.name}`,
      type: 'TASK',
      entityType: 'Task',
      entityId: id,
      link: `/tasks?id=${id}`,
    });
  }
  return getTask(id);
}

async function addDependency(taskId, dependsOnTaskId) {
  if (taskId === dependsOnTaskId) throw new AppError(400, 'A task cannot depend on itself.');
  await prisma.taskDependency.create({ data: { taskId, dependsOnTaskId } });
  await refreshBlocked(taskId);
  return getTask(taskId);
}

async function addTaskComment(taskId, body, user) {
  return prisma.comment.create({
    data: { entityType: 'Task', entityId: taskId, taskId, body, userId: user.id },
  });
}

module.exports = { createTask, listTasks, getTask, updateTask, addDependency, addTaskComment };
