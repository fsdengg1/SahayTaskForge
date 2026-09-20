const { prisma } = require('../prisma');
const { delayDays } = require('../utils/progress');
const { outputStatusWhere, withDeadlineFields } = require('../utils/leadDeadline');

function startOfDay(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

async function management() {
  const now = new Date();
  const [
    totalLeads,
    openLeads,
    wonLeads,
    lostLeads,
    totalProjects,
    activeProjects,
    onTrack,
    blocked,
    onHold,
    completed,
    delayed,
    projects,
    stages,
    statuses,
    overdueTasks,
    upcomingTasks,
    recentActivity,
    delays,
  ] = await Promise.all([
    prisma.lead.count({ where: { archived: false } }),
    prisma.lead.count({ where: { archived: false, statusCode: { notIn: ['WON', 'LOST'] } } }),
    prisma.lead.count({ where: { archived: false, statusCode: 'WON' } }),
    prisma.lead.count({ where: { archived: false, statusCode: 'LOST' } }),
    prisma.project.count({ where: { archived: false } }),
    prisma.project.count({ where: { archived: false, currentStatusCode: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
    prisma.project.count({ where: { archived: false, currentStatusCode: 'ON_TRACK' } }),
    prisma.project.count({ where: { archived: false, currentStatusCode: 'BLOCKED' } }),
    prisma.project.count({ where: { archived: false, currentStatusCode: 'ON_HOLD' } }),
    prisma.project.count({ where: { archived: false, currentStatusCode: 'COMPLETED' } }),
    prisma.project.count({
      where: {
        archived: false,
        currentStatusCode: { notIn: ['COMPLETED', 'CANCELLED'] },
        expectedCompletion: { lt: now },
      },
    }),
    prisma.project.findMany({
      where: { archived: false },
      include: { customer: true, projectManager: { select: { fullName: true } }, stages: true },
    }),
    prisma.project.groupBy({ by: ['currentStageCode'], where: { archived: false }, _count: true }),
    prisma.project.groupBy({ by: ['currentStatusCode'], where: { archived: false }, _count: true }),
    prisma.task.findMany({
      where: { dueDate: { lt: now }, statusCode: { notIn: ['COMPLETED', 'CANCELLED'] } },
      include: { project: true, assignedTo: { select: { fullName: true } }, department: true },
      take: 20,
      orderBy: { dueDate: 'asc' },
    }),
    prisma.task.findMany({
      where: { dueDate: { gte: now, lte: startOfDay(30) }, statusCode: { notIn: ['COMPLETED', 'CANCELLED'] } },
      include: { project: true, assignedTo: { select: { fullName: true } } },
      take: 20,
      orderBy: { dueDate: 'asc' },
    }),
    prisma.activityLog.findMany({
      include: { user: { select: { fullName: true } } },
      orderBy: { timestamp: 'desc' },
      take: 15,
    }),
    prisma.delayRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);

  const deptCodes = ['DESIGN', 'PROCUREMENT', 'PRODUCTION', 'QC', 'INSTALLATION'];
  const departmentProgress = {};
  for (const code of deptCodes) {
    const relatedStages = await prisma.stageWeight.findMany({
      where: { department: { code } },
    });
    const codes = relatedStages.map((s) => s.stageCode);
    const subset = projects.filter((p) => codes.includes(p.currentStageCode) || p.stages.some((s) => codes.includes(s.stageCode) && s.statusCode === 'COMPLETED'));
    const done = projects.filter((p) => p.stages.some((s) => codes.includes(s.stageCode) && s.statusCode === 'COMPLETED')).length;
    departmentProgress[code] = {
      total: projects.length,
      completed: done,
      percent: projects.length ? Math.round((done / projects.length) * 100) : 0,
    };
  }

  const pipelineMap = {
    Enquiry: (p) => p.leadId,
    Quotation: (p) => ['DETAILED_DESIGN', 'DESIGN_APPROVAL'].includes(p.currentStageCode) === false && p.leadId,
    'Order Review': (p) => p.currentStageCode === 'ORDER_REVIEW',
    Design: (p) => ['DETAILED_DESIGN', 'DESIGN_APPROVAL', 'BOM_MRP'].includes(p.currentStageCode),
    Procurement: (p) => ['PROCUREMENT', 'MATERIAL_RECEIPT'].includes(p.currentStageCode),
    Production: (p) => ['PRODUCTION', 'PRODUCTION_QC', 'PACKING'].includes(p.currentStageCode),
    Installation: (p) => ['DISPATCH', 'SITE_READINESS', 'INSTALLATION', 'INSTALLATION_QC', 'CUSTOMER_INSPECTION'].includes(p.currentStageCode),
    Handover: (p) => p.currentStageCode === 'HANDOVER',
    Closure: (p) => ['INVOICE_PAYMENT', 'PROJECT_CLOSURE'].includes(p.currentStageCode),
  };
  const pipeline = Object.entries(pipelineMap).map(([label, fn]) => ({
    label,
    count: projects.filter(fn).length,
  }));
  const enquiryCount = await prisma.lead.count({ where: { archived: false, statusCode: { notIn: ['WON', 'LOST'] } } });
  const quotationCount = await prisma.lead.count({
    where: { archived: false, statusCode: { in: ['QUOTATION_PENDING', 'QUOTATION_SENT', 'REVISION_REQUIRED'] } },
  });
  pipeline[0].count = enquiryCount;
  pipeline[1].count = quotationCount;

  const critical = projects
    .filter((p) => p.currentStatusCode === 'BLOCKED' || (p.expectedCompletion && p.expectedCompletion < now && p.currentStatusCode !== 'COMPLETED'))
    .slice(0, 10)
    .map((p) => ({
      id: p.id,
      projectId: p.projectId,
      name: p.name,
      customer: p.customer.companyName,
      status: p.currentStatusCode,
      stage: p.currentStageCode,
      delayDays: delayDays(p.expectedCompletion),
    }));

  return {
    kpis: {
      totalLeads,
      openLeads,
      wonLeads,
      lostLeads,
      totalProjects,
      activeProjects,
      onTrack,
      delayed,
      blocked,
      onHold,
      completed,
    },
    pipeline,
    departmentProgress,
    statusDistribution: statuses.map((s) => ({ code: s.currentStatusCode, count: s._count })),
    stageDistribution: stages.map((s) => ({ code: s.currentStageCode, count: s._count })),
    upcomingDeadlines: upcomingTasks.map((t) => ({
      id: t.id,
      taskId: t.taskId,
      name: t.name,
      dueDate: t.dueDate,
      project: t.project,
      assignedTo: t.assignedTo,
    })),
    overdueTasks: overdueTasks.map((t) => ({
      id: t.id,
      taskId: t.taskId,
      name: t.name,
      project: t.project,
      department: t.department?.name,
      assignedTo: t.assignedTo?.fullName,
      dueDate: t.dueDate,
      delayDays: delayDays(t.dueDate),
      reason: t.delayReason,
    })),
    criticalProjects: critical,
    recentActivity,
    delayReasons: delays,
  };
}

async function sales() {
  const today = startOfDay();
  const tomorrow = startOfDay(1);
  const outputStatuses = ['ON_TIME', 'OVERDUE', 'DELAYED_1_3', 'DELAYED_OVER_3', 'ON_HOLD', 'COMPLETED'];
  const [newLeads, openLeads, dueToday, overdue, quotationPending, quotationSent, negotiation, won, lost, outputOnTime, outputOverdue, outputDelayed13, outputDelayedOver3, outputOnHold, outputCompleted, outputItems, sources, statuses, owners] =
    await Promise.all([
      prisma.lead.count({ where: { archived: false, statusCode: 'NEW' } }),
      prisma.lead.count({ where: { archived: false, statusCode: { notIn: ['WON', 'LOST'] } } }),
      prisma.lead.count({ where: { archived: false, nextFollowUpDate: { gte: today, lt: tomorrow } } }),
      prisma.lead.count({
        where: { archived: false, nextFollowUpDate: { lt: today }, statusCode: { notIn: ['WON', 'LOST'] } },
      }),
      prisma.lead.count({ where: { archived: false, statusCode: 'QUOTATION_PENDING' } }),
      prisma.lead.count({ where: { archived: false, statusCode: 'QUOTATION_SENT' } }),
      prisma.lead.count({ where: { archived: false, statusCode: 'NEGOTIATION' } }),
      prisma.lead.count({ where: { archived: false, statusCode: 'WON' } }),
      prisma.lead.count({ where: { archived: false, statusCode: 'LOST' } }),
      ...outputStatuses.map((code) => prisma.lead.count({ where: { archived: false, ...outputStatusWhere(code) } })),
      prisma.lead.findMany({
        where: {
          archived: false,
          OR: ['OVERDUE', 'DELAYED_1_3', 'DELAYED_OVER_3', 'ON_HOLD'].map((code) => outputStatusWhere(code)),
        },
        include: { customer: { select: { companyName: true } }, salesPerson: { select: { fullName: true } } },
        orderBy: { submissionDeadline: 'asc' },
        take: 12,
      }),
      prisma.lead.groupBy({ by: ['sourceCode'], where: { archived: false }, _count: true }),
      prisma.lead.groupBy({ by: ['statusCode'], where: { archived: false }, _count: true }),
      prisma.lead.groupBy({ by: ['salesPersonId'], where: { archived: false }, _count: true }),
    ]);
  const users = await prisma.user.findMany({
    where: { id: { in: owners.map((o) => o.salesPersonId).filter(Boolean) } },
    select: { id: true, fullName: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
  return {
    kpis: {
      newLeads,
      openLeads,
      dueToday,
      overdue,
      quotationPending,
      quotationSent,
      negotiation,
      won,
      lost,
      outputOnTime,
      outputOverdue,
      outputDelayed13,
      outputDelayedOver3,
      outputOnHold,
      outputCompleted,
    },
    outputTracking: outputItems.map((lead) => withDeadlineFields(lead)),
    pipeline: statuses.map((s) => ({ code: s.statusCode, count: s._count })),
    sources: sources.map((s) => ({ code: s.sourceCode, count: s._count })),
    salespersons: owners.map((o) => ({ id: o.salesPersonId, name: userMap[o.salesPersonId] || 'Unassigned', count: o._count })),
  };
}

async function design() {
  const [assigned, pendingApprovals, overdue, revisions, completed, outputOnTime, outputOverdue, outputDelayed13, outputDelayedOver3, outputItems] = await Promise.all([
    prisma.task.count({ where: { module: 'DESIGN', statusCode: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
    prisma.approval.count({ where: { statusCode: 'PENDING_REVIEW' } }),
    prisma.task.count({
      where: { module: 'DESIGN', dueDate: { lt: new Date() }, statusCode: { notIn: ['COMPLETED', 'CANCELLED'] } },
    }),
    prisma.approval.count({ where: { statusCode: { in: ['REJECTED', 'REVISION_REQUIRED'] } } }),
    prisma.task.count({ where: { module: 'DESIGN', statusCode: 'COMPLETED' } }),
    prisma.lead.count({ where: { archived: false, ...outputStatusWhere('ON_TIME') } }),
    prisma.lead.count({ where: { archived: false, ...outputStatusWhere('OVERDUE') } }),
    prisma.lead.count({ where: { archived: false, ...outputStatusWhere('DELAYED_1_3') } }),
    prisma.lead.count({ where: { archived: false, ...outputStatusWhere('DELAYED_OVER_3') } }),
    prisma.lead.findMany({
      where: { archived: false, OR: ['ON_TIME', 'OVERDUE', 'DELAYED_1_3', 'DELAYED_OVER_3', 'ON_HOLD'].map((code) => outputStatusWhere(code)) },
      include: { customer: { select: { companyName: true } }, salesPerson: { select: { fullName: true } } },
      orderBy: { submissionDeadline: 'asc' },
      take: 20,
    }),
  ]);
  return {
    kpis: { assigned, pendingDrawings: assigned, pendingApprovals, overdue, revisions, completed, outputOnTime, outputOverdue, outputDelayed13, outputDelayedOver3 },
    outputTracking: outputItems.map((lead) => withDeadlineFields(lead)),
  };
}

async function procurement() {
  const [rfqs, pendingQuotes, poPending, delayed, incoming, iqc] = await Promise.all([
    prisma.rfq.count({ where: { statusCode: 'OPEN' } }),
    prisma.rfq.count({ where: { quotations: { none: {} }, statusCode: 'OPEN' } }),
    prisma.purchaseOrder.count({ where: { statusCode: { in: ['DRAFT', 'PENDING'] } } }),
    prisma.purchaseOrder.count({
      where: { expectedDelivery: { lt: new Date() }, statusCode: { not: 'RECEIVED' } },
    }),
    prisma.goodsReceipt.count(),
    prisma.qualityInspection.count({ where: { typeCode: 'INCOMING' } }),
  ]);
  return { kpis: { rfqs, pendingQuotes, poPending, delayedVendors: delayed, incoming, iqcPending: iqc } };
}

async function production() {
  const [orders, delayed, qcPending, rework, completed] = await Promise.all([
    prisma.productionOrder.count({ where: { statusCode: { not: 'COMPLETED' } } }),
    prisma.productionOperation.count({
      where: { targetDate: { lt: new Date() }, statusCode: { notIn: ['COMPLETED', 'CANCELLED'] } },
    }),
    prisma.qualityInspection.count({ where: { typeCode: 'FINAL_PRODUCTION' } }),
    prisma.task.count({ where: { sourceType: 'QC', statusCode: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
    prisma.productionOrder.count({ where: { statusCode: 'COMPLETED' } }),
  ]);
  const todayOps = await prisma.productionOperation.findMany({
    where: { statusCode: { in: ['IN_PROGRESS', 'NOT_STARTED'] } },
    include: { productionOrder: { include: { project: true } } },
    take: 20,
  });
  return { kpis: { productionProjects: orders, delayed, qcPending, rework, completed }, today: todayOps };
}

async function installation() {
  const now = new Date();
  const [upcoming, notReady, inProgress, punches, qcPending, handoverPending] = await Promise.all([
    prisma.installationVisit.count({ where: { visitDate: { gte: now } } }),
    prisma.installation.count({ where: { readinessCode: { in: ['NOT_READY', 'PARTIAL'] } } }),
    prisma.installation.count({ where: { statusCode: 'IN_PROGRESS' } }),
    prisma.punchPoint.count({ where: { statusCode: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.qualityInspection.count({ where: { typeCode: 'INSTALLATION', resultCode: { not: 'PASSED' } } }),
    prisma.project.count({
      where: { currentStageCode: { in: ['HANDOVER', 'CUSTOMER_INSPECTION'] }, currentStatusCode: { not: 'COMPLETED' } },
    }),
  ]);
  return { kpis: { upcoming, notReady, inProgress, punches, qcPending, handoverPending } };
}

module.exports = { management, sales, design, procurement, production, installation };
