const { prisma } = require('../prisma');
const { AppError } = require('../utils/errors');
const { parsePagination, paginated } = require('../utils/pagination');
const { logActivity } = require('../utils/activity');
const { notifyUsers, notifyOnce } = require('../utils/notifications');
const { istDayBounds } = require('../utils/leadDeadline');
const existingLeads = require('./existingLeadStore');

const include = {
  lead: true,
  responsiblePerson: { select: { id: true, fullName: true, email: true } },
  createdBy: { select: { id: true, fullName: true } },
  events: {
    include: { user: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'desc' },
  },
};

const LOOKUPS = {
  FEEDBACK_STATUS: [
    ['PENDING', 'Pending'],
    ['RECEIVED', 'Received'],
    ['NO_RESPONSE', 'No Response'],
    ['NOT_FEASIBLE', 'Not Feasible'],
    ['CLARIFICATION_REQUIRED', 'Clarification Required'],
  ],
  DRAWING_QUOTE_STATUS: [
    ['PENDING', 'Pending'],
    ['SENT', 'Sent'],
    ['REVISION_REQUIRED', 'Revision Required'],
    ['APPROVED', 'Approved'],
    ['ON_HOLD', 'On Hold'],
  ],
  FEEDBACK_FINAL_STATUS: [
    ['FOLLOW_UP_REQUIRED', 'Follow-up Required'],
    ['CUSTOMER_CONFIRMATION_PENDING', 'Customer Confirmation Pending'],
    ['AWAITING_CUSTOMER_RESPONSE', 'Awaiting Customer Response'],
    ['FEEDBACK_RECEIVED', 'Feedback Received'],
    ['QUOTATION_REVISION_REQUIRED', 'Quotation Revision Required'],
    ['LAYOUT_REVISION_REQUIRED', 'Layout Revision Required'],
    ['REQUIREMENT_PENDING', 'Requirement Pending'],
    ['NOT_FEASIBLE', 'Not Feasible'],
    ['CLOSED', 'Closed'],
  ],
};

const PERMS = [
  ['customer_feedback.view', 'View customer feedback', 'customer_feedback'],
  ['customer_feedback.create', 'Create customer feedback', 'customer_feedback'],
  ['customer_feedback.edit', 'Edit customer feedback', 'customer_feedback'],
];

let ready;

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function calendarDaysBetween(from, to = new Date()) {
  if (!from) return null;
  const a = startOfUtcDay(new Date(from));
  const b = startOfUtcDay(new Date(to));
  return Math.max(0, Math.round((b - a) / 86400000));
}

const FEEDBACK_DONE = new Set(['CLOSED', 'NOT_FEASIBLE', 'FEEDBACK_RECEIVED']);

function sentActionCompleted(row) {
  if (FEEDBACK_DONE.has(row.finalStatus)) return true;
  return row.drawingQuoteStatus === 'APPROVED';
}

function pendingDaysFor(sentDate, completed, row, now = new Date()) {
  if (!sentDate) return 'Not Sent';
  const end = completed ? (row.feedbackDate || row.updatedAt || now) : now;
  return calendarDaysBetween(sentDate, end);
}

function followUpState(row, now = new Date()) {
  if (['CLOSED', 'NOT_FEASIBLE'].includes(row.finalStatus)) {
    return { code: 'COMPLETED', label: 'Completed' };
  }
  if (!row.nextFollowUpDate) {
    return { code: 'UPCOMING', label: 'Upcoming' };
  }
  const { start, end } = istDayBounds(now);
  const due = new Date(row.nextFollowUpDate);
  if (due < start) return { code: 'OVERDUE', label: 'Overdue' };
  if (due >= start && due < end) return { code: 'DUE_TODAY', label: 'Due Today' };
  return { code: 'UPCOMING', label: 'Upcoming' };
}

function leadSummary(row) {
  const lead = row.lead || {};
  return {
    leadId: lead.leadCode || null,
    customerName: lead.companyName || lead.title || null,
    location: row.location || lead.location || lead.siteLocation || lead.companyAddress || null,
  };
}

function leadIndicator(row) {
  if (!row) return { code: 'NOT_REQUIRED', label: 'Not Required' };
  const follow = followUpState(row);
  if (follow.code === 'OVERDUE') return { code: 'OVERDUE', label: 'Overdue' };
  if (follow.code === 'DUE_TODAY') return { code: 'FOLLOW_UP_DUE', label: 'Follow-up Due' };
  if (row.feedbackStatus === 'RECEIVED' || row.finalStatus === 'FEEDBACK_RECEIVED') {
    return { code: 'RECEIVED', label: 'Received' };
  }
  return { code: 'PENDING', label: 'Pending' };
}

function shape(row) {
  const follow = followUpState(row);
  const lead = leadSummary(row);
  return {
    id: row.id,
    leadRecordId: row.leadId,
    leadId: lead.leadId,
    customerName: lead.customerName,
    location: lead.location,
    layoutSentDate: row.layoutSentDate,
    quotationSentDate: row.quotationSentDate,
    layoutPendingDays: pendingDaysFor(row.layoutSentDate, sentActionCompleted(row), row),
    quotationPendingDays: pendingDaysFor(row.quotationSentDate, sentActionCompleted(row), row),
    drawingQuoteStatus: row.drawingQuoteStatus,
    feedbackStatus: row.feedbackStatus,
    customerFeedback: row.customerFeedback,
    feedbackDate: row.feedbackDate,
    pendingRequirement: row.pendingRequirement,
    nextAction: row.nextAction,
    responsiblePersonId: row.responsiblePersonId,
    responsiblePerson: row.responsiblePerson,
    nextFollowUpDate: row.nextFollowUpDate,
    followUpStatus: follow.code,
    followUpStatusLabel: follow.label,
    finalStatus: row.finalStatus,
    remarks: row.remarks,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    indicator: leadIndicator(row),
    history: (row.events || []).map((event) => ({
      id: event.id,
      date: event.createdAt,
      user: event.user?.fullName || 'System',
      action: event.action,
      customerFeedback: event.customerFeedback,
      nextAction: event.nextAction,
      remarks: event.remarks,
    })),
  };
}

async function ensureAccess() {
  for (const [code, name, module] of PERMS) {
    await prisma.permission.upsert({
      where: { code },
      update: { name, module },
      create: { code, name, module },
    });
  }
  for (const [type, items] of Object.entries(LOOKUPS)) {
    for (let i = 0; i < items.length; i += 1) {
      const [code, label] = items[i];
      await prisma.lookup.upsert({
        where: { type_code: { type, code } },
        update: { label, sortOrder: i + 1, active: true },
        create: { type, code, label, sortOrder: i + 1, active: true },
      });
    }
  }

  const permRecords = await prisma.permission.findMany({
    where: { code: { in: PERMS.map((p) => p[0]) } },
  });
  const byCode = Object.fromEntries(permRecords.map((p) => [p.code, p]));
  const roles = await prisma.role.findMany({
    include: { permissions: { include: { permission: true } } },
  });
  const salesEdit = new Set(['SALES_MANAGER', 'SALES_EXEC', 'SALES_COORD', 'ADMIN']);
  for (const role of roles) {
    const hasLeadView = role.permissions.some((p) => p.permission.code === 'leads.view') || role.code === 'ADMIN' || role.isManagement;
    const codes = [];
    if (hasLeadView) codes.push('customer_feedback.view');
    if (salesEdit.has(role.code)) {
      codes.push('customer_feedback.view', 'customer_feedback.create', 'customer_feedback.edit');
    }
    for (const code of [...new Set(codes)]) {
      const perm = byCode[code];
      if (!perm) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }
}

async function readyAccess() {
  if (!ready) ready = ensureAccess();
  await ready;
}

async function notifyDue(items) {
  for (const row of items) {
    if (!row.responsiblePersonId) continue;
    if (row.followUpStatus === 'DUE_TODAY') {
      await notifyOnce([row.responsiblePersonId], {
        title: 'Customer follow-up due today',
        message: `${row.leadId || 'Lead'} · ${row.customerName || 'Customer'}`,
        type: 'WARNING',
        entityType: 'CustomerFeedback',
        entityId: row.id,
        link: `/customer-feedback/${row.id}`,
      });
    }
    if (row.followUpStatus === 'OVERDUE') {
      await notifyOnce([row.responsiblePersonId], {
        title: 'Customer follow-up overdue',
        message: `${row.leadId || 'Lead'} · ${row.customerName || 'Customer'}`,
        type: 'ALERT',
        entityType: 'CustomerFeedback',
        entityId: row.id,
        link: `/customer-feedback/${row.id}`,
      });
    }
  }
}

function buildWhere(query) {
  const AND = [];
  if (query.leadId) {
    AND.push({
      OR: [
        { leadId: query.leadId },
        { lead: { leadCode: { contains: query.leadId, mode: 'insensitive' } } },
      ],
    });
  }
  if (query.customer) AND.push({ lead: { companyName: { contains: query.customer, mode: 'insensitive' } } });
  if (query.responsiblePersonId) AND.push({ responsiblePersonId: query.responsiblePersonId });
  if (query.feedbackStatus) AND.push({ feedbackStatus: query.feedbackStatus });
  if (query.finalStatus) AND.push({ finalStatus: query.finalStatus });
  if (query.location) {
    AND.push({
      OR: [
        { location: { contains: query.location, mode: 'insensitive' } },
        { lead: { location: { contains: query.location, mode: 'insensitive' } } },
        { lead: { siteLocation: { contains: query.location, mode: 'insensitive' } } },
      ],
    });
  }
  if (query.followUpDate) {
    const day = new Date(`${query.followUpDate}T00:00:00.000Z`);
    const { start, end } = istDayBounds(Number.isNaN(day.getTime()) ? new Date() : day);
    AND.push({ nextFollowUpDate: { gte: start, lt: end } });
  }
  if (query.q) {
    const term = query.q.trim();
    AND.push({
      OR: [
        { customerFeedback: { contains: term, mode: 'insensitive' } },
        { remarks: { contains: term, mode: 'insensitive' } },
        { location: { contains: term, mode: 'insensitive' } },
        { pendingRequirement: { contains: term, mode: 'insensitive' } },
        { nextAction: { contains: term, mode: 'insensitive' } },
        { lead: { leadCode: { contains: term, mode: 'insensitive' } } },
        { lead: { companyName: { contains: term, mode: 'insensitive' } } },
        { lead: { location: { contains: term, mode: 'insensitive' } } },
        { lead: { siteLocation: { contains: term, mode: 'insensitive' } } },
        { lead: { title: { contains: term, mode: 'insensitive' } } },
      ],
    });
  }
  return AND.length ? { AND } : {};
}

function matchesFollowUpFilter(row, query) {
  if (!query.followUpStatus) return true;
  return row.followUpStatus === query.followUpStatus;
}

async function filterOptions() {
  const [leads, people, locations] = await Promise.all([
    prisma.customerFeedback.findMany({
      select: { leadId: true, lead: { select: { id: true, leadCode: true, companyName: true } } },
      distinct: ['leadId'],
    }),
    prisma.user.findMany({
      where: {
        active: true,
        roles: { some: { role: { code: { in: ['SALES_MANAGER', 'SALES_EXEC', 'SALES_COORD', 'ADMIN'] } } } },
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    }),
    prisma.customerFeedback.findMany({
      select: { location: true, lead: { select: { location: true, siteLocation: true } } },
    }),
  ]);
  const locationSet = new Set(
    locations
      .flatMap((row) => [row.location, row.lead?.location, row.lead?.siteLocation])
      .map((v) => (v || '').trim())
      .filter(Boolean)
  );
  return {
    leads: leads.map((row) => ({ id: row.leadId, leadId: row.lead?.leadCode, customerName: row.lead?.companyName })),
    people,
    locations: [...locationSet].sort(),
  };
}

function summarize(items) {
  return {
    total: items.length,
    pending: items.filter((r) => r.feedbackStatus === 'PENDING' || r.feedbackStatus === 'NO_RESPONSE').length,
    received: items.filter((r) => r.feedbackStatus === 'RECEIVED').length,
    followUpRequired: items.filter((r) => (
      ['FOLLOW_UP_REQUIRED', 'CUSTOMER_CONFIRMATION_PENDING', 'AWAITING_CUSTOMER_RESPONSE', 'REQUIREMENT_PENDING'].includes(r.finalStatus)
      || ['DUE_TODAY', 'OVERDUE'].includes(r.followUpStatus)
    ) && r.finalStatus !== 'CLOSED').length,
    dueToday: items.filter((r) => r.followUpStatus === 'DUE_TODAY').length,
    overdue: items.filter((r) => r.followUpStatus === 'OVERDUE').length,
    awaiting: items.filter((r) => r.finalStatus === 'AWAITING_CUSTOMER_RESPONSE' || r.feedbackStatus === 'PENDING').length,
  };
}

async function list(query) {
  await readyAccess();
  const { skip, take, page, pageSize } = parsePagination({ ...query, pageSize: query.pageSize || 50 });
  const rows = await prisma.customerFeedback.findMany({
    where: buildWhere(query),
    include,
    orderBy: [{ nextFollowUpDate: 'asc' }, { updatedAt: 'desc' }],
  });
  const items = rows.map(shape).filter((row) => matchesFollowUpFilter(row, query));
  await notifyDue(items).catch(() => {});
  return {
    ...paginated(items.slice(skip, skip + take), items.length, page, pageSize),
    kpis: summarize(items),
    filters: await filterOptions(),
  };
}

async function kpis() {
  await readyAccess();
  const rows = await prisma.customerFeedback.findMany({ include: { lead: true } });
  return summarize(rows.map(shape));
}

async function getById(id) {
  await readyAccess();
  const row = await prisma.customerFeedback.findUnique({ where: { id }, include });
  if (!row) throw new AppError(404, 'Customer feedback record not found.');
  return shape(row);
}

async function getByLeadId(leadId) {
  await readyAccess();
  if (!leadId) return null;
  const row = await prisma.customerFeedback.findUnique({ where: { leadId }, include });
  return row ? shape(row) : null;
}

async function summariesByLeadIds(ids) {
  if (!ids?.length) return {};
  const rows = await prisma.customerFeedback.findMany({
    where: { leadId: { in: ids } },
    include: { lead: { select: { leadCode: true, companyName: true } } },
  });
  return Object.fromEntries(rows.map((row) => [row.leadId, { id: row.id, ...leadIndicator(row) }]));
}

function payloadFrom(data, existing = {}) {
  const feedbackStatus = data.feedbackStatus ?? existing.feedbackStatus ?? 'PENDING';
  let feedbackDate = data.feedbackDate !== undefined ? toDate(data.feedbackDate) : existing.feedbackDate;
  if (feedbackStatus === 'RECEIVED' && !feedbackDate) feedbackDate = new Date();
  if (data.feedbackDate === '') feedbackDate = null;
  return {
    location: data.location !== undefined ? (data.location || null) : existing.location,
    layoutSentDate: data.layoutSentDate !== undefined ? toDate(data.layoutSentDate) : existing.layoutSentDate,
    quotationSentDate: data.quotationSentDate !== undefined ? toDate(data.quotationSentDate) : existing.quotationSentDate,
    drawingQuoteStatus: data.drawingQuoteStatus !== undefined ? (data.drawingQuoteStatus || null) : existing.drawingQuoteStatus,
    feedbackStatus,
    customerFeedback: data.customerFeedback !== undefined ? (data.customerFeedback || null) : existing.customerFeedback,
    feedbackDate,
    pendingRequirement: data.pendingRequirement !== undefined ? (data.pendingRequirement || null) : existing.pendingRequirement,
    nextAction: data.nextAction !== undefined ? (data.nextAction || null) : existing.nextAction,
    responsiblePersonId: data.responsiblePersonId !== undefined ? (data.responsiblePersonId || null) : existing.responsiblePersonId,
    nextFollowUpDate: data.nextFollowUpDate !== undefined ? toDate(data.nextFollowUpDate) : existing.nextFollowUpDate,
    finalStatus: data.finalStatus || existing.finalStatus || 'FOLLOW_UP_REQUIRED',
    remarks: data.remarks !== undefined ? (data.remarks || null) : existing.remarks,
  };
}

async function create(data, user) {
  await readyAccess();
  if (!data.leadId) throw new AppError(400, 'Select a lead for customer feedback.');
  const exists = await existingLeads.exists(data.leadId);
  if (!exists) throw new AppError(404, 'Lead not found.');
  const current = await prisma.customerFeedback.findUnique({ where: { leadId: data.leadId } });
  if (current) return getById(current.id);

  let location = data.location || null;
  let responsiblePersonId = data.responsiblePersonId || null;
  try {
    const lead = await existingLeads.getLead(data.leadId);
    location = location || lead.site?.address || lead.customer?.address || null;
    responsiblePersonId = responsiblePersonId || lead.salesPersonId || null;
  } catch {
    /* lead snapshot is optional */
  }

  const payload = payloadFrom({ ...data, location, responsiblePersonId });
  const row = await prisma.customerFeedback.create({
    data: {
      leadId: data.leadId,
      ...payload,
      createdById: user.id,
      events: {
        create: {
          action: 'CREATED',
          customerFeedback: payload.customerFeedback,
          nextAction: payload.nextAction,
          remarks: payload.remarks,
          userId: user.id,
        },
      },
    },
  });
  await logActivity({
    userId: user.id,
    action: 'CUSTOMER_FEEDBACK_CREATED',
    entity: 'CustomerFeedback',
    entityId: row.id,
    description: 'Customer feedback opened for lead',
  });
  if (payload.responsiblePersonId && payload.responsiblePersonId !== user.id) {
    await notifyUsers([payload.responsiblePersonId], {
      title: 'Customer feedback assigned',
      message: 'A customer follow-up has been assigned to you.',
      type: 'INFO',
      entityType: 'CustomerFeedback',
      entityId: row.id,
      link: `/customer-feedback/${row.id}`,
    });
  }
  return getById(row.id);
}

async function update(id, data, user) {
  await readyAccess();
  const existing = await prisma.customerFeedback.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Customer feedback record not found.');
  const payload = payloadFrom(data, existing);
  const action = payload.feedbackStatus === 'RECEIVED' && existing.feedbackStatus !== 'RECEIVED'
    ? 'FEEDBACK_RECEIVED'
    : 'FOLLOW_UP';
  await prisma.customerFeedback.update({ where: { id }, data: payload });
  await prisma.customerFeedbackEvent.create({
    data: {
      feedbackId: id,
      action,
      customerFeedback: payload.customerFeedback,
      nextAction: payload.nextAction,
      remarks: payload.remarks,
      userId: user.id,
    },
  });
  await logActivity({
    userId: user.id,
    action: `CUSTOMER_FEEDBACK_${action}`,
    entity: 'CustomerFeedback',
    entityId: id,
    description: payload.nextAction || payload.customerFeedback || 'Customer feedback updated',
  });
  if (action === 'FEEDBACK_RECEIVED' && payload.responsiblePersonId) {
    await notifyUsers([payload.responsiblePersonId], {
      title: 'Customer feedback received',
      message: payload.customerFeedback || 'Customer feedback has been recorded.',
      type: 'SUCCESS',
      entityType: 'CustomerFeedback',
      entityId: id,
      link: `/customer-feedback/${id}`,
    });
  }
  if (payload.responsiblePersonId && payload.responsiblePersonId !== existing.responsiblePersonId) {
    await notifyUsers([payload.responsiblePersonId], {
      title: 'Customer feedback assigned',
      message: 'A customer follow-up has been assigned to you.',
      type: 'INFO',
      entityType: 'CustomerFeedback',
      entityId: id,
      link: `/customer-feedback/${id}`,
    });
  }
  return getById(id);
}

async function openForLead(leadId, user, data = {}) {
  const existing = await getByLeadId(leadId);
  if (existing) return existing;
  return create({ leadId, ...data }, user);
}

module.exports = {
  list,
  kpis,
  getById,
  getByLeadId,
  summariesByLeadIds,
  create,
  update,
  openForLead,
  ensureAccess,
};
