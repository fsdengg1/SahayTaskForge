const { prisma } = require('../prisma');

async function listByType(type, includeInactive = false) {
  return prisma.lookup.findMany({
    where: { type, ...(includeInactive ? {} : { active: true }) },
    orderBy: { sortOrder: 'asc' },
  });
}

async function grouped() {
  const rows = await prisma.lookup.findMany({ where: { active: true }, orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }] });
  return rows.reduce((acc, row) => {
    acc[row.type] = acc[row.type] || [];
    acc[row.type].push(row);
    return acc;
  }, {});
}

async function listDepartments() {
  return prisma.department.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
}

module.exports = { listByType, grouped, listDepartments };
