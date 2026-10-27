const { Prisma } = require('@prisma/client');
const { prisma } = require('../prisma');
const { AppError } = require('../utils/errors');
const { can } = require('../middleware/authorize');
const { calendarDayKey } = require('../utils/leadDeadline');
const orders = require('./orderConversionService');
const progress = require('./procurementProgress');

function actor(user) {
  return user?.fullName || user?.username || 'User';
}

function canEdit(user) {
  if (!user) return false;
  if (user.roles?.some((role) => role.code === 'ADMIN' || role.isManagement)) return true;
  return can(user, 'procurement.edit');
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

function textOrNull(value, limit) {
  const text = String(value || '').trim().slice(0, limit);
  return text || null;
}

function projectLabel(order) {
  if (!order) return '—';
  return order.orderNo || order.projectCode || '—';
}

function materialKey(materialId, materialName) {
  if (materialId) return `id:${materialId}`;
  return `name:${String(materialName || '').trim().toLowerCase()}`;
}

async function lookupStatuses() {
  try {
    const rows = await prisma.$queryRaw`
      SELECT code, label FROM "Lookup"
      WHERE type = 'PROCUREMENT_LINE_STATUS' AND active = true
      ORDER BY "sortOrder" ASC, label ASC
    `;
    if (rows.length) return rows.map((row) => ({ code: String(row.code), label: row.label }));
  } catch (error) {
    console.error('Procurement statuses could not be loaded.', error);
  }
  return progress.STATUSES;
}

async function vendors() {
  try {
    return await prisma.$queryRaw`
      SELECT id::text AS id, name, vendor_code AS code
      FROM vendors
      WHERE name IS NOT NULL AND btrim(name) <> ''
        AND UPPER(COALESCE(status, 'ACTIVE')) NOT IN ('INACTIVE', 'ARCHIVED', 'DISABLED')
      ORDER BY name ASC
    `;
  } catch (error) {
    console.error('Procurement vendors could not be loaded.', error);
    return [];
  }
}

async function materials() {
  try {
    return await prisma.$queryRaw`
      SELECT id::text AS id, name, COALESCE(material_code, sku) AS code, unit
      FROM materials
      WHERE name IS NOT NULL AND btrim(name) <> ''
      ORDER BY name ASC
    `;
  } catch (error) {
    console.error('Procurement materials could not be loaded.', error);
    return [];
  }
}

async function purchaseOrders(projectIds) {
  if (!projectIds.length) return [];
  try {
    const ids = idList(projectIds);
    return await prisma.$queryRaw`
      SELECT project_id::text AS "projectId", vendor_id::text AS "vendorId",
             po_code AS "poNumber", ordered_at AS "poDate", expected_at AS "expectedAt"
      FROM purchase_orders
      WHERE project_id IN (${ids}) AND po_code IS NOT NULL AND btrim(po_code) <> ''
      ORDER BY ordered_at DESC NULLS LAST
    `;
  } catch (error) {
    console.error('Existing purchase orders could not be loaded.', error);
    return [];
  }
}

function shapeOrder(project) {
  return {
    id: project.id,
    orderNo: project.orderId || null,
    projectCode: project.projectId,
    customer: project.customer || '—',
    projectLabel: project.orderId || project.projectId || '—',
    currentStageCode: project.currentStageCode,
  };
}

async function loadRows() {
  try {
    return await prisma.$queryRaw`
      SELECT r.*, v.name AS live_vendor_name, m.name AS live_material_name, m.unit AS live_unit
      FROM otr_procurement_records r
      LEFT JOIN vendors v ON v.id = r.vendor_id
      LEFT JOIN materials m ON m.id = r.material_id
      WHERE r.archived_at IS NULL
      ORDER BY r.updated_at DESC
    `;
  } catch (error) {
    if (String(error.message || '').includes('otr_procurement_records')) {
      throw new AppError(503, 'Procurement storage is not ready.');
    }
    throw error;
  }
}

function shapeRecord(row, order) {
  const linked = order || {};
  const label = projectLabel(linked);
  const customer = linked.customer || '—';
  const materialName = row.live_material_name || row.material_name || '—';
  const unit = row.live_unit || row.unit || '';
  return {
    id: row.id,
    projectId: row.project_id,
    orderNo: linked.orderNo || null,
    projectCode: linked.projectCode || null,
    projectLabel: label,
    customer,
    projectCustomer: customer !== '—' ? `${label} · ${customer}` : label,
    currentStageCode: linked.currentStageCode || null,
    poNumber: row.po_number,
    materialId: row.material_id ? String(row.material_id) : null,
    materialName,
    unit: unit || null,
    quantity: Number(row.quantity),
    quantityLabel: progress.formatQuantity(row.quantity),
    vendorId: row.vendor_id ? String(row.vendor_id) : null,
    supplier: row.live_vendor_name || row.vendor_name || '—',
    poAt: row.po_at || null,
    poDateInput: dayText(row.po_at),
    expectedAt: row.expected_at || null,
    expectedDateInput: dayText(row.expected_at),
    status: progress.normalize(row.status),
    statusLabel: progress.labelOf(row.status),
    remarks: row.remarks || '',
  };
}

async function listTracking(user) {
  const [rows, otr, statuses, supplierRows, materialRows] = await Promise.all([
    loadRows(),
    orders.listOtr(),
    lookupStatuses(),
    vendors(),
    materials(),
  ]);
  const orderById = new Map(otr.items.map((item) => [String(item.id), shapeOrder(item)]));
  const eligibleIds = otr.items.filter((item) => item.currentStageCode === 'PROCUREMENT').map((item) => String(item.id));
  const knownPoProjects = [...new Set([
    ...eligibleIds,
    ...rows.map((row) => String(row.project_id)),
  ])];
  const pos = await purchaseOrders(knownPoProjects);
  const items = rows
    .map((row) => shapeRecord(row, orderById.get(String(row.project_id))))
    .sort((a, b) => String(a.projectCustomer).localeCompare(String(b.projectCustomer)) || String(a.poNumber).localeCompare(String(b.poNumber)));
  const eligible = otr.items
    .filter((item) => item.currentStageCode === 'PROCUREMENT')
    .map((item) => orderById.get(String(item.id)))
    .filter(Boolean)
    .sort((a, b) => String(a.projectLabel).localeCompare(String(b.projectLabel)));
  return {
    canEdit: canEdit(user),
    items,
    orders: eligible,
    statuses,
    vendors: supplierRows,
    materials: materialRows,
    purchaseOrders: pos.map((row) => ({
      projectId: row.projectId,
      vendorId: row.vendorId || null,
      poNumber: row.poNumber,
      poDateInput: row.poDate ? calendarDayKey(row.poDate) : '',
      expectedDateInput: row.expectedAt ? calendarDayKey(row.expectedAt) : '',
    })),
  };
}

async function assertVendor(id) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(String(id))) throw new AppError(400, 'Choose a supplier.');
  const rows = await prisma.$queryRaw`
    SELECT id::text AS id, name
    FROM vendors
    WHERE id = CAST(${String(id)} AS uuid)
      AND UPPER(COALESCE(status, 'ACTIVE')) NOT IN ('INACTIVE', 'ARCHIVED', 'DISABLED')
    LIMIT 1
  `;
  if (!rows[0]?.name) throw new AppError(400, 'Choose a supplier.');
  return rows[0];
}

async function assertMaterial(id) {
  if (!id) return null;
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new AppError(400, 'Choose a material.');
  const rows = await prisma.$queryRaw`
    SELECT id::text AS id, name, unit
    FROM materials
    WHERE id = CAST(${String(id)} AS uuid)
    LIMIT 1
  `;
  if (!rows[0]?.name) throw new AppError(400, 'Choose a material.');
  return rows[0];
}

async function readPayload(body) {
  const data = body || {};
  const poNumber = textOrNull(data.poNumber, 80);
  if (!poNumber) throw new AppError(400, 'PO number is required.');
  const material = data.materialId ? await assertMaterial(data.materialId) : null;
  const materialName = material?.name || textOrNull(data.materialName, 240);
  if (!materialName) throw new AppError(400, 'Material is required.');
  const parsed = progress.parseQuantity(data.quantity, material?.unit);
  if (parsed.error) throw new AppError(400, parsed.error);
  const vendor = await assertVendor(data.vendorId);
  const statuses = await lookupStatuses();
  const status = progress.normalize(data.status);
  if (!statuses.some((row) => row.code === status)) throw new AppError(400, 'Choose a procurement status.');
  const poAt = parseDay(data.poDate, 'PO date') || null;
  const expectedAt = parseDay(data.expectedDate, 'Expected delivery') || null;
  const dateError = progress.deliveryError(poAt, expectedAt);
  if (dateError) throw new AppError(400, dateError);
  return {
    poNumber,
    materialId: material?.id || null,
    materialName,
    materialKey: materialKey(material?.id, materialName),
    unit: material?.unit || null,
    quantity: parsed.value,
    vendorId: vendor.id,
    vendorName: vendor.name,
    poAt,
    expectedAt,
    status,
    remarks: textOrNull(data.remarks, 4000),
  };
}

async function projectInOtr(projectId) {
  const otr = await orders.listOtr();
  const project = otr.items.find((item) => String(item.id) === String(projectId));
  if (!project) throw new AppError(404, 'This order is not in the OTR workflow.');
  return project;
}

function assertProcurementStage(project) {
  if (project.currentStageCode !== 'PROCUREMENT') {
    throw new AppError(400, 'This order is not in Procurement. Complete design first.');
  }
}

async function insertEvents(tx, recordId, projectId, events, user, now) {
  for (const event of events) {
    await tx.$executeRaw`
      INSERT INTO otr_procurement_events (
        record_id, project_id, action, field_name, previous_value, new_value, remarks, user_id, user_name, created_at
      ) VALUES (
        CAST(${String(recordId)} AS uuid),
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

function isDuplicate(error) {
  const text = `${error?.message || ''} ${error?.meta?.message || ''}`;
  return error?.meta?.code === '23505' || text.includes('otr_procurement_active_line');
}

async function maybeAdvance(project, user) {
  if (!project || project.currentStageCode !== 'PROCUREMENT') return false;
  const rows = await prisma.$queryRaw`
    SELECT status FROM otr_procurement_records
    WHERE project_id = CAST(${String(project.id)} AS uuid) AND archived_at IS NULL
  `;
  if (!rows.length || rows.some((row) => progress.normalize(row.status) !== 'COMPLETED')) return false;
  const lifecycle = require('./lifecycleService');
  try {
    await lifecycle.actOnStage(project.id, 'PROCUREMENT', 'complete', {}, user);
  } catch (error) {
    if (error instanceof AppError && (error.status === 400 || error.status === 409)) return false;
    throw error;
  }
  return true;
}

async function createRecord(body, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  if (!body?.projectId) throw new AppError(400, 'Choose a project.');
  const project = await projectInOtr(body.projectId);
  assertProcurementStage(project);
  const fields = await readPayload(body);
  const now = new Date();
  const name = actor(user);
  const events = [
    { action: 'Created', field: 'Record', previous: null, next: fields.poNumber, remarks: fields.remarks },
    { action: 'Updated', field: 'Status', previous: null, next: progress.labelOf(fields.status), remarks: fields.remarks },
    { action: 'Updated', field: 'Supplier', previous: null, next: fields.vendorName, remarks: fields.remarks },
    { action: 'Updated', field: 'Quantity', previous: null, next: progress.formatQuantity(fields.quantity), remarks: fields.remarks },
  ];
  if (fields.poAt) events.push({ action: 'Updated', field: 'PO Date', previous: null, next: dayText(fields.poAt), remarks: fields.remarks });
  if (fields.expectedAt) events.push({ action: 'Updated', field: 'Expected Delivery', previous: null, next: dayText(fields.expectedAt), remarks: fields.remarks });
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`
        INSERT INTO otr_procurement_records (
          project_id, po_number, material_id, material_name, material_key, unit, quantity,
          vendor_id, vendor_name, po_at, expected_at, status, remarks,
          created_by, created_by_name, updated_by, updated_by_name, created_at, updated_at
        ) VALUES (
          CAST(${String(project.id)} AS uuid),
          ${fields.poNumber},
          ${fields.materialId ? Prisma.sql`CAST(${fields.materialId} AS uuid)` : Prisma.sql`NULL`},
          ${fields.materialName},
          ${fields.materialKey},
          ${fields.unit},
          ${fields.quantity},
          CAST(${fields.vendorId} AS uuid),
          ${fields.vendorName},
          ${fields.poAt},
          ${fields.expectedAt},
          ${fields.status},
          ${fields.remarks},
          CAST(${String(user.id)} AS uuid),
          ${name},
          CAST(${String(user.id)} AS uuid),
          ${name},
          ${now},
          ${now}
        )
        RETURNING id
      `;
      await insertEvents(tx, rows[0].id, project.id, events, user, now);
      return rows[0];
    });
  } catch (error) {
    if (isDuplicate(error)) throw new AppError(400, 'This PO already includes that material for the order.');
    throw error;
  }
  const advanced = await maybeAdvance(project, user);
  await require('./vendorTrackingService').ensureForProcurement(created.id, user);
  return { id: created.id, advanced };
}

async function loadActive(id) {
  const rows = await prisma.$queryRaw`
    SELECT r.*, v.name AS live_vendor_name, m.name AS live_material_name, m.unit AS live_unit
    FROM otr_procurement_records r
    LEFT JOIN vendors v ON v.id = r.vendor_id
    LEFT JOIN materials m ON m.id = r.material_id
    WHERE r.id = CAST(${String(id)} AS uuid) AND r.archived_at IS NULL
    LIMIT 1
  `;
  if (!rows[0]) throw new AppError(404, 'Procurement record not found.');
  return rows[0];
}

async function getRecord(id) {
  const row = await loadActive(id);
  const project = await projectInOtr(row.project_id);
  return shapeRecord(row, shapeOrder(project));
}

async function updateRecord(id, body, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  const existing = await loadActive(id);
  const fields = await readPayload(body);
  if (!body?.projectId) throw new AppError(400, 'Choose a project.');
  const nextProject = await projectInOtr(body.projectId);
  if (String(nextProject.id) !== String(existing.project_id)) assertProcurementStage(nextProject);
  const previousProject = String(nextProject.id) === String(existing.project_id)
    ? nextProject
    : await projectInOtr(existing.project_id);
  const now = new Date();
  const events = [];
  function track(field, previous, next) {
    if ((previous || '') === (next || '')) return;
    events.push({ action: 'Updated', field, previous: previous || '—', next: next || '—', remarks: fields.remarks });
  }
  track('Project / Customer', projectLabel(shapeOrder(previousProject)), projectLabel(shapeOrder(nextProject)));
  track('PO No.', existing.po_number, fields.poNumber);
  track('Material', existing.live_material_name || existing.material_name, fields.materialName);
  track('Quantity', progress.formatQuantity(existing.quantity), progress.formatQuantity(fields.quantity));
  track('Supplier', existing.live_vendor_name || existing.vendor_name, fields.vendorName);
  track('PO Date', dayText(existing.po_at), dayText(fields.poAt));
  track('Expected Delivery', dayText(existing.expected_at), dayText(fields.expectedAt));
  track('Status', progress.labelOf(existing.status), progress.labelOf(fields.status));
  track('Remarks', existing.remarks || '', fields.remarks || '');
  if (!events.length && String(existing.project_id) === String(nextProject.id)) {
    return { id: existing.id, changed: false, advanced: false };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE otr_procurement_records
        SET project_id = CAST(${String(nextProject.id)} AS uuid),
            po_number = ${fields.poNumber},
            material_id = ${fields.materialId ? Prisma.sql`CAST(${fields.materialId} AS uuid)` : Prisma.sql`NULL`},
            material_name = ${fields.materialName},
            material_key = ${fields.materialKey},
            unit = ${fields.unit},
            quantity = ${fields.quantity},
            vendor_id = CAST(${fields.vendorId} AS uuid),
            vendor_name = ${fields.vendorName},
            po_at = ${fields.poAt},
            expected_at = ${fields.expectedAt},
            status = ${fields.status},
            remarks = ${fields.remarks},
            updated_by = CAST(${String(user.id)} AS uuid),
            updated_by_name = ${actor(user)},
            updated_at = ${now}
        WHERE id = CAST(${String(existing.id)} AS uuid) AND archived_at IS NULL
      `;
      if (events.length) await insertEvents(tx, existing.id, nextProject.id, events, user, now);
    });
  } catch (error) {
    if (isDuplicate(error)) throw new AppError(400, 'This PO already includes that material for the order.');
    throw error;
  }
  const advanced = await maybeAdvance(nextProject, user);
  if (String(previousProject.id) !== String(nextProject.id)) await maybeAdvance(previousProject, user);
  await require('./vendorTrackingService').ensureForProcurement(existing.id, user);
  return { id: existing.id, changed: true, advanced };
}

async function archiveRecord(id, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  const existing = await loadActive(id);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE otr_procurement_records
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
    SELECT id FROM otr_procurement_records WHERE id = CAST(${String(id)} AS uuid) LIMIT 1
  `;
  if (!existing[0]) throw new AppError(404, 'Procurement record not found.');
  const rows = await prisma.$queryRaw`
    SELECT * FROM otr_procurement_events
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
      remarks: row.remarks || '',
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
