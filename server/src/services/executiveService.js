const { prisma } = require('../prisma');
const { delayDays } = require('../utils/progress');

const STAGE_DEPT = {
  ORDER_REVIEW: 'Projects',
  DETAILED_DESIGN: 'Design & Engineering',
  DESIGN_APPROVAL: 'Design & Engineering',
  BOM_MRP: 'Design & Engineering',
  PROCUREMENT: 'Procurement',
  MATERIAL_RECEIPT: 'Stores',
  PRODUCTION: 'Production',
  PRODUCTION_QC: 'Quality',
  PACKING: 'Production',
  DISPATCH: 'Logistics',
  SITE_READINESS: 'Installation',
  INSTALLATION: 'Installation',
  INSTALLATION_QC: 'Quality',
  CUSTOMER_INSPECTION: 'Installation',
  HANDOVER: 'Projects',
  INVOICE_PAYMENT: 'Finance',
  PROJECT_CLOSURE: 'Projects',
};

const DEPT_MODULES = {
  Sales: ['SALES', 'LEAD'],
  'Design & Engineering': ['DESIGN'],
  Projects: ['PROJECTS', 'PROJECT'],
  Procurement: ['PROCUREMENT'],
  PPC: ['PPC', 'PLANNING'],
  Stores: ['STORES', 'MATERIAL'],
  Production: ['PRODUCTION'],
  Quality: ['QC', 'QUALITY'],
  Logistics: ['LOGISTICS', 'DISPATCH'],
  Installation: ['INSTALLATION'],
  Finance: ['FINANCE'],
};

const PIPELINE = [
  { key: 'ENQUIRY', label: 'Enquiry', leadStatuses: ['NEW', 'QUALIFICATION', 'REQUIREMENT_REVIEW', 'SITE_SURVEY_REQUIRED', 'DESIGN_PENDING', 'CUSTOMER_FOLLOW_UP', 'NEGOTIATION', 'ON_HOLD'] },
  { key: 'QUOTATION', label: 'Quotation', leadStatuses: ['QUOTATION_PENDING', 'QUOTATION_SENT', 'REVISION_REQUIRED'] },
  { key: 'ORDER_REVIEW', label: 'Order Review', stages: ['ORDER_REVIEW'] },
  { key: 'DESIGN', label: 'Design', stages: ['DETAILED_DESIGN', 'DESIGN_APPROVAL', 'BOM_MRP'] },
  { key: 'PROCUREMENT', label: 'Procurement', stages: ['PROCUREMENT'] },
  { key: 'PPC', label: 'PPC', stages: ['MATERIAL_RECEIPT'] },
  { key: 'PRODUCTION', label: 'Production', stages: ['PRODUCTION', 'PACKING'] },
  { key: 'QUALITY', label: 'Quality', stages: ['PRODUCTION_QC'] },
  { key: 'DISPATCH', label: 'Dispatch', stages: ['DISPATCH'] },
  { key: 'INSTALLATION', label: 'Installation', stages: ['SITE_READINESS', 'INSTALLATION', 'INSTALLATION_QC', 'CUSTOMER_INSPECTION'] },
  { key: 'HANDOVER', label: 'Handover', stages: ['HANDOVER'] },
  { key: 'CLOSURE', label: 'Closure', stages: ['INVOICE_PAYMENT', 'PROJECT_CLOSURE'] },
];

const HEALTH_LABELS = {
  ON_TRACK: 'On Track',
  AT_RISK: 'At Risk',
  DELAYED: 'Delayed',
  BLOCKED: 'Blocked',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
};

function startOfDay(date = new Date(), offset = 0) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

function periodBounds(query) {
  if (query.from || query.to) {
    return {
      from: query.from ? new Date(query.from) : null,
      to: query.to ? new Date(query.to) : null,
    };
  }
  const now = new Date();
  const start = startOfDay(now);
  switch (query.period) {
    case 'today':
      return { from: start, to: now };
    case 'week': {
      const d = startOfDay(now);
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - day + 1);
      return { from: d, to: now };
    }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3;
      return { from: new Date(now.getFullYear(), q, 1), to: now };
    }
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to: now };
    default:
      return { from: null, to: null };
  }
}

function inPeriod(date, bounds) {
  if (!bounds.from && !bounds.to) return true;
  if (!date) return true;
  const t = new Date(date).getTime();
  if (bounds.from && t < bounds.from.getTime()) return false;
  if (bounds.to && t > bounds.to.getTime()) return false;
  return true;
}

function classifyHealth(project, ctx, now) {
  if (project.currentStatusCode === 'COMPLETED') return 'COMPLETED';
  if (project.currentStatusCode === 'CANCELLED') return 'COMPLETED';
  if (project.currentStatusCode === 'ON_HOLD') return 'ON_HOLD';
  if (project.currentStatusCode === 'BLOCKED') return 'BLOCKED';

  const overdueTasks = ctx.overdueTasks || 0;
  const pastDue = project.expectedCompletion && new Date(project.expectedCompletion) < now && project.currentStatusCode !== 'COMPLETED';
  if (overdueTasks > 0 || pastDue) return 'DELAYED';

  const soon = project.expectedCompletion && delayDays(startOfDay(now, 7), project.expectedCompletion) === 0
    && new Date(project.expectedCompletion) >= now
    && new Date(project.expectedCompletion) <= startOfDay(now, 8);
  if (soon || ctx.pendingApproval || ctx.failedQc || ctx.siteNotReady || ctx.openPunch) return 'AT_RISK';
  return 'ON_TRACK';
}

function taskDeptName(task) {
  if (task.department?.name) {
    const code = task.department.code;
    if (code === 'DESIGN') return 'Design & Engineering';
    if (code === 'QC') return 'Quality';
    if (code === 'PROJECTS') return 'Projects';
    if (code === 'SALES') return 'Sales';
    if (code === 'PROCUREMENT') return 'Procurement';
    if (code === 'PRODUCTION') return task.module === 'PPC' || task.module === 'PLANNING' ? 'PPC' : 'Production';
    if (code === 'STORES') return 'Stores';
    if (code === 'LOGISTICS') return 'Logistics';
    if (code === 'INSTALLATION') return 'Installation';
    if (code === 'FINANCE') return 'Finance';
  }
  const module = String(task.module || '').toUpperCase();
  for (const [name, mods] of Object.entries(DEPT_MODULES)) {
    if (mods.includes(module)) return name;
  }
  return STAGE_DEPT[task.project?.currentStageCode] || 'Projects';
}

function projectWhere(query) {
  const where = { archived: false };
  if (query.customerId) where.customerId = query.customerId;
  if (query.projectManagerId) where.projectManagerId = query.projectManagerId;
  if (query.salesPersonId) where.salesPersonId = query.salesPersonId;
  if (query.stage) where.currentStageCode = query.stage;
  if (query.status) where.currentStatusCode = query.status;
  if (query.priority) where.priorityCode = query.priority;
  return where;
}

async function executive(query = {}, user = {}) {
  const now = new Date();
  const bounds = periodBounds(query);
  const showValues = Boolean(
    user.permissions?.includes('finance.view')
    || user.roles?.some((r) => ['CEO', 'SAHAY_MD', 'ADMIN'].includes(r.code))
  );
  const roleCodes = (user.roles || []).map((r) => r.code);
  const isCft = roleCodes.includes('CFT');
  const isEng = roleCodes.includes('ENG_DIRECTOR');

  const projects = await prisma.project.findMany({
    where: projectWhere(query),
    include: {
      customer: true,
      projectManager: { select: { id: true, fullName: true } },
      salesPerson: { select: { id: true, fullName: true } },
      stages: true,
      tasks: { include: { department: true, assignedTo: { select: { fullName: true } } } },
      approvals: true,
      inspections: true,
      installations: { include: { readiness: true } },
      punchPoints: true,
      invoices: { include: { payments: true } },
      purchaseOrders: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const leads = await prisma.lead.findMany({
    where: {
      archived: false,
      ...(query.salesPersonId ? { salesPersonId: query.salesPersonId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
    },
    select: { id: true, leadId: true, statusCode: true, createdAt: true, leadDate: true },
  });

  const filteredProjects = projects.filter((p) => {
    if (bounds.from || bounds.to) {
      return inPeriod(p.startDate || p.createdAt, bounds) || inPeriod(p.expectedCompletion, bounds) || inPeriod(p.updatedAt, bounds);
    }
    return true;
  });

  const allTasks = await prisma.task.findMany({
    where: { statusCode: { not: 'CANCELLED' } },
    include: { department: true, project: { select: { id: true, projectId: true, name: true, currentStageCode: true } }, assignedTo: { select: { fullName: true } } },
  });

  const openTasks = (status) => allTasks.filter((t) => t.statusCode === status);
  const overdueAll = allTasks
    .filter((t) => t.dueDate && new Date(t.dueDate) < startOfDay(now) && !['COMPLETED', 'CANCELLED'].includes(t.statusCode))
    .sort((a, b) => delayDays(b.dueDate) - delayDays(a.dueDate));

  const projectCtx = {};
  for (const p of filteredProjects) {
    const tasks = p.tasks || [];
    const overdueTasks = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < startOfDay(now) && !['COMPLETED', 'CANCELLED'].includes(t.statusCode));
    const pendingApproval = (p.approvals || []).some((a) => a.statusCode === 'PENDING_REVIEW'
      && (now - new Date(a.submittedAt)) / 86400000 >= 3);
    const failedQc = (p.inspections || []).some((i) => i.resultCode === 'FAILED');
    const siteNotReady = (p.installations || []).some((i) => ['NOT_READY', 'PARTIAL'].includes(i.readinessCode));
    const openPunch = (p.punchPoints || []).some((x) => ['OPEN', 'IN_PROGRESS'].includes(x.statusCode));
    const materialDelay = (p.purchaseOrders || []).some((po) => po.expectedDelivery && new Date(po.expectedDelivery) < now && po.statusCode !== 'RECEIVED');
    projectCtx[p.id] = {
      overdueTasks: overdueTasks.length,
      pendingApproval,
      failedQc,
      siteNotReady,
      openPunch,
      materialDelay,
      overdueList: overdueTasks,
    };
  }

  const withHealth = filteredProjects.map((p) => {
    const ctx = projectCtx[p.id] || {};
    const health = classifyHealth(p, ctx, now);
    const issues = [];
    if (p.currentStatusCode === 'BLOCKED') issues.push('Project is blocked');
    if (ctx.overdueTasks) issues.push(`${ctx.overdueTasks} overdue task${ctx.overdueTasks > 1 ? 's' : ''}`);
    if (p.expectedCompletion && new Date(p.expectedCompletion) < now && p.currentStatusCode !== 'COMPLETED') issues.push('Expected completion passed');
    if (ctx.failedQc) issues.push('QC failure');
    if (ctx.materialDelay) issues.push('Material pending / late delivery');
    if (ctx.siteNotReady) issues.push('Installation site is not ready');
    if (ctx.openPunch) issues.push('Customer punch points pending');
    if (ctx.pendingApproval) issues.push('Approval pending');
    const lastTask = [...(p.tasks || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    return {
      id: p.id,
      projectId: p.projectId,
      name: p.name,
      customer: p.customer?.companyName,
      customerId: p.customerId,
      stage: p.currentStageCode,
      status: p.currentStatusCode,
      health,
      progress: Number(p.progressPercent || 0),
      department: STAGE_DEPT[p.currentStageCode] || 'Projects',
      expectedCompletion: p.expectedCompletion,
      startDate: p.startDate,
      delayDays: ['COMPLETED', 'CANCELLED'].includes(p.currentStatusCode) ? 0 : delayDays(p.expectedCompletion),
      projectManager: p.projectManager?.fullName || '—',
      projectManagerId: p.projectManagerId,
      salesPerson: p.salesPerson?.fullName || '—',
      orderValue: showValues ? Number(p.orderValue || 0) : null,
      currency: p.currency,
      remainingTasks: (p.tasks || []).filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.statusCode)).length,
      issues,
      lastActivity: lastTask?.createdAt || p.updatedAt,
    };
  });

  const healthCounts = { ON_TRACK: 0, AT_RISK: 0, DELAYED: 0, BLOCKED: 0, ON_HOLD: 0, COMPLETED: 0 };
  for (const p of withHealth) healthCounts[p.health] = (healthCounts[p.health] || 0) + 1;
  const healthTotal = withHealth.length || 1;
  const projectHealth = Object.entries(HEALTH_LABELS).map(([code, label]) => ({
    code,
    label,
    count: healthCounts[code] || 0,
    percent: Math.round(((healthCounts[code] || 0) / healthTotal) * 100),
  }));

  const activeSet = withHealth.filter((p) => !['COMPLETED'].includes(p.health) && p.status !== 'CANCELLED');
  const kpis = {
    totalProjects: projects.length,
    activeProjects: projects.filter((p) => !['COMPLETED', 'CANCELLED'].includes(p.currentStatusCode)).length,
    onTrack: withHealth.filter((p) => p.health === 'ON_TRACK').length,
    delayed: withHealth.filter((p) => p.health === 'DELAYED').length,
    blocked: withHealth.filter((p) => p.health === 'BLOCKED').length,
    onHold: withHealth.filter((p) => p.health === 'ON_HOLD').length,
    completed: projects.filter((p) => p.currentStatusCode === 'COMPLETED').length,
  };

  const pipeline = PIPELINE.map((step) => {
    if (step.leadStatuses) {
      return {
        key: step.key,
        label: step.label,
        count: leads.filter((l) => step.leadStatuses.includes(l.statusCode)).length,
        href: step.key === 'ENQUIRY' ? '/leads' : '/leads?status=QUOTATION_PENDING',
      };
    }
    return {
      key: step.key,
      label: step.label,
      count: withHealth.filter((p) => step.stages.includes(p.stage)).length,
      href: step.stages.length === 1 ? `/projects?stage=${step.stages[0]}` : `/projects?stage=${step.stages[0]}`,
    };
  });

  const deptStats = Object.keys(DEPT_MODULES).map((name) => {
    const tasks = allTasks.filter((t) => taskDeptName(t) === name);
    const pending = tasks.filter((t) => ['NOT_STARTED', 'PENDING'].includes(t.statusCode)).length;
    const inProgress = tasks.filter((t) => t.statusCode === 'IN_PROGRESS').length;
    const completed = tasks.filter((t) => t.statusCode === 'COMPLETED').length;
    const overdue = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < startOfDay(now) && !['COMPLETED', 'CANCELLED'].includes(t.statusCode)).length;
    const blocked = tasks.filter((t) => t.statusCode === 'BLOCKED').length;
    const active = pending + inProgress + blocked;
    return { name, active, pending, inProgress, overdue, blocked, completed };
  });

  const critical = withHealth
    .filter((p) => p.issues.length > 0 || ['DELAYED', 'BLOCKED', 'AT_RISK'].includes(p.health))
    .map((p) => ({
      ...p,
      issue: p.issues[0] || HEALTH_LABELS[p.health],
      owner: p.projectManager,
      nextAction: p.issues[0] ? 'Review and unblock' : 'Monitor progress',
    }))
    .sort((a, b) => b.delayDays - a.delayDays)
    .slice(0, 12);

  const upcoming = allTasks
    .filter((t) => t.dueDate && !['COMPLETED', 'CANCELLED'].includes(t.statusCode) && new Date(t.dueDate) >= startOfDay(now) && new Date(t.dueDate) < startOfDay(now, 15))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .map((t) => {
      const due = new Date(t.dueDate);
      let bucket = '14';
      if (due < startOfDay(now, 1)) bucket = 'today';
      else if (due < startOfDay(now, 4)) bucket = '3';
      else if (due < startOfDay(now, 8)) bucket = '7';
      return {
        id: t.id,
        taskId: t.taskId,
        name: t.name,
        project: t.project,
        department: taskDeptName(t),
        owner: t.assignedTo?.fullName || '—',
        dueDate: t.dueDate,
        status: t.statusCode,
        bucket,
      };
    });

  const bottlenecks = deptStats
    .map((d) => ({ name: d.name, pending: d.pending, overdue: d.overdue, blocked: d.blocked, load: d.pending + d.overdue + d.blocked }))
    .sort((a, b) => b.load - a.load);

  const completions = withHealth
    .filter((p) => p.expectedCompletion && p.status !== 'COMPLETED')
    .sort((a, b) => new Date(a.expectedCompletion) - new Date(b.expectedCompletion))
    .slice(0, 10);

  const recentActivity = await prisma.activityLog.findMany({
    include: { user: { select: { fullName: true, department: true } } },
    orderBy: { timestamp: 'desc' },
    take: 20,
  });

  const projectIds = new Set(projects.map((p) => p.id));
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));

  const alerts = [];
  for (const p of withHealth) {
    if (p.delayDays > 0 && p.status !== 'COMPLETED') {
      alerts.push({ level: 'warn', text: `${p.projectId} is ${p.delayDays} day${p.delayDays > 1 ? 's' : ''} overdue`, href: `/projects/${p.id}`, projectId: p.id });
    }
    const ctx = projectCtx[p.id] || {};
    if (ctx.materialDelay) alerts.push({ level: 'warn', text: `${p.projectId} has material pending`, href: `/projects/${p.id}`, projectId: p.id });
    if (ctx.siteNotReady) alerts.push({ level: 'warn', text: `${p.projectId} installation site is not ready`, href: `/projects/${p.id}`, projectId: p.id });
    if (ctx.failedQc) alerts.push({ level: 'warn', text: `${p.projectId} QC failed`, href: `/projects/${p.id}`, projectId: p.id });
    if (ctx.openPunch) alerts.push({ level: 'warn', text: `${p.projectId} customer punch points pending`, href: `/projects/${p.id}`, projectId: p.id });
    if (ctx.pendingApproval) alerts.push({ level: 'warn', text: `${p.projectId} approval pending`, href: `/projects/${p.id}`, projectId: p.id });
  }

  const cft = withHealth.filter((p) => {
    const tasks = projects.find((x) => x.id === p.id)?.tasks || [];
    const waiting = tasks.filter((t) => t.statusCode === 'BLOCKED' || (t.blockers && t.blockers.length));
    const depts = new Set(tasks.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.statusCode)).map(taskDeptName));
    return depts.size >= 2 && (p.health === 'BLOCKED' || p.health === 'DELAYED' || p.health === 'AT_RISK' || waiting.length);
  }).map((p) => {
    const full = projects.find((x) => x.id === p.id);
    const byDept = {};
    for (const t of full.tasks || []) {
      const name = taskDeptName(t);
      if (!['COMPLETED', 'CANCELLED'].includes(t.statusCode)) {
        byDept[name] = byDept[name] || [];
        byDept[name].push(t.name);
      }
    }
    return {
      ...p,
      waitingOn: Object.entries(byDept).map(([dept, items]) => ({ dept, items })),
      action: p.issues[0] || 'Coordinate across departments',
    };
  }).slice(0, 8);

  let engineering = null;
  if (isEng || roleCodes.includes('ADMIN') || roleCodes.includes('CEO')) {
    const designTasks = allTasks.filter((t) => taskDeptName(t) === 'Design & Engineering');
    const pendingApprovals = await prisma.approval.count({ where: { statusCode: 'PENDING_REVIEW' } });
    const revisions = await prisma.approval.count({ where: { statusCode: { in: ['REJECTED', 'REVISION_REQUIRED'] } } });
    engineering = {
      workload: designTasks.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.statusCode)).length,
      completed: designTasks.filter((t) => t.statusCode === 'COMPLETED').length,
      overdue: designTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now && !['COMPLETED', 'CANCELLED'].includes(t.statusCode)).length,
      pendingApprovals,
      revisions,
    };
  }

  const values = showValues
    ? {
      total: projects.reduce((s, p) => s + Number(p.orderValue || 0), 0),
      active: projects.filter((p) => !['COMPLETED', 'CANCELLED'].includes(p.currentStatusCode)).reduce((s, p) => s + Number(p.orderValue || 0), 0),
      completed: projects.filter((p) => p.currentStatusCode === 'COMPLETED').reduce((s, p) => s + Number(p.orderValue || 0), 0),
      pending: projects.filter((p) => !['COMPLETED', 'CANCELLED'].includes(p.currentStatusCode)).reduce((s, p) => s + Number(p.orderValue || 0), 0),
    }
    : null;

  const customers = await prisma.customer.findMany({
    where: { archived: false },
    select: { id: true, companyName: true },
    orderBy: { companyName: 'asc' },
    take: 200,
  });
  const managers = await prisma.user.findMany({
    where: { active: true, roles: { some: { role: { code: { in: ['PROJECT_MANAGER', 'ADMIN', 'CEO'] } } } } },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });
  const salesPeople = await prisma.user.findMany({
    where: { active: true, roles: { some: { role: { code: { in: ['SALES_MANAGER', 'SALES_EXEC', 'ADMIN'] } } } } },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });

  let liveOverview = null;
  try {
    liveOverview = await require('./liveProjectStore').overview();
  } catch (error) {
    console.error(error);
  }
  if (liveOverview) {
    kpis.totalProjects = liveOverview.projectKpis.total;
    kpis.activeProjects = liveOverview.projectKpis.active;
    kpis.completed = liveOverview.projectKpis.completed;
    kpis.delayed = liveOverview.projectKpis.delayed;
    kpis.onHold = liveOverview.projectKpis.onHold;
    kpis.onTrack = liveOverview.projectKpis.onTrack;
    kpis.totalLeads = liveOverview.leadKpis.total;
    kpis.activeLeads = liveOverview.leadKpis.active;
    kpis.completedLeads = liveOverview.leadKpis.completed;
    kpis.liveLeads = liveOverview.leadKpis.live;
    kpis.pendingLeads = liveOverview.leadKpis.pending;
    kpis.delayedLeads = liveOverview.leadKpis.delayed;
    kpis.leadOnHold = liveOverview.leadKpis.onHold;
  }

  return {
    kpis,
    leadKpis: liveOverview?.leadKpis || null,
    projectKpis: liveOverview?.projectKpis || null,
    leadsByStatus: liveOverview?.leadsByStatus || [],
    projectsByStatus: liveOverview?.projectsByStatus || [],
    projectsByDepartment: liveOverview?.projectsByDepartment || [],
    projectHealthRows: liveOverview?.healthRows || [],
    values,
    pipeline,
    projectHealth,
    departmentWorkload: deptStats,
    bottlenecks,
    matrix: (query.status ? withHealth : withHealth.filter((p) => p.status !== 'COMPLETED')).slice(0, 25),
    timeline: query.status ? withHealth : withHealth.filter((p) => p.status !== 'COMPLETED'),
    critical,
    upcomingDeadlines: liveOverview?.upcomingDeadlines?.length ? liveOverview.upcomingDeadlines : upcoming,
    overdueActivities: overdueAll.slice(0, 20).map((t) => ({
      id: t.id,
      taskId: t.taskId,
      name: t.name,
      project: t.project,
      department: taskDeptName(t),
      assignedTo: t.assignedTo?.fullName || '—',
      dueDate: t.dueDate,
      delayDays: delayDays(t.dueDate),
      reason: t.delayReason,
    })),
    completions,
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      timestamp: a.timestamp,
      action: a.action,
      description: a.description,
      user: a.user?.fullName,
      department: a.user?.department?.name || '—',
      entity: a.entity,
      entityId: a.entityId,
      href: projectIds.has(a.entityId) ? `/projects/${a.entityId}` : a.entity === 'Lead' ? `/leads/${a.entityId}` : a.entity === 'Task' ? `/tasks?id=${a.entityId}` : '/projects',
      projectId: projectById[a.entityId]?.projectId,
    })),
    alerts: alerts.slice(0, 12),
    cft: isCft || roleCodes.includes('ADMIN') || roleCodes.includes('CEO') ? cft : [],
    engineering,
    attentionIssues: await require('./issueService').attentionIssues(),
    customerFollowUps: await require('./customerFeedbackService').kpis().catch(() => ({
      total: 0, pending: 0, received: 0, followUpRequired: 0, dueToday: 0, overdue: 0, awaiting: 0,
    })),
    filters: { customers, managers, salesPeople },
    generatedAt: now,
  };
}

module.exports = { executive, STAGE_DEPT, PIPELINE, HEALTH_LABELS };
