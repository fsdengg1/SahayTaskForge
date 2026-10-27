const { prisma } = require('../prisma');
const { parsePagination, paginated } = require('../utils/pagination');
const existingLeads = require('./existingLeadStore');

const CLOSED = new Set(['COMPLETED', 'CLOSED', 'CANCELLED']);
const HOLD = new Set(['ON_HOLD', 'HOLD']);

const STAGE_LABELS = {
  SALES: 'Sales',
  SALES_LEAD_APPROVAL: 'Sales Lead Approval',
  PRE_DESIGN: 'Pre Design',
  PRE_DESIGN_LEAD_APPROVAL: 'Pre Design Approval',
  POST_DESIGN: 'Post Design',
  PRODUCTION: 'Production',
  INSTALLATION: 'Installation',
  PROCUREMENT: 'Procurement',
  QUALITY: 'Quality',
  DISPATCH: 'Dispatch',
  HANDOVER: 'Handover',
};

function labelFromCode(code) {
  const key = String(code || '').trim().toUpperCase();
  if (!key) return '—';
  if (key === 'IN_PROGRESS') return 'LIVE';
  if (STAGE_LABELS[key]) return STAGE_LABELS[key];
  return key.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function projectStatusLabel(code) {
  const key = String(code || '').trim().toUpperCase();
  if (key === 'IN_PROGRESS') return 'In Progress';
  if (key === 'OPEN') return 'Open';
  if (key === 'ON_HOLD' || key === 'HOLD') return 'On Hold';
  if (key === 'COMPLETED' || key === 'CLOSED') return 'Completed';
  return labelFromCode(key);
}

function dayKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().endsWith('T00:00:00.000Z')) return date.toISOString().slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDays(day, days) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function departmentForStage(stage) {
  const code = String(stage || '').toUpperCase();
  if (code.includes('SALES')) return 'Sales';
  if (code.includes('DESIGN')) return 'Design & Engineering';
  if (code.includes('PROCURE')) return 'Procurement';
  if (code.includes('PRODUCTION')) return 'Production';
  if (code.includes('INSTALL')) return 'Installation';
  if (code.includes('QUALITY') || code.includes('QC')) return 'Quality';
  if (code.includes('DISPATCH') || code.includes('LOGISTIC')) return 'Logistics';
  if (!code) return 'Unassigned';
  return labelFromCode(code);
}

function isClosedStatus(status) {
  return CLOSED.has(String(status || '').toUpperCase());
}

function healthTone(code) {
  if (code === 'ON_HOLD') return 'yellow';
  if (code === 'DELAYED' || code === 'CRITICAL') return 'red';
  if (code === 'ATTENTION') return 'orange';
  if (code === 'ON_TRACK' || code === 'COMPLETED') return 'green';
  return 'grey';
}

function healthItem(code, label) {
  return { code, label, tone: healthTone(code) };
}

async function fetchProjects() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT p.id, p.project_code, p.lead_id, p.customer_id, p.name, p.current_stage, p.status,
           p.owner_id, p.start_date, p.target_end_date, p.priority, p.created_at, p.updated_at,
           p.po_number, p.po_date, p.currency, p.currency_value,
           l.lead_code, l.company_name, l.product, l.product_1, l.company_address, l.status AS lead_status,
           u.full_name AS owner_name
    FROM projects p
    LEFT JOIN leads l ON l.id = p.lead_id
    LEFT JOIN users u ON u.id = p.owner_id
    ORDER BY p.created_at DESC NULLS LAST
  `);
  return rows;
}

async function fetchGantt() {
  try {
    return await prisma.$queryRawUnsafe(`
      SELECT id, project_id, name, start_date, end_date, status, progress
      FROM project_gantt_activities
      ORDER BY start_date NULLS LAST, created_at
    `);
  } catch {
    return [];
  }
}

async function fetchOpenHolds() {
  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT project_id FROM project_holds WHERE released_at IS NULL
    `);
    return new Set(rows.map((row) => String(row.project_id)));
  } catch {
    return new Set();
  }
}

async function groupedCounts(sql) {
  try {
    const rows = await prisma.$queryRawUnsafe(sql);
    const map = new Map();
    for (const row of rows) {
      const id = String(row.project_id);
      const current = map.get(id) || { open: 0, overdue: 0, pending: 0 };
      current.open += Number(row.open_count || 0);
      current.overdue += Number(row.overdue_count || 0);
      current.pending += Number(row.pending_count || 0);
      map.set(id, current);
    }
    return map;
  } catch {
    return new Map();
  }
}

function shapeProject(row, extras) {
  const gantt = extras.gantt.get(String(row.id)) || [];
  const progressValues = gantt.map((item) => Number(item.progress)).filter((value) => !Number.isNaN(value));
  const progressPercent = progressValues.length
    ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length)
    : 0;
  const status = row.status || 'OPEN';
  const deadline = row.target_end_date || null;
  const onHold = HOLD.has(String(status).toUpperCase()) || extras.holds.has(String(row.id));
  const closed = isClosedStatus(status);
  const endDay = dayKey(deadline);
  const today = extras.today;
  const delayed = Boolean(endDay && endDay < today && !closed && !onHold);
  const productGroup = row.product || row.product_1 || null;
  const milestones = gantt.map((item) => ({
    id: item.id,
    name: item.name,
    startDate: item.start_date,
    endDate: item.end_date,
    status: item.status,
    progress: Number(item.progress || 0),
  }));
  return {
    id: row.id,
    projectId: row.project_code,
    name: row.name,
    leadId: row.lead_id,
    lead: row.lead_id ? { id: row.lead_id, leadId: row.lead_code, statusCode: row.lead_status } : null,
    customerId: row.customer_id,
    customer: { id: row.customer_id, companyName: row.company_name || row.name },
    salesPersonId: row.owner_id,
    salesPerson: row.owner_name ? { id: row.owner_id, fullName: row.owner_name } : null,
    projectManager: null,
    productCategory: productGroup,
    productGroup: productGroup || '—',
    location: row.company_address || '—',
    site: row.company_address ? { address: row.company_address, name: row.company_address } : null,
    currentStageCode: row.current_stage,
    currentStatusCode: status,
    stageLabel: labelFromCode(row.current_stage),
    statusLabel: projectStatusLabel(status),
    department: departmentForStage(row.current_stage),
    startDate: row.start_date,
    expectedCompletion: deadline,
    priorityCode: row.priority,
    progressPercent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: false,
    onHold,
    delayed,
    closed,
    milestones,
    currency: row.currency || 'INR',
    orderValue: row.currency_value == null ? null : Number(row.currency_value),
    currencyValue: row.currency_value == null ? null : Number(row.currency_value),
    poNumber: row.po_number || null,
    poDate: row.po_date || null,
    remarks: null,
  };
}

function taskHealth(project, today) {
  const items = project.milestones || [];
  if (!items.length) return healthItem('NO_TASKS', 'No tasks');
  const open = items.filter((item) => !['COMPLETED', 'DONE', 'CLOSED'].includes(String(item.status || '').toUpperCase()));
  const overdue = open.filter((item) => dayKey(item.endDate) && dayKey(item.endDate) < today);
  if (overdue.length) return healthItem('DELAYED', `${overdue.length} overdue`);
  if (!open.length) return healthItem('ON_TRACK', 'Tasks complete');
  const soon = open.filter((item) => {
    const end = dayKey(item.endDate);
    return end && end <= addDays(today, 7);
  });
  if (soon.length) return healthItem('ATTENTION', `${soon.length} due soon`);
  return healthItem('ON_TRACK', `${open.length} open`);
}

function issueHealth(counts) {
  if (!counts || !counts.open) return healthItem('ON_TRACK', 'No open issues');
  if (counts.overdue) return healthItem('DELAYED', `${counts.overdue} overdue`);
  return healthItem('ATTENTION', `${counts.open} open`);
}

function approvalHealth(project, counts) {
  if (counts?.pending) return healthItem('ATTENTION', `${counts.pending} pending`);
  const stage = String(project.currentStageCode || '').toUpperCase();
  if (stage.includes('APPROVAL') && !project.closed) return healthItem('ATTENTION', 'Approval in progress');
  return healthItem('ON_TRACK', 'No pending approvals');
}

function scheduleHealth(project, today) {
  if (project.closed) return healthItem('COMPLETED', 'Completed');
  if (project.onHold) return healthItem('ON_HOLD', 'On Hold');
  if (project.delayed) return healthItem('DELAYED', 'Past deadline');
  const end = dayKey(project.expectedCompletion);
  if (!end) return healthItem('NO_DEADLINE', 'No deadline');
  if (end <= addDays(today, 7)) return healthItem('ATTENTION', 'Deadline this week');
  return healthItem('ON_TRACK', 'On Track');
}

function overallHealth(parts) {
  const codes = parts.map((part) => part.code);
  if (codes.includes('ON_HOLD')) return healthItem('ON_HOLD', 'On Hold');
  if (codes.includes('DELAYED') || codes.includes('CRITICAL')) return healthItem('DELAYED', 'Delayed / Critical');
  if (codes.includes('ATTENTION')) return healthItem('ATTENTION', 'Attention Required');
  if (codes.every((code) => ['NO_TASKS', 'NO_DEADLINE', 'ON_TRACK', 'COMPLETED'].includes(code))) {
    if (codes.includes('ON_TRACK') || codes.includes('COMPLETED')) return healthItem('ON_TRACK', 'On Track');
    return healthItem('NO_DEADLINE', 'No deadline');
  }
  return healthItem('ON_TRACK', 'On Track');
}

function withHealth(project, issues, approvals, today) {
  const schedule = scheduleHealth(project, today);
  const tasks = taskHealth(project, today);
  const issue = issueHealth(issues.get(String(project.id)));
  const approval = approvalHealth(project, approvals.get(String(project.id)));
  const overall = overallHealth([schedule, tasks, issue, approval]);
  return { ...project, schedule, tasksHealth: tasks, issueHealth: issue, approvalHealth: approval, overall };
}

function matches(project, query) {
  if (query.q) {
    const q = String(query.q).toLowerCase();
    const hay = [project.projectId, project.name, project.customer?.companyName, project.salesPerson?.fullName, project.productGroup, project.location, project.lead?.leadId].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (query.status && project.currentStatusCode !== query.status) return false;
  if (query.stage && project.currentStageCode !== query.stage) return false;
  if (query.salesPersonId && project.salesPersonId !== query.salesPersonId) return false;
  if (query.customerId && project.customerId !== query.customerId) return false;
  if (query.bucket === 'active' && (project.closed || project.onHold)) return false;
  if (query.delayed === 'true' && !project.delayed) return false;
  if (query.department && project.department !== query.department) return false;
  if (query.from && dayKey(project.expectedCompletion) && dayKey(project.expectedCompletion) < query.from) return false;
  if (query.to && dayKey(project.expectedCompletion) && dayKey(project.expectedCompletion) > query.to) return false;
  return true;
}

function bump(map, code, label) {
  const current = map.get(code) || { code, label, count: 0 };
  current.count += 1;
  map.set(code, current);
}

async function loadContext() {
  const [rows, ganttRows, holds] = await Promise.all([fetchProjects(), fetchGantt(), fetchOpenHolds()]);
  const gantt = new Map();
  for (const item of ganttRows) {
    const key = String(item.project_id);
    const list = gantt.get(key) || [];
    list.push(item);
    gantt.set(key, list);
  }
  const today = todayKey();
  const projects = rows.map((row) => shapeProject(row, { gantt, holds, today }));
  const [issues, approvals] = await Promise.all([
    groupedCounts(`
      SELECT project_id::text AS project_id,
             COUNT(*) FILTER (WHERE resolved_at IS NULL AND UPPER(COALESCE(status, '')) NOT IN ('RESOLVED', 'CLOSED', 'COMPLETED'))::int AS open_count,
             0::int AS overdue_count,
             0::int AS pending_count
      FROM installation_issues
      GROUP BY project_id
    `),
    groupedCounts(`
      SELECT "projectId" AS project_id,
             0::int AS open_count,
             0::int AS overdue_count,
             COUNT(*) FILTER (WHERE "statusCode" = 'PENDING_REVIEW')::int AS pending_count
      FROM "Approval"
      GROUP BY "projectId"
    `),
  ]);
  return {
    projects: projects.map((project) => withHealth(project, issues, approvals, today)),
    today,
  };
}

async function hasProjects() {
  const rows = await prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM projects');
  return Number(rows[0]?.n || 0) > 0;
}

async function list(query = {}) {
  const { projects } = await loadContext();
  const filtered = projects.filter((project) => matches(project, query));
  const { skip, take, page, pageSize } = parsePagination({ ...query, pageSize: query.pageSize || 100 });
  return paginated(filtered.slice(skip, skip + take), filtered.length, page, pageSize);
}

function detailShape(project) {
  const tasks = (project.milestones || []).map((item) => ({
    id: item.id,
    taskId: item.name,
    name: item.name,
    statusCode: item.status || 'OPEN',
    startDate: item.startDate,
    dueDate: item.endDate,
    assignedTo: null,
    blockers: [],
  }));
  return {
    ...project,
    stages: [{
      id: `${project.id}-stage`,
      stageCode: project.currentStageCode,
      statusCode: project.closed ? 'COMPLETED' : (project.currentStatusCode || 'IN_PROGRESS'),
      startDate: project.startDate,
      targetDate: project.expectedCompletion,
      completedDate: null,
    }],
    tasks,
    documents: [],
    comments: [],
    issues: [],
    approvals: [],
    punchPoints: [],
    invoices: [],
    handovers: [],
    installations: [],
    productionOrders: [],
    inspections: [],
    rfqs: [],
    purchaseOrders: [],
    activity: [],
    delayDays: project.delayed ? 1 : 0,
  };
}

async function getById(id) {
  const { projects } = await loadContext();
  const project = projects.find((item) => String(item.id) === String(id));
  return project ? detailShape(project) : null;
}

function leadLabel(code) {
  return labelFromCode(code);
}

async function overview() {
  const [{ projects, today }, leads] = await Promise.all([
    loadContext(),
    existingLeads.matchingLeads({}),
  ]);
  const leadStatus = new Map();
  const leadStats = require('./leadStatistics').calculateLeadStatistics(leads);
  for (const lead of leads) {
    const code = lead.statusCode || 'UNKNOWN';
    bump(leadStatus, code, leadLabel(code));
  }

  const projectStatus = new Map();
  const departments = new Map();
  let activeProjects = 0;
  let completedProjects = 0;
  let delayedProjects = 0;
  let onHoldProjects = 0;
  let onTrackProjects = 0;
  for (const project of projects) {
    bump(projectStatus, project.currentStatusCode, project.statusLabel);
    bump(departments, project.department, project.department);
    if (project.closed) completedProjects += 1;
    else activeProjects += 1;
    if (project.delayed) delayedProjects += 1;
    if (project.onHold) onHoldProjects += 1;
    if (project.overall.code === 'ON_TRACK') onTrackProjects += 1;
  }

  function bucketFor(due) {
    const day = dayKey(due);
    if (!day || day < today) return null;
    if (day === today) return 'today';
    if (day <= addDays(today, 3)) return '3';
    if (day <= addDays(today, 7)) return '7';
    return '14';
  }
  const deadlines = [];
  for (const lead of leads) {
    const bucket = bucketFor(lead.submissionDeadline);
    if (!bucket || lead.outputStatus === 'COMPLETED') continue;
    deadlines.push({
      id: `lead-${lead.id}`,
      name: lead.customer?.companyName || 'Lead deadline',
      detail: lead.leadId || 'Lead',
      dueDate: lead.submissionDeadline,
      kind: 'Lead',
      href: `/leads/${lead.id}`,
      bucket,
      project: { projectId: lead.leadId },
      department: 'Sales',
      status: lead.statusCode,
    });
  }
  for (const project of projects) {
    const bucket = bucketFor(project.expectedCompletion);
    if (bucket && !project.closed) {
      deadlines.push({
        id: `project-${project.id}`,
        name: project.name,
        detail: project.projectId,
        dueDate: project.expectedCompletion,
        kind: 'Project',
        href: `/projects/${project.id}`,
        bucket,
        project: { id: project.id, projectId: project.projectId },
        department: project.department,
        status: project.currentStatusCode,
      });
    }
    for (const milestone of project.milestones || []) {
      const bucket = bucketFor(milestone.endDate);
      if (!bucket) continue;
      if (['COMPLETED', 'DONE', 'CLOSED'].includes(String(milestone.status || '').toUpperCase())) continue;
      deadlines.push({
        id: `milestone-${milestone.id}`,
        name: milestone.name,
        detail: project.projectId,
        dueDate: milestone.endDate,
        kind: 'Milestone',
        href: `/projects/${project.id}`,
        bucket,
        project: { id: project.id, projectId: project.projectId },
        department: project.department,
        status: milestone.status,
      });
    }
  }
  deadlines.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  return {
    leadKpis: {
      total: leadStats.totalLeads,
      active: leadStats.activeLeads,
      completed: leadStats.completedLeads,
      live: leadStats.liveLeads,
      pending: leadStats.pendingLeads,
      delayed: leadStats.delayedLeads,
      onHold: leadStats.onHoldLeads,
    },
    projectKpis: {
      total: projects.length,
      active: activeProjects,
      completed: completedProjects,
      delayed: delayedProjects,
      onHold: onHoldProjects,
      onTrack: onTrackProjects,
    },
    leadsByStatus: [...leadStatus.values()].sort((a, b) => b.count - a.count),
    projectsByStatus: [...projectStatus.values()].sort((a, b) => b.count - a.count),
    projectsByDepartment: [...departments.values()].sort((a, b) => b.count - a.count),
    upcomingDeadlines: deadlines.slice(0, 12),
    healthRows: projects.filter((project) => !project.closed).map((project) => ({
      id: project.id,
      projectId: project.projectId,
      name: project.name,
      customer: project.customer?.companyName || '—',
      progress: project.progressPercent,
      schedule: project.schedule,
      tasks: project.tasksHealth,
      issues: project.issueHealth,
      approvals: project.approvalHealth,
      overall: project.overall,
    })),
  };
}

module.exports = {
  hasProjects,
  list,
  getById,
  overview,
};
