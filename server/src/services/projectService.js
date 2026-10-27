const { prisma } = require('../prisma');
const { nextNumber } = require('../utils/numbering');
const { parsePagination, paginated, parseSort } = require('../utils/pagination');
const { AppError } = require('../utils/errors');
const { logActivity, logAudit } = require('../utils/activity');
const { recalculateProjectProgress, delayDays } = require('../utils/progress');
const { notifyUsers, notifyByPermission } = require('../utils/notifications');

const projectInclude = {
  customer: true,
  contact: true,
  site: true,
  lead: { select: { id: true, leadId: true, statusCode: true } },
  salesPerson: { select: { id: true, fullName: true } },
  projectManager: { select: { id: true, fullName: true } },
  members: { include: { user: { select: { id: true, fullName: true } }, department: true } },
  stages: { orderBy: { sortOrder: 'asc' } },
  orders: { include: { items: true } },
};

function currencyAmount(data, fallback) {
  const raw = data.currencyValue != null && data.currencyValue !== '' ? data.currencyValue : data.orderValue;
  if (raw == null || raw === '') return fallback ?? null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new AppError(400, 'Enter a valid currency value.');
  }
  return amount;
}

async function stageTemplates() {
  return prisma.lookup.findMany({
    where: { type: 'PROJECT_STAGE', active: true },
    orderBy: { sortOrder: 'asc' },
  });
}

async function createStages(projectId) {
  const stages = await stageTemplates();
  await prisma.projectStageRecord.createMany({
    data: stages.map((s, i) => ({
      projectId,
      stageCode: s.code,
      statusCode: i === 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
      sortOrder: s.sortOrder,
    })),
  });
}

async function createProjectFromLead(lead, data, user) {
  const projectId = await nextNumber('PROJECT');
  const req = lead.requirement || {};
  const project = await prisma.project.create({
    data: {
      projectId,
      name: data.name || `${lead.customer.companyName} — ${req.storageMethodCode || 'Project'}`,
      leadId: lead.id,
      customerId: lead.customerId,
      contactId: lead.contactId,
      siteId: lead.siteId,
      salesPersonId: lead.salesPersonId,
      projectManagerId: data.projectManagerId || null,
      productCategory: req.storageMethodCode || data.productCategory || null,
      projectType: req.requirementType || data.projectType || null,
      orderNumber: data.orderNumber || null,
      poNumber: data.poNumber || null,
      poDate: data.poDate ? new Date(data.poDate) : null,
      orderValue: currencyAmount(data, lead.budgetAmount),
      currency: data.currency || lead.budgetCurrency || 'INR',
      startDate: data.startDate ? new Date(data.startDate) : new Date(),
      expectedCompletion: data.expectedCompletion ? new Date(data.expectedCompletion) : null,
      priorityCode: lead.priorityCode || 'MEDIUM',
      currentStageCode: 'ORDER_REVIEW',
      currentStatusCode: 'IN_PROGRESS',
      remarks: data.remarks || lead.remarks,
      createdById: user.id,
    },
  });

  await createStages(project.id);
  if (data.orderNumber || data.poNumber) {
    await prisma.order.create({
      data: {
        projectId: project.id,
        orderNumber: data.orderNumber || null,
        poNumber: data.poNumber || null,
        poDate: data.poDate ? new Date(data.poDate) : null,
        value: project.orderValue,
        currency: project.currency,
      },
    });
  }

  if (lead.documents?.length) {
    await prisma.document.updateMany({
      where: { leadId: lead.id },
      data: { projectId: project.id },
    });
  }

  await prisma.projectStatusHistory.create({
    data: {
      projectId: project.id,
      stageCode: 'ORDER_REVIEW',
      statusCode: 'IN_PROGRESS',
      reason: `Converted from ${lead.leadId}`,
      changedBy: user.id,
    },
  });

  await prisma.installation.create({
    data: {
      projectId: project.id,
      statusCode: 'NOT_STARTED',
      readinessCode: 'NOT_READY',
      activities: {
        create: [
          ['SITE_READINESS', 'Site Readiness'],
          ['MATERIAL_VERIFY', 'Material Verification'],
          ['POSITION_MARKING', 'Position Marking'],
          ['ERECTION', 'Installation / Erection'],
          ['ACCESSORIES', 'Accessories'],
          ['DECKING', 'Decking'],
          ['SAFETY', 'Safety System'],
          ['INSTALL_QC', 'Installation QC'],
          ['CUSTOMER_INSP', 'Customer Inspection'],
          ['PUNCH', 'Punch Points'],
          ['RECTIFICATION', 'Rectification'],
          ['ACCEPTANCE', 'Customer Acceptance'],
          ['HANDOVER', 'Handover'],
        ].map(([activityCode, label], i) => ({ activityCode, label, sortOrder: i + 1 })),
      },
      readiness: {
        create: [
          ['FLOOR', 'Floor ready'],
          ['AREA', 'Area available'],
          ['HEIGHT', 'Clear height confirmed'],
          ['MATERIAL', 'Material available'],
          ['ACCESS', 'Customer site access available'],
          ['SAFETY', 'Safety requirements ready'],
          ['CLEARED', 'Installation area cleared'],
          ['REP', 'Customer representative available'],
        ].map(([itemCode, label]) => ({ itemCode, label, statusCode: 'NOT_READY' })),
      },
    },
  });

  await logActivity({
    userId: user.id,
    action: 'PROJECT_CREATED',
    entity: 'Project',
    entityId: project.id,
    description: `${projectId} created from ${lead.leadId}`,
  });
  await recalculateProjectProgress(project.id);
  return prisma.project.findUnique({ where: { id: project.id }, include: projectInclude });
}

async function createProject(data, user) {
  if (!data.customerId) throw new AppError(400, 'Customer is needed.', { field: 'customerId' });
  if (!data.name) throw new AppError(400, 'Project name is needed.', { field: 'name' });
  const projectId = await nextNumber('PROJECT');
  const project = await prisma.project.create({
    data: {
      projectId,
      name: data.name,
      customerId: data.customerId,
      contactId: data.contactId || null,
      siteId: data.siteId || null,
      salesPersonId: data.salesPersonId || null,
      projectManagerId: data.projectManagerId || null,
      productCategory: data.productCategory || null,
      projectType: data.projectType || null,
      orderNumber: data.orderNumber || null,
      poNumber: data.poNumber || null,
      poDate: data.poDate ? new Date(data.poDate) : null,
      orderValue: data.orderValue != null ? Number(data.orderValue) : null,
      currency: data.currency || 'INR',
      startDate: data.startDate ? new Date(data.startDate) : new Date(),
      expectedCompletion: data.expectedCompletion ? new Date(data.expectedCompletion) : null,
      priorityCode: data.priorityCode || 'MEDIUM',
      currentStageCode: data.currentStageCode || 'ORDER_REVIEW',
      currentStatusCode: data.currentStatusCode || 'NOT_STARTED',
      remarks: data.remarks || null,
      createdById: user.id,
    },
  });
  await createStages(project.id);
  await prisma.installation.create({
    data: { projectId: project.id, statusCode: 'NOT_STARTED' },
  });
  await logActivity({
    userId: user.id,
    action: 'PROJECT_CREATED',
    entity: 'Project',
    entityId: project.id,
    description: `${projectId} created`,
  });
  return prisma.project.findUnique({ where: { id: project.id }, include: projectInclude });
}

function projectWhere(query) {
  const where = { archived: query.archived === 'true' };
  if (query.q) {
    where.OR = [
      { projectId: { contains: query.q, mode: 'insensitive' } },
      { name: { contains: query.q, mode: 'insensitive' } },
      { customer: { companyName: { contains: query.q, mode: 'insensitive' } } },
      { orderNumber: { contains: query.q, mode: 'insensitive' } },
      { poNumber: { contains: query.q, mode: 'insensitive' } },
      { projectManager: { fullName: { contains: query.q, mode: 'insensitive' } } },
    ];
  }
  if (query.stage) where.currentStageCode = query.stage;
  if (query.status) where.currentStatusCode = query.status;
  if (query.projectManagerId) where.projectManagerId = query.projectManagerId;
  if (query.salesPersonId) where.salesPersonId = query.salesPersonId;
  if (query.customerId) where.customerId = query.customerId;
  if (query.bucket === 'active') where.currentStatusCode = { notIn: ['COMPLETED', 'CANCELLED'] };
  if (query.delayed === 'true') {
    where.expectedCompletion = { lt: new Date() };
    where.currentStatusCode = { notIn: ['COMPLETED', 'CANCELLED'] };
  }
  if (query.from || query.to) {
    where.expectedCompletion = where.expectedCompletion || {};
    if (query.from) where.expectedCompletion.gte = new Date(query.from);
    if (query.to) where.expectedCompletion.lte = new Date(query.to);
  }
  return where;
}

async function listProjects(query) {
  const liveProjects = require('./liveProjectStore');
  if (await liveProjects.hasProjects()) return liveProjects.list(query);
  const { skip, take, page, pageSize } = parsePagination(query);
  const where = projectWhere(query);
  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        customer: true,
        projectManager: { select: { id: true, fullName: true } },
        salesPerson: { select: { id: true, fullName: true } },
      },
      skip,
      take,
      orderBy: parseSort(query, ['projectId', 'name', 'createdAt', 'expectedCompletion', 'progressPercent'], 'createdAt'),
    }),
    prisma.project.count({ where }),
  ]);
  const withDelay = items.map((p) => ({
    ...p,
    delayDays: p.currentStatusCode === 'COMPLETED' ? 0 : delayDays(p.expectedCompletion),
  }));
  return paginated(withDelay, total, page, pageSize);
}

async function getProject(id) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      ...projectInclude,
      tasks: { include: { assignedTo: { select: { id: true, fullName: true } }, department: true, blockers: { include: { dependsOn: true } } } },
      documents: { where: { archived: false }, orderBy: { uploadedAt: 'desc' } },
      comments: { include: { user: { select: { id: true, fullName: true } } }, orderBy: { createdAt: 'desc' } },
      issues: {
        include: {
          department: { select: { name: true } },
          assignedTo: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      punchPoints: { include: { assignedTo: { select: { id: true, fullName: true } } } },
      invoices: { include: { payments: true } },
      handovers: true,
      installations: { include: { visits: true, activities: true, readiness: true } },
      productionOrders: { include: { operations: { include: { updates: true } } } },
      inspections: { include: { inspector: { select: { id: true, fullName: true } } } },
      rfqs: { include: { quotations: { include: { vendor: true } } } },
      purchaseOrders: { include: { vendor: true, items: true } },
      approvals: { include: { submittedBy: { select: { fullName: true } }, reviewer: { select: { fullName: true } }, document: true } },
      statusHistory: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!project) {
    const live = await require('./liveProjectStore').getById(id);
    if (live) return live;
    throw new AppError(404, 'Project not found.');
  }
  const activity = await prisma.activityLog.findMany({
    where: { OR: [{ entity: 'Project', entityId: id }, { entityId: id }] },
    include: { user: { select: { id: true, fullName: true } } },
    orderBy: { timestamp: 'desc' },
    take: 150,
  });
  return { ...project, delayDays: delayDays(project.expectedCompletion, project.actualCompletion), activity };
}

async function updateProject(id, data, user) {
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Project not found.');
  const project = await prisma.project.update({
    where: { id },
    data: {
      name: data.name ?? undefined,
      projectManagerId: data.projectManagerId ?? undefined,
      salesPersonId: data.salesPersonId ?? undefined,
      productCategory: data.productCategory ?? undefined,
      projectType: data.projectType ?? undefined,
      orderNumber: data.orderNumber ?? undefined,
      poNumber: data.poNumber ?? undefined,
      poDate: data.poDate ? new Date(data.poDate) : undefined,
      orderValue: data.orderValue != null ? Number(data.orderValue) : undefined,
      currency: data.currency ?? undefined,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      expectedCompletion: data.expectedCompletion ? new Date(data.expectedCompletion) : undefined,
      priorityCode: data.priorityCode ?? undefined,
      remarks: data.remarks ?? undefined,
    },
    include: projectInclude,
  });
  await logActivity({ userId: user.id, action: 'PROJECT_UPDATED', entity: 'Project', entityId: id, description: `${existing.projectId} updated` });
  return project;
}

async function changeStage(id, stageCode, user, reason) {
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Project not found.');
  await prisma.project.update({ where: { id }, data: { currentStageCode: stageCode, currentStatusCode: 'IN_PROGRESS' } });
  await prisma.projectStageRecord.updateMany({
    where: { projectId: id, stageCode: existing.currentStageCode, statusCode: { not: 'COMPLETED' } },
    data: { statusCode: 'COMPLETED', completedDate: new Date() },
  });
  await prisma.projectStageRecord.updateMany({
    where: { projectId: id, stageCode },
    data: { statusCode: 'IN_PROGRESS', startDate: new Date() },
  });
  await prisma.projectStatusHistory.create({
    data: { projectId: id, stageCode, statusCode: 'IN_PROGRESS', reason, changedBy: user.id },
  });
  await logActivity({
    userId: user.id,
    action: 'PROJECT_STAGE_CHANGED',
    entity: 'Project',
    entityId: id,
    oldValue: existing.currentStageCode,
    newValue: stageCode,
    description: reason || `Stage changed to ${stageCode}`,
  });
  await logAudit({
    userId: user.id,
    entity: 'Project',
    entityId: id,
    action: 'STAGE_CHANGE',
    previous: { stage: existing.currentStageCode },
    next: { stage: stageCode, reason },
  });
  await recalculateProjectProgress(id);
  return getProject(id);
}

async function changeStatus(id, statusCode, reason, user) {
  if (/^[0-9a-f-]{36}$/i.test(String(id || ''))) {
    const live = await prisma.$queryRaw`
      SELECT id, status, project_code FROM projects WHERE id = CAST(${id} AS uuid) LIMIT 1
    `;
    if (live[0]) {
      await prisma.$executeRaw`
        UPDATE projects SET status = ${statusCode}, updated_at = ${new Date()} WHERE id = CAST(${id} AS uuid)
      `;
      await logActivity({
        userId: user.id,
        action: 'PROJECT_STATUS_CHANGED',
        entity: 'Project',
        entityId: id,
        oldValue: live[0].status,
        newValue: statusCode,
        description: reason || `${live[0].project_code} status changed to ${statusCode}`,
      });
      return require('./liveProjectStore').getById(id);
    }
  }
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Project not found.');
  await prisma.project.update({ where: { id }, data: { currentStatusCode: statusCode } });
  await prisma.projectStageRecord.updateMany({
    where: { projectId: id, stageCode: existing.currentStageCode },
    data: { statusCode, ...(statusCode === 'COMPLETED' ? { completedDate: new Date() } : {}) },
  });
  await prisma.projectStatusHistory.create({
    data: { projectId: id, stageCode: existing.currentStageCode, statusCode, reason, changedBy: user.id },
  });
  if (reason) {
    await prisma.delayRecord.create({
      data: {
        projectId: id,
        targetDate: existing.expectedCompletion,
        actualDate: new Date(),
        delayDays: delayDays(existing.expectedCompletion),
        reason,
        ownerId: user.id,
        categoryCode: dataCategory(statusCode),
      },
    });
  }
  await logActivity({
    userId: user.id,
    action: 'PROJECT_STATUS_CHANGED',
    entity: 'Project',
    entityId: id,
    oldValue: existing.currentStatusCode,
    newValue: statusCode,
    description: reason || `Status changed to ${statusCode}`,
  });
  if (statusCode === 'BLOCKED') {
    await notifyByPermission('dashboard.management', {
      title: 'Project blocked',
      message: `${existing.projectId} is blocked${reason ? `: ${reason}` : ''}`,
      type: 'BLOCKED',
      entityType: 'Project',
      entityId: id,
      link: `/projects/${id}`,
    });
  }
  await recalculateProjectProgress(id);
  return getProject(id);
}

function dataCategory(status) {
  if (status === 'BLOCKED') return 'INTERNAL';
  return 'OTHER';
}

async function updateStageRecord(projectId, stageCode, data, user) {
  const rec = await prisma.projectStageRecord.update({
    where: { projectId_stageCode: { projectId, stageCode } },
    data: {
      statusCode: data.statusCode ?? undefined,
      ownerId: data.ownerId ?? undefined,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
      completedDate: data.completedDate ? new Date(data.completedDate) : undefined,
      delayReason: data.delayReason ?? undefined,
      remarks: data.remarks ?? undefined,
    },
  });
  await recalculateProjectProgress(projectId);
  await logActivity({
    userId: user.id,
    action: 'STAGE_UPDATED',
    entity: 'Project',
    entityId: projectId,
    description: `${stageCode} updated`,
  });
  return rec;
}

async function getTimeline(id) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { stages: { orderBy: { sortOrder: 'asc' } }, lead: true },
  });
  if (!project) throw new AppError(404, 'Project not found.');
  const now = new Date();
  return project.stages.map((s) => {
    let visual = 'UPCOMING';
    if (s.statusCode === 'COMPLETED') visual = 'COMPLETED';
    else if (s.stageCode === project.currentStageCode) visual = 'CURRENT';
    if (s.targetDate && s.statusCode !== 'COMPLETED' && new Date(s.targetDate) < now) visual = 'DELAYED';
    return { ...s, visual, delayDays: delayDays(s.targetDate, s.completedDate) };
  });
}

async function addComment(projectId, body, user) {
  const comment = await prisma.comment.create({
    data: { entityType: 'Project', entityId: projectId, projectId, body, userId: user.id },
  });
  await logActivity({ userId: user.id, action: 'COMMENT_ADDED', entity: 'Project', entityId: projectId, description: body.slice(0, 120) });
  return comment;
}

async function closeProject(id, remarks, user) {
  const project = await getProject(id);
  const conditions = await prisma.closureCondition.findMany({ where: { required: true }, orderBy: { sortOrder: 'asc' } });
  const openTasks = project.tasks.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.statusCode));
  const openPunch = project.punchPoints.filter((p) => !['COMPLETED', 'VERIFIED'].includes(p.statusCode));
  const pendingQc = project.inspections.filter((i) => i.resultCode === 'FAILED');
  const pendingHandover = project.handovers.filter((h) => h.customerAccepted).length === 0;
  const outstanding = project.invoices.reduce((sum, inv) => {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    return sum + (Number(inv.amount) - paid);
  }, 0);

  const blockers = [];
  for (const c of conditions) {
    if (c.code === 'OPEN_TASKS' && openTasks.length) blockers.push({ code: c.code, label: c.label, count: openTasks.length });
    if (c.code === 'OPEN_PUNCH' && openPunch.length) blockers.push({ code: c.code, label: c.label, count: openPunch.length });
    if (c.code === 'PENDING_QC' && pendingQc.length) blockers.push({ code: c.code, label: c.label, count: pendingQc.length });
    if (c.code === 'PENDING_HANDOVER' && pendingHandover) blockers.push({ code: c.code, label: c.label, count: 1 });
    if (c.code === 'OUTSTANDING' && outstanding > 0) blockers.push({ code: c.code, label: c.label, count: outstanding });
  }
  if (blockers.length) {
    throw new AppError(400, 'Project cannot be closed until required conditions are met.', { blockers });
  }

  await prisma.project.update({
    where: { id },
    data: {
      currentStatusCode: 'COMPLETED',
      currentStageCode: 'PROJECT_CLOSURE',
      actualCompletion: new Date(),
      closureDate: new Date(),
      closedById: user.id,
      closureRemarks: remarks || null,
      progressPercent: 100,
    },
  });
  await prisma.projectStageRecord.updateMany({
    where: { projectId: id },
    data: { statusCode: 'COMPLETED', completedDate: new Date() },
  });
  await logActivity({
    userId: user.id,
    action: 'PROJECT_CLOSED',
    entity: 'Project',
    entityId: id,
    description: remarks || `${project.projectId} closed`,
  });
  return getProject(id);
}

async function closurePreview(id) {
  const project = await getProject(id);
  const conditions = await prisma.closureCondition.findMany({ orderBy: { sortOrder: 'asc' } });
  const openTasks = project.tasks.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.statusCode));
  const openPunch = project.punchPoints.filter((p) => !['COMPLETED', 'VERIFIED'].includes(p.statusCode));
  const pendingQc = project.inspections.filter((i) => i.resultCode === 'FAILED' || !i.resultCode);
  const handoverDone = project.handovers.some((h) => h.customerAccepted);
  const invoiced = project.invoices.length > 0;
  const outstanding = project.invoices.reduce((sum, inv) => {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    return sum + (Number(inv.amount) - paid);
  }, 0);
  return {
    conditions: conditions.map((c) => ({
      ...c,
      met:
        (c.code === 'OPEN_TASKS' && openTasks.length === 0) ||
        (c.code === 'OPEN_PUNCH' && openPunch.length === 0) ||
        (c.code === 'PENDING_QC' && pendingQc.length === 0) ||
        (c.code === 'PENDING_HANDOVER' && handoverDone) ||
        (c.code === 'PENDING_INVOICE' && invoiced) ||
        (c.code === 'PENDING_DOCS' && project.documents.length > 0) ||
        (c.code === 'OUTSTANDING' && outstanding <= 0),
    })),
    openTasks,
    openPunch,
    pendingQc,
    outstanding,
  };
}

module.exports = {
  createProjectFromLead,
  createProject,
  listProjects,
  getProject,
  updateProject,
  changeStage,
  changeStatus,
  updateStageRecord,
  getTimeline,
  addComment,
  closeProject,
  closurePreview,
};
