const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');
const { prisma } = require('../prisma');
const { AppError } = require('../utils/errors');
const { can } = require('../middleware/authorize');
const { calendarDayKey } = require('../utils/leadDeadline');

const DRAWING_EXT = new Set(['dwg', 'dxf', 'pdf', 'png', 'jpg', 'jpeg']);
const BOM_EXT = new Set(['xlsx', 'xls', 'csv', 'pdf']);
const OTR_ORDER = ['DESIGN', 'PROCUREMENT', 'PRODUCTION', 'QUALITY', 'DISPATCH', 'INSTALLATION', 'COMPLETED'];
const NEXT_STAGE = {
  PROCUREMENT: 'PRODUCTION',
  PRODUCTION: 'QUALITY',
  QUALITY: 'DISPATCH',
  DISPATCH: 'INSTALLATION',
  INSTALLATION: 'COMPLETED',
};

const STATUS_LABELS = {
  NEW: 'New',
  DESIGN: 'Design',
  DESIGN_SUBMITTED: 'Design Submitted',
  CUSTOMER_REVIEW: 'Customer Review',
  CUSTOMER_APPROVED: 'Customer Approved',
  NEGOTIATION: 'Negotiation / Revision Required',
  DESIGN_REVISION: 'Design Revision',
};

function actor(user) {
  return user?.fullName || user?.username || 'User';
}

function roleOk(user, permission, roles = []) {
  if (!user) return false;
  if (user.roles?.some((role) => role.code === 'ADMIN' || role.isManagement)) return true;
  if (permission && can(user, permission)) return true;
  return user.roles?.some((role) => roles.includes(role.code));
}

function assertFile(file, kind) {
  if (!file?.path || !file.size) {
    if (file?.path) fs.rmSync(file.path, { force: true });
    throw new AppError(400, 'The file is empty or could not be read.');
  }
  const ext = path.extname(file.originalname).slice(1).toLowerCase();
  const allowed = kind === 'PRE_BOM' ? BOM_EXT : DRAWING_EXT;
  if (!allowed.has(ext)) {
    fs.rmSync(file.path, { force: true });
    throw new AppError(400, kind === 'PRE_BOM'
      ? 'BOM files must be XLSX, XLS, CSV, or PDF.'
      : 'Drawings must be DWG, DXF, PDF, or an image.');
  }
  return ext;
}

async function record({ leadId = null, projectId = null, action, previousStatus = null, newStatus = null, remarks = null, user }) {
  await prisma.$executeRaw`
    INSERT INTO workflow_events (
      lead_id, project_id, action, previous_status, new_status, remarks, user_id, user_name
    ) VALUES (
      ${leadId ? String(leadId) : null}::uuid,
      ${projectId ? String(projectId) : null}::uuid,
      ${action},
      ${previousStatus},
      ${newStatus},
      ${remarks},
      ${user?.id || null}::uuid,
      ${actor(user)}
    )
  `;
}

async function leadRow(id) {
  const rows = await prisma.$queryRaw`
    SELECT l.id, l.lead_code, l.company_name, l.company_address, l.product, l.product_1,
           l.output_required, l.priority, l.submission_deadline, l.workflow_status,
           l.workflow_submitted_at, l.workflow_submitted_by_name, l.workflow_sent_at, l.workflow_sent_by_name,
           l.workflow_drawing_version, l.workflow_bom_version, l.workflow_approved_at,
           l.workflow_approval_remarks, l.workflow_approved_drawing_version, l.workflow_approved_bom_version,
           l.is_archived, u.full_name AS owner_name, p.id AS project_id, p.project_code
    FROM leads l
    LEFT JOIN users u ON u.id = l.owner_id
    LEFT JOIN LATERAL (
      SELECT id, project_code FROM projects WHERE lead_id = l.id ORDER BY created_at DESC NULLS LAST LIMIT 1
    ) p ON true
    WHERE l.id = CAST(${id} AS uuid)
  `;
  if (!rows[0] || rows[0].is_archived) throw new AppError(404, 'Lead not found.');
  return rows[0];
}

function shapeLead(row, files = []) {
  const drawings = files.filter((file) => file.kind === 'PRE_DRAWING');
  const boms = files.filter((file) => file.kind === 'PRE_BOM');
  const latest = (list) => list[0] || null;
  return {
    id: row.id,
    leadId: row.lead_code,
    customer: row.company_name || '—',
    location: row.company_address || '—',
    productGroup: row.product || row.product_1 || '—',
    salesPerson: row.owner_name || '—',
    outputRequired: row.output_required || '—',
    deadline: row.submission_deadline,
    status: row.workflow_status || 'NEW',
    statusLabel: STATUS_LABELS[row.workflow_status] || row.workflow_status || 'New',
    projectId: row.project_id,
    projectCode: row.project_code,
    submittedAt: row.workflow_submitted_at,
    submittedBy: row.workflow_submitted_by_name,
    sentAt: row.workflow_sent_at,
    sentBy: row.workflow_sent_by_name,
    drawingVersion: latest(drawings) ? `V${latest(drawings).version}` : '—',
    bomVersion: latest(boms) ? `V${latest(boms).version}` : '—',
    approvedAt: row.workflow_approved_at,
    approvalRemarks: row.workflow_approval_remarks || '',
    files: files.map(shapeFile),
  };
}

function shapeFile(row) {
  return {
    id: row.id,
    kind: row.kind,
    drawingName: row.drawing_name,
    fileName: row.file_name,
    fileType: row.file_type,
    version: row.version,
    versionLabel: `V${row.version}`,
    status: row.status,
    remarks: row.remarks || '',
    uploadedBy: row.uploaded_by_name || '—',
    uploadedAt: row.uploaded_at,
  };
}

async function listPresales(user) {
  const leads = await prisma.$queryRaw`
    SELECT l.id, l.lead_code, l.company_name, l.company_address, l.product, l.product_1,
           l.output_required, l.priority, l.submission_deadline, l.workflow_status,
           l.workflow_submitted_at, l.workflow_submitted_by_name, l.workflow_sent_at, l.workflow_sent_by_name,
           l.workflow_drawing_version, l.workflow_bom_version, l.workflow_approved_at,
           l.workflow_approval_remarks, l.workflow_approved_drawing_version, l.workflow_approved_bom_version,
           l.is_archived, u.full_name AS owner_name, p.id AS project_id, p.project_code
    FROM leads l
    LEFT JOIN users u ON u.id = l.owner_id
    LEFT JOIN LATERAL (
      SELECT id, project_code FROM projects WHERE lead_id = l.id ORDER BY created_at DESC NULLS LAST LIMIT 1
    ) p ON true
    WHERE l.is_archived = false
    ORDER BY l.created_at DESC NULLS LAST
  `;
  let files = [];
  try {
    if (leads.length) {
      const ids = Prisma.join(leads.map((lead) => Prisma.sql`${String(lead.id)}::uuid`));
      files = await prisma.$queryRaw`
        SELECT * FROM presales_files
        WHERE archived = false AND lead_id IN (${ids})
        ORDER BY version DESC
      `;
    }
  } catch (error) {
    if (String(error.message || '').includes('presales_files')) throw new AppError(503, 'Pre-sales storage is not ready.');
    throw error;
  }
  const grouped = new Map();
  for (const file of files) {
    const list = grouped.get(String(file.lead_id)) || [];
    list.push(file);
    grouped.set(String(file.lead_id), list);
  }
  return {
    canDesign: roleOk(user, 'design.edit'),
    canSales: roleOk(user, 'leads.edit'),
    items: leads.map((lead) => shapeLead(lead, grouped.get(String(lead.id)) || [])),
  };
}

async function uploadPresales({ leadId, kind, file, drawingName, remarks, user }) {
  if (!roleOk(user, 'design.edit')) throw new AppError(403, 'Access denied.');
  const lead = await leadRow(leadId);
  const open = ['NEW', 'DESIGN', 'DESIGN_REVISION'];
  if (!open.includes(lead.workflow_status || 'NEW')) {
    fs.rmSync(file.path, { force: true });
    throw new AppError(400, 'Drawings and BOM can be uploaded while the lead is with Design.');
  }
  const ext = assertFile(file, kind);
  const name = String(drawingName || file.originalname || '').trim().slice(0, 240);
  try {
    const created = await prisma.$transaction(async (tx) => {
      const current = await tx.$queryRaw`
        SELECT COALESCE(MAX(version), 0)::int AS version
        FROM presales_files
        WHERE lead_id = CAST(${leadId} AS uuid) AND kind = ${kind}
      `;
      const version = Number(current[0]?.version || 0) + 1;
      const rows = await tx.$queryRaw`
        INSERT INTO presales_files (
          lead_id, kind, drawing_name, file_name, stored_name, storage_path,
          mime_type, file_size, file_type, version, status, remarks, uploaded_by, uploaded_by_name
        ) VALUES (
          CAST(${leadId} AS uuid), ${kind}, ${name || null}, ${file.originalname},
          ${path.basename(file.path)}, ${file.path}, ${file.mimetype || null}, ${file.size},
          ${ext}, ${version}, ${kind === 'PRE_BOM' ? 'UPLOADED' : 'IN_PROGRESS'},
          ${remarks || null}, CAST(${user.id} AS uuid), ${actor(user)}
        ) RETURNING *
      `;
      if ((lead.workflow_status || 'NEW') === 'NEW') {
        await tx.$executeRaw`
          UPDATE leads SET workflow_status = 'DESIGN', updated_at = ${new Date()}
          WHERE id = CAST(${leadId} AS uuid)
        `;
      }
      return rows[0];
    });
    await record({
      leadId,
      projectId: lead.project_id,
      action: kind === 'PRE_BOM' ? 'BOM Uploaded' : 'Drawing Uploaded',
      previousStatus: lead.workflow_status,
      newStatus: (lead.workflow_status || 'NEW') === 'NEW' ? 'DESIGN' : lead.workflow_status,
      remarks: `V${created.version}`,
      user,
    });
    return shapeFile(created);
  } catch (error) {
    fs.rmSync(file.path, { force: true });
    throw error;
  }
}

async function fileForDownload(id) {
  const rows = await prisma.$queryRaw`SELECT * FROM presales_files WHERE id = CAST(${id} AS uuid) AND archived = false`;
  const file = rows[0];
  if (!file || !fs.existsSync(file.storage_path)) throw new AppError(404, 'File not found.');
  return file;
}

async function latestVersions(leadId) {
  const rows = await prisma.$queryRaw`
    SELECT kind, MAX(version)::int AS version
    FROM presales_files
    WHERE lead_id = CAST(${leadId} AS uuid) AND archived = false
    GROUP BY kind
  `;
  return {
    drawing: rows.find((row) => row.kind === 'PRE_DRAWING')?.version || null,
    bom: rows.find((row) => row.kind === 'PRE_BOM')?.version || null,
  };
}

async function setStatus(lead, next, patch, user, action) {
  const now = new Date();
  await prisma.$executeRaw`
    UPDATE leads
    SET workflow_status = ${next},
        workflow_submitted_at = COALESCE(${patch.submittedAt || null}, workflow_submitted_at),
        workflow_submitted_by_name = COALESCE(${patch.submittedBy || null}, workflow_submitted_by_name),
        workflow_sent_at = COALESCE(${patch.sentAt || null}, workflow_sent_at),
        workflow_sent_by_name = COALESCE(${patch.sentBy || null}, workflow_sent_by_name),
        workflow_drawing_version = COALESCE(${patch.drawingVersion ?? null}, workflow_drawing_version),
        workflow_bom_version = COALESCE(${patch.bomVersion ?? null}, workflow_bom_version),
        workflow_approved_at = COALESCE(${patch.approvedAt || null}, workflow_approved_at),
        workflow_approval_remarks = COALESCE(${patch.remarks || null}, workflow_approval_remarks),
        workflow_approved_drawing_version = COALESCE(${patch.approvedDrawing ?? null}, workflow_approved_drawing_version),
        workflow_approved_bom_version = COALESCE(${patch.approvedBom ?? null}, workflow_approved_bom_version),
        updated_at = ${now}
    WHERE id = ${lead.id}::uuid
  `;
  await record({
    leadId: lead.id,
    projectId: lead.project_id,
    action,
    previousStatus: lead.workflow_status,
    newStatus: next,
    remarks: patch.remarks || null,
    user,
  });
  return { id: lead.id, leadId: lead.lead_code, status: next, statusLabel: STATUS_LABELS[next] || next };
}

async function submitToSales(leadId, user) {
  if (!roleOk(user, 'design.edit')) throw new AppError(403, 'Access denied.');
  const lead = await leadRow(leadId);
  if (!['NEW', 'DESIGN', 'DESIGN_REVISION'].includes(lead.workflow_status || 'NEW')) {
    throw new AppError(400, 'This lead is not with Design.');
  }
  const versions = await latestVersions(leadId);
  if (!versions.drawing || !versions.bom) {
    throw new AppError(400, 'Upload a basic drawing and an initial BOM before submitting to Sales.');
  }
  return setStatus(lead, 'DESIGN_SUBMITTED', {
    submittedAt: new Date(),
    submittedBy: actor(user),
    drawingVersion: versions.drawing,
    bomVersion: versions.bom,
  }, user, 'Design Submitted');
}

async function sendToCustomer(leadId, user) {
  if (!roleOk(user, 'leads.edit')) throw new AppError(403, 'Access denied.');
  const lead = await leadRow(leadId);
  if (lead.workflow_status !== 'DESIGN_SUBMITTED') throw new AppError(400, 'Sales can send a package only after Design submits it.');
  return setStatus(lead, 'CUSTOMER_REVIEW', {
    sentAt: new Date(),
    sentBy: actor(user),
  }, user, 'Sent to Customer');
}

async function approveCustomer(leadId, remarks, user) {
  if (!roleOk(user, 'leads.edit')) throw new AppError(403, 'Access denied.');
  const lead = await leadRow(leadId);
  if (lead.workflow_status !== 'CUSTOMER_REVIEW') throw new AppError(400, 'Customer approval is recorded from Customer Review.');
  return setStatus(lead, 'CUSTOMER_APPROVED', {
    approvedAt: new Date(),
    remarks: remarks || null,
    approvedDrawing: lead.workflow_drawing_version,
    approvedBom: lead.workflow_bom_version,
  }, user, 'Customer Approved');
}

async function startNegotiation(leadId, remarks, user) {
  if (!roleOk(user, 'leads.edit')) throw new AppError(403, 'Access denied.');
  const lead = await leadRow(leadId);
  if (lead.workflow_status !== 'CUSTOMER_REVIEW') throw new AppError(400, 'Negotiation starts from Customer Review.');
  return setStatus(lead, 'NEGOTIATION', { remarks: remarks || null }, user, 'Negotiation Started');
}

async function requestRevision(leadId, remarks, user) {
  if (!roleOk(user, 'leads.edit')) throw new AppError(403, 'Access denied.');
  const lead = await leadRow(leadId);
  if (!['NEGOTIATION', 'CUSTOMER_REVIEW'].includes(lead.workflow_status)) {
    throw new AppError(400, 'A revision can be requested during customer review or negotiation.');
  }
  return setStatus(lead, 'DESIGN_REVISION', { remarks: remarks || null }, user, 'Revision Requested');
}

function pendingDays(from, now = new Date()) {
  const start = calendarDayKey(from);
  const today = calendarDayKey(now);
  if (!start || !today) return 0;
  return Math.max(0, Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000));
}

async function workRows(ids, stage) {
  if (!ids.length) return [];
  const idSql = Prisma.join(ids.map((id) => Prisma.sql`${String(id)}::uuid`));
  if (stage) {
    return prisma.$queryRaw`
      SELECT * FROM project_stage_work
      WHERE stage = ${stage} AND project_id IN (${idSql})
    `;
  }
  return prisma.$queryRaw`SELECT * FROM project_stage_work WHERE project_id IN (${idSql})`;
}

async function attachBom(items) {
  if (!items.length) return items;
  const ids = Prisma.join(items.map((item) => Prisma.sql`${String(item.id)}::uuid`));
  const rows = await prisma.$queryRaw`SELECT id, final_bom_version FROM projects WHERE id IN (${ids})`;
  const versions = new Map(rows.map((row) => [String(row.id), row.final_bom_version]));
  return items.map((item) => ({
    ...item,
    finalBom: versions.get(String(item.id)) ? `V${versions.get(String(item.id))}` : '—',
  }));
}

function withWork(item, row) {
  const anchor = row?.started_at || item.orderConfirmedAt;
  return {
    ...item,
    workStatus: row?.status || 'PENDING',
    startedAt: row?.started_at || null,
    targetAt: row?.target_at || null,
    completedAt: row?.completed_at || null,
    assignedName: row?.assigned_name || '',
    remarks: row?.remarks || '',
    pendingDays: pendingDays(anchor),
    current: true,
  };
}

async function listExecution(stage, user) {
  const wanted = String(stage || '').toUpperCase();
  if (!OTR_ORDER.includes(wanted)) throw new AppError(400, 'Unknown stage.');
  const orders = require('./orderConversionService');
  const otr = await orders.listOtr();
  const items = otr.items.filter((item) => item.currentStageCode === wanted);
  const work = await workRows(items.map((item) => item.id), wanted);
  const byId = new Map(work.map((row) => [String(row.project_id), row]));
  return {
    stage: wanted,
    canEdit: roleOk(user, stagePermission(wanted), stageRoles(wanted)),
    items: await attachBom(items.map((item) => withWork(item, byId.get(String(item.id))))),
  };
}

async function listProductionFlow(user) {
  const orders = require('./orderConversionService');
  const otr = await orders.listOtr();
  const open = new Set(['PRODUCTION', 'QUALITY', 'DISPATCH']);
  const items = otr.items.filter((item) => open.has(item.currentStageCode));
  const work = await workRows(items.map((item) => item.id));
  return {
    canEdit: roleOk(user, 'production.edit', ['QC_MANAGER', 'QC_ENG', 'LOGISTICS', 'STORES']),
    items: await attachBom(items.map((item) => {
      const row = work.find((entry) => String(entry.project_id) === String(item.id) && entry.stage === item.currentStageCode);
      return withWork(item, row);
    })),
  };
}

async function dashboard(user) {
  const orders = require('./orderConversionService');
  const otr = await orders.listOtr();
  const work = await workRows(otr.items.map((item) => item.id));
  const counts = { total: otr.items.length, design: 0, procurement: 0, production: 0, installation: 0, completed: 0 };
  const items = otr.items.map((item) => {
    const code = item.currentStageCode;
    if (code === 'DESIGN') counts.design += 1;
    else if (code === 'PROCUREMENT') counts.procurement += 1;
    else if (code === 'PRODUCTION' || code === 'QUALITY' || code === 'DISPATCH') counts.production += 1;
    else if (code === 'INSTALLATION') counts.installation += 1;
    else if (code === 'COMPLETED') counts.completed += 1;
    const row = work.find((entry) => String(entry.project_id) === String(item.id) && entry.stage === code);
    return withWork(item, row);
  });
  let salesPeople = [];
  try {
    salesPeople = await orders.salesPeople();
  } catch (error) {
    console.error('Sales people could not be loaded.', error);
  }
  return {
    counts,
    stages: ['ORDER CONFIRMED', 'DESIGN', 'PROCUREMENT', 'PRODUCTION', 'QUALITY', 'DISPATCH', 'INSTALLATION', 'COMPLETED'],
    items: await attachBom(items),
    canEdit: roleOk(user, 'projects.edit'),
    salesPeople,
    poStatuses: orders.PO_STATUSES,
  };
}

function stagePermission(stage) {
  if (stage === 'PROCUREMENT') return 'procurement.edit';
  if (stage === 'PRODUCTION' || stage === 'QUALITY' || stage === 'DISPATCH') return 'production.edit';
  if (stage === 'INSTALLATION') return 'installation.edit';
  return 'projects.edit';
}

function stageRoles(stage) {
  if (stage === 'QUALITY') return ['QC_MANAGER', 'QC_ENG'];
  if (stage === 'DISPATCH') return ['LOGISTICS', 'STORES', 'QC_MANAGER'];
  return [];
}

async function ensureWork(projectId, stage, user) {
  await prisma.$executeRaw`
    INSERT INTO project_stage_work (project_id, stage, status, updated_by_name)
    VALUES (CAST(${projectId} AS uuid), ${stage}, 'PENDING', ${actor(user)})
    ON CONFLICT (project_id, stage) DO NOTHING
  `;
}

async function actOnStage(projectId, stage, action, body, user) {
  const wanted = String(stage || '').toUpperCase();
  if (!roleOk(user, stagePermission(wanted), stageRoles(wanted))) throw new AppError(403, 'Access denied.');
  const orders = require('./orderConversionService');
  const otr = await orders.listOtr();
  const project = otr.items.find((item) => String(item.id) === String(projectId));
  if (!project) throw new AppError(404, 'This project is not in the OTR workflow.');
  if (project.currentStageCode !== wanted) {
    throw new AppError(400, 'This stage cannot start until the previous stage is completed.');
  }
  await ensureWork(projectId, wanted, user);
  const now = new Date();
  const assigned = body.assignedName || null;
  const remarks = body.remarks || null;
  const target = body.targetDate ? new Date(body.targetDate) : null;

  if (action === 'hold') {
    await prisma.$executeRaw`
      UPDATE project_stage_work
      SET status = 'ON_HOLD', remarks = COALESCE(${remarks}, remarks), updated_by_name = ${actor(user)}, updated_at = ${now}
      WHERE project_id = CAST(${projectId} AS uuid) AND stage = ${wanted}
    `;
    await record({ projectId, action: `${title(wanted)} On Hold`, previousStatus: project.currentStageCode, newStatus: 'ON_HOLD', remarks, user });
    return { ok: true, status: 'ON_HOLD' };
  }

  if (action === 'start') {
    await prisma.$executeRaw`
      UPDATE project_stage_work
      SET status = ${wanted === 'QUALITY' ? 'INSPECTION' : wanted === 'DISPATCH' ? 'READY' : 'IN_PROGRESS'},
          started_at = COALESCE(started_at, ${now}),
          target_at = COALESCE(${target}, target_at),
          assigned_name = COALESCE(${assigned}, assigned_name),
          remarks = COALESCE(${remarks}, remarks),
          updated_by_name = ${actor(user)},
          updated_at = ${now}
      WHERE project_id = CAST(${projectId} AS uuid) AND stage = ${wanted}
    `;
    await record({ projectId, action: `${title(wanted)} Started`, previousStatus: 'PENDING', newStatus: 'IN_PROGRESS', remarks, user });
    return { ok: true, status: 'IN_PROGRESS' };
  }

  if (action === 'reject' && wanted === 'QUALITY') {
    await prisma.$executeRaw`
      UPDATE project_stage_work
      SET status = 'REJECTED', completed_at = ${now}, remarks = COALESCE(${remarks}, remarks),
          updated_by_name = ${actor(user)}, updated_at = ${now}
      WHERE project_id = CAST(${projectId} AS uuid) AND stage = 'QUALITY'
    `;
    await prisma.$executeRaw`
      UPDATE projects SET otr_stage = 'PRODUCTION', updated_at = ${now} WHERE id = CAST(${projectId} AS uuid)
    `;
    await prisma.$executeRaw`
      INSERT INTO project_stage_work (project_id, stage, status, remarks, updated_by_name)
      VALUES (CAST(${projectId} AS uuid), 'PRODUCTION', 'PENDING', ${remarks}, ${actor(user)})
      ON CONFLICT (project_id, stage) DO UPDATE
      SET status = 'PENDING', completed_at = NULL, updated_at = ${now}, remarks = EXCLUDED.remarks
    `;
    await record({ projectId, action: 'Quality Rejected', previousStatus: 'QUALITY', newStatus: 'PRODUCTION', remarks, user });
    return { ok: true, status: 'PRODUCTION' };
  }

  if (action !== 'complete') throw new AppError(400, 'Unknown action.');
  const next = NEXT_STAGE[wanted];
  if (!next) throw new AppError(400, 'This stage cannot be completed.');
  const doneStatus = wanted === 'QUALITY' ? 'APPROVED' : wanted === 'DISPATCH' ? 'DISPATCHED' : 'COMPLETED';
  await prisma.$executeRaw`
    UPDATE project_stage_work
    SET status = ${doneStatus},
        completed_at = ${now},
        assigned_name = COALESCE(${assigned}, assigned_name),
        remarks = COALESCE(${remarks}, remarks),
        updated_by_name = ${actor(user)},
        updated_at = ${now}
    WHERE project_id = CAST(${projectId} AS uuid) AND stage = ${wanted}
  `;
  if (next === 'COMPLETED') {
    await prisma.$executeRaw`
      UPDATE projects
      SET otr_stage = 'COMPLETED', status = 'COMPLETED', closed_at = COALESCE(closed_at, ${now}),
          closed_by_name = ${actor(user)}, closure_remarks = ${remarks}, updated_at = ${now}
      WHERE id = CAST(${projectId} AS uuid) AND UPPER(COALESCE(otr_stage, '')) = 'INSTALLATION'
    `;
    await record({ projectId, action: 'Project Closed', previousStatus: 'INSTALLATION', newStatus: 'COMPLETED', remarks, user });
  } else {
    await prisma.$executeRaw`
      UPDATE projects SET otr_stage = ${next}, updated_at = ${now}
      WHERE id = CAST(${projectId} AS uuid) AND UPPER(COALESCE(otr_stage, '')) = ${wanted}
    `;
    await ensureWork(projectId, next, user);
    await record({
      projectId,
      action: `${title(wanted)} Completed`,
      previousStatus: wanted,
      newStatus: next,
      remarks,
      user,
    });
  }
  return { ok: true, status: next };
}

function title(stage) {
  return stage.charAt(0) + stage.slice(1).toLowerCase();
}

module.exports = {
  listPresales,
  uploadPresales,
  fileForDownload,
  submitToSales,
  sendToCustomer,
  approveCustomer,
  startNegotiation,
  requestRevision,
  listExecution,
  listProductionFlow,
  dashboard,
  actOnStage,
  record,
};
