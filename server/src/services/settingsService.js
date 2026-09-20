const { prisma } = require('../prisma');
const { AppError } = require('../utils/errors');

async function listLookups(type) {
  return prisma.lookup.findMany({
    where: type ? { type } : {},
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
  });
}

async function upsertLookup(data) {
  if (!data.type || !data.code || !data.label) throw new AppError(400, 'Type, code and label are needed.');
  return prisma.lookup.upsert({
    where: { type_code: { type: data.type, code: data.code } },
    update: { label: data.label, sortOrder: data.sortOrder ?? 0, active: data.active ?? true, color: data.color },
    create: {
      type: data.type,
      code: data.code,
      label: data.label,
      sortOrder: data.sortOrder ?? 0,
      active: data.active ?? true,
      color: data.color,
    },
  });
}

async function listStageWeights() {
  return prisma.stageWeight.findMany({ include: { department: true }, orderBy: { sortOrder: 'asc' } });
}

async function updateStageWeights(items) {
  for (const item of items) {
    await prisma.stageWeight.update({
      where: { id: item.id },
      data: { weight: item.weight, label: item.label ?? undefined },
    });
  }
  return listStageWeights();
}

async function listProductionOps() {
  return prisma.productionOperationConfig.findMany({ orderBy: { sortOrder: 'asc' } });
}

async function upsertProductionOp(data) {
  return prisma.productionOperationConfig.upsert({
    where: { code: data.code },
    update: { name: data.name, sortOrder: data.sortOrder ?? 0, active: data.active ?? true },
    create: { code: data.code, name: data.name, sortOrder: data.sortOrder ?? 0 },
  });
}

async function listDepartments() {
  return prisma.department.findMany({ orderBy: { sortOrder: 'asc' } });
}

async function upsertDepartment(data) {
  return prisma.department.upsert({
    where: { code: data.code },
    update: { name: data.name, active: data.active ?? true, sortOrder: data.sortOrder ?? 0 },
    create: { code: data.code, name: data.name, sortOrder: data.sortOrder ?? 0 },
  });
}

async function listClosure() {
  return prisma.closureCondition.findMany({ orderBy: { sortOrder: 'asc' } });
}

async function updateClosure(id, data) {
  return prisma.closureCondition.update({ where: { id }, data: { required: data.required, label: data.label } });
}

async function listAudit(query) {
  return prisma.auditLog.findMany({
    include: { user: { select: { fullName: true, username: true } } },
    orderBy: { timestamp: 'desc' },
    take: Math.min(200, Number(query.limit) || 50),
  });
}

module.exports = {
  listLookups,
  upsertLookup,
  listStageWeights,
  updateStageWeights,
  listProductionOps,
  upsertProductionOp,
  listDepartments,
  upsertDepartment,
  listClosure,
  updateClosure,
  listAudit,
};
