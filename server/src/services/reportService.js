const { prisma } = require('../prisma');
const { delayDays } = require('../utils/progress');
const { withDeadlineFields } = require('../utils/leadDeadline');

async function run(type, query = {}) {
  switch (type) {
    case 'lead-conversion':
      return leadConversion();
    case 'lead-status':
      return prisma.lead.groupBy({ by: ['statusCode'], where: { archived: false }, _count: true });
    case 'sales-followup':
      return prisma.lead.findMany({
        where: { archived: false, statusCode: { notIn: ['WON', 'LOST'] } },
        include: { customer: true, salesPerson: { select: { fullName: true } }, followUps: { orderBy: { followUpDate: 'desc' }, take: 1 } },
        orderBy: { nextFollowUpDate: 'asc' },
      }).then((rows) => rows.map((row) => withDeadlineFields(row)));
    case 'project-status':
      return prisma.project.findMany({
        where: { archived: false },
        include: { customer: true, projectManager: { select: { fullName: true } } },
      });
    case 'project-delay':
      return delayReport();
    case 'department-progress':
      return departmentProgress();
    case 'design-delay':
      return moduleDelay('DESIGN');
    case 'procurement-delay':
      return moduleDelay('PROCUREMENT');
    case 'production-progress':
      return prisma.productionOrder.findMany({ include: { project: true, operations: true } });
    case 'installation-progress':
      return prisma.installation.findMany({ include: { project: true, activities: true, visits: true } });
    case 'customer-projects':
      return prisma.customer.findMany({
        where: { archived: false },
        include: { projects: true, _count: { select: { projects: true, leads: true } } },
      });
    case 'salesperson-leads':
      return salespersonLeads();
    case 'project-completion':
      return prisma.project.findMany({
        where: { currentStatusCode: 'COMPLETED' },
        include: { customer: true, closedBy: { select: { fullName: true } } },
      });
    case 'quality-report':
      return prisma.qualityInspection.findMany({
        include: { project: { select: { id: true, projectId: true, name: true } }, inspector: { select: { fullName: true } } },
        orderBy: { inspectedAt: 'desc' },
      });
    case 'order-value':
      return prisma.project.findMany({
        where: { archived: false },
        include: { customer: true },
        orderBy: { createdAt: 'desc' },
      });
    default:
      return { error: 'Unknown report' };
  }
}

async function leadConversion() {
  const [total, won, lost] = await Promise.all([
    prisma.lead.count({ where: { archived: false } }),
    prisma.lead.count({ where: { archived: false, statusCode: 'WON' } }),
    prisma.lead.count({ where: { archived: false, statusCode: 'LOST' } }),
  ]);
  return { total, won, lost, conversionRate: total ? Number(((won / total) * 100).toFixed(1)) : 0 };
}

async function delayReport() {
  const projects = await prisma.project.findMany({
    where: { archived: false, currentStatusCode: { notIn: ['COMPLETED', 'CANCELLED'] } },
    include: { customer: true, delays: true },
  });
  return projects
    .map((p) => ({
      ...p,
      delayDays: delayDays(p.expectedCompletion),
    }))
    .filter((p) => p.delayDays > 0);
}

async function departmentProgress() {
  const weights = await prisma.stageWeight.findMany({ include: { department: true } });
  const projects = await prisma.project.findMany({ include: { stages: true } });
  const byDept = {};
  for (const w of weights) {
    const key = w.department?.name || 'Other';
    byDept[key] = byDept[key] || { codes: new Set() };
    byDept[key].codes.add(w.stageCode);
  }
  return Object.entries(byDept).map(([name, v]) => {
    let completed = 0;
    let inProgress = 0;
    for (const p of projects) {
      const relevant = p.stages.filter((s) => v.codes.has(s.stageCode));
      if (!relevant.length) continue;
      if (relevant.every((s) => s.statusCode === 'COMPLETED')) completed += 1;
      else if (relevant.some((s) => ['IN_PROGRESS', 'ON_TRACK', 'PENDING'].includes(s.statusCode))) inProgress += 1;
    }
    const total = projects.length;
    return {
      name,
      completed,
      inProgress,
      pending: Math.max(0, total - completed - inProgress),
      total,
      percent: total ? Math.round((completed / total) * 100) : 0,
    };
  });
}

async function moduleDelay(module) {
  const tasks = await prisma.task.findMany({
    where: { module, statusCode: { notIn: ['COMPLETED', 'CANCELLED'] }, dueDate: { lt: new Date() } },
    include: { project: true, assignedTo: { select: { fullName: true } } },
  });
  return tasks.map((t) => ({ ...t, delayDays: delayDays(t.dueDate) }));
}

async function salespersonLeads() {
  const grouped = await prisma.lead.groupBy({ by: ['salesPersonId', 'statusCode'], where: { archived: false }, _count: true });
  const users = await prisma.user.findMany({ select: { id: true, fullName: true } });
  const map = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
  return grouped.map((g) => ({ salesperson: map[g.salesPersonId] || 'Unassigned', status: g.statusCode, count: g._count }));
}

module.exports = { run };
