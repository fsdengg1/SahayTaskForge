const { Prisma } = require('@prisma/client');
const { prisma } = require('../prisma');
const { AppError } = require('../utils/errors');
const { can } = require('../middleware/authorize');
const { calendarDayKey } = require('../utils/leadDeadline');
const orders = require('./orderConversionService');
const progress = require('./productionProgress');

const PRODUCTION_ROLES = ['PPC_MANAGER', 'PROD_SUPER', 'QC_MANAGER', 'QC_ENG'];

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

function textOrNull(value, limit) {
  const text = String(value || '').trim().slice(0, limit);
  return text || null;
}

function sameDay(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return calendarDayKey(left) === calendarDayKey(right);
}

function locationOf(row, fallback) {
  const value = String(row?.site_location || row?.lead_location || row?.company_address || '').trim();
  if (value) return value;
  if (fallback && fallback !== '—') return fallback;
  return '—';
}

function productOf(row, labels, fallback) {
  const details = row?.details && typeof row.details === 'object' ? row.details : {};
  const raw = String(row?.product || row?.product_1 || row?.type_of_storage || details.storageMethod || details.materialToStore || '').trim();
  if (raw) return labels.get(raw) || raw;
  if (fallback && fallback !== '—') return fallback;
  return '—';
}

async function storageLabels() {
  try {
    const rows = await prisma.$queryRaw`
      SELECT code, label FROM "Lookup"
      WHERE type = 'STORAGE_METHOD' AND active = true
    `;
    return new Map(rows.map((row) => [String(row.code), row.label]));
  } catch {
    return new Map();
  }
}

async function stageOptions() {
  try {
    const rows = await prisma.$queryRaw`
      SELECT code, label FROM "Lookup"
      WHERE type = 'PRODUCTION_STAGE' AND active = true
      ORDER BY "sortOrder" ASC, label ASC
    `;
    if (rows.length) {
      return rows.map((row) => ({ code: String(row.code), label: row.label || progress.labelOf(row.code, progress.STAGE_LABELS) }));
    }
  } catch (error) {
    console.error('Production stages could not be loaded from lookups.', error);
  }
  return progress.STAGES;
}

async function assignees() {
  const codes = Prisma.join(PRODUCTION_ROLES);
  try {
    return await prisma.$queryRaw`
      SELECT u.id::text AS id, u.full_name AS "fullName", r.code AS role, r.name AS "roleName"
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE COALESCE(u.is_active, true) = true
        AND u.full_name IS NOT NULL
        AND btrim(u.full_name) <> ''
        AND r.code IN (${codes})
      ORDER BY u.full_name ASC
    `;
  } catch (error) {
    console.error('Production assignees could not be loaded.', error);
    return [];
  }
}

async function assertAssignee(id) {
  if (!id) return null;
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new AppError(400, 'Choose a production team member.');
  const codes = Prisma.join(PRODUCTION_ROLES);
  const rows = await prisma.$queryRaw`
    SELECT u.id::text AS id, u.full_name AS name
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = CAST(${String(id)} AS uuid)
      AND COALESCE(u.is_active, true) = true
      AND r.code IN (${codes})
    LIMIT 1
  `;
  if (!rows[0]?.name) throw new AppError(400, 'Choose a production team member.');
  return rows[0];
}

async function commercialRows(projectIds) {
  if (!projectIds.length) return [];
  const ids = idList(projectIds);
  return prisma.$queryRaw`
    SELECT p.id::text AS id, l.site_location, l.location AS lead_location, l.company_address,
           l.product, l.product_1, l.type_of_storage, l.details
    FROM projects p
    LEFT JOIN leads l ON l.id = p.lead_id
    WHERE p.id IN (${ids})
  `;
}

function shapeOrder(project, commercial, labels) {
  return {
    id: project.id,
    orderNo: project.orderId || null,
    orderDate: project.orderConfirmedAt || null,
    projectCode: project.projectId,
    customer: project.customer || '—',
    location: locationOf(commercial, project.location),
    product: productOf(commercial, labels, project.productGroup),
    currentStageCode: project.currentStageCode,
  };
}

async function loadRows() {
  try {
    return await prisma.$queryRaw`
      SELECT r.*, u.full_name AS user_name
      FROM production_records r
      LEFT JOIN users u ON u.id = r.assigned_user_id
      WHERE r.archived_at IS NULL
      ORDER BY r.updated_at DESC
    `;
  } catch (error) {
    if (String(error.message || '').includes('production_records')) {
      throw new AppError(503, 'Production storage is not ready.');
    }
    throw error;
  }
}

function shapeRecord(row, order) {
  const status = progress.normalize(row.status);
  const stage = progress.normalize(row.stage);
  const material = progress.normalize(row.material_status);
  const qc = progress.normalize(row.qc_status);
  const linked = order || {};
  return {
    id: row.id,
    projectId: row.project_id,
    orderNo: linked.orderNo || null,
    orderDate: linked.orderDate || null,
    projectCode: linked.projectCode || null,
    customer: linked.customer || '—',
    location: linked.location || '—',
    product: linked.product || '—',
    currentStageCode: linked.currentStageCode || null,
    startedAt: row.started_at || null,
    startedDateInput: row.started_at ? calendarDayKey(row.started_at) : '',
    plannedAt: row.planned_at || null,
    plannedDateInput: row.planned_at ? calendarDayKey(row.planned_at) : '',
    completedAt: status === 'COMPLETED' ? (row.completed_at || null) : null,
    completedDateInput: status === 'COMPLETED' && row.completed_at ? calendarDayKey(row.completed_at) : '',
    followUpAt: row.follow_up_at || null,
    followUpInput: row.follow_up_at ? calendarDayKey(row.follow_up_at) : '',
    progress: Number(row.progress_pct),
    progressLabel: progress.formatProgress(row.progress_pct),
    stage,
    stageLabel: progress.labelOf(stage, progress.STAGE_LABELS),
    materialStatus: material,
    materialLabel: progress.labelOf(material),
    qcStatus: qc,
    qcLabel: progress.labelOf(qc),
    responsibleId: row.assigned_user_id ? String(row.assigned_user_id) : null,
    responsibleName: row.user_name || row.assigned_name || '',
    status,
    statusLabel: progress.labelOf(status),
    delayDays: progress.productionDelayDays(row.planned_at, row.completed_at, status),
    remarks: row.remarks || '',
  };
}

async function listTracking(user) {
  const [rows, otr, labels, stages, people] = await Promise.all([
    loadRows(),
    orders.listOtr(),
    storageLabels(),
    stageOptions(),
    assignees(),
  ]);
  const projectIds = [...new Set([
    ...rows.map((row) => String(row.project_id)),
    ...otr.items.filter((item) => item.currentStageCode === 'PRODUCTION').map((item) => String(item.id)),
  ])];
  const commercial = await commercialRows(projectIds);
  const commercialById = new Map(commercial.map((row) => [String(row.id), row]));
  const orderById = new Map(otr.items.map((item) => [
    String(item.id),
    shapeOrder(item, commercialById.get(String(item.id)), labels),
  ]));
  const activeProjects = new Set(rows.map((row) => String(row.project_id)));
  const items = rows
    .map((row) => shapeRecord(row, orderById.get(String(row.project_id))))
    .sort((a, b) => String(a.orderNo || '').localeCompare(String(b.orderNo || '')));
  const eligible = otr.items
    .filter((item) => item.currentStageCode === 'PRODUCTION' && !activeProjects.has(String(item.id)))
    .map((item) => orderById.get(String(item.id)))
    .filter(Boolean)
    .sort((a, b) => String(a.orderNo || '').localeCompare(String(b.orderNo || '')));
  return {
    canEdit: canEdit(user),
    items,
    orders: eligible,
    stages,
    materialStatuses: progress.MATERIAL_STATUSES,
    qcStatuses: progress.QC_STATUSES,
    statuses: progress.PRODUCTION_STATUSES,
    assignees: people,
  };
}

function requireChoice(value, options, message) {
  const code = progress.normalize(value);
  if (!options.some((row) => row.code === code)) throw new AppError(400, message);
  return code;
}

function readPayload(body, stages, existing) {
  const data = body || {};
  const stage = requireChoice(data.stage, stages, 'Choose a production stage.');
  if (existing && stage !== progress.normalize(existing.stage)) {
    const known = stages.some((row) => row.code === stage);
    if (!known) throw new AppError(400, 'Choose a production stage.');
  }
  const parsed = progress.parseProgress(data.progress);
  if (parsed.error) throw new AppError(400, parsed.error);
  const materialStatus = requireChoice(data.materialStatus, progress.MATERIAL_STATUSES, 'Choose a material status.');
  const qcStatus = requireChoice(data.qcStatus, progress.QC_STATUSES, 'Choose a QC status.');
  const status = requireChoice(data.status, progress.PRODUCTION_STATUSES, 'Choose a production status.');
  if (status === 'COMPLETED' && !progress.canComplete(stage, qcStatus)) {
    throw new AppError(400, 'Complete the packing stage and pass QC before completing production.');
  }
  return {
    stage,
    progress: parsed.value,
    materialStatus,
    qcStatus,
    status,
    startedAt: parseDay(data.startedDate, 'Production start date'),
    plannedAt: parseDay(data.plannedDate, 'Planned completion date'),
    completedAt: parseDay(data.completedDate, 'Actual completion date'),
    followUpAt: parseDay(data.followUpDate, 'Next follow up date'),
    remarks: data.remarks === undefined ? undefined : textOrNull(data.remarks, 4000),
    responsibleId: data.responsibleId,
  };
}

async function projectInProduction(projectId) {
  const otr = await orders.listOtr();
  const project = otr.items.find((item) => String(item.id) === String(projectId));
  if (!project) throw new AppError(404, 'This order is not in the OTR workflow.');
  return project;
}

async function insertEvents(tx, productionId, projectId, events, user, now) {
  for (const event of events) {
    await tx.$executeRaw`
      INSERT INTO production_events (
        production_id, project_id, action, field_name, previous_value, new_value, remarks, user_id, user_name, created_at
      ) VALUES (
        CAST(${String(productionId)} AS uuid),
        CAST(${String(projectId)} AS uuid),
        ${event.action},
        ${event.field || null},
        ${event.previous ?? null},
        ${event.next ?? null},
        ${event.remarks || null},
        CAST(${String(user.id)} AS uuid),
        ${actor(user)},
        ${now}
      )
    `;
  }
}

async function syncStageWork(project, fields, user) {
  if (project.currentStageCode !== 'PRODUCTION' || fields.status === 'COMPLETED') return;
  const now = new Date();
  const workStatus = fields.status === 'ON_HOLD'
    ? 'ON_HOLD'
    : fields.status === 'NOT_STARTED'
      ? 'PENDING'
      : 'IN_PROGRESS';
  const name = actor(user);
  await prisma.$executeRaw`
    INSERT INTO project_stage_work (project_id, stage, status, updated_by_name)
    VALUES (CAST(${String(project.id)} AS uuid), 'PRODUCTION', 'PENDING', ${name})
    ON CONFLICT (project_id, stage) DO NOTHING
  `;
  const assigneeSql = fields.responsibleId
    ? Prisma.sql`CAST(${fields.responsibleId} AS uuid)`
    : Prisma.sql`NULL`;
  await prisma.$executeRaw`
    UPDATE project_stage_work
    SET status = ${workStatus},
        started_at = COALESCE(${fields.startedAt}, started_at),
        target_at = ${fields.plannedAt},
        assigned_user_id = ${assigneeSql},
        assigned_name = ${fields.responsibleName},
        remarks = ${fields.remarks},
        updated_by_name = ${name},
        updated_at = ${now}
    WHERE project_id = CAST(${String(project.id)} AS uuid) AND stage = 'PRODUCTION'
      AND status <> 'COMPLETED'
  `;
}

function dayText(value) {
  return value ? calendarDayKey(value) : '';
}

async function createRecord(body, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  const stages = await stageOptions();
  const fields = readPayload(body, stages);
  if (!body?.projectId) throw new AppError(400, 'Choose an order.');
  const project = await projectInProduction(body.projectId);
  if (project.currentStageCode !== 'PRODUCTION') {
    throw new AppError(400, 'This order is not in Production. Complete procurement first.');
  }
  const assignee = fields.responsibleId ? await assertAssignee(fields.responsibleId) : null;
  const now = new Date();
  let completedAt = null;
  if (fields.status === 'COMPLETED') {
    completedAt = fields.completedAt || now;
  }
  const remarks = fields.remarks === undefined ? null : fields.remarks;
  const name = actor(user);
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`
        INSERT INTO production_records (
          project_id, stage, progress_pct, material_status, qc_status, status,
          started_at, planned_at, completed_at, follow_up_at,
          assigned_user_id, assigned_name, remarks,
          created_by, created_by_name, updated_by, updated_by_name, created_at, updated_at
        ) VALUES (
          CAST(${String(project.id)} AS uuid),
          ${fields.stage},
          ${fields.progress},
          ${fields.materialStatus},
          ${fields.qcStatus},
          ${fields.status},
          ${fields.startedAt || null},
          ${fields.plannedAt || null},
          ${completedAt},
          ${fields.followUpAt || null},
          ${assignee ? Prisma.sql`CAST(${assignee.id} AS uuid)` : Prisma.sql`NULL`},
          ${assignee?.name || null},
          ${remarks},
          CAST(${String(user.id)} AS uuid),
          ${name},
          CAST(${String(user.id)} AS uuid),
          ${name},
          ${now},
          ${now}
        )
        RETURNING id
      `;
      await insertEvents(tx, rows[0].id, project.id, [{
        action: 'Created',
        field: 'Status',
        previous: null,
        next: progress.labelOf(fields.status),
        remarks,
      }], user, now);
      return rows[0];
    });
  } catch (error) {
    if (String(error.message || '').includes('production_records_active_project')) {
      throw new AppError(400, 'This order already has a production record.');
    }
    throw error;
  }
  await syncStageWork(project, {
    ...fields,
    responsibleId: assignee?.id || null,
    responsibleName: assignee?.name || null,
    remarks,
  }, user);
  let advanced = false;
  if (fields.status === 'COMPLETED' && project.currentStageCode === 'PRODUCTION') {
    const lifecycle = require('./lifecycleService');
    await lifecycle.actOnStage(project.id, 'PRODUCTION', 'complete', {
      remarks,
      assignedName: assignee?.name || null,
    }, user);
    advanced = true;
  }
  return { id: created.id, advanced };
}

async function loadActive(id) {
  const rows = await prisma.$queryRaw`
    SELECT * FROM production_records
    WHERE id = CAST(${String(id)} AS uuid) AND archived_at IS NULL
    LIMIT 1
  `;
  if (!rows[0]) throw new AppError(404, 'Production record not found.');
  return rows[0];
}

async function updateRecord(id, body, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  const existing = await loadActive(id);
  const stages = await stageOptions();
  const allowedStages = stages.some((row) => row.code === progress.normalize(existing.stage))
    ? stages
    : [...stages, { code: progress.normalize(existing.stage), label: progress.labelOf(existing.stage, progress.STAGE_LABELS) }];
  const fields = readPayload(body, allowedStages, existing);
  const project = await projectInProduction(existing.project_id);
  const assignee = fields.responsibleId === undefined
    ? { id: existing.assigned_user_id ? String(existing.assigned_user_id) : null, name: existing.assigned_name || null }
    : fields.responsibleId
      ? await assertAssignee(fields.responsibleId)
      : null;
  const previousStatus = progress.normalize(existing.status);
  let completedAt = existing.completed_at || null;
  if (fields.status === 'COMPLETED') {
    if (fields.completedAt) completedAt = fields.completedAt;
    else if (!completedAt || previousStatus !== 'COMPLETED') completedAt = new Date();
  } else {
    completedAt = null;
  }
  const remarks = fields.remarks === undefined ? (existing.remarks || null) : fields.remarks;
  const responsibleId = assignee?.id || null;
  const responsibleName = assignee?.name || null;
  const now = new Date();
  const events = [];
  function track(field, previous, next) {
    if ((previous || '') === (next || '')) return;
    events.push({ action: 'Updated', field, previous: previous || '—', next: next || '—' });
  }
  track('Stage', progress.labelOf(existing.stage, progress.STAGE_LABELS), progress.labelOf(fields.stage, progress.STAGE_LABELS));
  track('Production %', progress.formatProgress(existing.progress_pct), progress.formatProgress(fields.progress));
  track('Status', progress.labelOf(existing.status), progress.labelOf(fields.status));
  track('Material Status', progress.labelOf(existing.material_status), progress.labelOf(fields.materialStatus));
  track('QC Status', progress.labelOf(existing.qc_status), progress.labelOf(fields.qcStatus));
  track('Responsible Person', existing.assigned_name || '', responsibleName || '');
  track('Production Start', dayText(existing.started_at), dayText(fields.startedAt));
  track('Planned Completion', dayText(existing.planned_at), dayText(fields.plannedAt));
  track('Actual Completion', dayText(existing.completed_at), dayText(completedAt));
  track('Next Follow Up', dayText(existing.follow_up_at), dayText(fields.followUpAt));
  track('Remarks', existing.remarks || '', remarks || '');
  if (previousStatus !== 'COMPLETED' && fields.status === 'COMPLETED') {
    events.push({ action: 'Completed', field: 'Status', previous: progress.labelOf(previousStatus), next: 'Completed', remarks });
  }
  if (!events.length) return { id: existing.id, advanced: false, changed: false };

  const assigneeSql = responsibleId ? Prisma.sql`CAST(${responsibleId} AS uuid)` : Prisma.sql`NULL`;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE production_records
      SET stage = ${fields.stage},
          progress_pct = ${fields.progress},
          material_status = ${fields.materialStatus},
          qc_status = ${fields.qcStatus},
          status = ${fields.status},
          started_at = ${fields.startedAt || null},
          planned_at = ${fields.plannedAt || null},
          completed_at = ${completedAt},
          follow_up_at = ${fields.followUpAt || null},
          assigned_user_id = ${assigneeSql},
          assigned_name = ${responsibleName},
          remarks = ${remarks},
          updated_by = CAST(${String(user.id)} AS uuid),
          updated_by_name = ${actor(user)},
          updated_at = ${now}
      WHERE id = CAST(${String(existing.id)} AS uuid) AND archived_at IS NULL
    `;
    await insertEvents(tx, existing.id, existing.project_id, events.map((event) => ({ ...event, remarks: event.remarks || remarks })), user, now);
  });
  await syncStageWork(project, { ...fields, responsibleId, responsibleName, remarks }, user);
  let advanced = false;
  if (fields.status === 'COMPLETED' && project.currentStageCode === 'PRODUCTION') {
    const lifecycle = require('./lifecycleService');
    await lifecycle.actOnStage(project.id, 'PRODUCTION', 'complete', { remarks, assignedName: responsibleName }, user);
    advanced = true;
  }
  return { id: existing.id, advanced, changed: true };
}

async function archiveRecord(id, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  const existing = await loadActive(id);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE production_records
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
      previous: progress.labelOf(existing.status),
      next: 'Archived',
      remarks: existing.remarks || null,
    }], user, now);
  });
  return { id: existing.id };
}

async function history(id) {
  const existing = await prisma.$queryRaw`
    SELECT id, project_id FROM production_records WHERE id = CAST(${String(id)} AS uuid) LIMIT 1
  `;
  if (!existing[0]) throw new AppError(404, 'Production record not found.');
  const rows = await prisma.$queryRaw`
    SELECT * FROM production_events
    WHERE production_id = CAST(${String(id)} AS uuid)
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
      remarks: row.remarks || '',
      userName: row.user_name || '—',
      createdAt: row.created_at,
    })),
  };
}

module.exports = {
  listTracking,
  createRecord,
  updateRecord,
  archiveRecord,
  history,
};
