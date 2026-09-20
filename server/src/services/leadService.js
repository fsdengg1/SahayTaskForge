const { prisma } = require('../prisma');
const { parsePagination, paginated, parseSort } = require('../utils/pagination');
const { AppError } = require('../utils/errors');
const { logActivity, logAudit } = require('../utils/activity');
const { notifyUsers, notifyByPermission } = require('../utils/notifications');
const existingLeads = require('./existingLeadStore');
const {
  calculateLeadSubmissionDeadline,
  getOutputSubmissionStatus,
  withDeadlineFields,
  deadlinePreview,
  outputRequiredLabel,
  formatDeadlineDate,
  formatIstDateTime,
  outputStatusWhere,
  istDateRange,
  calendarDelayDays,
} = require('../utils/leadDeadline');

const DEFAULT_CHECKLIST = [
  ['PALLET_DIMS', 'Pallet / material dimensions confirmed'],
  ['LOAD_CAPACITY', 'Load capacity confirmed'],
  ['FLOOR_AREA', 'Available floor area confirmed'],
  ['CLEAR_HEIGHT', 'Clear height confirmed'],
  ['HANDLING', 'Handling equipment details confirmed'],
  ['SITE_DOCS', 'Site photos / layout received'],
  ['QTY', 'Customer requirement / quantity confirmed'],
  ['TIMELINE', 'Installation timeline confirmed'],
];

const leadInclude = {
  customer: true,
  contact: true,
  site: true,
  salesPerson: { select: { id: true, fullName: true, username: true } },
  outputCompletedBy: { select: { id: true, fullName: true } },
  requirement: true,
  equipment: true,
  checklist: { include: { completedBy: { select: { id: true, fullName: true } } } },
  followUps: { include: { contact: true, salesPerson: { select: { id: true, fullName: true } } }, orderBy: { followUpDate: 'desc' } },
  revisions: { orderBy: { createdAt: 'desc' } },
  documents: { where: { archived: false }, orderBy: { uploadedAt: 'desc' } },
  comments: { include: { user: { select: { id: true, fullName: true } } }, orderBy: { createdAt: 'desc' } },
  projects: { select: { id: true, projectId: true, name: true, currentStatusCode: true } },
};

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDecimal(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function validateLead(data) {
  if (!data.companyName && !data.customerId) {
    throw new AppError(400, 'Customer / Company Name is needed.', { field: 'companyName' });
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw new AppError(400, 'Enter a valid email address.', { field: 'email' });
  }
  if (data.mobile && !/^[0-9+\-\s()]{7,20}$/.test(data.mobile)) {
    throw new AppError(400, 'Enter a valid mobile number.', { field: 'mobile' });
  }
}

async function createLead(data, user, files = []) {
  validateLead(data);
  const lead = await existingLeads.createLead(data, user);
  for (const file of files) {
    await existingLeads.addDocument(
      lead.id,
      file,
      file.fieldname === 'drawings' ? 'LAYOUT' : 'SITE_PHOTO',
      user.id
    );
  }
  return existingLeads.getLead(lead.id);
}

function leadWhere(query, user) {
  const where = { archived: query.archived === 'true' };
  if (query.q) {
    where.OR = [
      { leadId: { contains: query.q, mode: 'insensitive' } },
      { customer: { companyName: { contains: query.q, mode: 'insensitive' } } },
      { contact: { name: { contains: query.q, mode: 'insensitive' } } },
      { salesPerson: { fullName: { contains: query.q, mode: 'insensitive' } } },
    ];
  }
  if (query.status) where.statusCode = query.status;
  if (query.priority) where.priorityCode = query.priority;
  if (query.salesPersonId) where.salesPersonId = query.salesPersonId;
  if (query.customerId) where.customerId = query.customerId;
  if (query.outputRequired) where.outputRequired = query.outputRequired;
  const outputStatus = query.outputStatus || query.deadlineStatus;
  if (outputStatus) Object.assign(where, outputStatusWhere(outputStatus));
  if (query.overdue === 'true') {
    where.nextFollowUpDate = { lt: new Date() };
    where.statusCode = { notIn: ['WON', 'LOST'] };
  }
  if (query.from || query.to) {
    where.leadDate = {};
    if (query.from) where.leadDate.gte = new Date(query.from);
    if (query.to) where.leadDate.lte = new Date(query.to);
  }
  const createdRange = istDateRange(query.createdDate);
  if (createdRange) where.createdAt = { gte: createdRange.start, lt: createdRange.end };
  const deadlineRange = istDateRange(query.deadlineDate);
  if (deadlineRange) where.submissionDeadline = { gte: deadlineRange.start, lt: deadlineRange.end };
  return where;
}

async function listLeads(query, user) {
  return existingLeads.listLeads(query, user);
}

async function getLead(id) {
  if (await existingLeads.exists(id)) return existingLeads.getLead(id);
  const lead = await prisma.lead.findUnique({ where: { id }, include: leadInclude });
  if (!lead) throw new AppError(404, 'Lead not found.');
  const activity = await prisma.activityLog.findMany({
    where: { entity: 'Lead', entityId: id },
    include: { user: { select: { id: true, fullName: true } } },
    orderBy: { timestamp: 'desc' },
    take: 100,
  });
  return withDeadlineFields({ ...lead, activity });
}

async function updateLead(id, data, user) {
  if (await existingLeads.exists(id)) return existingLeads.updateLead(id, data, user);
  const existing = await prisma.lead.findUnique({ where: { id }, include: { requirement: true } });
  if (!existing) throw new AppError(404, 'Lead not found.');

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw new AppError(400, 'Enter a valid email address.', { field: 'email' });
  }

  const equipmentAvailable = Array.isArray(data.equipmentAvailable) ? data.equipmentAvailable : undefined;
  const equipmentRequired = Array.isArray(data.equipmentRequired) ? data.equipmentRequired : undefined;

  await prisma.lead.update({
    where: { id },
    data: {
      leadDate: data.leadDate ? toDate(data.leadDate) : undefined,
      sourceCode: data.sourceCode ?? undefined,
      industry: data.industry ?? undefined,
      salesPersonId: data.salesPersonId ?? undefined,
      priorityCode: data.priorityCode ?? undefined,
      nextFollowUpDate: data.nextFollowUpDate !== undefined ? toDate(data.nextFollowUpDate) : undefined,
      customerNeed: data.customerNeed ?? undefined,
      expectedOrderDate: data.expectedOrderDate !== undefined ? toDate(data.expectedOrderDate) : undefined,
      remarks: data.remarks ?? undefined,
      expectedProjectDate: data.expectedProjectDate !== undefined ? toDate(data.expectedProjectDate) : undefined,
      installationTimeline: data.installationTimeline ?? undefined,
      budgetCurrency: data.budgetCurrency ?? undefined,
      budgetAmount: data.budgetAmount !== undefined ? toDecimal(data.budgetAmount) : undefined,
      competitor: data.competitor ?? undefined,
      quotationRequiredBy: data.quotationRequiredBy !== undefined ? toDate(data.quotationRequiredBy) : undefined,
      decisionMaker: data.decisionMaker ?? undefined,
      outputRequired: data.outputRequired ?? undefined,
    },
  });

  if (existing.requirement) {
    await prisma.leadRequirement.update({
      where: { leadId: id },
      data: {
        requirementType: data.requirementType ?? undefined,
        materialToStore: data.materialToStore ?? undefined,
        storageMethodCode: data.storageMethodCode ?? undefined,
        requiredQuantity: data.requiredQuantity ?? undefined,
        noOfLevels: data.noOfLevels ?? undefined,
        loadPerPalletKg: data.loadPerPalletKg !== undefined ? toDecimal(data.loadPerPalletKg) : undefined,
        palletMaterialSize: data.palletMaterialSize ?? undefined,
        rackLength: data.rackLength ?? undefined,
        rackDepth: data.rackDepth ?? undefined,
        rackHeight: data.rackHeight ?? undefined,
        requiredRackHeight: data.requiredRackHeight ?? undefined,
        availableAreaLength: data.availableAreaLength ?? undefined,
        availableAreaWidth: data.availableAreaWidth ?? undefined,
        clearHeight: data.clearHeight ?? undefined,
        floorLoadingCapacity: data.floorLoadingCapacity ?? undefined,
        floorCondition: data.floorCondition ?? undefined,
        existingRacking: data.existingRacking ?? undefined,
        existingStorage: data.existingStorage ?? undefined,
        sitePhotosAvailable: data.sitePhotosAvailable ?? undefined,
        layoutAvailable: data.layoutAvailable ?? undefined,
        forkLengthCapacity: data.forkLengthCapacity ?? undefined,
        requiredLiftingHeight: data.requiredLiftingHeight ?? undefined,
        ...(equipmentAvailable ? { equipmentAvailable: equipmentAvailable.join(',') } : {}),
        ...(equipmentRequired ? { equipmentRequired: equipmentRequired.join(',') } : {}),
      },
    });
  }

  if (equipmentAvailable || equipmentRequired) {
    await prisma.leadEquipment.deleteMany({ where: { leadId: id } });
    const rows = [
      ...(equipmentAvailable || []).map((code) => ({ leadId: id, equipmentCode: code, kind: 'AVAILABLE' })),
      ...(equipmentRequired || []).map((code) => ({ leadId: id, equipmentCode: code, kind: 'REQUIRED' })),
    ];
    if (rows.length) await prisma.leadEquipment.createMany({ data: rows });
  }

  await logActivity({
    userId: user.id,
    action: 'LEAD_UPDATED',
    entity: 'Lead',
    entityId: id,
    description: `Lead ${existing.leadId} updated`,
  });
  return getLead(id);
}

async function changeStatus(id, statusCode, reason, user) {
  if (await existingLeads.exists(id)) return existingLeads.changeStatus(id, statusCode, reason, user);
  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Lead not found.');
  await prisma.lead.update({ where: { id }, data: { statusCode } });
  await logActivity({
    userId: user.id,
    action: 'STATUS_CHANGED',
    entity: 'Lead',
    entityId: id,
    oldValue: existing.statusCode,
    newValue: statusCode,
    description: reason || `Lead status changed to ${statusCode}`,
  });
  await logAudit({
    userId: user.id,
    ip: user.ip,
    entity: 'Lead',
    entityId: id,
    action: 'STATUS_CHANGE',
    previous: { statusCode: existing.statusCode },
    next: { statusCode, reason },
  });
  return getLead(id);
}

async function addFollowUp(leadId, data, user) {
  if (await existingLeads.exists(leadId)) return existingLeads.addFollowUp(leadId, data, user);
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new AppError(404, 'Lead not found.');
  if (!data.followUpDate) throw new AppError(400, 'Follow-up date is needed.', { field: 'followUpDate' });

  const followUp = await prisma.leadFollowUp.create({
    data: {
      leadId,
      followUpDate: toDate(data.followUpDate) || new Date(),
      typeCode: data.typeCode || 'PHONE',
      contactId: data.contactId || lead.contactId,
      discussion: data.discussion || null,
      customerFeedback: data.customerFeedback || null,
      nextAction: data.nextAction || null,
      nextFollowUpDate: toDate(data.nextFollowUpDate),
      salesPersonId: data.salesPersonId || user.id,
      statusCode: data.statusCode || 'OPEN',
      remarks: data.remarks || null,
    },
  });

  if (data.nextFollowUpDate) {
    await prisma.lead.update({ where: { id: leadId }, data: { nextFollowUpDate: toDate(data.nextFollowUpDate) } });
  }

  await logActivity({
    userId: user.id,
    action: 'FOLLOW_UP_ADDED',
    entity: 'Lead',
    entityId: leadId,
    description: `Follow-up added on ${followUp.followUpDate.toISOString().slice(0, 10)}`,
  });
  if (followUp.salesPersonId) {
    await notifyUsers([followUp.salesPersonId], {
      title: 'Follow-up recorded',
      message: `${lead.leadId}: ${data.nextAction || data.discussion || 'Follow-up added'}`,
      type: 'FOLLOW_UP',
      entityType: 'Lead',
      entityId: leadId,
      link: `/leads/${leadId}`,
    });
  }
  return followUp;
}

async function addRevision(leadId, data, user) {
  if (await existingLeads.exists(leadId)) return existingLeads.addRevision(leadId, data, user);
  const existing = await prisma.leadRevision.findMany({
    where: { leadId, category: data.category },
    orderBy: { createdAt: 'desc' },
  });
  const next = `R${existing.length}`;
  const revision = await prisma.leadRevision.create({
    data: {
      leadId,
      category: data.category,
      revisionNumber: data.revisionNumber || next,
      reason: data.reason || null,
      customerFeedback: data.customerFeedback || null,
      statusCode: data.statusCode || 'DRAFT',
      documentId: data.documentId || null,
      createdById: user.id,
    },
  });
  await logActivity({
    userId: user.id,
    action: 'REVISION_CREATED',
    entity: 'Lead',
    entityId: leadId,
    description: `${data.category} ${revision.revisionNumber} created`,
  });
  return revision;
}

async function toggleChecklist(leadId, itemCode, completed, user) {
  if (await existingLeads.exists(leadId)) return existingLeads.toggleChecklist(leadId, itemCode, completed, user);
  const item = await prisma.leadChecklistItem.update({
    where: { leadId_itemCode: { leadId, itemCode } },
    data: {
      completed,
      completedById: completed ? user.id : null,
      completedAt: completed ? new Date() : null,
    },
  });
  await logActivity({
    userId: user.id,
    action: 'CHECKLIST_UPDATED',
    entity: 'Lead',
    entityId: leadId,
    description: `${item.label} ${completed ? 'completed' : 'reopened'}`,
  });
  return item;
}

async function addRemark(leadId, body, user) {
  if (await existingLeads.exists(leadId)) return existingLeads.addRemark(leadId, body, user);
  const comment = await prisma.comment.create({
    data: { entityType: 'Lead', entityId: leadId, leadId, body, userId: user.id },
  });
  await logActivity({
    userId: user.id,
    action: 'REMARK_ADDED',
    entity: 'Lead',
    entityId: leadId,
    description: body.slice(0, 120),
  });
  return comment;
}

async function archiveLead(id, user) {
  if (await existingLeads.exists(id)) return existingLeads.archiveLead(id, user);
  const lead = await prisma.lead.update({ where: { id }, data: { archived: true } });
  await logActivity({ userId: user.id, action: 'LEAD_ARCHIVED', entity: 'Lead', entityId: id, description: `${lead.leadId} archived` });
  return lead;
}

async function convertToProject(leadId, data, user) {
  if (await existingLeads.exists(leadId)) {
    const lead = await existingLeads.getLead(leadId);
    if (lead.projects?.length && !data.allowAdditional) {
      throw new AppError(400, `This lead is already linked to ${lead.projects[0].projectId}.`);
    }
    if (lead.statusCode !== 'WON') {
      throw new AppError(400, 'A lead can be converted only after status is Won.');
    }
    throw new AppError(400, 'This enquiry is already tracked in the existing project records.');
  }
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { customer: true, contact: true, site: true, requirement: true, documents: true },
  });
  if (!lead) throw new AppError(404, 'Lead not found.');
  if (lead.statusCode !== 'WON') {
    throw new AppError(400, 'A lead can be converted only after status is Won.');
  }
  const existing = await prisma.project.findFirst({ where: { leadId } });
  if (existing && !data.allowAdditional) {
    throw new AppError(400, `This lead is already linked to ${existing.projectId}.`);
  }

  const { createProjectFromLead } = require('./projectService');
  const project = await createProjectFromLead(lead, data, user);
  await logActivity({
    userId: user.id,
    action: 'LEAD_CONVERTED',
    entity: 'Lead',
    entityId: leadId,
    newValue: project.projectId,
    description: `Lead ${lead.leadId} converted to ${project.projectId}`,
  });
  await notifyByPermission('projects.view', {
    title: 'New project created',
    message: `${project.projectId} created from ${lead.leadId}`,
    type: 'PROJECT',
    entityType: 'Project',
    entityId: project.id,
    link: `/projects/${project.id}`,
  });
  return project;
}

function getDeadlinePreview() {
  return deadlinePreview(new Date());
}

async function completeLeadOutput(lead, userId, at = new Date()) {
  const delayDays = Math.max(0, calendarDelayDays(lead.submissionDeadline, at));
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      outputCompletedAt: at,
      outputCompletedById: userId || null,
      outputDelayDays: delayDays,
      outputStatus: 'COMPLETED',
      outputOnHold: false,
      holdEndedAt: lead.outputOnHold ? at : lead.holdEndedAt,
    },
  });
  const computed = getOutputSubmissionStatus({
    submissionDeadline: lead.submissionDeadline,
    now: at,
    outputCompletedAt: at,
    outputDelayDays: delayDays,
  });
  await logActivity({
    userId,
    action: 'OUTPUT_SUBMITTED',
    entity: 'Lead',
    entityId: lead.id,
    description: `Output submitted for ${lead.leadId} at ${formatIstDateTime(at)}. Status: COMPLETED. Submission delay: ${delayDays} day${delayDays === 1 ? '' : 's'}.`,
  });
  await notifyByPermission('leads.view', {
    title: 'Lead output completed',
    message: `${lead.leadId} output marked COMPLETED${delayDays ? ` with ${delayDays}-day delay` : ''}.`,
    type: 'LEAD',
    entityType: 'Lead',
    entityId: lead.id,
    link: `/leads/${lead.id}`,
  });
  return computed;
}

async function markOutputSubmitted(id, completed, user) {
  if (await existingLeads.exists(id)) return existingLeads.markOutputSubmitted(id, completed, user);
  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Lead not found.');
  if (completed === false) {
    await prisma.lead.update({
      where: { id },
      data: {
        outputCompletedAt: null,
        outputCompletedById: null,
        outputDelayDays: null,
        outputStatus: null,
      },
    });
    await logActivity({
      userId: user.id,
      action: 'OUTPUT_REOPENED',
      entity: 'Lead',
      entityId: id,
      description: `Output marked incomplete for ${existing.leadId}. Deadline preserved.`,
    });
    return getLead(id);
  }
  await completeLeadOutput(existing, user.id);
  return getLead(id);
}

async function setOutputHold(id, data, user) {
  if (await existingLeads.exists(id)) return existingLeads.setOutputHold(id, data, user);
  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Lead not found.');
  if (existing.outputCompletedAt) throw new AppError(400, 'Completed output cannot be placed on hold.');
  const onHold = data.onHold !== false;
  const now = new Date();
  await prisma.lead.update({
    where: { id },
    data: onHold
      ? {
          outputOnHold: true,
          outputStatus: 'ON_HOLD',
          holdReason: data.reason || existing.holdReason,
          holdStartedAt: existing.holdStartedAt || now,
          holdEndedAt: null,
        }
      : {
          outputOnHold: false,
          outputStatus: null,
          holdEndedAt: now,
        },
  });
  await logActivity({
    userId: user.id,
    action: onHold ? 'OUTPUT_ON_HOLD' : 'OUTPUT_RESUMED',
    entity: 'Lead',
    entityId: id,
    description: onHold
      ? `${existing.leadId} output placed ON HOLD${data.reason ? `: ${data.reason}` : ''}. Original deadline ${formatDeadlineDate(existing.submissionDeadline)} preserved.`
      : `${existing.leadId} taken off hold. Original deadline ${formatDeadlineDate(existing.submissionDeadline)} still applies.`,
  });
  return getLead(id);
}

async function maybeCompleteLeadOutput(leadId, userId) {
  if (!leadId) return;
  if (await existingLeads.exists(leadId)) return;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { documents: { select: { categoryCode: true } } },
  });
  if (!lead || lead.outputCompletedAt || !lead.outputRequired) return;

  const cats = new Set(lead.documents.map((d) => d.categoryCode));
  const hasBom = cats.has('BOQ') || cats.has('BOM');
  const hasDrawing = cats.has('LAYOUT') || cats.has('GA_DRAWING') || cats.has('DRAWING');
  const done =
    (lead.outputRequired === 'BOM' && hasBom) ||
    (lead.outputRequired === 'DRAWING' && hasDrawing) ||
    (lead.outputRequired === 'BOM_DRAWINGS' && hasBom && hasDrawing);
  if (!done) return;
  await completeLeadOutput(lead, userId);
}

module.exports = {
  createLead,
  listLeads,
  getLead,
  updateLead,
  changeStatus,
  addFollowUp,
  addRevision,
  toggleChecklist,
  addRemark,
  archiveLead,
  convertToProject,
  getDeadlinePreview,
  markOutputSubmitted,
  setOutputHold,
  maybeCompleteLeadOutput,
  DEFAULT_CHECKLIST,
};
