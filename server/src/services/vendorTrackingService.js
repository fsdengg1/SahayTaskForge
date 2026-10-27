const { Prisma } = require('@prisma/client');
const { prisma } = require('../prisma');
const { AppError } = require('../utils/errors');
const { can } = require('../middleware/authorize');
const { calendarDayKey } = require('../utils/leadDeadline');
const orders = require('./orderConversionService');
const procurement = require('./procurementTrackingService');
const timing = require('./vendorTrackingProgress');

function actor(user) {
  return user?.fullName || user?.username || 'User';
}

function userSql(user) {
  if (!user?.id) return Prisma.sql`NULL`;
  return Prisma.sql`CAST(${String(user.id)} AS uuid)`;
}

function canEdit(user) {
  if (!user) return false;
  if (user.roles?.some((role) => role.code === 'ADMIN' || role.isManagement)) return true;
  return can(user, 'procurement.edit') || can(user, 'vendors.edit');
}

function canCreateVendor(user) {
  if (!user) return false;
  if (user.roles?.some((role) => role.code === 'ADMIN' || role.isManagement)) return true;
  return can(user, 'vendors.edit');
}

function parseDay(value, label) {
  if (value === undefined || value === null || value === '') return null;
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

async function vendorRows() {
  return prisma.$queryRaw`
    SELECT id::text AS id, name, vendor_code AS code
    FROM vendors
    WHERE name IS NOT NULL AND btrim(name) <> ''
      AND UPPER(COALESCE(status, 'ACTIVE')) NOT IN ('INACTIVE', 'ARCHIVED', 'DISABLED')
    ORDER BY name ASC
  `;
}

async function materialRows() {
  return prisma.$queryRaw`
    SELECT id::text AS id, name, COALESCE(material_code, sku) AS code, unit
    FROM materials
    WHERE name IS NOT NULL AND btrim(name) <> ''
    ORDER BY name ASC
  `;
}

async function nextVendorCode() {
  const year = new Date().getFullYear();
  const prefix = `VEN-${year}-`;
  const rows = await prisma.$queryRaw`
    SELECT vendor_code FROM vendors WHERE vendor_code LIKE ${`${prefix}%`}
  `;
  let max = 0;
  for (const row of rows) {
    const value = Number(String(row.vendor_code || '').slice(prefix.length));
    if (value > max) max = value;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

async function resolveVendor(body, user) {
  if (body?.vendorId) {
    const rows = await prisma.$queryRaw`
      SELECT id::text AS id, name FROM vendors
      WHERE id = CAST(${String(body.vendorId)} AS uuid)
        AND UPPER(COALESCE(status, 'ACTIVE')) NOT IN ('INACTIVE', 'ARCHIVED', 'DISABLED')
      LIMIT 1
    `;
    if (!rows[0]?.name) throw new AppError(400, 'Choose a vendor.');
    return rows[0];
  }
  const name = String(body?.vendorName || '').trim().slice(0, 160);
  if (!name) throw new AppError(400, 'Vendor name is required.');
  const existing = await prisma.$queryRaw`
    SELECT id::text AS id, name FROM vendors
    WHERE lower(btrim(name)) = lower(${name})
    LIMIT 1
  `;
  if (existing[0]) return existing[0];
  if (!canCreateVendor(user)) throw new AppError(403, 'You do not have permission to add a vendor.');
  const code = await nextVendorCode();
  const now = new Date();
  const created = await prisma.$queryRaw`
    INSERT INTO vendors (id, name, vendor_code, status, created_at, updated_at)
    VALUES (gen_random_uuid(), ${name}, ${code}, 'ACTIVE', ${now}, ${now})
    RETURNING id::text AS id, name
  `;
  return created[0];
}

async function insertTrack(procurementId, user) {
  const procurementRow = await prisma.$queryRaw`
    SELECT id, project_id FROM otr_procurement_records
    WHERE id = CAST(${String(procurementId)} AS uuid) AND archived_at IS NULL
    LIMIT 1
  `;
  if (!procurementRow[0]) throw new AppError(404, 'Procurement record not found.');
  const now = new Date();
  const name = user ? actor(user) : 'System';
  const rows = await prisma.$queryRaw`
    INSERT INTO otr_vendor_tracks (
      procurement_id, manufacturing_status, status, status_locked,
      created_by, created_by_name, updated_by, updated_by_name, created_at, updated_at
    ) VALUES (
      CAST(${String(procurementId)} AS uuid),
      'NOT_STARTED',
      'PENDING',
      false,
      ${userSql(user)},
      ${name},
      ${userSql(user)},
      ${name},
      ${now},
      ${now}
    )
    RETURNING id
  `;
  await prisma.$executeRaw`
    INSERT INTO otr_vendor_track_events (
      track_id, procurement_id, action, field_name, previous_value, new_value, user_id, user_name, created_at
    ) VALUES (
      CAST(${String(rows[0].id)} AS uuid),
      CAST(${String(procurementId)} AS uuid),
      'Created',
      'Vendor',
      NULL,
      'Tracking started',
      ${userSql(user)},
      ${name},
      ${now}
    )
  `;
  return rows[0].id;
}

async function ensureForProcurement(procurementId, user) {
  try {
    const rows = await prisma.$queryRaw`
      SELECT id, archived_at FROM otr_vendor_tracks
      WHERE procurement_id = CAST(${String(procurementId)} AS uuid)
    `;
    const active = rows.find((row) => !row.archived_at);
    if (active) return active.id;
    if (rows.length) return null;
    return insertTrack(procurementId, user);
  } catch (error) {
    if (String(error.message || '').includes('otr_vendor_tracks')) {
      console.error('Vendor tracking is not ready.', error);
      return null;
    }
    throw error;
  }
}

async function ensureMissing(user) {
  try {
    const rows = await prisma.$queryRaw`
      SELECT p.id
      FROM otr_procurement_records p
      WHERE p.archived_at IS NULL AND p.vendor_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM otr_vendor_tracks t WHERE t.procurement_id = p.id
        )
    `;
    for (const row of rows) {
      await insertTrack(row.id, user);
    }
  } catch (error) {
    if (String(error.message || '').includes('otr_vendor_tracks')) {
      throw new AppError(503, 'Vendor tracking storage is not ready.');
    }
    throw error;
  }
}

function shapeRecord(row, order) {
  const linked = order || {};
  const label = projectLabel({ orderNo: linked.orderNo, projectCode: linked.projectCode });
  const customer = linked.customer || '—';
  const manufacturing = timing.normalize(row.manufacturing_status);
  const derived = timing.derivedStatus({
    manufacturing,
    deliveryAt: row.delivery_at,
    requiredAt: row.expected_at,
  });
  const status = row.status_locked ? timing.normalize(row.status) : derived;
  const lead = timing.leadTime(row.po_at, row.delivery_at);
  const delay = timing.delayDays(row.expected_at, row.delivery_at);
  return {
    id: row.id,
    procurementId: row.procurement_id,
    projectId: row.project_id,
    orderNo: linked.orderNo || null,
    projectCode: linked.projectCode || null,
    projectLabel: label,
    customer,
    projectCustomer: customer !== '—' ? `${label} · ${customer}` : label,
    vendorId: row.vendor_id ? String(row.vendor_id) : null,
    vendorName: row.live_vendor_name || row.vendor_name || '—',
    poNumber: row.po_number,
    materialId: row.material_id ? String(row.material_id) : null,
    materialName: row.live_material_name || row.material_name || '—',
    unit: row.live_unit || row.unit || null,
    quantity: Number(row.quantity),
    quantityLabel: String(Number(row.quantity)),
    poAt: row.po_at || null,
    poDateInput: dayText(row.po_at),
    requiredAt: row.expected_at || null,
    requiredDateInput: dayText(row.expected_at),
    manufacturingStatus: manufacturing,
    manufacturingLabel: timing.labelOf(manufacturing, timing.MANUFACTURING_LABELS),
    dispatchAt: row.dispatch_at || null,
    dispatchDateInput: dayText(row.dispatch_at),
    deliveryAt: row.delivery_at || null,
    deliveryDateInput: dayText(row.delivery_at),
    leadDays: lead.days,
    leadTimeLabel: lead.label,
    delayDays: delay,
    status,
    statusLabel: timing.labelOf(status),
    statusLocked: Boolean(row.status_locked),
    suggestedStatus: derived,
    procurementStatus: row.procurement_status,
    remarks: row.procurement_remarks || '',
  };
}

async function loadRows() {
  return prisma.$queryRaw`
    SELECT t.*, p.project_id, p.po_number, p.material_id, p.material_name, p.unit, p.quantity,
           p.vendor_id, p.vendor_name, p.po_at, p.expected_at, p.status AS procurement_status,
           p.remarks AS procurement_remarks,
           v.name AS live_vendor_name, m.name AS live_material_name, m.unit AS live_unit
    FROM otr_vendor_tracks t
    JOIN otr_procurement_records p ON p.id = t.procurement_id AND p.archived_at IS NULL
    LEFT JOIN vendors v ON v.id = p.vendor_id
    LEFT JOIN materials m ON m.id = p.material_id
    WHERE t.archived_at IS NULL
    ORDER BY t.updated_at DESC
  `;
}

async function listTracking(user) {
  await ensureMissing(user);
  const [rows, otr, vendors, materials, manufacturing, statuses] = await Promise.all([
    loadRows(),
    orders.listOtr(),
    vendorRows(),
    materialRows(),
    lookupOptions('VENDOR_MANUFACTURING_STATUS', timing.MANUFACTURING),
    lookupOptions('VENDOR_TRACK_STATUS', timing.STATUSES),
  ]);
  const orderById = new Map(otr.items.map((item) => [String(item.id), {
    id: item.id,
    orderNo: item.orderId || null,
    projectCode: item.projectId,
    customer: item.customer || '—',
    currentStageCode: item.currentStageCode,
  }]));
  const items = rows
    .map((row) => shapeRecord(row, orderById.get(String(row.project_id))))
    .sort((a, b) => String(a.vendorName).localeCompare(String(b.vendorName)));
  const tracked = new Set(items.map((item) => String(item.procurementId)));
  const procurementLines = await procurementLinesFor(orderById);
  return {
    canEdit: canEdit(user),
    canCreateVendor: canCreateVendor(user),
    items,
    vendors,
    materials,
    manufacturing,
    statuses,
    orders: otr.items
      .filter((item) => item.currentStageCode === 'PROCUREMENT')
      .map((item) => orderById.get(String(item.id)))
      .filter(Boolean),
    procurementLines: procurementLines.filter((line) => !tracked.has(String(line.id))),
  };
}

async function procurementLinesFor(orderById) {
  const rows = await prisma.$queryRaw`
    SELECT p.id, p.project_id, p.po_number, p.material_id, p.material_name, p.quantity, p.vendor_id, p.po_at, p.expected_at,
           m.name AS live_material_name
    FROM otr_procurement_records p
    LEFT JOIN materials m ON m.id = p.material_id
    WHERE p.archived_at IS NULL
    ORDER BY p.po_number ASC
  `;
  return rows.map((row) => {
    const order = orderById.get(String(row.project_id)) || {};
    const label = projectLabel(order);
    return {
      id: row.id,
      projectId: row.project_id,
      poNumber: row.po_number,
      projectLabel: label,
      customer: order.customer || '—',
      projectCustomer: order.customer && order.customer !== '—' ? `${label} · ${order.customer}` : label,
      materialId: row.material_id ? String(row.material_id) : null,
      materialName: row.live_material_name || row.material_name,
      quantity: Number(row.quantity),
      vendorId: row.vendor_id ? String(row.vendor_id) : null,
      poDateInput: dayText(row.po_at),
      requiredDateInput: dayText(row.expected_at),
    };
  });
}

function readSchedule(body, poAt, requiredAt) {
  const manufacturing = timing.normalize(body?.manufacturingStatus || 'NOT_STARTED');
  if (!timing.MANUFACTURING.some((row) => row.code === manufacturing)) {
    throw new AppError(400, 'Choose a manufacturing status.');
  }
  const dispatchAt = parseDay(body?.dispatchDate, 'Dispatch date');
  const deliveryAt = parseDay(body?.deliveryDate, 'Delivery date');
  if (poAt && requiredAt && requiredAt < poAt) throw new AppError(400, 'Required date cannot be before the PO date.');
  const derived = timing.derivedStatus({ manufacturing, deliveryAt, requiredAt });
  if (body?.statusOverride) {
    const status = timing.normalize(body.status);
    if (!timing.STATUSES.some((row) => row.code === status)) throw new AppError(400, 'Choose a status.');
    return { manufacturing, dispatchAt, deliveryAt, status, statusLocked: status !== derived, derived };
  }
  return { manufacturing, dispatchAt, deliveryAt, status: derived, statusLocked: false, derived };
}

async function applySchedule(trackId, procurementId, before, schedule, user) {
  const now = new Date();
  const events = [];
  function track(field, previous, next) {
    if ((previous || '') === (next || '')) return;
    events.push({ action: 'Updated', field, previous: previous || '—', next: next || '—' });
  }
  if (!before) {
    events.push({ action: 'Created', field: 'Vendor', previous: null, next: 'Tracking started' });
  }
  track('Manufacturing Status', before ? timing.labelOf(before.manufacturing_status, timing.MANUFACTURING_LABELS) : '', timing.labelOf(schedule.manufacturing, timing.MANUFACTURING_LABELS));
  track('Dispatch Date', before ? dayText(before.dispatch_at) : '', dayText(schedule.dispatchAt));
  track('Delivery Date', before ? dayText(before.delivery_at) : '', dayText(schedule.deliveryAt));
  track('Status', before ? timing.labelOf(before.status_locked ? before.status : timing.derivedStatus({
    manufacturing: before.manufacturing_status,
    deliveryAt: before.delivery_at,
    requiredAt: before.expected_at,
  })) : '', timing.labelOf(schedule.status));
  const changedBy = userSql(user);
  await prisma.$executeRaw`
    UPDATE otr_vendor_tracks
    SET manufacturing_status = ${schedule.manufacturing},
        dispatch_at = ${schedule.dispatchAt},
        delivery_at = ${schedule.deliveryAt},
        status = ${schedule.status},
        status_locked = ${schedule.statusLocked},
        updated_by = ${changedBy},
        updated_by_name = ${actor(user)},
        updated_at = ${now}
    WHERE id = CAST(${String(trackId)} AS uuid) AND archived_at IS NULL
  `;
  for (const event of events) {
    await prisma.$executeRaw`
      INSERT INTO otr_vendor_track_events (
        track_id, procurement_id, action, field_name, previous_value, new_value, user_id, user_name, created_at
      ) VALUES (
        CAST(${String(trackId)} AS uuid),
        CAST(${String(procurementId)} AS uuid),
        ${event.action},
        ${event.field},
        ${event.previous ?? null},
        ${event.next ?? null},
        ${changedBy},
        ${actor(user)},
        ${now}
      )
    `;
  }
}

async function syncProcurement(procurementId, body, vendor, user) {
  const current = await procurement.getRecord(procurementId);
  await procurement.updateRecord(procurementId, {
    projectId: body.projectId || current.projectId,
    poNumber: body.poNumber,
    materialId: body.materialId,
    materialName: body.materialName,
    quantity: body.quantity,
    vendorId: vendor.id,
    poDate: body.poDate || null,
    expectedDate: body.requiredDate || null,
    status: current.status,
    remarks: current.remarks,
  }, user);
  return procurement.getRecord(procurementId);
}

async function logSharedChange(trackId, procurementId, field, previous, next, user) {
  if ((previous || '') === (next || '')) return;
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO otr_vendor_track_events (
      track_id, procurement_id, action, field_name, previous_value, new_value, user_id, user_name, created_at
    ) VALUES (
      CAST(${String(trackId)} AS uuid),
      CAST(${String(procurementId)} AS uuid),
      'Updated',
      ${field},
      ${previous || '—'},
      ${next || '—'},
      ${userSql(user)},
      ${actor(user)},
      ${now}
    )
  `;
}

async function createRecord(body, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  const vendor = await resolveVendor(body, user);
  let procurementId = body?.procurementId || null;
  if (procurementId) {
    const active = await prisma.$queryRaw`
      SELECT id FROM otr_vendor_tracks
      WHERE procurement_id = CAST(${String(procurementId)} AS uuid) AND archived_at IS NULL
      LIMIT 1
    `;
    if (active[0]) throw new AppError(400, 'This procurement line is already in Vendor Management.');
    await syncProcurement(procurementId, body, vendor, user);
  } else {
    const created = await procurement.createRecord({
      projectId: body.projectId,
      poNumber: body.poNumber,
      materialId: body.materialId,
      materialName: body.materialName,
      quantity: body.quantity,
      vendorId: vendor.id,
      poDate: body.poDate || null,
      expectedDate: body.requiredDate || null,
      status: 'PENDING',
      remarks: null,
    }, user);
    procurementId = created.id;
  }
  let trackId = await ensureForProcurement(procurementId, user);
  if (!trackId) trackId = await insertTrack(procurementId, user);
  const saved = await procurement.getRecord(procurementId);
  const schedule = readSchedule(body, saved.poAt ? new Date(saved.poAt) : null, saved.expectedAt ? new Date(saved.expectedAt) : null);
  const before = await prisma.$queryRaw`
    SELECT t.*, p.expected_at
    FROM otr_vendor_tracks t
    JOIN otr_procurement_records p ON p.id = t.procurement_id
    WHERE t.id = CAST(${String(trackId)} AS uuid)
    LIMIT 1
  `;
  await applySchedule(trackId, procurementId, before[0], schedule, user);
  await logSharedChange(trackId, procurementId, 'Quantity', null, String(saved.quantity), user);
  if (saved.poDateInput) await logSharedChange(trackId, procurementId, 'PO Date', null, saved.poDateInput, user);
  if (saved.expectedDateInput) await logSharedChange(trackId, procurementId, 'Required Date', null, saved.expectedDateInput, user);
  return { id: trackId, procurementId, vendorId: vendor.id };
}

async function loadActive(id) {
  const rows = await prisma.$queryRaw`
    SELECT t.*, p.project_id, p.po_number, p.material_id, p.material_name, p.unit, p.quantity,
           p.vendor_id, p.vendor_name, p.po_at, p.expected_at, p.status AS procurement_status,
           p.remarks AS procurement_remarks,
           v.name AS live_vendor_name, m.name AS live_material_name, m.unit AS live_unit
    FROM otr_vendor_tracks t
    JOIN otr_procurement_records p ON p.id = t.procurement_id
    LEFT JOIN vendors v ON v.id = p.vendor_id
    LEFT JOIN materials m ON m.id = p.material_id
    WHERE t.id = CAST(${String(id)} AS uuid) AND t.archived_at IS NULL AND p.archived_at IS NULL
    LIMIT 1
  `;
  if (!rows[0]) throw new AppError(404, 'Vendor record not found.');
  return rows[0];
}

async function getRecord(id) {
  const row = await loadActive(id);
  const otr = await orders.listOtr();
  const project = otr.items.find((item) => String(item.id) === String(row.project_id));
  return shapeRecord(row, project ? {
    orderNo: project.orderId || null,
    projectCode: project.projectId,
    customer: project.customer || '—',
  } : null);
}

async function updateRecord(id, body, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  const existing = await loadActive(id);
  const vendor = await resolveVendor(body, user);
  const previousQty = String(Number(existing.quantity));
  const previousRequired = dayText(existing.expected_at);
  await syncProcurement(existing.procurement_id, { ...body, projectId: body.projectId || existing.project_id }, vendor, user);
  const saved = await procurement.getRecord(existing.procurement_id);
  const schedule = readSchedule(body, saved.poAt ? new Date(saved.poAt) : null, saved.expectedAt ? new Date(saved.expectedAt) : null);
  await applySchedule(id, existing.procurement_id, existing, schedule, user);
  await logSharedChange(id, existing.procurement_id, 'Quantity', previousQty, String(saved.quantity), user);
  await logSharedChange(id, existing.procurement_id, 'Required Date', previousRequired, saved.expectedDateInput || '', user);
  return { id, changed: true };
}

async function archiveRecord(id, user) {
  if (!canEdit(user)) throw new AppError(403, 'Access denied.');
  const existing = await loadActive(id);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE otr_vendor_tracks
      SET archived_at = ${now},
          archived_by_name = ${actor(user)},
          updated_by = ${userSql(user)},
          updated_by_name = ${actor(user)},
          updated_at = ${now}
      WHERE id = CAST(${String(existing.id)} AS uuid) AND archived_at IS NULL
    `;
    await tx.$executeRaw`
      INSERT INTO otr_vendor_track_events (
        track_id, procurement_id, action, field_name, previous_value, new_value, user_id, user_name, created_at
      ) VALUES (
        CAST(${String(existing.id)} AS uuid),
        CAST(${String(existing.procurement_id)} AS uuid),
        'Deleted',
        'Vendor',
        ${existing.live_vendor_name || existing.vendor_name || '—'},
        'Archived',
        ${userSql(user)},
        ${actor(user)},
        ${now}
      )
    `;
  });
  return { id: existing.id };
}

async function history(id) {
  const rows = await prisma.$queryRaw`
    SELECT * FROM otr_vendor_track_events
    WHERE track_id = CAST(${String(id)} AS uuid)
    ORDER BY created_at DESC
    LIMIT 200
  `;
  if (!rows.length) {
    const exists = await prisma.$queryRaw`
      SELECT id FROM otr_vendor_tracks WHERE id = CAST(${String(id)} AS uuid) LIMIT 1
    `;
    if (!exists[0]) throw new AppError(404, 'Vendor record not found.');
  }
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
  ensureForProcurement,
};
