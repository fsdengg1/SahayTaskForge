const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');
const { prisma } = require('../prisma');
const { AppError } = require('../utils/errors');
const { can } = require('../middleware/authorize');
const orders = require('./orderConversionService');
const progress = require('./designProgress');
const { calendarDayKey } = require('../utils/leadDeadline');

const DESIGN_ROLES = [
  'DESIGN_LEAD',
  'DESIGN_MEMBER',
  'PRE_DESIGN_LEAD',
  'PRE_DESIGN_MEMBER',
  'POST_DESIGN_LEAD',
  'POST_DESIGN_MEMBER',
  'DESIGN_MANAGER',
  'DESIGN_ENG',
];

const DRAWING_STATUSES = ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REVISION_REQUIRED'];
const BOM_STATUSES = ['PENDING', 'UPLOADED', 'UNDER_REVIEW', 'APPROVED', 'REVISION_REQUIRED'];
const DRAWING_EXT = new Set(['dwg', 'dxf', 'pdf', 'png', 'jpg', 'jpeg', 'tif', 'tiff']);
const BOM_EXT = new Set(['xlsx', 'xls', 'csv', 'pdf']);
const STATUS_LABELS = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REVISION_REQUIRED: 'Revision Required',
  UPLOADED: 'Uploaded',
  UNDER_REVIEW: 'Under Review',
};

function canEditDesign(user) {
  if (!user) return false;
  if (user.roles?.some((role) => role.code === 'ADMIN' || role.isManagement)) return true;
  return can(user, 'design.edit');
}

function actor(user) {
  return user?.fullName || user?.username || 'User';
}

function asNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && typeof value.toNumber === 'function') {
    const number = value.toNumber();
    return Number.isFinite(number) ? number : null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function idList(projectIds) {
  return Prisma.join(projectIds.map((id) => Prisma.sql`CAST(${String(id)} AS uuid)`));
}

function extensionOf(name) {
  const ext = path.extname(String(name || '')).slice(1).toLowerCase();
  return ext;
}

function assertFile(file, kind) {
  if (!file?.path || !file.size) {
    if (file?.path) fs.rmSync(file.path, { force: true });
    throw new AppError(400, 'The file is empty or could not be read.');
  }
  const ext = extensionOf(file.originalname);
  const allowed = kind === 'BOM' ? BOM_EXT : DRAWING_EXT;
  if (!allowed.has(ext)) {
    fs.rmSync(file.path, { force: true });
    throw new AppError(400, kind === 'BOM'
      ? 'BOM files must be XLSX, XLS, CSV, or PDF.'
      : 'Drawings must be DWG, DXF, PDF, or an image.');
  }
  const fd = fs.openSync(file.path, 'r');
  const header = Buffer.alloc(16);
  const read = fs.readSync(fd, header, 0, 16, 0);
  fs.closeSync(fd);
  if (!read) {
    fs.rmSync(file.path, { force: true });
    throw new AppError(400, 'The file is empty or could not be read.');
  }
  if (!signatureOk(ext, header, file.path)) {
    fs.rmSync(file.path, { force: true });
    throw new AppError(400, 'This file does not match its type and was not saved.');
  }
  return ext;
}

function signatureOk(ext, header, filePath) {
  const text = header.toString('utf8');
  if (ext === 'pdf') return text.startsWith('%PDF');
  if (ext === 'png') return header[0] === 0x89 && text.slice(1, 4) === 'PNG';
  if (ext === 'jpg' || ext === 'jpeg') return header[0] === 0xff && header[1] === 0xd8;
  if (ext === 'xlsx') return header[0] === 0x50 && header[1] === 0x4b;
  if (ext === 'xls') return header[0] === 0xd0 && header[1] === 0xcf;
  if (ext === 'dwg') return text.startsWith('AC10');
  if (ext === 'tif' || ext === 'tiff') return text.startsWith('II') || text.startsWith('MM');
  if (ext === 'dxf') return /section|^\s*0/i.test(fs.readFileSync(filePath, 'utf8').slice(0, 400));
  if (ext === 'csv') {
    const sample = fs.readFileSync(filePath).subarray(0, 512);
    return !sample.includes(0) && sample.length > 0;
  }
  return false;
}

function shapeFile(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    drawingName: row.drawing_name,
    fileName: row.file_name,
    fileType: row.file_type,
    version: row.version,
    versionLabel: `V${row.version}`,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] || row.status,
    remarks: row.remarks || '',
    uploadedBy: row.uploaded_by_name || '—',
    uploadedAt: row.uploaded_at,
    sizeBytes: row.file_size,
  };
}

async function confirmedProject(projectId) {
  const list = await orders.listOtr();
  const project = list.items.find((item) => String(item.id) === String(projectId));
  if (!project) throw new AppError(404, 'This project is not in the OTR workflow.');
  return project;
}

async function fileRows(projectIds) {
  if (!projectIds.length) return [];
  const ids = Prisma.join(projectIds.map((id) => Prisma.sql`CAST(${String(id)} AS uuid)`));
  return prisma.$queryRaw`
    SELECT * FROM design_files
    WHERE archived = false AND project_id IN (${ids})
    ORDER BY version DESC
  `;
}

function latestOf(rows, kind) {
  return rows.find((row) => row.kind === kind) || null;
}

async function listProjects(user) {
  const otr = await orders.listOtr();
  const designItems = otr.items.filter((item) => item.currentStageCode === 'DESIGN');
  const ids = designItems.map((item) => item.id);
  let files = [];
  try {
    files = await fileRows(ids);
  } catch (error) {
    if (String(error.message || '').includes('design_files')) {
      throw new AppError(503, 'Design storage is not ready.');
    }
    throw error;
  }
  const byProject = new Map();
  for (const row of files) {
    const list = byProject.get(String(row.project_id)) || [];
    list.push(row);
    byProject.set(String(row.project_id), list);
  }
  const base = designItems.map((project) => {
    const rows = byProject.get(String(project.id)) || [];
    const drawing = latestOf(rows, 'DRAWING');
    const layout = latestOf(rows, 'LAYOUT');
    const bom = latestOf(rows, 'BOM');
    const updated = [drawing?.uploaded_at, layout?.uploaded_at, bom?.uploaded_at, project.orderConfirmedAt]
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null;
    return {
      ...project,
      drawingStatus: drawing ? STATUS_LABELS[drawing.status] || drawing.status : 'Pending',
      drawingStatusCode: drawing?.status || 'PENDING',
      bomStatus: bom ? STATUS_LABELS[bom.status] || bom.status : 'Pending',
      bomStatusCode: bom?.status || 'PENDING',
      latestDrawingVersion: drawing ? `V${drawing.version}` : '—',
      latestLayoutVersion: layout ? `V${layout.version}` : '—',
      latestBomVersion: bom ? `V${bom.version}` : '—',
      lastUpdated: updated,
    };
  });
  const items = await attachTracking(base);
  return {
    canEdit: canEditDesign(user),
    activityOrder: progress.ACTIVITIES,
    activityLabels: progress.ACTIVITY_LABELS,
    activityStatuses: progress.ACTIVITY_STATUSES,
    overallStatuses: progress.OVERALL_STATUSES,
    stageOptions: progress.STAGE_OPTIONS,
    assignees: await designAssignees(),
    fileAccept: {
      BOM: [...BOM_EXT].map((ext) => `.${ext}`).join(','),
      DRAWING: [...DRAWING_EXT].map((ext) => `.${ext}`).join(','),
    },
    items,
  };
}

async function listFiles(projectId, kind) {
  const project = await confirmedProject(projectId);
  const rows = await prisma.$queryRaw`
    SELECT * FROM design_files
    WHERE project_id = CAST(${projectId} AS uuid)
      AND kind = ${kind}
      AND archived = false
    ORDER BY version DESC
  `;
  return { project, items: rows.map(shapeFile) };
}

async function uploadFile({ projectId, kind, file, drawingName, remarks, status, user }) {
  const project = await confirmedProject(projectId);
  if (!canEditDesign(user)) throw new AppError(403, 'Access denied.');
  if (project.currentStageCode !== 'DESIGN') {
    throw new AppError(400, 'Drawings and BOM can be uploaded while the project is in Design.');
  }
  const ext = assertFile(file, kind);
  const activityStatus = progress.ACTIVITIES.includes(kind) && progress.isActivityStatus(status)
    ? progress.normalizeStatus(status)
    : null;
  const allowedStatus = kind === 'BOM' ? BOM_STATUSES : DRAWING_STATUSES;
  const nextStatus = activityStatus
    || (allowedStatus.includes(status) ? status : (kind === 'BOM' ? 'UPLOADED' : 'IN_PROGRESS'));
  const name = String(drawingName || file.originalname || '').trim().slice(0, 240);
  if (kind === 'DRAWING' && !name) {
    fs.rmSync(file.path, { force: true });
    throw new AppError(400, 'Drawing name is required.');
  }
  try {
    const created = await prisma.$transaction(async (tx) => {
      const current = await tx.$queryRaw`
        SELECT COALESCE(MAX(version), 0)::int AS version
        FROM design_files
        WHERE project_id = CAST(${projectId} AS uuid) AND kind = ${kind}
      `;
      const version = Number(current[0]?.version || 0) + 1;
      const rows = await tx.$queryRaw`
        INSERT INTO design_files (
          project_id, kind, drawing_name, file_name, stored_name, storage_path,
          mime_type, file_size, file_type, version, status, remarks,
          uploaded_by, uploaded_by_name
        ) VALUES (
          CAST(${projectId} AS uuid),
          ${kind},
          ${name || null},
          ${file.originalname},
          ${path.basename(file.path)},
          ${file.path},
          ${file.mimetype || null},
          ${file.size},
          ${ext},
          ${version},
          ${nextStatus},
          ${remarks || null},
          CAST(${user.id} AS uuid),
          ${user.fullName || user.username || 'User'}
        )
        RETURNING *
      `;
      return rows[0];
    });
    const shaped = shapeFile(created);
    if (progress.ACTIVITIES.includes(kind)) {
      const mapped = progress.activityStatusFromFile(nextStatus);
      if (mapped) await applyActivity(projectId, kind, mapped, remarks, user);
    }
    return shaped;
  } catch (error) {
    fs.rmSync(file.path, { force: true });
    throw error;
  }
}

async function updateFile(id, data, user) {
  if (!canEditDesign(user)) throw new AppError(403, 'Access denied.');
  const rows = await prisma.$queryRaw`SELECT * FROM design_files WHERE id = CAST(${id} AS uuid) AND archived = false`;
  const file = rows[0];
  if (!file) throw new AppError(404, 'File not found.');
  const allowed = file.kind === 'BOM' ? BOM_STATUSES : DRAWING_STATUSES;
  const status = data.status && allowed.includes(data.status) ? data.status : file.status;
  const remarks = data.remarks !== undefined ? String(data.remarks || '') : file.remarks;
  const drawingName = data.drawingName !== undefined ? String(data.drawingName || '').slice(0, 240) : file.drawing_name;
  const updated = await prisma.$queryRaw`
    UPDATE design_files
    SET status = ${status}, remarks = ${remarks}, drawing_name = ${drawingName}
    WHERE id = CAST(${id} AS uuid)
    RETURNING *
  `;
  const shaped = shapeFile(updated[0]);
  if (progress.ACTIVITIES.includes(file.kind)) {
    const latest = await prisma.$queryRaw`
      SELECT id FROM design_files
      WHERE project_id = CAST(${String(file.project_id)} AS uuid)
        AND kind = ${file.kind}
        AND archived = false
      ORDER BY version DESC
      LIMIT 1
    `;
    if (String(latest[0]?.id) === String(file.id)) {
      const mapped = progress.activityStatusFromFile(status);
      if (mapped) await applyActivity(String(file.project_id), file.kind, mapped, remarks, user);
    }
  }
  return shaped;
}

async function removeFile(id, user) {
  if (!canEditDesign(user)) throw new AppError(403, 'Access denied.');
  const updated = await prisma.$queryRaw`
    UPDATE design_files SET archived = true
    WHERE id = CAST(${id} AS uuid) AND archived = false
    RETURNING id
  `;
  if (!updated[0]) throw new AppError(404, 'File not found.');
  return { ok: true };
}

async function fileForDownload(id) {
  const rows = await prisma.$queryRaw`
    SELECT * FROM design_files WHERE id = CAST(${id} AS uuid) AND archived = false
  `;
  const file = rows[0];
  if (!file || !fs.existsSync(file.storage_path)) throw new AppError(404, 'File not found.');
  return file;
}

async function completeDesign(projectId, user, options = {}) {
  if (!canEditDesign(user)) throw new AppError(403, 'Access denied.');
  const project = await confirmedProject(projectId);
  if (project.currentStageCode !== 'DESIGN') {
    throw new AppError(400, 'Only a project in the Design stage can be completed.');
  }
  const activityState = await prisma.$queryRaw`
    SELECT activity, status FROM design_activities
    WHERE project_id = CAST(${projectId} AS uuid)
  `;
  if (!progress.allActivitiesDone(progress.activityMap(activityState))) {
    throw new AppError(400, 'Complete or approve SHOP, BOM, Manufacturing Drawing, and Installation Drawing before completing design.');
  }
  const work = await prisma.$queryRaw`
    SELECT status FROM project_stage_work
    WHERE project_id = CAST(${projectId} AS uuid) AND stage = 'DESIGN'
    LIMIT 1
  `;
  if (!options.force && progress.normalizeStatus(work[0]?.status) === 'ON_HOLD') {
    throw new AppError(400, 'Design is on hold.');
  }
  const versions = await prisma.$queryRaw`
    SELECT kind, MAX(version)::int AS version
    FROM design_files
    WHERE project_id = CAST(${projectId} AS uuid) AND archived = false
    GROUP BY kind
  `;
  const versionOf = (kinds) => {
    for (const kind of kinds) {
      const found = versions.find((row) => row.kind === kind);
      if (found?.version) return Number(found.version);
    }
    return null;
  };
  const now = new Date();
  const name = actor(user);
  const updated = await prisma.$queryRaw`
    UPDATE projects
    SET otr_stage = 'PROCUREMENT',
        design_completed_at = ${now},
        design_completed_by_name = ${name},
        final_drawing_version = ${versionOf(['MANUFACTURING_DRAWING', 'DRAWING', 'SHOP'])},
        final_layout_version = ${versionOf(['INSTALLATION_DRAWING', 'LAYOUT'])},
        final_bom_version = ${versionOf(['BOM'])},
        updated_at = ${now}
    WHERE id = CAST(${projectId} AS uuid) AND UPPER(COALESCE(otr_stage, 'DESIGN')) = 'DESIGN'
    RETURNING id, project_code, otr_stage
  `;
  if (!updated[0]) throw new AppError(409, 'Design was already completed.');
  await prisma.$executeRaw`
    INSERT INTO project_stage_work (project_id, stage, status, completed_at, updated_by_name, updated_at)
    VALUES (CAST(${projectId} AS uuid), 'DESIGN', 'COMPLETED', ${now}, ${name}, ${now})
    ON CONFLICT (project_id, stage) DO UPDATE
    SET status = 'COMPLETED', completed_at = ${now}, updated_by_name = ${name}, updated_at = ${now}
  `;
  await prisma.$executeRaw`
    INSERT INTO project_stage_work (project_id, stage, status, updated_by_name)
    VALUES (CAST(${projectId} AS uuid), 'PROCUREMENT', 'PENDING', ${name})
    ON CONFLICT (project_id, stage) DO NOTHING
  `;
  try {
    await recordEvent(projectId, 'DESIGN', 'DESIGN', 'COMPLETED', null, user);
  } catch (error) {
    console.error('Design completion was saved, but the activity event was not.', error);
  }
  try {
    const lifecycle = require('./lifecycleService');
    await lifecycle.record({
      projectId,
      action: 'Design Completed',
      previousStatus: 'DESIGN',
      newStatus: 'PROCUREMENT',
      user,
    });
  } catch (error) {
    console.error('Design completion was saved, but the workflow event was not.', error);
  }
  return {
    id: updated[0].id,
    projectId: updated[0].project_code,
    currentStage: 'PROCUREMENT',
  };
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

async function designAssignees() {
  const codes = Prisma.join(DESIGN_ROLES);
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
    console.error('Design assignees could not be loaded.', error);
    return [];
  }
}

async function commercialRows(projectIds) {
  if (!projectIds.length) return [];
  const ids = idList(projectIds);
  return prisma.$queryRaw`
    SELECT p.id::text AS id, p.design_completed_at,
           p.otr_location, p.otr_product, p.otr_po_status, p.otr_project_value, p.otr_customer,
           l.po_value, l.basic_value, l.estimated_value, l.payment_status, l.currency,
           l.details, l.site_location, l.location AS lead_location, l.company_address,
           l.product, l.product_1, l.type_of_storage
    FROM projects p
    LEFT JOIN leads l ON l.id = p.lead_id
    WHERE p.id IN (${ids})
  `;
}

async function workRows(projectIds) {
  if (!projectIds.length) return [];
  const ids = idList(projectIds);
  return prisma.$queryRaw`
    SELECT w.*, u.full_name AS user_name
    FROM project_stage_work w
    LEFT JOIN users u ON u.id = w.assigned_user_id
    WHERE w.stage = 'DESIGN' AND w.project_id IN (${ids})
  `;
}

async function loadActivities(projectIds) {
  if (!projectIds.length) return [];
  const ids = idList(projectIds);
  try {
    return await prisma.$queryRaw`
      SELECT * FROM design_activities WHERE project_id IN (${ids})
    `;
  } catch (error) {
    if (String(error.message || '').includes('design_activities')) {
      throw new AppError(503, 'Design activity storage is not ready.');
    }
    throw error;
  }
}

function projectValueOf(row) {
  const stored = asNumber(row?.otr_project_value);
  if (stored != null) return stored;
  const direct = asNumber(row?.po_value) ?? asNumber(row?.basic_value) ?? asNumber(row?.estimated_value);
  if (direct != null) return direct;
  const details = row?.details && typeof row.details === 'object' ? row.details : {};
  return asNumber(details.orderValue) ?? asNumber(details.budget);
}

function locationOf(row, fallback) {
  const stored = String(row?.otr_location || '').trim();
  if (stored) return stored;
  const value = String(row?.site_location || row?.lead_location || row?.company_address || '').trim();
  if (value) return value;
  if (fallback && fallback !== '—') return fallback;
  return '—';
}

function productOf(row, labels, fallback) {
  const stored = String(row?.otr_product || '').trim();
  if (stored) return stored;
  const details = row?.details && typeof row.details === 'object' ? row.details : {};
  const raw = String(row?.product || row?.product_1 || row?.type_of_storage || details.storageMethod || details.materialToStore || '').trim();
  if (raw) return labels.get(raw) || raw;
  if (fallback && fallback !== '—') return fallback;
  return '—';
}

function latestRemark(work, rows) {
  const candidates = [];
  if (String(work?.remarks || '').trim()) candidates.push({ at: work.updated_at || 0, text: String(work.remarks).trim() });
  for (const row of rows) {
    if (String(row.remarks || '').trim()) candidates.push({ at: row.updated_at || 0, text: String(row.remarks).trim() });
  }
  candidates.sort((a, b) => new Date(b.at) - new Date(a.at));
  return candidates[0]?.text || '';
}

function shapeTracking(project, extras) {
  const commercial = extras.commercial || {};
  const work = extras.work || null;
  const rows = extras.activities || [];
  const map = progress.activityMap(rows);
  const done = progress.allActivitiesDone(map) || Boolean(commercial.design_completed_at);
  const latestAt = rows.map((row) => row.updated_at).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
  const completedAt = commercial.design_completed_at || work?.completed_at || (done ? latestAt : null);
  const stage = progress.designStage(map, work?.status);
  const overall = progress.designStatus(map, work?.status);
  const percent = progress.designPercent(map);
  const activities = Object.fromEntries(progress.ACTIVITIES.map((key) => [key, {
    code: map[key],
    label: progress.statusLabel(map[key]),
  }]));
  return {
    ...project,
    orderNo: project.orderId || null,
    orderDate: project.orderConfirmedAt || null,
    targetDateInput: work?.target_at ? calendarDayKey(work.target_at) : '',
    location: locationOf(commercial, project.location),
    productGroup: productOf(commercial, extras.labels, project.productGroup),
    poStatusCode: commercial.otr_po_status || commercial.payment_status || null,
    poStatus: (commercial.otr_po_status || commercial.payment_status)
      ? progress.statusLabel(commercial.otr_po_status || commercial.payment_status)
      : '—',
    projectValue: projectValueOf(commercial),
    currency: commercial.currency || project.currency || 'INR',
    activities,
    designPercent: percent,
    designPercentLabel: progress.formatDesignPercent(percent),
    designStage: stage.label,
    designStageCode: stage.code,
    designStatus: overall.label,
    designStatusCode: overall.code,
    responsibleId: work?.assigned_user_id ? String(work.assigned_user_id) : null,
    responsibleName: work?.user_name || work?.assigned_name || '',
    delayDays: progress.delayDays(work?.target_at || null, completedAt, done),
    targetDate: work?.target_at || null,
    remarks: latestRemark(work, rows),
    canCompleteDesign: progress.allActivitiesDone(map),
  };
}

async function attachTracking(items) {
  const ids = items.map((item) => item.id);
  const [commercial, work, activities, labels] = await Promise.all([
    commercialRows(ids),
    workRows(ids),
    loadActivities(ids),
    storageLabels(),
  ]);
  const commercialById = new Map(commercial.map((row) => [String(row.id), row]));
  const workById = new Map(work.map((row) => [String(row.project_id), row]));
  const activitiesById = new Map();
  for (const row of activities) {
    const key = String(row.project_id);
    const list = activitiesById.get(key) || [];
    list.push(row);
    activitiesById.set(key, list);
  }
  return items.map((project) => shapeTracking(project, {
    commercial: commercialById.get(String(project.id)),
    work: workById.get(String(project.id)),
    activities: activitiesById.get(String(project.id)) || [],
    labels,
  }));
}

async function ensureWork(projectId, user) {
  await prisma.$executeRaw`
    INSERT INTO project_stage_work (project_id, stage, status, updated_by_name)
    VALUES (CAST(${projectId} AS uuid), 'DESIGN', 'PENDING', ${actor(user)})
    ON CONFLICT (project_id, stage) DO NOTHING
  `;
}

async function recordEvent(projectId, activity, previousStatus, newStatus, remarks, user) {
  await prisma.$executeRaw`
    INSERT INTO design_activity_events (
      project_id, activity, previous_status, new_status, remarks, user_id, user_name
    ) VALUES (
      CAST(${projectId} AS uuid),
      ${activity},
      ${previousStatus},
      ${newStatus},
      ${remarks || null},
      CAST(${String(user.id)} AS uuid),
      ${actor(user)}
    )
  `;
}

async function assertAssignee(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw new AppError(400, 'Choose a design team member.');
  const codes = Prisma.join(DESIGN_ROLES);
  const rows = await prisma.$queryRaw`
    SELECT u.id::text AS id, u.full_name AS name
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = CAST(${String(id)} AS uuid)
      AND COALESCE(u.is_active, true) = true
      AND r.code IN (${codes})
    LIMIT 1
  `;
  if (!rows[0]?.name) throw new AppError(400, 'Choose a design team member.');
  return rows[0];
}

function parseTarget(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new AppError(400, 'Target date is not valid.');
  return new Date(`${text}T00:00:00.000Z`);
}

function sameDay(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return calendarDayKey(left) === calendarDayKey(right);
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

async function loadActivity(projectId, activity) {
  const rows = await prisma.$queryRaw`
    SELECT * FROM design_activities
    WHERE project_id = CAST(${projectId} AS uuid) AND activity = ${activity}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function persistActivity(projectId, activity, body, user, options = {}) {
  if (!progress.ACTIVITIES.includes(activity)) throw new AppError(400, 'Unknown design activity.');
  if (!canEditDesign(user)) throw new AppError(403, 'Access denied.');
  const project = await confirmedProject(projectId);
  const inDesign = project.currentStageCode === 'DESIGN';
  if (options.requireDesign && !inDesign) {
    throw new AppError(400, 'Design activities can be updated while the order is in Design.');
  }
  const existing = await loadActivity(projectId, activity);
  if (!existing && options.allowCreate === false) throw new AppError(404, 'This design activity does not exist.');
  if (inDesign) await ensureWork(projectId, user);

  const data = body || {};
  const previousStatus = existing?.status ? progress.normalizeStatus(existing.status) : 'PENDING';
  let nextStatus = previousStatus;
  if (data.status !== undefined) {
    nextStatus = progress.normalizeStatus(data.status);
    if (!progress.isActivityStatus(nextStatus)) throw new AppError(400, 'Choose a design activity status.');
  }
  const remarks = data.remarks === undefined ? (existing?.remarks || null) : textOrNull(data.remarks, 4000);
  const pendingReason = data.pendingReason === undefined
    ? (existing?.pending_reason || null)
    : textOrNull(data.pendingReason, 500);

  let responsibleId = existing?.assigned_user_id ? String(existing.assigned_user_id) : null;
  let responsibleName = existing?.assigned_name || null;
  if (data.responsibleId !== undefined) {
    if (!data.responsibleId) {
      responsibleId = null;
      responsibleName = null;
    } else {
      const assignee = await assertAssignee(data.responsibleId);
      responsibleId = assignee.id;
      responsibleName = assignee.name;
    }
  }

  let assignedAt = existing?.assigned_at || null;
  const assignedInput = parseDay(data.assignedDate, 'Assigned date');
  if (assignedInput !== undefined) assignedAt = assignedInput;
  else if (!assignedAt && responsibleId && data.responsibleId) assignedAt = new Date();

  let targetAt = existing?.target_at || null;
  const targetInput = parseDay(data.targetDate, 'Target date');
  if (targetInput !== undefined) targetAt = targetInput;

  const finishedBefore = ['COMPLETED', 'APPROVED'].includes(previousStatus);
  const nowDone = ['COMPLETED', 'APPROVED'].includes(nextStatus);
  let completedAt = existing?.completed_at || null;
  const completedInput = parseDay(data.completedDate, 'Completed date');
  if (completedInput !== undefined) completedAt = completedInput;
  else if (nowDone && !finishedBefore && !completedAt) completedAt = new Date();
  else if (!nowDone && finishedBefore) completedAt = null;

  const unchanged = Boolean(existing)
    && previousStatus === nextStatus
    && (existing.remarks || null) === remarks
    && (existing.pending_reason || null) === pendingReason
    && (existing.assigned_user_id ? String(existing.assigned_user_id) : null) === responsibleId
    && (existing.assigned_name || null) === (responsibleName || null)
    && sameDay(existing.assigned_at, assignedAt)
    && sameDay(existing.target_at, targetAt)
    && sameDay(existing.completed_at, completedAt);
  if (unchanged) return { changed: false, advanced: false, orderNo: project.orderId || project.projectId };

  const now = new Date();
  const name = actor(user);
  const assigneeSql = responsibleId
    ? Prisma.sql`CAST(${responsibleId} AS uuid)`
    : Prisma.sql`NULL`;
  const previousResponsible = existing?.assigned_name || null;
  const previousTarget = existing?.target_at || null;
  const previousPending = existing?.pending_reason || null;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO design_activities (
        project_id, activity, status, remarks, pending_reason,
        assigned_user_id, assigned_name, assigned_at, target_at, completed_at,
        updated_by, updated_by_name, updated_at
      ) VALUES (
        CAST(${projectId} AS uuid), ${activity}, ${nextStatus}, ${remarks}, ${pendingReason},
        ${assigneeSql}, ${responsibleName}, ${assignedAt}, ${targetAt}, ${completedAt},
        CAST(${String(user.id)} AS uuid), ${name}, ${now}
      )
      ON CONFLICT (project_id, activity) DO UPDATE
      SET status = EXCLUDED.status,
          remarks = EXCLUDED.remarks,
          pending_reason = EXCLUDED.pending_reason,
          assigned_user_id = EXCLUDED.assigned_user_id,
          assigned_name = EXCLUDED.assigned_name,
          assigned_at = EXCLUDED.assigned_at,
          target_at = EXCLUDED.target_at,
          completed_at = EXCLUDED.completed_at,
          updated_by = EXCLUDED.updated_by,
          updated_by_name = EXCLUDED.updated_by_name,
          updated_at = EXCLUDED.updated_at
    `;
    await tx.$executeRaw`
      INSERT INTO design_activity_events (
        project_id, activity, previous_status, new_status, remarks,
        previous_target_at, new_target_at,
        previous_responsible_name, new_responsible_name,
        previous_pending_reason, new_pending_reason,
        user_id, user_name, created_at
      ) VALUES (
        CAST(${projectId} AS uuid), ${activity}, ${previousStatus}, ${nextStatus}, ${remarks},
        ${previousTarget}, ${targetAt},
        ${previousResponsible}, ${responsibleName},
        ${previousPending}, ${pendingReason},
        CAST(${String(user.id)} AS uuid), ${name}, ${now}
      )
    `;
    if (inDesign && !progress.isIdle(nextStatus)) {
      await tx.$executeRaw`
        UPDATE project_stage_work
        SET started_at = COALESCE(started_at, ${now}),
            status = CASE WHEN status = 'PENDING' THEN 'IN_PROGRESS' ELSE status END,
            updated_by_name = ${name},
            updated_at = ${now}
        WHERE project_id = CAST(${projectId} AS uuid) AND stage = 'DESIGN' AND status <> 'ON_HOLD'
      `;
    }
  });
  try {
    const lifecycle = require('./lifecycleService');
    await lifecycle.record({
      projectId,
      action: `${progress.ACTIVITY_LABELS[activity]} ${progress.statusLabel(nextStatus)}`,
      previousStatus: previousStatus,
      newStatus: nextStatus,
      remarks,
      user,
    });
  } catch (error) {
    console.error('Design activity was saved, but the workflow event was not.', error);
  }
  if (!inDesign || options.advance === false) {
    return { changed: true, advanced: false, orderNo: project.orderId || project.projectId };
  }
  const advanced = await maybeAdvance(projectId, user);
  return {
    changed: true,
    advanced: Boolean(advanced.advanced),
    stage: advanced.stage || null,
    orderNo: project.orderId || project.projectId,
  };
}

async function applyActivity(projectId, activity, status, remarks, user, options = {}) {
  const body = remarks === undefined ? { status } : { status, remarks };
  return persistActivity(projectId, activity, body, user, {
    requireDesign: true,
    allowCreate: true,
    advance: options.advance !== false,
  });
}

async function updateActivity(projectId, activity, body, user) {
  return persistActivity(projectId, activity, body, user, {
    requireDesign: false,
    allowCreate: true,
    advance: true,
  });
}

async function maybeAdvance(projectId, user) {
  const work = await prisma.$queryRaw`
    SELECT status FROM project_stage_work
    WHERE project_id = CAST(${projectId} AS uuid) AND stage = 'DESIGN'
    LIMIT 1
  `;
  if (progress.normalizeStatus(work[0]?.status) === 'ON_HOLD') return { advanced: false };
  const rows = await prisma.$queryRaw`
    SELECT activity, status FROM design_activities
    WHERE project_id = CAST(${projectId} AS uuid)
  `;
  if (!progress.allActivitiesDone(progress.activityMap(rows))) return { advanced: false };
  try {
    const result = await completeDesign(projectId, user);
    return { advanced: true, stage: result.currentStage };
  } catch (error) {
    if (error instanceof AppError && (error.status === 409 || error.status === 400)) return { advanced: false };
    throw error;
  }
}

async function updateTracking(projectId, body, user) {
  if (!canEditDesign(user)) throw new AppError(403, 'Access denied.');
  const project = await confirmedProject(projectId);
  if (project.currentStageCode !== 'DESIGN') throw new AppError(400, 'This order is not in the Design stage.');
  await ensureWork(projectId, user);
  const data = body || {};
  if (data.activities && typeof data.activities === 'object') {
    for (const key of progress.ACTIVITIES) {
      if (data.activities[key] !== undefined) {
        await applyActivity(projectId, key, data.activities[key], undefined, user, { advance: false });
      }
    }
  }
  const now = new Date();
  const name = actor(user);
  if (data.responsibleId !== undefined) {
    const assignee = data.responsibleId ? await assertAssignee(data.responsibleId) : null;
    if (assignee) {
      await prisma.$executeRaw`
        UPDATE project_stage_work
        SET assigned_user_id = CAST(${assignee.id} AS uuid),
            assigned_name = ${assignee.name},
            updated_by_name = ${name},
            updated_at = ${now}
        WHERE project_id = CAST(${projectId} AS uuid) AND stage = 'DESIGN'
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE project_stage_work
        SET assigned_user_id = NULL,
            assigned_name = NULL,
            updated_by_name = ${name},
            updated_at = ${now}
        WHERE project_id = CAST(${projectId} AS uuid) AND stage = 'DESIGN'
      `;
    }
  }
  const target = parseTarget(data.targetDate);
  if (target !== undefined) {
    if (target) {
      await prisma.$executeRaw`
        UPDATE project_stage_work
        SET target_at = ${target}, updated_by_name = ${name}, updated_at = ${now}
        WHERE project_id = CAST(${projectId} AS uuid) AND stage = 'DESIGN'
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE project_stage_work
        SET target_at = NULL, updated_by_name = ${name}, updated_at = ${now}
        WHERE project_id = CAST(${projectId} AS uuid) AND stage = 'DESIGN'
      `;
    }
  }
  if (data.remarks !== undefined) {
    const remarks = String(data.remarks || '').slice(0, 4000);
    await prisma.$executeRaw`
      UPDATE project_stage_work
      SET remarks = ${remarks || null}, updated_by_name = ${name}, updated_at = ${now}
      WHERE project_id = CAST(${projectId} AS uuid) AND stage = 'DESIGN'
    `;
    await recordEvent(projectId, 'DESIGN', null, null, remarks, user);
  }
  const currentRows = await prisma.$queryRaw`
    SELECT activity, status FROM design_activities
    WHERE project_id = CAST(${projectId} AS uuid)
  `;
  const map = progress.activityMap(currentRows);
  const done = progress.allActivitiesDone(map);
  const started = progress.ACTIVITIES.some((key) => !progress.isIdle(map[key]));
  const status = data.status !== undefined ? progress.normalizeStatus(data.status) : undefined;
  if (status && !progress.OVERALL_STATUSES.some((row) => row.code === status)) {
    throw new AppError(400, 'Choose a design status.');
  }
  if (status === 'PENDING' && started) throw new AppError(400, 'Design is already in progress.');
  if (status === 'COMPLETED' && !done) {
    throw new AppError(400, 'Complete or approve SHOP, BOM, Manufacturing Drawing, and Installation Drawing before completing design.');
  }
  const work = await prisma.$queryRaw`
    SELECT status FROM project_stage_work
    WHERE project_id = CAST(${projectId} AS uuid) AND stage = 'DESIGN'
    LIMIT 1
  `;
  const previous = work[0]?.status || 'PENDING';
  if (status && status !== 'COMPLETED' && status !== previous) {
    await prisma.$executeRaw`
      UPDATE project_stage_work
      SET status = ${status},
          started_at = CASE WHEN ${status} = 'IN_PROGRESS' THEN COALESCE(started_at, ${now}) ELSE started_at END,
          updated_by_name = ${name},
          updated_at = ${now}
      WHERE project_id = CAST(${projectId} AS uuid) AND stage = 'DESIGN'
    `;
    await recordEvent(projectId, 'DESIGN', previous, status, data.remarks || null, user);
    try {
      const lifecycle = require('./lifecycleService');
      await lifecycle.record({
        projectId,
        action: `Design ${progress.statusLabel(status)}`,
        previousStatus: previous,
        newStatus: status,
        remarks: data.remarks || null,
        user,
      });
    } catch (error) {
      console.error('Design status was saved, but the workflow event was not.', error);
    }
  }
  if (status === 'ON_HOLD') return { ok: true, advanced: false };
  const stillHeld = status === undefined && progress.normalizeStatus(previous) === 'ON_HOLD';
  if (stillHeld) return { ok: true, advanced: false };
  if (done) {
    const result = await completeDesign(projectId, user, { force: status === 'COMPLETED' });
    return { ok: true, advanced: true, stage: result.currentStage, orderNo: project.orderId || project.projectId };
  }
  return { ok: true, advanced: false };
}

function shapeActivityEvent(row) {
  return {
    id: row.id,
    activity: row.activity,
    activityLabel: progress.ACTIVITY_LABELS[row.activity] || (row.activity ? progress.statusLabel(row.activity) : 'Design'),
    previousStatus: row.previous_status,
    previousLabel: row.previous_status ? progress.statusLabel(row.previous_status) : '—',
    newStatus: row.new_status,
    newLabel: row.new_status ? progress.statusLabel(row.new_status) : '—',
    previousTargetDate: row.previous_target_at || null,
    newTargetDate: row.new_target_at || null,
    previousResponsible: row.previous_responsible_name || '',
    newResponsible: row.new_responsible_name || '',
    previousPendingReason: row.previous_pending_reason || '',
    newPendingReason: row.new_pending_reason || '',
    remarks: row.remarks || '',
    userName: row.user_name || '—',
    createdAt: row.created_at,
  };
}

async function activityHistory(projectId, activity) {
  await confirmedProject(projectId);
  const activityCode = activity ? requireActivity(activity) : null;
  const rows = activityCode
    ? await prisma.$queryRaw`
        SELECT * FROM design_activity_events
        WHERE project_id = CAST(${projectId} AS uuid) AND activity = ${activityCode}
        ORDER BY created_at DESC
        LIMIT 200
      `
    : await prisma.$queryRaw`
        SELECT * FROM design_activity_events
        WHERE project_id = CAST(${projectId} AS uuid)
        ORDER BY created_at DESC
        LIMIT 200
      `;
  return { items: rows.map(shapeActivityEvent) };
}

function shapeLogRow(row, project, commercial, labels) {
  const status = progress.normalizeStatus(row.status);
  return {
    id: row.id,
    projectId: project.id,
    projectCode: project.projectId,
    orderNo: project.orderId || null,
    orderDate: project.orderConfirmedAt || null,
    customer: commercial?.otr_customer || project.customer || '—',
    location: locationOf(commercial, project.location),
    product: productOf(commercial, labels, project.productGroup),
    activity: row.activity,
    activityLabel: progress.ACTIVITY_LABELS[row.activity] || row.activity,
    responsibleId: row.assigned_user_id ? String(row.assigned_user_id) : null,
    responsibleName: row.user_name || row.assigned_name || '',
    assignedDate: row.assigned_at || null,
    assignedDateInput: row.assigned_at ? calendarDayKey(row.assigned_at) : '',
    targetDate: row.target_at || null,
    targetDateInput: row.target_at ? calendarDayKey(row.target_at) : '',
    completedDate: row.completed_at || null,
    completedDateInput: row.completed_at ? calendarDayKey(row.completed_at) : '',
    status,
    statusLabel: progress.statusLabel(status),
    delayDays: progress.activityDelayDays(row.target_at, row.completed_at, status),
    pendingReason: row.pending_reason || '',
    remarks: row.remarks || '',
    currentStageCode: project.currentStageCode || null,
  };
}

async function listActivityLog(user) {
  const otr = await orders.listOtr();
  const projects = otr.items.filter((item) => item.id);
  const ids = projects.map((item) => item.id);
  let activities = [];
  try {
    if (ids.length) {
      const idSql = idList(ids);
      activities = await prisma.$queryRaw`
        SELECT a.*, u.full_name AS user_name
        FROM design_activities a
        LEFT JOIN users u ON u.id = a.assigned_user_id
        WHERE a.project_id IN (${idSql})
      `;
    }
  } catch (error) {
    if (String(error.message || '').includes('design_activities')) {
      throw new AppError(503, 'Design activity storage is not ready.');
    }
    throw error;
  }
  const [commercial, labels, assignees] = await Promise.all([
    commercialRows(ids),
    storageLabels(),
    designAssignees(),
  ]);
  const projectById = new Map(projects.map((item) => [String(item.id), item]));
  const commercialById = new Map(commercial.map((row) => [String(row.id), row]));
  const rank = new Map(progress.ACTIVITIES.map((key, index) => [key, index]));
  const items = activities
    .map((row) => {
      const project = projectById.get(String(row.project_id));
      if (!project || !progress.ACTIVITIES.includes(row.activity)) return null;
      return shapeLogRow(row, project, commercialById.get(String(project.id)), labels);
    })
    .filter(Boolean)
    .sort((a, b) => {
      const left = a.orderDate ? new Date(a.orderDate).getTime() : 0;
      const right = b.orderDate ? new Date(b.orderDate).getTime() : 0;
      if (left !== right) return right - left;
      const order = String(a.orderNo || a.projectCode || '').localeCompare(String(b.orderNo || b.projectCode || ''));
      if (order) return order;
      return (rank.get(a.activity) ?? 9) - (rank.get(b.activity) ?? 9);
    });
  return {
    canEdit: canEditDesign(user),
    activityOrder: progress.ACTIVITIES,
    activityLabels: progress.ACTIVITY_LABELS,
    activityStatuses: progress.ACTIVITY_STATUSES,
    assignees,
    fileAccept: {
      BOM: [...BOM_EXT].map((ext) => `.${ext}`).join(','),
      DRAWING: [...DRAWING_EXT].map((ext) => `.${ext}`).join(','),
    },
    items,
  };
}

async function listActivityFiles(projectId) {
  const project = await confirmedProject(projectId);
  const kinds = Prisma.join(progress.ACTIVITIES);
  const rows = await prisma.$queryRaw`
    SELECT * FROM design_files
    WHERE project_id = CAST(${projectId} AS uuid)
      AND archived = false
      AND kind IN (${kinds})
    ORDER BY kind ASC, version DESC
  `;
  return { project, items: rows.map(shapeFile) };
}

function requireActivity(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!progress.ACTIVITIES.includes(code)) throw new AppError(400, 'Unknown design activity.');
  return code;
}

async function saveDesignEntry(body, user) {
  if (!canEditDesign(user)) throw new AppError(403, 'Access denied.');
  const projectId = String(body?.projectId || '');
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new AppError(400, 'Choose an order.');
  const project = await confirmedProject(projectId);
  if (project.currentStageCode !== 'DESIGN') throw new AppError(400, 'This order is not in the Design stage.');
  const customer = textOrNull(body.customer, 200);
  const location = textOrNull(body.location, 200);
  const product = textOrNull(body.productGroup, 200);
  const poStatus = body.poStatus ? String(body.poStatus).trim().toUpperCase().slice(0, 40) : null;
  if (poStatus && !/^[A-Z0-9_]+$/.test(poStatus)) throw new AppError(400, 'Choose a PO status.');
  let projectValue = null;
  if (body.projectValue !== undefined && body.projectValue !== null && body.projectValue !== '') {
    const number = Number(body.projectValue);
    if (!Number.isFinite(number) || number < 0) throw new AppError(400, 'Project value cannot be negative.');
    projectValue = Math.round(number * 100) / 100;
  }
  const now = new Date();
  const targetDate = body.targetDate ? new Date(`${String(body.targetDate).slice(0, 10)}T00:00:00.000Z`) : null;
  await prisma.$executeRaw`
    UPDATE projects
    SET otr_customer = ${customer},
        otr_location = ${location},
        otr_product = ${product},
        otr_po_status = ${poStatus},
        otr_project_value = ${projectValue},
        target_end_date = ${targetDate},
        updated_at = ${now}
    WHERE id = CAST(${projectId} AS uuid)
  `;
  const activities = {};
  for (const key of progress.ACTIVITIES) {
    activities[key] = body.activities?.[key] || 'PENDING';
  }
  return updateTracking(projectId, {
    activities,
    responsibleId: body.responsibleId || null,
    targetDate: body.targetDate || null,
    remarks: body.remarks || null,
  }, user);
}

module.exports = {
  saveDesignEntry,
  listProjects,
  listFiles,
  uploadFile,
  updateFile,
  removeFile,
  fileForDownload,
  completeDesign,
  canEditDesign,
  updateTracking,
  applyActivity,
  updateActivity,
  listActivityLog,
  activityHistory,
  listActivityFiles,
  requireActivity,
  DRAWING_EXT,
  BOM_EXT,
};
