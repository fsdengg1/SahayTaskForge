const { prisma } = require('../prisma');
const { nextNumber } = require('../utils/numbering');
const { AppError } = require('../utils/errors');
const { logActivity } = require('../utils/activity');
const { notifyOnce, notifyByPermission } = require('../utils/notifications');

const MGMT = ['CEO', 'SAHAY_MD', 'ENG_DIRECTOR', 'CFT', 'ADMIN'];
const CLOSED = ['RESOLVED', 'CLOSED'];

const include = {
  project: {
    select: {
      id: true,
      projectId: true,
      name: true,
      currentStageCode: true,
      currentStatusCode: true,
      projectManagerId: true,
      customer: { select: { id: true, companyName: true } },
      site: { select: { id: true, name: true, address: true } },
    },
  },
  department: { select: { id: true, code: true, name: true } },
  blockedDepartment: { select: { id: true, code: true, name: true } },
  assignedTo: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  actionOwner: { select: { id: true, fullName: true } },
};

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayDiff(from, to = new Date()) {
  return Math.max(0, Math.floor((startOfDay(to) - startOfDay(from)) / 86400000));
}

function isManagement(user) {
  return (user.roles || []).some((r) => MGMT.includes(r.code || r.role?.code));
}

function visibilityWhere(user) {
  if (isManagement(user) || user.permissions?.includes('dashboard.management')) return {};
  return {
    OR: [
      { departmentId: user.departmentId || '__none__' },
      { assignedToId: user.id },
      { createdById: user.id },
      { actionOwnerId: user.id },
    ],
  };
}

function isOverdue(issue, now = new Date()) {
  if (!issue.dueDate || CLOSED.includes(issue.statusCode)) return false;
  return startOfDay(now) > startOfDay(issue.dueDate);
}

function shapeIssue(issue, now = new Date()) {
  const overdue = isOverdue(issue, now);
  const age = dayDiff(issue.createdAt, now);
  return {
    ...issue,
    age,
    ageLabel: age === 1 ? '1 day' : `${age} days`,
    overdue,
    overdueDays: overdue ? dayDiff(issue.dueDate, now) : 0,
    owner: issue.assignedTo?.fullName || '—',
    departmentName: issue.department?.name || '—',
    projectCode: issue.project?.projectId || '—',
    customerName: issue.project?.customer?.companyName || '—',
  };
}

function punchAge(punch, now = new Date()) {
  const age = dayDiff(punch.createdAt, now);
  const resolved = ['COMPLETED', 'VERIFIED'].includes(punch.statusCode);
  const overdue = punch.dueDate && !resolved && startOfDay(now) > startOfDay(punch.dueDate);
  return {
    ...punch,
    age,
    ageLabel: age === 1 ? '1 day' : `${age} days`,
    overdue,
    overdueDays: overdue ? dayDiff(punch.dueDate, now) : 0,
  };
}

async function issueNotify(issue, title, message, extraIds = []) {
  const ids = [
    issue.assignedToId,
    issue.createdById,
    issue.actionOwnerId,
    issue.project?.projectManagerId,
    ...extraIds,
  ];
  await notifyOnce(ids, {
    title,
    message,
    type: title.includes('Critical') || title.includes('Blocked') || title.includes('overdue') ? 'WARN' : 'INFO',
    entityType: 'Issue',
    entityId: issue.id,
    link: `/issues/${issue.id}`,
  });
}

async function listWorkspace(query = {}, user = {}) {
  const now = new Date();
  const where = { ...visibilityWhere(user) };
  const and = [];
  if (query.q) {
    and.push({
      OR: [
        { issueNumber: { contains: query.q, mode: 'insensitive' } },
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
        { project: { projectId: { contains: query.q, mode: 'insensitive' } } },
      ],
    });
  }
  if (query.projectId) and.push({ projectId: query.projectId });
  if (query.departmentId) and.push({ departmentId: query.departmentId });
  if (query.priority) and.push({ priorityCode: query.priority });
  if (query.status) and.push({ statusCode: query.status });
  if (query.issueType) and.push({ issueType: query.issueType });
  if (query.assignedToId) and.push({ assignedToId: query.assignedToId });
  if (query.due === 'overdue') {
    and.push({ dueDate: { lt: startOfDay(now) }, statusCode: { notIn: CLOSED } });
  } else if (query.due === 'today') {
    and.push({
      dueDate: { gte: startOfDay(now), lt: new Date(startOfDay(now).getTime() + 86400000) },
      statusCode: { notIn: CLOSED },
    });
  } else if (query.due === 'week') {
    and.push({
      dueDate: { gte: startOfDay(now), lt: new Date(startOfDay(now).getTime() + 8 * 86400000) },
      statusCode: { notIn: CLOSED },
    });
  } else if (query.dueDate) {
    const day = startOfDay(query.dueDate);
    and.push({ dueDate: { gte: day, lt: new Date(day.getTime() + 86400000) } });
  }
  if (and.length) where.AND = and;

  const [issues, punches, projects, users, departments] = await Promise.all([
    prisma.issue.findMany({
      where,
      include: include,
      orderBy: [{ isBlocking: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    }),
    prisma.punchPoint.findMany({
      include: {
        project: { select: { id: true, projectId: true, name: true, customer: { select: { companyName: true } } } },
        assignedTo: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.project.findMany({
      where: { archived: false },
      select: { id: true, projectId: true, name: true },
      orderBy: { projectId: 'asc' },
      take: 200,
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, fullName: true, departmentId: true },
      orderBy: { fullName: 'asc' },
    }),
    prisma.department.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  const scoped = issues.map((row) => shapeIssue(row, now));
  const allOpen = scoped.filter((i) => !CLOSED.includes(i.statusCode));
  const todayStart = startOfDay(now);
  const tomorrow = new Date(todayStart.getTime() + 86400000);

  for (const issue of allOpen) {
    if (issue.overdue) {
      await issueNotify(issue, 'Issue overdue', `${issue.issueNumber} is overdue.`);
    } else if (issue.dueDate && issue.dueDate >= todayStart && issue.dueDate < tomorrow) {
      await issueNotify(issue, 'Issue due today', `${issue.issueNumber} is due today.`);
    }
  }

  const summary = {
    open: allOpen.length,
    blocked: allOpen.filter((i) => i.statusCode === 'BLOCKED' || i.isBlocking).length,
    highPriority: allOpen.filter((i) => ['CRITICAL', 'HIGH', 'VERY_HIGH'].includes(i.priorityCode)).length,
    overdue: allOpen.filter((i) => i.overdue).length,
    dueToday: allOpen.filter((i) => i.dueDate && i.dueDate >= todayStart && i.dueDate < tomorrow).length,
    onHold: allOpen.filter((i) => i.statusCode === 'ON_HOLD').length,
  };

  const attention = scoped.filter((i) => (
    !CLOSED.includes(i.statusCode)
    && (i.priorityCode === 'CRITICAL' || i.statusCode === 'BLOCKED' || i.isBlocking || i.overdue)
  )).slice(0, 12);

  const punchScope = isManagement(user) || user.permissions?.includes('installation.view')
    ? punches
    : punches.filter((p) => p.assignedToId === user.id);
  const openPunches = punchScope.filter((p) => ['OPEN', 'IN_PROGRESS'].includes(p.statusCode));

  return {
    issues: scoped,
    punches: punchScope.map((p) => punchAge(p, now)),
    openPunches: openPunches.map((p) => punchAge(p, now)),
    summary,
    attention,
    filters: { projects, users, departments },
  };
}

async function getIssue(id, user) {
  const issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      ...include,
      comments: { include: { user: { select: { id: true, fullName: true } } }, orderBy: { createdAt: 'asc' } },
      documents: { include: { uploadedBy: { select: { fullName: true } } }, orderBy: { uploadedAt: 'desc' } },
    },
  });
  if (!issue) throw new AppError(404, 'Issue not found.');
  if (!canSee(issue, user)) throw new AppError(403, 'You do not have access to this issue.');
  const activity = await prisma.activityLog.findMany({
    where: { OR: [{ entity: 'Issue', entityId: id }, { entity: 'Project', entityId: issue.projectId, description: { contains: issue.issueNumber } }] },
    include: { user: { select: { fullName: true } } },
    orderBy: { timestamp: 'asc' },
    take: 80,
  });
  return { ...shapeIssue(issue), activity };
}

function canSee(issue, user) {
  if (isManagement(user) || user.permissions?.includes('dashboard.management')) return true;
  return [issue.departmentId, issue.assignedToId, issue.createdById, issue.actionOwnerId].includes(user.id)
    || issue.assignedToId === user.id
    || issue.createdById === user.id
    || issue.actionOwnerId === user.id
    || (user.departmentId && issue.departmentId === user.departmentId);
}

async function createIssue(data, user) {
  if (!data.projectId) throw new AppError(400, 'Select a project.');
  if (!data.title) throw new AppError(400, 'Enter an issue title.');
  const issueNumber = await nextNumber('ISSUE');
  const issue = await prisma.issue.create({
    data: {
      issueNumber,
      projectId: data.projectId,
      title: data.title,
      description: data.description || null,
      issueType: data.issueType || 'OTHER',
      departmentId: data.departmentId || null,
      priorityCode: data.priorityCode || 'MEDIUM',
      assignedToId: data.assignedToId || null,
      createdById: user.id,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      isBlocking: Boolean(data.isBlocking),
      blockedDepartmentId: data.blockedDepartmentId || null,
      requiredAction: data.requiredAction || null,
      actionOwnerId: data.actionOwnerId || data.assignedToId || null,
      targetDate: data.targetDate ? new Date(data.targetDate) : (data.dueDate ? new Date(data.dueDate) : null),
      impactNotes: data.impactNotes || null,
      estimatedDelayDays: data.estimatedDelayDays != null ? Number(data.estimatedDelayDays) : null,
      statusCode: data.statusCode || 'OPEN',
    },
    include: include,
  });
  await logActivity({
    userId: user.id,
    action: 'ISSUE_CREATED',
    entity: 'Issue',
    entityId: issue.id,
    description: `${issue.issueNumber} created`,
  });
  await logActivity({
    userId: user.id,
    action: 'ISSUE_CREATED',
    entity: 'Project',
    entityId: issue.projectId,
    description: `${issue.issueNumber} ${issue.title}`,
  });
  await issueNotify(issue, 'Issue assigned', `${issue.issueNumber} was assigned to you.`);
  if (issue.priorityCode === 'CRITICAL') {
    await notifyByPermission('dashboard.management', {
      title: 'Issue marked Critical',
      message: `${issue.issueNumber}: ${issue.title}`,
      type: 'WARN',
      entityType: 'Issue',
      entityId: issue.id,
      link: `/issues/${issue.id}`,
    });
  }
  if (issue.statusCode === 'BLOCKED' || issue.isBlocking) {
    await notifyByPermission('dashboard.management', {
      title: 'Issue marked Blocked',
      message: `${issue.issueNumber} is blocking ${issue.project?.projectId || 'a project'}`,
      type: 'WARN',
      entityType: 'Issue',
      entityId: issue.id,
      link: `/issues/${issue.id}`,
    });
  }
  return shapeIssue(issue);
}

async function updateIssue(id, data, user) {
  const current = await prisma.issue.findUnique({ where: { id } });
  if (!current) throw new AppError(404, 'Issue not found.');
  const nextStatus = data.statusCode ?? current.statusCode;
  const resolved = CLOSED.includes(nextStatus) && !CLOSED.includes(current.statusCode);
  const issue = await prisma.issue.update({
    where: { id },
    data: {
      title: data.title ?? undefined,
      description: data.description ?? undefined,
      issueType: data.issueType ?? undefined,
      departmentId: data.departmentId === undefined ? undefined : data.departmentId || null,
      priorityCode: data.priorityCode ?? undefined,
      assignedToId: data.assignedToId === undefined ? undefined : data.assignedToId || null,
      dueDate: data.dueDate === undefined ? undefined : data.dueDate ? new Date(data.dueDate) : null,
      statusCode: data.statusCode ?? undefined,
      isBlocking: data.isBlocking === undefined ? undefined : Boolean(data.isBlocking),
      blockedDepartmentId: data.blockedDepartmentId === undefined ? undefined : data.blockedDepartmentId || null,
      requiredAction: data.requiredAction ?? undefined,
      actionOwnerId: data.actionOwnerId === undefined ? undefined : data.actionOwnerId || null,
      targetDate: data.targetDate === undefined ? undefined : data.targetDate ? new Date(data.targetDate) : null,
      impactNotes: data.impactNotes ?? undefined,
      estimatedDelayDays: data.estimatedDelayDays === undefined ? undefined : data.estimatedDelayDays == null ? null : Number(data.estimatedDelayDays),
      resolutionNotes: data.resolutionNotes ?? undefined,
      resolvedAt: resolved ? new Date() : data.statusCode && !CLOSED.includes(nextStatus) ? null : undefined,
    },
    include: include,
  });
  const changes = [];
  if (data.statusCode && data.statusCode !== current.statusCode) changes.push(`Status ${current.statusCode} → ${data.statusCode}`);
  if (data.assignedToId && data.assignedToId !== current.assignedToId) changes.push('Issue reassigned');
  if (data.priorityCode && data.priorityCode !== current.priorityCode) changes.push(`Priority ${data.priorityCode}`);
  await logActivity({
    userId: user.id,
    action: resolved ? 'ISSUE_RESOLVED' : 'ISSUE_UPDATED',
    entity: 'Issue',
    entityId: issue.id,
    oldValue: current.statusCode,
    newValue: issue.statusCode,
    description: changes[0] || `${issue.issueNumber} updated`,
  });
  await logActivity({
    userId: user.id,
    action: resolved ? 'ISSUE_RESOLVED' : 'ISSUE_UPDATED',
    entity: 'Project',
    entityId: issue.projectId,
    description: `${issue.issueNumber} ${changes[0] || issue.title}`,
  });
  if (data.assignedToId && data.assignedToId !== current.assignedToId) {
    await issueNotify(issue, 'Issue reassigned', `${issue.issueNumber} was reassigned to you.`, [data.assignedToId]);
  }
  if (data.priorityCode === 'CRITICAL' && current.priorityCode !== 'CRITICAL') {
    await issueNotify(issue, 'Issue marked Critical', `${issue.issueNumber} is Critical.`);
  }
  if ((data.statusCode === 'BLOCKED' || data.isBlocking) && current.statusCode !== 'BLOCKED') {
    await issueNotify(issue, 'Issue marked Blocked', `${issue.issueNumber} is blocked.`);
  }
  if (resolved) {
    await issueNotify(issue, 'Issue resolved', `${issue.issueNumber} was resolved.`);
  }
  return shapeIssue(issue);
}

async function addComment(id, body, user) {
  if (!body) throw new AppError(400, 'Enter a comment.');
  const issue = await prisma.issue.findUnique({ where: { id } });
  if (!issue) throw new AppError(404, 'Issue not found.');
  const comment = await prisma.comment.create({
    data: {
      entityType: 'Issue',
      entityId: id,
      issueId: id,
      projectId: issue.projectId,
      body,
      userId: user.id,
    },
    include: { user: { select: { id: true, fullName: true } } },
  });
  await logActivity({
    userId: user.id,
    action: 'ISSUE_COMMENT',
    entity: 'Issue',
    entityId: id,
    description: `${issue.issueNumber} comment added`,
  });
  await issueNotify(issue, 'Comment added', `${user.fullName || 'A user'} commented on ${issue.issueNumber}.`);
  return comment;
}

async function getPunch(id) {
  const punch = await prisma.punchPoint.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          projectId: true,
          name: true,
          customer: { select: { companyName: true } },
          site: { select: { name: true, address: true } },
        },
      },
      assignedTo: { select: { id: true, fullName: true } },
    },
  });
  if (!punch) throw new AppError(404, 'Punch point not found.');
  const [comments, activity, photo] = await Promise.all([
    prisma.comment.findMany({
      where: { entityType: 'PunchPoint', entityId: id },
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.activityLog.findMany({
      where: { OR: [{ entity: 'PunchPoint', entityId: id }, { description: { contains: punch.punchId } }] },
      include: { user: { select: { fullName: true } } },
      orderBy: { timestamp: 'asc' },
      take: 50,
    }),
    punch.photoDocumentId
      ? prisma.document.findUnique({ where: { id: punch.photoDocumentId }, include: { uploadedBy: { select: { fullName: true } } } })
      : null,
  ]);
  return { ...punchAge(punch), comments, activity, photo };
}

async function addPunchComment(id, body, user) {
  if (!body) throw new AppError(400, 'Enter a comment.');
  const punch = await prisma.punchPoint.findUnique({ where: { id } });
  if (!punch) throw new AppError(404, 'Punch point not found.');
  const comment = await prisma.comment.create({
    data: {
      entityType: 'PunchPoint',
      entityId: id,
      projectId: punch.projectId,
      body,
      userId: user.id,
    },
    include: { user: { select: { fullName: true } } },
  });
  await logActivity({
    userId: user.id,
    action: 'PUNCH_COMMENT',
    entity: 'PunchPoint',
    entityId: id,
    description: `${punch.punchId} comment added`,
  });
  return comment;
}

async function attentionIssues() {
  const now = new Date();
  const rows = await prisma.issue.findMany({
    where: {
      statusCode: { notIn: CLOSED },
      OR: [
        { priorityCode: 'CRITICAL' },
        { statusCode: 'BLOCKED' },
        { isBlocking: true },
        { dueDate: { lt: startOfDay(now) } },
      ],
    },
    include: include,
    orderBy: { createdAt: 'desc' },
    take: 12,
  });
  return rows.map((row) => shapeIssue(row, now));
}

module.exports = {
  listWorkspace,
  getIssue,
  createIssue,
  updateIssue,
  addComment,
  getPunch,
  addPunchComment,
  attentionIssues,
};
