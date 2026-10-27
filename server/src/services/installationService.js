const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');
const { prisma } = require('../prisma');
const { AppError } = require('../utils/errors');
const { can } = require('../middleware/authorize');
const { calendarDayKey } = require('../utils/leadDeadline');
const orders = require('./orderConversionService');
const progress = require('./installationProgress');

const INSTALL_ROLES = ['INSTALL_MANAGER', 'SITE_ENG'];
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

function actor(user) {
  return user?.fullName || user?.username || 'User';
}

function canEdit(user) {
  if (!user) return false;
  if (user.roles?.some((role) => role.code === 'ADMIN' || role.isManagement)) return true;
  return can(user, 'installation.edit');
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

function dayText(value) {
  return value ? calendarDayKey(value) : '';
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

function discardFile(file) {
  if (file?.path) fs.rmSync(file.path, { force: true });
}

function assertImage(file) {
  if (!file?.path || !file.size) {
    discardFile(file);
    throw new AppError(400, 'The photo is empty or could not be read.');
  }
  const ext = path.extname(String(file.originalname || '')).slice(1).toLowerCase();
  if (!IMAGE_EXT.has(ext)) {
    discardFile(file);
    throw new AppError(400, 'Site photos must be JPG, PNG, WEBP, or GIF images.');
  }
  const header = Buffer.alloc(16);
  const fd = fs.openSync(file.path, 'r');
  const read = fs.readSync(fd, header, 0, 16, 0);
  fs.closeSync(fd);
  const text = header.toString('utf8');
  const ok = read >= 12 && (
    (ext === 'png' && header[0] === 0x89 && text.slice(1, 4) === 'PNG')
    || ((ext === 'jpg' || ext === 'jpeg') && header[0] === 0xff && header[1] === 0xd8)
    || (ext === 'gif' && text.startsWith('GIF8'))
    || (ext === 'webp' && text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP')
  );
  if (!ok) {
    discardFile(file);
    throw new AppError(400, 'This file is not a valid site photo and was not saved.');
  }
  return ext;
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

async function lookupOptions(type, fallback) {
  try {
    const rows = await prisma.$queryRaw`
      SELECT code, label FROM "Lookup"
      WHERE type = ${type} AND active = true
      ORDER BY "sortOrder" ASC, label ASC
    `;
    if (rows.length) return rows.map((row) => ({ code: String(row.code), label: row.label }));
  } catch (error) {
    console.error(`${type} options could not be loaded.`, error);
  }
  return fallback;
}

async function assignees() {
  const codes = Prisma.join(INSTALL_ROLES);
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
    console.error('Installation assignees could not be loaded.', error);
    return [];
  }
}

async function assertAssignee(id) {
  if (!id) return null;
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new AppError(400, 'Choose an installation team member.');
  const codes = Prisma.join(INSTALL_ROLES);
  const rows = await prisma.$queryRaw`
    SELECT u.id::text AS id, u.full_name AS name
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = CAST(${String(id)} AS uuid)
      AND COALESCE(u.is_active, true) = true
      AND r.code IN (${codes})
    LIMIT 1
  `;
  if (!rows[0]?.name) throw new AppError(400, 'Choose an installation team member.');
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
      SELECT r.*, u.full_name AS user_name,
             (
               SELECT COUNT(*)::int FROM otr_installation_photos p
               WHERE p.installation_id = r.id AND p.archived = false
             ) AS photo_count
      FROM otr_installation_records r
      LEFT JOIN users u ON u.id = r.assigned_user_id
      WHERE r.archived_at IS NULL
      ORDER BY r.updated_at DESC
    `;
  } catch (error) {
    if (String(error.message || '').includes('otr_installation_records')) {
      throw new AppError(503, 'Installation storage is not ready.');
    }
    throw error;
  }
}

function shapeRecord(row, order) {
  const status = progress.normalize(row.status);
  const stage = progress.normalize(row.stage);
  const readiness = progress.normalize(row.readiness);
  const handover = progress.normalize(row.handover_status);
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
    plannedAt: row.planned_at || null,
    plannedDateInput: row.planned_at ? calendarDayKey(row.planned_at) : '',
    startedAt: row.started_at || null,
    startedDateInput: row.started_at ? calendarDayKey(row.started_at) : '',
    completedAt: status === 'COMPLETED' ? (row.completed_at || null) : null,
    completedDateInput: status === 'COMPLETED' && row.completed_at ? calendarDayKey(row.completed_at) : '',
    progress: Number(row.progress_pct),
    progressLabel: progress.formatProgress(row.progress_pct),
    stage,
    stageLabel: progress.labelOf(stage, progress.STAGE_LABELS),
    readiness,
    readinessLabel: progress.labelOf(readiness),
    readinessReason: row.readiness_reason || '',
    status,
    statusLabel: progress.labelOf(status),
    delayDays: progress.installationDelayDays(row.planned_at, row.completed_at, status),
    delayReason: row.delay_reason || '',
    handoverStatus: handover,
    handoverLabel: progress.labelOf(handover),
    responsibleId: row.assigned_user_id ? String(row.assigned_user_id) : null,
    responsibleName: row.user_name || row.assigned_name || '',
    remarks: row.remarks || '',
    photoCount: Number(row.photo_count || 0),
  };
}

function shapePhoto(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    sizeBytes: row.file_size,
    uploadedBy: row.uploaded_by_name || '—',
    uploadedAt: row.uploaded_at,
  };
}

async function photosFor(installationId) {
  const rows = await prisma.$queryRaw`
    SELECT * FROM otr_installation_photos
    WHERE installation_id = CAST(${String(installationId)} AS uuid) AND archived = false
    ORDER BY uploaded_at DESC
  `;
  return rows.map(shapePhoto);
}

async function listTracking(user) {
  const [rows, otr, labels, stages, readiness, statuses, handover, people] = await Promise.all([
    loadRows(),
    orders.listOtr(),
    storageLabels(),
    lookupOptions('INSTALLATION_STAGE', progress.STAGES),
    lookupOptions('SITE_READINESS', progress.READINESS),
    lookupOptions('INSTALLATION_STATUS', progress.INSTALL_STATUSES),
    lookupOptions('HANDOVER_STATUS', progress.HANDOVER_STATUSES),
    assignees(),
  ]);
  const projectIds = [...new Set([
    ...rows.map((row) => String(row.project_id)),
    ...otr.items.filter((item) => item.currentStageCode === 'INSTALLATION').map((item) => String(item.id)),
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
    .filter((item) => item.currentStageCode === 'INSTALLATION' && !activeProjects.has(String(item.id)))
    .map((item) => orderById.get(String(item.id)))
    .filter(Boolean)
    .sort((a, b) => String(a.orderNo || '').localeCompare(String(b.orderNo || '')));
  return {
    canEdit: canEdit(user),
    items,
    orders: eligible,
    stages,
    readiness,
    statuses,
    handoverStatuses: handover,
    assignees: people,
  };
}

function requireChoice(value, options, message) {
  const code = progress.normalize(value);
  if (!options.some((row) => row.code === code)) throw new AppError(400, message);
  return code;
}

async function optionLists() {
  const [readiness, statuses, handover] = await Promise.all([
    lookupOptions('SITE_READINESS', progress.READINESS),
    lookupOptions('INSTALLATION_STATUS', progress.INSTALL_STATUSES),
    lookupOptions('HANDOVER_STATUS', progress.HANDOVER_STATUSES),
  ]);
  return { readiness, statuses, handover };
}

function readPayload(body, lists) {
  const data = body || {};
  const status = requireChoice(data.status, lists.statuses, 'Choose an installation status.');
  const applied = progress.applyProgress(status, data.progress);
  if (applied.error) throw new AppError(400, applied.error);
  const readiness = requireChoice(data.readiness, lists.readiness, 'Choose site readiness.');
  const handoverStatus = requireChoice(data.handoverStatus, lists.handover, 'Choose a handover status.');
  const plannedAt = parseDay(data.plannedDate, 'Installation planned date');
  if (!plannedAt) throw new AppError(400, 'Installation planned date is required.');
  return {
    progress: applied.value,
    stage: applied.stage,
    status,
    readiness,
    readinessReason: readiness === 'NOT_READY' ? textOrNull(data.readinessReason, 500) : null,
    handoverStatus,
    delayReason: data.delayReason === undefined ? undefined : textOrNull(data.delayReason, 500),
    plannedAt,
    startedAt: parseDay(data.startedDate, 'Installation start date'),
    completedAt: parseDay(data.completedDate, 'Installation completion date'),
    remarks: data.remarks === undefined ? undefined : textOrNull(data.remarks, 4000),
    responsibleId: data.responsibleId,
  };
}

async function projectInOtr(projectId) {
  const otr = await orders.listOtr();
  const project = otr.items.find((item) => String(item.id) === String(projectId));
  if (!project) throw new AppError(404, 'This order is not in the OTR workflow.');
  return project;
}

async function insertEvents(tx, installationId, projectId, events, user, now) {
  for (const event of events) {
    await tx.$executeRaw`
      INSERT INTO otr_installation_events (
        installation_id, project_id, action, field_name, previous_value, new_value, remarks, user_id, user_name, created_at
      ) VALUES (
        CAST(${String(installationId)} AS uuid),
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
  if (project.currentStageCode !== 'INSTALLATION' || fields.status === 'COMPLETED') return;
  const now = new Date();
  const workStatus = fields.status === 'ON_HOLD'
    ? 'ON_HOLD'
    : fields.status === 'NOT_STARTED'
      ? 'PENDING'
      : 'IN_PROGRESS';
  const name = actor(user);
  await prisma.$executeRaw`
    INSERT INTO project_stage_work (project_id, stage, status, updated_by_name)
    VALUES (CAST(${String(project.id)} AS uuid), 'INSTALLATION', 'PENDING', ${name})
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
    WHERE project_id = CAST(${String(project.id)} AS uuid) AND stage = 'INSTALLATION'
      AND status <> 'COMPLETED'
  `;
}

async function finishInstallation(project, fields, user) {
  if (fields.status !== 'COMPLETED' || project.currentStageCode !== 'INSTALLATION') return false;
  const lifecycle = require('./lifecycleService');
  await lifecycle.actOnStage(project.id, 'INSTALLATION', 'complete', {
    remarks: fields.remarks,
    assignedName: fields.responsibleName || null,
  }, user);
  return true;
}

async function createRecord(body, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  const lists = await optionLists();
  const fields = readPayload(body, lists);
  if (!body?.projectId) throw new AppError(400, 'Choose an order.');
  const project = await projectInOtr(body.projectId);
  if (project.currentStageCode !== 'INSTALLATION') {
    throw new AppError(400, 'This order is not in Installation. Complete dispatch first.');
  }
  const assignee = fields.responsibleId ? await assertAssignee(fields.responsibleId) : null;
  const now = new Date();
  const completedAt = fields.status === 'COMPLETED' ? (fields.completedAt || now) : null;
  const remarks = fields.remarks === undefined ? null : fields.remarks;
  const delayReason = fields.delayReason === undefined ? null : fields.delayReason;
  const name = actor(user);
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`
        INSERT INTO otr_installation_records (
          project_id, progress_pct, stage, readiness, readiness_reason, status, handover_status, delay_reason,
          planned_at, started_at, completed_at, assigned_user_id, assigned_name, remarks,
          created_by, created_by_name, updated_by, updated_by_name, created_at, updated_at
        ) VALUES (
          CAST(${String(project.id)} AS uuid),
          ${fields.progress},
          ${fields.stage},
          ${fields.readiness},
          ${fields.readinessReason},
          ${fields.status},
          ${fields.handoverStatus},
          ${delayReason},
          ${fields.plannedAt},
          ${fields.startedAt || null},
          ${completedAt},
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
    const text = `${error?.message || ''} ${error?.meta?.message || ''}`;
    if (error?.meta?.code === '23505' || text.includes('otr_installation_records_active_project')) {
      throw new AppError(400, 'This order already has an installation record.');
    }
    throw error;
  }
  const saved = {
    ...fields,
    remarks,
    responsibleId: assignee?.id || null,
    responsibleName: assignee?.name || null,
  };
  await syncStageWork(project, saved, user);
  const advanced = await finishInstallation(project, saved, user);
  return { id: created.id, advanced };
}

async function loadActive(id) {
  const rows = await prisma.$queryRaw`
    SELECT r.*, u.full_name AS user_name,
           (
             SELECT COUNT(*)::int FROM otr_installation_photos p
             WHERE p.installation_id = r.id AND p.archived = false
           ) AS photo_count
    FROM otr_installation_records r
    LEFT JOIN users u ON u.id = r.assigned_user_id
    WHERE r.id = CAST(${String(id)} AS uuid) AND r.archived_at IS NULL
    LIMIT 1
  `;
  if (!rows[0]) throw new AppError(404, 'Installation record not found.');
  return rows[0];
}

async function getRecord(id) {
  const row = await loadActive(id);
  const project = await projectInOtr(row.project_id);
  const labels = await storageLabels();
  const commercial = await commercialRows([row.project_id]);
  const shaped = shapeRecord(row, shapeOrder(project, commercial[0], labels));
  shaped.photos = await photosFor(row.id);
  return shaped;
}

async function updateRecord(id, body, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  const existing = await loadActive(id);
  const lists = await optionLists();
  const fields = readPayload(body, lists);
  const project = await projectInOtr(existing.project_id);
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
  const delayReason = fields.delayReason === undefined ? (existing.delay_reason || null) : fields.delayReason;
  const responsibleId = assignee?.id || null;
  const responsibleName = assignee?.name || null;
  const now = new Date();
  const events = [];
  function track(field, previous, next) {
    if ((previous || '') === (next || '')) return;
    events.push({ action: 'Updated', field, previous: previous || '—', next: next || '—' });
  }
  track('Installation %', progress.formatProgress(existing.progress_pct), progress.formatProgress(fields.progress));
  track('Current Stage', progress.labelOf(existing.stage, progress.STAGE_LABELS), progress.labelOf(fields.stage, progress.STAGE_LABELS));
  track('Installation Status', progress.labelOf(existing.status), progress.labelOf(fields.status));
  track('Site Readiness', progress.labelOf(existing.readiness), progress.labelOf(fields.readiness));
  track('Readiness Reason', existing.readiness_reason || '', fields.readinessReason || '');
  track('Handover Status', progress.labelOf(existing.handover_status), progress.labelOf(fields.handoverStatus));
  track('Delay Reason', existing.delay_reason || '', delayReason || '');
  track('Responsible Person', existing.assigned_name || '', responsibleName || '');
  track('Installation Planned Date', dayText(existing.planned_at), dayText(fields.plannedAt));
  track('Installation Start Date', dayText(existing.started_at), dayText(fields.startedAt));
  track('Installation Completion Date', dayText(existing.completed_at), dayText(completedAt));
  track('Remarks', existing.remarks || '', remarks || '');
  if (previousStatus !== 'COMPLETED' && fields.status === 'COMPLETED') {
    events.push({
      action: 'Completed',
      field: 'Installation Status',
      previous: progress.labelOf(previousStatus),
      next: 'Completed',
      remarks,
    });
  }
  if (!events.length) return { id: existing.id, advanced: false, changed: false };
  const assigneeSql = responsibleId ? Prisma.sql`CAST(${responsibleId} AS uuid)` : Prisma.sql`NULL`;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE otr_installation_records
      SET progress_pct = ${fields.progress},
          stage = ${fields.stage},
          readiness = ${fields.readiness},
          readiness_reason = ${fields.readinessReason},
          status = ${fields.status},
          handover_status = ${fields.handoverStatus},
          delay_reason = ${delayReason},
          planned_at = ${fields.plannedAt},
          started_at = ${fields.startedAt || null},
          completed_at = ${completedAt},
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
  const saved = { ...fields, remarks, responsibleId, responsibleName };
  await syncStageWork(project, saved, user);
  const advanced = await finishInstallation(project, saved, user);
  return { id: existing.id, advanced, changed: true };
}

async function archiveRecord(id, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  const existing = await loadActive(id);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE otr_installation_records
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
    SELECT id FROM otr_installation_records WHERE id = CAST(${String(id)} AS uuid) LIMIT 1
  `;
  if (!existing[0]) throw new AppError(404, 'Installation record not found.');
  const rows = await prisma.$queryRaw`
    SELECT * FROM otr_installation_events
    WHERE installation_id = CAST(${String(id)} AS uuid)
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

async function addPhoto(installationId, file, user) {
  if (!canEdit(user)) {
    discardFile(file);
    throw new AppError(403, 'Access denied.');
  }
  const existing = await loadActive(installationId).catch((error) => {
    discardFile(file);
    throw error;
  });
  assertImage(file);
  const now = new Date();
  const rows = await prisma.$queryRaw`
    INSERT INTO otr_installation_photos (
      installation_id, project_id, file_name, stored_name, storage_path, mime_type, file_size,
      uploaded_by, uploaded_by_name, uploaded_at
    ) VALUES (
      CAST(${String(existing.id)} AS uuid),
      CAST(${String(existing.project_id)} AS uuid),
      ${file.originalname},
      ${path.basename(file.path)},
      ${file.path},
      ${file.mimetype || null},
      ${file.size},
      CAST(${String(user.id)} AS uuid),
      ${actor(user)},
      ${now}
    )
    RETURNING *
  `;
  await prisma.$executeRaw`
    INSERT INTO otr_installation_events (
      installation_id, project_id, action, field_name, previous_value, new_value, user_id, user_name, created_at
    ) VALUES (
      CAST(${String(existing.id)} AS uuid),
      CAST(${String(existing.project_id)} AS uuid),
      'Updated',
      'Site Installation Photos',
      '—',
      ${file.originalname},
      CAST(${String(user.id)} AS uuid),
      ${actor(user)},
      ${now}
    )
  `;
  return shapePhoto(rows[0]);
}

async function removePhoto(photoId, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  const rows = await prisma.$queryRaw`
    SELECT * FROM otr_installation_photos
    WHERE id = CAST(${String(photoId)} AS uuid) AND archived = false
    LIMIT 1
  `;
  const photo = rows[0];
  if (!photo) throw new AppError(404, 'Photo not found.');
  const now = new Date();
  await prisma.$executeRaw`
    UPDATE otr_installation_photos SET archived = true WHERE id = CAST(${String(photo.id)} AS uuid)
  `;
  await prisma.$executeRaw`
    INSERT INTO otr_installation_events (
      installation_id, project_id, action, field_name, previous_value, new_value, user_id, user_name, created_at
    ) VALUES (
      CAST(${String(photo.installation_id)} AS uuid),
      CAST(${String(photo.project_id)} AS uuid),
      'Updated',
      'Site Installation Photos',
      ${photo.file_name},
      'Removed',
      CAST(${String(user.id)} AS uuid),
      ${actor(user)},
      ${now}
    )
  `;
  return { id: photo.id };
}

async function photoForDownload(photoId) {
  const rows = await prisma.$queryRaw`
    SELECT * FROM otr_installation_photos
    WHERE id = CAST(${String(photoId)} AS uuid) AND archived = false
    LIMIT 1
  `;
  const photo = rows[0];
  if (!photo) throw new AppError(404, 'Photo not found.');
  if (!photo.storage_path || !fs.existsSync(photo.storage_path)) {
    throw new AppError(404, 'Photo file is no longer available.');
  }
  return photo;
}

module.exports = {
  listTracking,
  getRecord,
  createRecord,
  updateRecord,
  archiveRecord,
  history,
  addPhoto,
  removePhoto,
  photoForDownload,
};
