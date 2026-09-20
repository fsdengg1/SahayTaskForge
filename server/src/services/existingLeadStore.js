const crypto = require('crypto');
const { prisma } = require('../prisma');
const { parsePagination, paginated } = require('../utils/pagination');
const { AppError } = require('../utils/errors');
const { logActivity, logAudit } = require('../utils/activity');
const {
  calculateLeadSubmissionDeadline,
  withDeadlineFields,
  calendarDelayDays,
  formatIstDateTime,
  formatDeadlineDate,
  istDateRange,
} = require('../utils/leadDeadline');

const CHECKLIST_ITEMS = [
  ['PALLET_DIMS', 'palletDimensionsConfirmed', 'Pallet / material dimensions confirmed'],
  ['LOAD_CAPACITY', 'loadCapacityConfirmed', 'Load capacity confirmed'],
  ['FLOOR_AREA', 'floorAreaConfirmed', 'Available floor area confirmed'],
  ['CLEAR_HEIGHT', 'clearHeightConfirmed', 'Clear height confirmed'],
  ['HANDLING', 'handlingEquipmentConfirmed', 'Handling equipment details confirmed'],
  ['SITE_DOCS', 'sitePhotosReceived', 'Site photos / layout received'],
  ['QTY', 'quantityConfirmed', 'Customer requirement / quantity confirmed'],
  ['TIMELINE', 'installationTimelineConfirmed', 'Installation timeline confirmed'],
];

const OUTPUT_TO_CODE = {
  'Only Drawings': 'DRAWING',
  'Only BOM': 'BOM',
  'Drawings + BOM': 'BOM_DRAWINGS',
  DRAWING: 'DRAWING',
  BOM: 'BOM',
  BOM_DRAWINGS: 'BOM_DRAWINGS',
};

const CODE_TO_OUTPUT = {
  DRAWING: 'Only Drawings',
  BOM: 'Only BOM',
  BOM_DRAWINGS: 'Drawings + BOM',
};

const OUTPUT_LABELS = {
  DRAWING: 'Only Drawings',
  BOM: 'Only BOM',
  BOM_DRAWINGS: 'Drawings + BOM',
  'Only Drawings': 'Only Drawings',
  'Only BOM': 'Only BOM',
  'Drawings + BOM': 'Drawings + BOM',
};

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNumber(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function asObject(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function normalizeOutput(value) {
  if (!value) return null;
  return OUTPUT_TO_CODE[value] || value;
}

function outputLabel(value) {
  if (!value) return '—';
  return OUTPUT_LABELS[value] || CODE_TO_OUTPUT[value] || value;
}

function dbOutputValue(value) {
  if (!value) return null;
  return CODE_TO_OUTPUT[value] || value;
}

function mapSource(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  const key = v.toLowerCase();
  if (key.includes('direct')) return 'DIRECT';
  if (key.includes('website')) return 'WEBSITE';
  if (key.includes('referral')) return 'REFERRAL';
  if (key.includes('existing')) return 'EXISTING';
  if (key.includes('dealer') || key.includes('partner')) return 'DEALER';
  if (key.includes('exhibition')) return 'EXHIBITION';
  if (key.includes('tender')) return 'TENDER';
  if (key.includes('email')) return 'EMAIL';
  if (key.includes('phone')) return 'PHONE';
  return v;
}

function checklistArray(raw) {
  const obj = asObject(raw);
  return CHECKLIST_ITEMS.map(([itemCode, key, label]) => ({
    itemCode,
    jsonKey: key,
    label,
    completed: Boolean(obj[key]),
    completedBy: null,
    completedAt: null,
  }));
}

function checklistObject(items = []) {
  const obj = {};
  for (const [itemCode, key] of CHECKLIST_ITEMS) {
    const item = items.find((row) => row.itemCode === itemCode || row.jsonKey === key || row.itemCode === key);
    obj[key] = Boolean(item?.completed);
  }
  return obj;
}

function requirementFromDetails(details, row) {
  const d = asObject(details);
  const available = [];
  const required = [];
  if (d.availableForklift || d.forklift) available.push('FORKLIFT');
  if (d.availableReachTruck || d.reachTruck) available.push('REACH_TRUCK');
  if (d.availableStacker || d.stacker) available.push('STACKER');
  if (d.requiredForklift) required.push('FORKLIFT');
  if (d.requiredReachTruck) required.push('REACH_TRUCK');
  if (d.requiredStacker) required.push('STACKER');
  return {
    requirementType: d.requirementType || null,
    materialToStore: d.materialToStore || null,
    storageMethodCode: d.storageMethod || row.type_of_storage || null,
    requiredQuantity: d.requiredQuantity || null,
    noOfLevels: d.levels || d.noOfLevels || null,
    loadPerPalletKg: toNumber(d.loadPerPallet || d.loadCapacity),
    palletMaterialSize: d.palletSize || null,
    rackLength: d.rackLength || null,
    rackDepth: d.rackDepth || null,
    rackHeight: d.rackHeight || d.rackHeightDim || null,
    requiredRackHeight: d.requiredRackHeight || null,
    availableAreaLength: d.areaLength || d.availableArea || null,
    availableAreaWidth: d.areaWidth || null,
    clearHeight: d.clearHeight || null,
    floorLoadingCapacity: d.floorLoading || null,
    floorCondition: d.floorCondition || null,
    existingRacking: d.existingRacking || null,
    existingStorage: d.existingStorage || null,
    sitePhotosAvailable: Boolean(d.sitePhotosAvailable),
    layoutAvailable: Boolean(d.layoutAvailable),
    equipmentAvailable: available.join(','),
    equipmentRequired: required.join(','),
    forkLengthCapacity: d.forkLength || d.forkCapacity || null,
    requiredLiftingHeight: d.liftingHeight || null,
  };
}

function equipmentFromDetails(details) {
  const req = requirementFromDetails(details, {});
  return [
    ...String(req.equipmentAvailable || '').split(',').filter(Boolean).map((code) => ({ equipmentCode: code, kind: 'AVAILABLE' })),
    ...String(req.equipmentRequired || '').split(',').filter(Boolean).map((code) => ({ equipmentCode: code, kind: 'REQUIRED' })),
  ];
}

function mergeDetails(existing, data = {}) {
  const details = { ...asObject(existing) };
  const assign = (key, value) => {
    if (value !== undefined) details[key] = value;
  };
  assign('customerNeed', data.customerNeed);
  assign('expectedOrderDate', data.expectedOrderDate || details.expectedOrderDate);
  assign('nextFollowUpDate', data.nextFollowUpDate || details.nextFollowUpDate);
  assign('requirementType', data.requirementType);
  assign('materialToStore', data.materialToStore);
  assign('storageMethod', data.storageMethodCode);
  assign('requiredQuantity', data.requiredQuantity);
  assign('levels', data.noOfLevels);
  assign('loadPerPallet', data.loadPerPalletKg);
  assign('palletSize', data.palletMaterialSize);
  assign('rackLength', data.rackLength);
  assign('rackDepth', data.rackDepth);
  assign('rackHeightDim', data.rackHeight);
  assign('requiredRackHeight', data.requiredRackHeight);
  assign('areaLength', data.availableAreaLength);
  assign('areaWidth', data.availableAreaWidth);
  assign('clearHeight', data.clearHeight);
  assign('floorLoading', data.floorLoadingCapacity);
  assign('floorCondition', data.floorCondition);
  assign('existingRacking', data.existingRacking);
  assign('existingStorage', data.existingStorage);
  assign('sitePhotosAvailable', data.sitePhotosAvailable);
  assign('layoutAvailable', data.layoutAvailable);
  assign('forkLength', data.forkLengthCapacity);
  assign('liftingHeight', data.requiredLiftingHeight);
  assign('competitor', data.competitor);
  assign('decisionMaker', data.decisionMaker);
  assign('quotationRequiredBy', data.quotationRequiredBy);
  assign('expectedProjectDate', data.expectedProjectDate);
  assign('installationTimeline', data.installationTimeline);
  assign('budget', data.budgetAmount);
  if (Array.isArray(data.equipmentAvailable)) {
    details.availableForklift = data.equipmentAvailable.includes('FORKLIFT');
    details.availableReachTruck = data.equipmentAvailable.includes('REACH_TRUCK');
    details.availableStacker = data.equipmentAvailable.includes('STACKER');
  }
  if (Array.isArray(data.equipmentRequired)) {
    details.requiredForklift = data.equipmentRequired.includes('FORKLIFT');
    details.requiredReachTruck = data.equipmentRequired.includes('REACH_TRUCK');
    details.requiredStacker = data.equipmentRequired.includes('STACKER');
  }
  return details;
}

async function existingUserId(id) {
  if (!isUuid(id)) return null;
  const rows = await prisma.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid LIMIT 1`;
  return rows[0]?.id || null;
}

async function fetchLeadRows() {
  return prisma.$queryRaw`
    SELECT
      l.*,
      u.full_name AS owner_name,
      submitter.full_name AS submitter_name,
      q.customer_need AS qual_customer_need,
      q.expected_order_date,
      q.next_action,
      q.next_follow_up_date,
      q.remarks AS qualification_remarks,
      d.lead_source,
      d.plant_location,
      d.company_name AS detail_company_name,
      d.contact_person AS detail_contact_person,
      d.email AS detail_email,
      d.mobile AS detail_mobile,
      d.company_address AS detail_company_address,
      d.industry AS detail_industry,
      d.designation AS detail_designation,
      d.lead_date AS detail_lead_date
    FROM leads l
    LEFT JOIN users u ON u.id = l.owner_id
    LEFT JOIN users submitter ON submitter.id = l.last_submitted_by
    LEFT JOIN lead_qualification q ON q.lead_id = l.id
    LEFT JOIN lead_customer_details d ON d.lead_id = l.id
  `;
}

async function fetchLeadRow(id) {
  if (!isUuid(id)) return null;
  const rows = await prisma.$queryRaw`
    SELECT
      l.*,
      u.full_name AS owner_name,
      submitter.full_name AS submitter_name,
      q.customer_need AS qual_customer_need,
      q.expected_order_date,
      q.next_action,
      q.next_follow_up_date,
      q.remarks AS qualification_remarks,
      d.lead_source,
      d.plant_location,
      d.company_name AS detail_company_name,
      d.contact_person AS detail_contact_person,
      d.email AS detail_email,
      d.mobile AS detail_mobile,
      d.company_address AS detail_company_address,
      d.industry AS detail_industry,
      d.designation AS detail_designation,
      d.lead_date AS detail_lead_date
    FROM leads l
    LEFT JOIN users u ON u.id = l.owner_id
    LEFT JOIN users submitter ON submitter.id = l.last_submitted_by
    LEFT JOIN lead_qualification q ON q.lead_id = l.id
    LEFT JOIN lead_customer_details d ON d.lead_id = l.id
    WHERE l.id = ${id}::uuid
    LIMIT 1
  `;
  return rows[0] || null;
}

function shapeLead(row, extras = {}) {
  const details = asObject(row.details);
  const companyName = row.company_name || row.detail_company_name || row.title || '';
  const contactName = row.contact_person || row.detail_contact_person || null;
  const outputRequired = normalizeOutput(row.output_required);
  const createdAt = row.created_at;
  const submissionDeadline = calculateLeadSubmissionDeadline(createdAt);
  const hold = Boolean(details.outputOnHold);
  const shaped = withDeadlineFields({
    id: row.id,
    leadId: row.lead_code,
    leadDate: row.lead_date || row.detail_lead_date || createdAt,
    sourceCode: mapSource(row.source || row.lead_source || row.source_other),
    customerId: row.customer_id || null,
    industry: row.industry || row.detail_industry || null,
    salesPersonId: row.owner_id || null,
    priorityCode: row.priority || 'MEDIUM',
    statusCode: row.status,
    nextFollowUpDate: row.next_follow_up_date || toDate(details.nextFollowUpDate),
    customerNeed: row.qual_customer_need || details.customerNeed || null,
    expectedOrderDate: row.expected_order_date || toDate(details.expectedOrderDate),
    remarks: row.qualification_remarks || row.notes || details.customerCommercialRemarks || null,
    expectedProjectDate: toDate(details.expectedProjectDate),
    installationTimeline: details.installationTimeline || null,
    budgetCurrency: row.currency || 'INR',
    budgetAmount: toNumber(details.budget || row.estimated_value || row.basic_value || row.po_value),
    competitor: details.competitor || null,
    quotationRequiredBy: toDate(details.quotationRequiredBy),
    decisionMaker: details.decisionMaker || row.quotation_authority || null,
    outputRequired,
    submissionDeadline,
    outputStatus: null,
    outputCompletedAt: row.submitted_at || null,
    outputCompletedById: row.last_submitted_by || null,
    outputDelayDays: row.submitted_at ? calendarDelayDays(submissionDeadline, row.submitted_at) : null,
    outputOnHold: hold,
    holdReason: details.holdReason || row.send_back_reason || null,
    holdStartedAt: details.holdStartedAt || null,
    holdEndedAt: details.holdEndedAt || null,
    archived: Boolean(row.is_archived),
    createdById: row.created_by || null,
    createdAt,
    updatedAt: row.updated_at,
    customer: {
      id: row.customer_id || row.id,
      companyName,
      industry: row.industry || row.detail_industry || null,
      address: row.company_address || row.detail_company_address || null,
    },
    contact: {
      id: null,
      name: contactName,
      designation: row.designation || row.detail_designation || null,
      mobile: row.mobile || row.detail_mobile || null,
      email: row.contact_email || row.detail_email || null,
    },
    site: {
      id: null,
      name: row.site_location || row.plant_location || row.location || null,
      address: row.site_location || row.plant_location || row.location || null,
    },
    salesPerson: row.owner_id ? { id: row.owner_id, fullName: row.owner_name || 'Assigned owner', username: null } : null,
    outputCompletedBy: row.last_submitted_by ? { id: row.last_submitted_by, fullName: row.submitter_name || '—' } : null,
    requirement: requirementFromDetails(details, row),
    equipment: extras.equipment || equipmentFromDetails(details),
    checklist: extras.checklist || checklistArray(row.checklist),
    followUps: extras.followUps || [],
    revisions: extras.revisions || [],
    documents: extras.documents || [],
    comments: extras.comments || [],
    projects: extras.projects || [],
    activity: extras.activity || [],
    title: row.title,
    product: row.product || row.product_1 || null,
    sourceRaw: row.source || row.lead_source || null,
  });
  shaped.outputRequiredLabel = outputLabel(row.output_required || outputRequired);
  return shaped;
}

function matchesQuery(lead, query) {
  if (query.archived === 'all') {
    // include archived and active
  } else if (query.archived === 'true') {
    if (!lead.archived) return false;
  } else if (lead.archived) {
    return false;
  }

  if (query.q) {
    const q = String(query.q).toLowerCase();
    const hay = [
      lead.leadId,
      lead.customer?.companyName,
      lead.contact?.name,
      lead.salesPerson?.fullName,
      lead.title,
      lead.statusCode,
    ].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (query.status && lead.statusCode !== query.status) return false;
  if (query.priority && lead.priorityCode !== query.priority) return false;
  if (query.salesPersonId && lead.salesPersonId !== query.salesPersonId) return false;
  if (query.customerId && lead.customerId !== query.customerId && lead.customer?.id !== query.customerId) return false;
  if (query.outputRequired && lead.outputRequired !== query.outputRequired && lead.outputRequiredLabel !== query.outputRequired) {
    return false;
  }
  const outputStatus = query.outputStatus || query.deadlineStatus;
  if (outputStatus && lead.outputStatus !== outputStatus) return false;
  if (query.overdue === 'true') {
    if (!lead.nextFollowUpDate || new Date(lead.nextFollowUpDate) >= new Date()) return false;
    if (['WON', 'LOST'].includes(lead.statusCode)) return false;
  }
  if (query.from && lead.leadDate && new Date(lead.leadDate) < new Date(query.from)) return false;
  if (query.to && lead.leadDate && new Date(lead.leadDate) > new Date(query.to)) return false;
  const createdRange = istDateRange(query.createdDate);
  if (createdRange && lead.createdAt) {
    const t = new Date(lead.createdAt);
    if (t < createdRange.start || t >= createdRange.end) return false;
  }
  const deadlineRange = istDateRange(query.deadlineDate);
  if (deadlineRange && lead.submissionDeadline) {
    const t = new Date(lead.submissionDeadline);
    if (t < deadlineRange.start || t >= deadlineRange.end) return false;
  }
  return true;
}

function sortLeads(items, query) {
  const allowed = ['leadId', 'leadDate', 'createdAt', 'nextFollowUpDate', 'statusCode', 'submissionDeadline'];
  const field = allowed.includes(query.sort) ? query.sort : 'createdAt';
  const dir = query.dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const rawA = a[field];
    const rawB = b[field];
    const dateA = rawA ? Date.parse(rawA) : NaN;
    const dateB = rawB ? Date.parse(rawB) : NaN;
    const av = Number.isNaN(dateA) ? String(rawA || '') : dateA;
    const bv = Number.isNaN(dateB) ? String(rawB || '') : dateB;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

async function exists(id) {
  if (!isUuid(id)) return false;
  const rows = await prisma.$queryRaw`SELECT id FROM leads WHERE id = ${id}::uuid LIMIT 1`;
  return Boolean(rows[0]);
}

async function listLeads(query) {
  const { skip, take, page, pageSize } = parsePagination(query);
  const rows = await fetchLeadRows();
  const shaped = sortLeads(
    rows.map((row) => shapeLead(row)).filter((lead) => matchesQuery(lead, query)),
    query
  );
  return paginated(shaped.slice(skip, skip + take), shaped.length, page, pageSize);
}

async function getLead(id) {
  const row = await fetchLeadRow(id);
  if (!row) throw new AppError(404, 'Lead not found.');

  const [documents, followUps, projects, stfActivity, appActivity] = await Promise.all([
    prisma.$queryRaw`
      SELECT id, file_name, document_type, file_url, created_at, uploaded_by, mime_type
      FROM lead_documents WHERE lead_id = ${id}::uuid ORDER BY created_at DESC
    `,
    prisma.$queryRaw`
      SELECT f.*, u.full_name AS created_name
      FROM lead_followups f
      LEFT JOIN users u ON u.id = f.created_by
      WHERE f.lead_id = ${id}::uuid
      ORDER BY f.followup_at DESC
    `,
    prisma.$queryRaw`
      SELECT id, project_code, name, status, current_stage
      FROM projects WHERE lead_id = ${id}::uuid
    `,
    prisma.$queryRaw`
      SELECT a.id, a.action, a.details, a.created_at, u.full_name
      FROM lead_activity a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.lead_id = ${id}::uuid
      ORDER BY a.created_at DESC
    `,
    prisma.activityLog.findMany({
      where: { entity: 'Lead', entityId: id },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { timestamp: 'desc' },
      take: 100,
    }),
  ]);

  const activity = [
    ...stfActivity.map((item) => ({
      id: item.id,
      action: item.action || 'ACTIVITY',
      description: typeof item.details === 'string' ? item.details : JSON.stringify(item.details || {}),
      timestamp: item.created_at,
      user: item.full_name ? { fullName: item.full_name } : null,
    })),
    ...appActivity.map((item) => ({
      id: item.id,
      action: item.action,
      description: item.description,
      oldValue: item.oldValue,
      newValue: item.newValue,
      timestamp: item.timestamp,
      user: item.user,
    })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return shapeLead(row, {
    documents: documents.map((doc) => ({
      id: doc.id,
      originalName: doc.file_name,
      categoryCode: doc.document_type,
      revision: 'R0',
      uploadedAt: doc.created_at,
      fileUrl: doc.file_url,
    })),
    followUps: followUps.map((item) => ({
      id: item.id,
      followUpDate: item.followup_at,
      typeCode: 'PHONE',
      discussion: item.notes,
      customerFeedback: null,
      nextAction: item.next_action,
      nextFollowUpDate: null,
      statusCode: item.status,
      remarks: item.notes,
      salesPerson: item.created_name ? { fullName: item.created_name } : null,
    })),
    projects: projects.map((project) => ({
      id: project.id,
      projectId: project.project_code,
      name: project.name,
      currentStatusCode: project.status || project.current_stage,
    })),
    activity,
  });
}

async function nextLeadCode() {
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(MAX(CAST(substring(lead_code from 'ENQ-([0-9]+)') AS int)), 0) AS n
    FROM leads
    WHERE lead_code ~ 'ENQ-[0-9]+'
  `;
  const n = Number(rows[0]?.n || 0) + 1;
  return `SCY-26-ENQ-${String(n).padStart(3, '0')}-R0`;
}

async function createLead(data, user) {
  const id = crypto.randomUUID();
  const leadCode = await nextLeadCode();
  const companyName = data.companyName || data.title;
  const createdAt = new Date();
  const details = mergeDetails({}, data);
  const checklist = Array.isArray(data.checklist) && data.checklist.length
    ? checklistObject(data.checklist)
    : checklistObject(CHECKLIST_ITEMS.map(([itemCode, jsonKey, label]) => ({ itemCode, jsonKey, label, completed: false })));
  const ownerId = await existingUserId(data.salesPersonId);
  const createdBy = await existingUserId(user?.id);

  await prisma.$executeRaw`
    INSERT INTO leads (
      id, lead_code, title, status, details, checklist, is_archived,
      company_name, industry, contact_person, designation, mobile, contact_email,
      company_address, site_location, lead_date, priority, output_required,
      notes, owner_id, created_by, created_at, updated_at, currency
    ) VALUES (
      ${id}::uuid,
      ${leadCode},
      ${companyName},
      ${data.statusCode || 'FOLLOW_UP'},
      ${JSON.stringify(details)}::jsonb,
      ${JSON.stringify(checklist)}::jsonb,
      false,
      ${companyName || null},
      ${data.industry || null},
      ${data.contactPerson || null},
      ${data.designation || null},
      ${data.mobile || null},
      ${data.email || null},
      ${data.companyAddress || null},
      ${data.plantLocation || null},
      ${toDate(data.leadDate) || createdAt},
      ${data.priorityCode || 'MEDIUM'},
      ${dbOutputValue(data.outputRequired)},
      ${data.remarks || null},
      ${ownerId}::uuid,
      ${createdBy}::uuid,
      ${createdAt},
      ${createdAt},
      ${data.budgetCurrency || 'INR'}
    )
  `;

  await prisma.$executeRaw`
    INSERT INTO lead_customer_details (
      id, lead_id, lead_date, lead_source, company_name, industry, contact_person,
      designation, mobile, email, company_address, plant_location, created_at, updated_at
    ) VALUES (
      ${crypto.randomUUID()}::uuid,
      ${id}::uuid,
      ${toDate(data.leadDate) || createdAt},
      ${data.sourceCode || null},
      ${companyName || null},
      ${data.industry || null},
      ${data.contactPerson || null},
      ${data.designation || null},
      ${data.mobile || null},
      ${data.email || null},
      ${data.companyAddress || null},
      ${data.plantLocation || null},
      ${createdAt},
      ${createdAt}
    )
  `;

  await prisma.$executeRaw`
    INSERT INTO lead_qualification (
      id, lead_id, customer_need, expected_order_date, next_action, next_follow_up_date, remarks, created_at, updated_at
    ) VALUES (
      ${crypto.randomUUID()}::uuid,
      ${id}::uuid,
      ${data.customerNeed || null},
      ${toDate(data.expectedOrderDate)},
      ${null},
      ${toDate(data.nextFollowUpDate)},
      ${data.remarks || null},
      ${createdAt},
      ${createdAt}
    )
  `;

  await logActivity({
    userId: user.id,
    action: 'LEAD_CREATED',
    entity: 'Lead',
    entityId: id,
    description: `${formatIstDateTime(createdAt)} — ${user.fullName || 'User'} created ${leadCode}. Output Required: ${outputLabel(data.outputRequired)}. Submission Deadline: ${formatDeadlineDate(calculateLeadSubmissionDeadline(createdAt))}`,
  });

  return getLead(id);
}

async function updateLead(id, data, user) {
  const row = await fetchLeadRow(id);
  if (!row) throw new AppError(404, 'Lead not found.');
  const details = mergeDetails(row.details, data);
  const ownerId = data.salesPersonId ? await existingUserId(data.salesPersonId) : row.owner_id;
  const checklist = Array.isArray(data.checklist) ? checklistObject(data.checklist) : asObject(row.checklist);
  const companyName = data.companyName !== undefined ? data.companyName : row.company_name;

  await prisma.$executeRaw`
    UPDATE leads SET
      title = ${companyName || row.title},
      company_name = ${companyName || row.company_name},
      industry = ${data.industry !== undefined ? data.industry : row.industry},
      contact_person = ${data.contactPerson !== undefined ? data.contactPerson : row.contact_person},
      designation = ${data.designation !== undefined ? data.designation : row.designation},
      mobile = ${data.mobile !== undefined ? data.mobile : row.mobile},
      contact_email = ${data.email !== undefined ? data.email : row.contact_email},
      company_address = ${data.companyAddress !== undefined ? data.companyAddress : row.company_address},
      site_location = ${data.plantLocation !== undefined ? data.plantLocation : row.site_location},
      lead_date = ${data.leadDate ? toDate(data.leadDate) : row.lead_date},
      priority = ${data.priorityCode !== undefined ? data.priorityCode : row.priority},
      status = ${data.statusCode !== undefined ? data.statusCode : row.status},
      output_required = ${data.outputRequired !== undefined ? dbOutputValue(data.outputRequired) : row.output_required},
      notes = ${data.remarks !== undefined ? data.remarks : row.notes},
      owner_id = ${ownerId}::uuid,
      details = ${JSON.stringify(details)}::jsonb,
      checklist = ${JSON.stringify(checklist)}::jsonb,
      updated_at = ${new Date()}
    WHERE id = ${id}::uuid
  `;

  await prisma.$executeRaw`
    UPDATE lead_qualification SET
      customer_need = ${data.customerNeed !== undefined ? data.customerNeed : row.qual_customer_need},
      expected_order_date = ${data.expectedOrderDate !== undefined ? toDate(data.expectedOrderDate) : row.expected_order_date},
      next_follow_up_date = ${data.nextFollowUpDate !== undefined ? toDate(data.nextFollowUpDate) : row.next_follow_up_date},
      remarks = ${data.remarks !== undefined ? data.remarks : row.qualification_remarks},
      updated_at = ${new Date()}
    WHERE lead_id = ${id}::uuid
  `;

  await prisma.$executeRaw`
    UPDATE lead_customer_details SET
      company_name = ${companyName || row.detail_company_name},
      industry = ${data.industry !== undefined ? data.industry : row.detail_industry},
      contact_person = ${data.contactPerson !== undefined ? data.contactPerson : row.detail_contact_person},
      designation = ${data.designation !== undefined ? data.designation : row.detail_designation},
      mobile = ${data.mobile !== undefined ? data.mobile : row.detail_mobile},
      email = ${data.email !== undefined ? data.email : row.detail_email},
      company_address = ${data.companyAddress !== undefined ? data.companyAddress : row.detail_company_address},
      plant_location = ${data.plantLocation !== undefined ? data.plantLocation : row.plant_location},
      lead_date = ${data.leadDate ? toDate(data.leadDate) : row.detail_lead_date},
      updated_at = ${new Date()}
    WHERE lead_id = ${id}::uuid
  `;

  await logActivity({
    userId: user.id,
    action: 'LEAD_UPDATED',
    entity: 'Lead',
    entityId: id,
    description: `Lead ${row.lead_code} updated`,
  });
  return getLead(id);
}

async function changeStatus(id, statusCode, reason, user) {
  const row = await fetchLeadRow(id);
  if (!row) throw new AppError(404, 'Lead not found.');
  await prisma.$executeRaw`
    UPDATE leads SET status = ${statusCode}, updated_at = ${new Date()} WHERE id = ${id}::uuid
  `;
  await logActivity({
    userId: user.id,
    action: 'STATUS_CHANGED',
    entity: 'Lead',
    entityId: id,
    oldValue: row.status,
    newValue: statusCode,
    description: reason || `Lead status changed to ${statusCode}`,
  });
  await logAudit({
    userId: user.id,
    ip: user.ip,
    entity: 'Lead',
    entityId: id,
    action: 'STATUS_CHANGE',
    previous: { statusCode: row.status },
    next: { statusCode, reason },
  });
  return getLead(id);
}

async function archiveLead(id, user) {
  const row = await fetchLeadRow(id);
  if (!row) throw new AppError(404, 'Lead not found.');
  await prisma.$executeRaw`
    UPDATE leads SET is_archived = true, updated_at = ${new Date()} WHERE id = ${id}::uuid
  `;
  await logActivity({
    userId: user.id,
    action: 'LEAD_ARCHIVED',
    entity: 'Lead',
    entityId: id,
    description: `${row.lead_code} archived`,
  });
  return getLead(id);
}

async function toggleChecklist(leadId, itemCode, completed, user) {
  const row = await fetchLeadRow(leadId);
  if (!row) throw new AppError(404, 'Lead not found.');
  const match = CHECKLIST_ITEMS.find(([code, key]) => code === itemCode || key === itemCode);
  if (!match) throw new AppError(400, 'Unknown checklist item.');
  const checklist = asObject(row.checklist);
  checklist[match[1]] = Boolean(completed);
  await prisma.$executeRaw`
    UPDATE leads SET checklist = ${JSON.stringify(checklist)}::jsonb, updated_at = ${new Date()}
    WHERE id = ${leadId}::uuid
  `;
  await logActivity({
    userId: user.id,
    action: 'CHECKLIST_UPDATED',
    entity: 'Lead',
    entityId: leadId,
    description: `${match[2]} ${completed ? 'completed' : 'reopened'}`,
  });
  return { itemCode: match[0], label: match[2], completed: Boolean(completed) };
}

async function addFollowUp(leadId, data, user) {
  const row = await fetchLeadRow(leadId);
  if (!row) throw new AppError(404, 'Lead not found.');
  if (!data.followUpDate) throw new AppError(400, 'Follow-up date is needed.', { field: 'followUpDate' });
  const id = crypto.randomUUID();
  const createdBy = await existingUserId(user.id);
  const followUpDate = toDate(data.followUpDate) || new Date();
  await prisma.$executeRaw`
    INSERT INTO lead_followups (
      id, lead_id, followup_at, notes, created_by, created_at, updated_at, next_action, status
    ) VALUES (
      ${id}::uuid,
      ${leadId}::uuid,
      ${followUpDate},
      ${data.discussion || data.remarks || null},
      ${createdBy}::uuid,
      ${new Date()},
      ${new Date()},
      ${data.nextAction || null},
      ${data.statusCode || 'OPEN'}
    )
  `;
  if (data.nextFollowUpDate) {
    await prisma.$executeRaw`
      UPDATE lead_qualification SET next_follow_up_date = ${toDate(data.nextFollowUpDate)}, updated_at = ${new Date()}
      WHERE lead_id = ${leadId}::uuid
    `;
  }
  await logActivity({
    userId: user.id,
    action: 'FOLLOW_UP_ADDED',
    entity: 'Lead',
    entityId: leadId,
    description: `Follow-up added on ${followUpDate.toISOString().slice(0, 10)}`,
  });
  return { id, followUpDate, discussion: data.discussion, nextAction: data.nextAction };
}

async function addRemark(leadId, body, user) {
  const row = await fetchLeadRow(leadId);
  if (!row) throw new AppError(404, 'Lead not found.');
  await logActivity({
    userId: user.id,
    action: 'REMARK_ADDED',
    entity: 'Lead',
    entityId: leadId,
    description: String(body || '').slice(0, 120),
  });
  return { id: crypto.randomUUID(), body, userId: user.id };
}

async function addRevision(leadId, data, user) {
  const row = await fetchLeadRow(leadId);
  if (!row) throw new AppError(404, 'Lead not found.');
  await logActivity({
    userId: user.id,
    action: 'REVISION_CREATED',
    entity: 'Lead',
    entityId: leadId,
    description: `${data.category || 'Revision'} ${data.revisionNumber || ''} created`,
  });
  return {
    id: crypto.randomUUID(),
    category: data.category,
    revisionNumber: data.revisionNumber || 'R0',
    reason: data.reason || null,
    statusCode: data.statusCode || 'DRAFT',
  };
}

async function markOutputSubmitted(id, completed, user) {
  const row = await fetchLeadRow(id);
  if (!row) throw new AppError(404, 'Lead not found.');
  if (completed === false) {
    await prisma.$executeRaw`
      UPDATE leads SET submitted_at = NULL, last_submitted_by = NULL, updated_at = ${new Date()}
      WHERE id = ${id}::uuid
    `;
    await logActivity({
      userId: user.id,
      action: 'OUTPUT_REOPENED',
      entity: 'Lead',
      entityId: id,
      description: `Output marked incomplete for ${row.lead_code}. Deadline preserved.`,
    });
    return getLead(id);
  }
  const at = new Date();
  const submitter = await existingUserId(user.id);
  await prisma.$executeRaw`
    UPDATE leads SET submitted_at = ${at}, last_submitted_by = ${submitter}::uuid, updated_at = ${at}
    WHERE id = ${id}::uuid
  `;
  const deadline = calculateLeadSubmissionDeadline(row.created_at);
  const delayDays = Math.max(0, calendarDelayDays(deadline, at));
  await logActivity({
    userId: user.id,
    action: 'OUTPUT_SUBMITTED',
    entity: 'Lead',
    entityId: id,
    description: `Output submitted for ${row.lead_code} at ${formatIstDateTime(at)}. Status: COMPLETED. Submission delay: ${delayDays} day${delayDays === 1 ? '' : 's'}.`,
  });
  return getLead(id);
}

async function setOutputHold(id, data, user) {
  const row = await fetchLeadRow(id);
  if (!row) throw new AppError(404, 'Lead not found.');
  if (row.submitted_at) throw new AppError(400, 'Completed output cannot be placed on hold.');
  const onHold = data.onHold !== false;
  const details = asObject(row.details);
  details.outputOnHold = onHold;
  details.holdReason = onHold ? (data.reason || details.holdReason) : details.holdReason;
  details.holdStartedAt = onHold ? (details.holdStartedAt || new Date().toISOString()) : details.holdStartedAt;
  details.holdEndedAt = onHold ? null : new Date().toISOString();
  await prisma.$executeRaw`
    UPDATE leads SET details = ${JSON.stringify(details)}::jsonb, updated_at = ${new Date()}
    WHERE id = ${id}::uuid
  `;
  await logActivity({
    userId: user.id,
    action: onHold ? 'OUTPUT_ON_HOLD' : 'OUTPUT_RESUMED',
    entity: 'Lead',
    entityId: id,
    description: onHold
      ? `${row.lead_code} output placed ON HOLD${data.reason ? `: ${data.reason}` : ''}.`
      : `${row.lead_code} taken off hold.`,
  });
  return getLead(id);
}

async function addDocument(leadId, file, categoryCode, userId) {
  const row = await fetchLeadRow(leadId);
  if (!row) throw new AppError(404, 'Lead not found.');
  const id = crypto.randomUUID();
  const uploadedBy = await existingUserId(userId);
  const rel = file?.path ? String(file.path).replace(/\\/g, '/') : null;
  await prisma.$executeRaw`
    INSERT INTO lead_documents (
      id, lead_id, file_name, file_url, document_type, uploaded_by, created_at, updated_at, mime_type, file_size, stored_name
    ) VALUES (
      ${id}::uuid,
      ${leadId}::uuid,
      ${file.originalname || file.filename},
      ${rel},
      ${categoryCode || 'OTHER'},
      ${uploadedBy}::uuid,
      ${new Date()},
      ${new Date()},
      ${file.mimetype || null},
      ${file.size || null},
      ${file.filename || null}
    )
  `;
  return {
    id,
    originalName: file.originalname || file.filename,
    categoryCode: categoryCode || 'OTHER',
    revision: 'R0',
    uploadedAt: new Date(),
  };
}

module.exports = {
  exists,
  listLeads,
  getLead,
  createLead,
  updateLead,
  changeStatus,
  archiveLead,
  toggleChecklist,
  addFollowUp,
  addRemark,
  addRevision,
  markOutputSubmitted,
  setOutputHold,
  addDocument,
};
