const { Prisma } = require('@prisma/client');
const { prisma } = require('../prisma');
const { AppError } = require('../utils/errors');
const { can } = require('../middleware/authorize');
const { calendarDayKey } = require('../utils/leadDeadline');
const orders = require('./orderConversionService');
const timing = require('./manufacturingLeadTime');

function actor(user) {
  return user?.fullName || user?.username || 'User';
}

function canEdit(user) {
  if (!user) return false;
  if (user.roles?.some((role) => role.code === 'ADMIN' || role.isManagement)) return true;
  return can(user, 'production.edit');
}

function idList(ids) {
  return Prisma.join(ids.map((id) => Prisma.sql`CAST(${String(id)} AS uuid)`));
}

function parseDay(value, label) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new AppError(400, `${label} is not valid.`);
  return new Date(`${text}T00:00:00.000Z`);
}

function dayText(value) {
  return value ? calendarDayKey(value) : '';
}

function projectLabel(order) {
  if (!order) return '—';
  return order.orderNo || order.projectCode || '—';
}

async function lookupStatuses() {
  try {
    const rows = await prisma.$queryRaw`
      SELECT code, label FROM "Lookup"
      WHERE type = 'MANUFACTURING_LEAD_STATUS' AND active = true
      ORDER BY "sortOrder" ASC, label ASC
    `;
    if (rows.length) return rows.map((row) => ({ code: String(row.code), label: row.label }));
  } catch (error) {
    console.error('Manufacturing lead time statuses could not be loaded.', error);
  }
  return timing.STATUSES;
}

async function poDateMap(projectIds) {
  if (!projectIds.length) return new Map();
  const ids = idList(projectIds);
  try {
    const rows = await prisma.$queryRaw`
      SELECT id::text AS id, po_date FROM projects WHERE id IN (${ids})
    `;
    return new Map(rows.map((row) => [String(row.id), row.po_date || null]));
  } catch (error) {
    if (String(error.message || '').includes('po_date')) return new Map();
    throw error;
  }
}

function shapeOrder(project, poDate) {
  return {
    id: project.id,
    orderNo: project.orderId || null,
    projectCode: project.projectId,
    customer: project.customer || '—',
    poDate: poDate || null,
    poDateInput: poDate ? calendarDayKey(poDate) : '',
    currentStageCode: project.currentStageCode,
  };
}

async function loadRows() {
  try {
    return await prisma.$queryRaw`
      SELECT * FROM otr_manufacturing_lead_times
      WHERE archived_at IS NULL
      ORDER BY updated_at DESC
    `;
  } catch (error) {
    if (String(error.message || '').includes('otr_manufacturing_lead_times')) {
      throw new AppError(503, 'Manufacturing & Lead Time storage is not ready.');
    }
    throw error;
  }
}

function shapeRecord(row, order) {
  const linked = order || {};
  const dates = {
    poAt: row.po_at || null,
    drawingAt: row.drawing_approval_at || null,
    materialAt: row.material_ready_at || null,
    startedAt: row.manufacturing_started_at || null,
    completedAt: row.manufacturing_completed_at || null,
    dispatchAt: row.dispatch_at || null,
    deliveryAt: row.delivery_at || null,
  };
  const manufacturing = timing.manufacturingTime(dates.startedAt, dates.completedAt);
  const lead = timing.leadTime(dates.poAt, dates.deliveryAt, dates.startedAt, dates.completedAt);
  const status = timing.normalize(row.status);
  return {
    id: row.id,
    projectId: row.project_id,
    orderNo: linked.orderNo || null,
    projectCode: linked.projectCode || null,
    projectLabel: projectLabel(linked),
    customer: linked.customer || '—',
    currentStageCode: linked.currentStageCode || null,
    poAt: dates.poAt,
    poDateInput: dayText(dates.poAt),
    drawingApprovalAt: dates.drawingAt,
    drawingApprovalDateInput: dayText(dates.drawingAt),
    materialReadyAt: dates.materialAt,
    materialReadyDateInput: dayText(dates.materialAt),
    manufacturingStartedAt: dates.startedAt,
    manufacturingStartDateInput: dayText(dates.startedAt),
    manufacturingCompletedAt: dates.completedAt,
    manufacturingCompleteDateInput: dayText(dates.completedAt),
    dispatchAt: dates.dispatchAt,
    dispatchDateInput: dayText(dates.dispatchAt),
    deliveryAt: dates.deliveryAt,
    deliveryDateInput: dayText(dates.deliveryAt),
    manufacturingDays: manufacturing.days,
    manufacturingOpen: manufacturing.open,
    manufacturingTimeLabel: manufacturing.label,
    leadDays: lead.days,
    leadOpen: lead.open,
    leadTimeLabel: lead.label,
    status,
    statusLabel: timing.labelOf(status),
    statusLocked: Boolean(row.status_locked),
    suggestedStatus: timing.derivedStatus(dates),
    suggestedStatusLabel: timing.labelOf(timing.derivedStatus(dates)),
  };
}

async function listTracking(user) {
  const [rows, otr, statuses] = await Promise.all([
    loadRows(),
    orders.listOtr(),
    lookupStatuses(),
  ]);
  const projectIds = [...new Set([
    ...rows.map((row) => String(row.project_id)),
    ...otr.items.map((item) => String(item.id)),
  ])];
  const poDates = await poDateMap(projectIds);
  const orderById = new Map(otr.items.map((item) => [
    String(item.id),
    shapeOrder(item, poDates.get(String(item.id))),
  ]));
  const activeProjects = new Set(rows.map((row) => String(row.project_id)));
  const items = rows
    .map((row) => shapeRecord(row, orderById.get(String(row.project_id))))
    .sort((a, b) => String(a.projectLabel).localeCompare(String(b.projectLabel)));
  const eligible = otr.items
    .filter((item) => !activeProjects.has(String(item.id)))
    .map((item) => orderById.get(String(item.id)))
    .filter(Boolean)
    .sort((a, b) => String(projectLabel(a)).localeCompare(String(projectLabel(b))));
  return { canEdit: canEdit(user), items, orders: eligible, statuses };
}

function readDates(body) {
  const data = body || {};
  const dates = {
    poAt: parseDay(data.poDate, 'PO date') || null,
    drawingAt: parseDay(data.drawingApprovalDate, 'Drawing approval date') || null,
    materialAt: parseDay(data.materialReadyDate, 'Material ready date') || null,
    startedAt: parseDay(data.manufacturingStartDate, 'Manufacturing start date') || null,
    completedAt: parseDay(data.manufacturingCompleteDate, 'Manufacturing complete date') || null,
    dispatchAt: parseDay(data.dispatchDate, 'Dispatch date') || null,
    deliveryAt: parseDay(data.deliveryDate, 'Delivery date') || null,
  };
  if (dates.startedAt && dates.completedAt && dates.completedAt < dates.startedAt) {
    throw new AppError(400, 'Manufacturing complete date cannot be before the manufacturing start date.');
  }
  return dates;
}

async function readPayload(body) {
  const dates = readDates(body);
  const derived = timing.derivedStatus(dates);
  const statuses = await lookupStatuses();
  if (body?.statusOverride) {
    const status = timing.normalize(body.status);
    if (!statuses.some((row) => row.code === status)) throw new AppError(400, 'Choose a status.');
    return { ...dates, status, statusLocked: status !== derived, derived };
  }
  return { ...dates, status: derived, statusLocked: false, derived };
}

async function projectInOtr(projectId) {
  const otr = await orders.listOtr();
  const project = otr.items.find((item) => String(item.id) === String(projectId));
  if (!project) throw new AppError(404, 'This order is not in the OTR workflow.');
  return project;
}

async function insertEvents(tx, recordId, projectId, events, user, now) {
  for (const event of events) {
    await tx.$executeRaw`
      INSERT INTO otr_manufacturing_lead_events (
        record_id, project_id, action, field_name, previous_value, new_value, user_id, user_name, created_at
      ) VALUES (
        CAST(${String(recordId)} AS uuid),
        CAST(${String(projectId)} AS uuid),
        ${event.action},
        ${event.field || null},
        ${event.previous ?? null},
        ${event.next ?? null},
        CAST(${String(user.id)} AS uuid),
        ${actor(user)},
        ${now}
      )
    `;
  }
}

async function writePoDate(tx, projectId, poAt) {
  const day = poAt ? calendarDayKey(poAt) : null;
  await tx.$executeRaw`
    UPDATE projects
    SET po_date = CAST(${day} AS date)
    WHERE id = CAST(${String(projectId)} AS uuid)
  `;
}

function isDuplicate(error) {
  const text = `${error?.message || ''} ${error?.meta?.message || ''}`;
  return error?.meta?.code === '23505' || text.includes('otr_mfg_lead_active_project');
}

async function createRecord(body, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  const fields = await readPayload(body);
  if (!body?.projectId) throw new AppError(400, 'Choose a project or order.');
  const project = await projectInOtr(body.projectId);
  const now = new Date();
  const name = actor(user);
  const events = [
    { action: 'Created', field: 'Record', previous: null, next: project.orderId || project.projectId },
    { action: 'Updated', field: 'Status', previous: null, next: timing.labelOf(fields.status) },
  ];
  const dateEvents = [
    ['PO Date', fields.poAt],
    ['Drawing Approval Date', fields.drawingAt],
    ['Material Ready Date', fields.materialAt],
    ['Manufacturing Start', fields.startedAt],
    ['Manufacturing Complete', fields.completedAt],
    ['Dispatch Date', fields.dispatchAt],
    ['Delivery Date', fields.deliveryAt],
  ];
  for (const [field, value] of dateEvents) {
    if (!value) continue;
    events.push({ action: 'Updated', field, previous: null, next: dayText(value) });
  }
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`
        INSERT INTO otr_manufacturing_lead_times (
          project_id, po_at, drawing_approval_at, material_ready_at, manufacturing_started_at,
          manufacturing_completed_at, dispatch_at, delivery_at, status, status_locked,
          created_by, created_by_name, updated_by, updated_by_name, created_at, updated_at
        ) VALUES (
          CAST(${String(project.id)} AS uuid),
          ${fields.poAt},
          ${fields.drawingAt},
          ${fields.materialAt},
          ${fields.startedAt},
          ${fields.completedAt},
          ${fields.dispatchAt},
          ${fields.deliveryAt},
          ${fields.status},
          ${fields.statusLocked},
          CAST(${String(user.id)} AS uuid),
          ${name},
          CAST(${String(user.id)} AS uuid),
          ${name},
          ${now},
          ${now}
        )
        RETURNING id
      `;
      await writePoDate(tx, project.id, fields.poAt);
      await insertEvents(tx, rows[0].id, project.id, events, user, now);
      return rows[0];
    });
  } catch (error) {
    if (isDuplicate(error)) throw new AppError(400, 'This order already has a Manufacturing & Lead Time record.');
    throw error;
  }
  return { id: created.id };
}

async function loadActive(id) {
  const rows = await prisma.$queryRaw`
    SELECT * FROM otr_manufacturing_lead_times
    WHERE id = CAST(${String(id)} AS uuid) AND archived_at IS NULL
    LIMIT 1
  `;
  if (!rows[0]) throw new AppError(404, 'Manufacturing & Lead Time record not found.');
  return rows[0];
}

async function getRecord(id) {
  const row = await loadActive(id);
  const project = await projectInOtr(row.project_id);
  const poDates = await poDateMap([row.project_id]);
  return shapeRecord(row, shapeOrder(project, poDates.get(String(row.project_id))));
}

async function updateRecord(id, body, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  const existing = await loadActive(id);
  const fields = await readPayload(body);
  const now = new Date();
  const events = [];
  function track(field, previous, next) {
    if ((previous || '') === (next || '')) return;
    events.push({ action: 'Updated', field, previous: previous || '—', next: next || '—' });
  }
  track('PO Date', dayText(existing.po_at), dayText(fields.poAt));
  track('Drawing Approval Date', dayText(existing.drawing_approval_at), dayText(fields.drawingAt));
  track('Material Ready Date', dayText(existing.material_ready_at), dayText(fields.materialAt));
  track('Manufacturing Start', dayText(existing.manufacturing_started_at), dayText(fields.startedAt));
  track('Manufacturing Complete', dayText(existing.manufacturing_completed_at), dayText(fields.completedAt));
  track('Dispatch Date', dayText(existing.dispatch_at), dayText(fields.dispatchAt));
  track('Delivery Date', dayText(existing.delivery_at), dayText(fields.deliveryAt));
  track('Status', timing.labelOf(existing.status), timing.labelOf(fields.status));
  if (!events.length) return { id: existing.id, changed: false };
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE otr_manufacturing_lead_times
      SET po_at = ${fields.poAt},
          drawing_approval_at = ${fields.drawingAt},
          material_ready_at = ${fields.materialAt},
          manufacturing_started_at = ${fields.startedAt},
          manufacturing_completed_at = ${fields.completedAt},
          dispatch_at = ${fields.dispatchAt},
          delivery_at = ${fields.deliveryAt},
          status = ${fields.status},
          status_locked = ${fields.statusLocked},
          updated_by = CAST(${String(user.id)} AS uuid),
          updated_by_name = ${actor(user)},
          updated_at = ${now}
      WHERE id = CAST(${String(existing.id)} AS uuid) AND archived_at IS NULL
    `;
    await writePoDate(tx, existing.project_id, fields.poAt);
    await insertEvents(tx, existing.id, existing.project_id, events, user, now);
  });
  return { id: existing.id, changed: true };
}

async function archiveRecord(id, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  const existing = await loadActive(id);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE otr_manufacturing_lead_times
      SET archived_at = ${now},
          archived_by_name = ${actor(user)},
          updated_by = CAST(${String(user.id)} AS uuid),
          updated_by_name = ${actor(user)},
          updated_at = ${now}
      WHERE id = CAST(${String(existing.id)} AS uuid) AND archived_at IS NULL
    `;
    await insertEvents(tx, existing.id, existing.project_id, [{
      action: 'Deleted',
      field: 'Record',
      previous: timing.labelOf(existing.status),
      next: 'Archived',
    }], user, now);
  });
  return { id: existing.id };
}

async function history(id) {
  const existing = await prisma.$queryRaw`
    SELECT id FROM otr_manufacturing_lead_times WHERE id = CAST(${String(id)} AS uuid) LIMIT 1
  `;
  if (!existing[0]) throw new AppError(404, 'Manufacturing & Lead Time record not found.');
  const rows = await prisma.$queryRaw`
    SELECT * FROM otr_manufacturing_lead_events
    WHERE record_id = CAST(${String(id)} AS uuid)
    ORDER BY created_at DESC
    LIMIT 200
  `;
  return {
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      field: row.field_name || '—',
      previousValue: row.previous_value || '—',
      newValue: row.new_value || '—',
      userName: row.user_name || '—',
      createdAt: row.created_at,
    })),
  };
}

module.exports = {
  listTracking,
  getRecord,
  createRecord,
  updateRecord,
  archiveRecord,
  history,
};
