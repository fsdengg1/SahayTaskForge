const { Prisma } = require('@prisma/client');
const { prisma } = require('../prisma');
const { AppError } = require('../utils/errors');
const { logActivity } = require('../utils/activity');
const { calendarDayKey } = require('../utils/leadDeadline');

const ORDER_CONFIRMED = 'ORDER_CONFIRMED';

const OTR_STAGES = [
  'ORDER CONFIRMED',
  'DESIGN',
  'PROCUREMENT',
  'PRODUCTION',
  'QUALITY',
  'DISPATCH',
  'INSTALLATION',
  'COMPLETED',
];

const COMPLETED_VALUES = new Set(['COMPLETED', 'CLOSED', 'DONE', 'COMPLETE', 'PROJECT_CLOSED', 'WON']);
const CONFIRMED_ORDER_VALUES = new Set(['ORDER_CONFIRMED', 'ORDER CONFIRMED', 'CONFIRMED']);
const STAGE_DONE = new Set(['COMPLETED', 'CLOSED', 'DONE', 'COMPLETE']);

const PROJECT_STATUS_LABELS = {
  COMPLETED: 'Completed',
  CLOSED: 'Completed',
  DONE: 'Completed',
  PROJECT_CLOSED: 'Completed',
  IN_PROGRESS: 'In Progress',
  OPEN: 'Open',
  ON_HOLD: 'On Hold',
  HOLD: 'On Hold',
  PENDING: 'Pending',
  NOT_STARTED: 'Not Started',
};

const QUOTE_LABELS = {
  PENDING: 'Pending',
  SENT: 'Sent',
  REVISION_REQUIRED: 'Revision Required',
  APPROVED: 'Approved',
  ON_HOLD: 'On Hold',
  DRAFT: 'Draft',
  IN_PROGRESS: 'In Progress',
  FINAL_READY: 'Final Ready',
};

const OTR_STAGE_MAP = {
  DESIGN: 'DESIGN',
  DESIGN_CLEARANCE: 'DESIGN',
  PRE_DESIGN: 'DESIGN',
  PRE_DESIGN_LEAD_APPROVAL: 'DESIGN',
  POST_DESIGN: 'DESIGN',
  POST_DESIGN_LEAD_APPROVAL: 'DESIGN',
  DETAILED_DESIGN: 'DESIGN',
  DESIGN_APPROVAL: 'DESIGN',
  PROCUREMENT: 'PROCUREMENT',
  BOM_CLEARANCE: 'PROCUREMENT',
  BOM_MRP: 'PROCUREMENT',
  MATERIAL_RECEIPT: 'PROCUREMENT',
  PRODUCTION: 'PRODUCTION',
  PRODUCTION_LEAD: 'PRODUCTION',
  MANUFACTURING: 'PRODUCTION',
  QUALITY: 'QUALITY',
  PRODUCTION_QC: 'QUALITY',
  DISPATCH: 'DISPATCH',
  FINISHED_GOODS: 'DISPATCH',
  PACKING: 'DISPATCH',
  INSTALLATION: 'INSTALLATION',
  INSTALLATION_LEAD: 'INSTALLATION',
  INSTALLATION_CLEARANCE: 'INSTALLATION',
  INSTALLATION_QC: 'INSTALLATION',
  COMPLETED: 'COMPLETED',
  PROJECT_CLOSED: 'COMPLETED',
  CLOSED: 'COMPLETED',
};

function norm(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function labelFromCode(code, labels = {}) {
  const key = norm(code).replaceAll(' ', '_');
  if (!key) return '—';
  if (labels[key]) return labels[key];
  return key.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function isCompletedSignal(value) {
  return COMPLETED_VALUES.has(norm(value).replaceAll(' ', '_'));
}

function isOrderConfirmed(row) {
  const order = norm(row?.order_status || row?.orderStatusCode);
  if (CONFIRMED_ORDER_VALUES.has(order)) return true;
  return STAGE_DONE.has(norm(row?.order_received_status || row?.orderReceivedStatus).replaceAll(' ', '_'));
}

const AWAITING_WORKFLOW = new Set(['DESIGN_SUBMITTED', 'CUSTOMER_REVIEW', 'NEGOTIATION', 'CUSTOMER_APPROVED']);

const WORKFLOW_LABELS = {
  DESIGN_SUBMITTED: 'Design Submitted',
  CUSTOMER_REVIEW: 'Customer Review',
  NEGOTIATION: 'Negotiation',
  CUSTOMER_APPROVED: 'Customer Approved',
  DESIGN_REVISION: 'Revision Required',
  DESIGN: 'Design',
  NEW: 'New',
};

function workflowCode(row) {
  return norm(row?.workflow_status || row?.workflowStatus).replaceAll(' ', '_');
}

function hasConversionRecord(row) {
  if (!row || row.direct || row.archived || row.otr_archived_at) return false;
  if (row.order_id || row.orderId) return true;
  const stored = norm(row.order_status || row.storedOrderStatus);
  return CONFIRMED_ORDER_VALUES.has(stored);
}

function isEligible(row) {
  if (!row || isOrderConfirmed(row) || hasConversionRecord(row)) return false;
  return workflowCode(row) === 'CUSTOMER_APPROVED';
}

function isAwaitingConversion(row) {
  if (!row || row.direct || row.archived || row.otr_archived_at) return false;
  if (hasConversionRecord(row) || isOrderConfirmed(row)) return false;
  return AWAITING_WORKFLOW.has(workflowCode(row));
}

function monthStamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).format(date);
}

function classifyConversion(rows, now = new Date()) {
  const awaiting = [];
  const confirmed = [];
  for (const row of rows) {
    if (row.direct || row.archived || row.otr_archived_at) continue;
    if (hasConversionRecord(row)) confirmed.push(row);
    else if (isAwaitingConversion(row)) awaiting.push(row);
  }
  const month = monthStamp(now);
  const seen = new Set();
  const uniqueConfirmed = confirmed.filter((row) => {
    const key = String(row.id || row.order_id || row.orderId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    awaiting,
    confirmed: uniqueConfirmed,
    kpis: {
      awaiting: awaiting.length,
      confirmed: uniqueConfirmed.length,
      month: uniqueConfirmed.filter((row) => monthStamp(row.order_confirmed_at || row.orderConfirmedAt) === month).length,
    },
  };
}

function otrStageCode(row) {
  const stored = norm(row?.otr_stage || row?.otrStage).replaceAll(' ', '_');
  if (OTR_STAGE_MAP[stored]) return OTR_STAGE_MAP[stored];
  const fromProject = OTR_STAGE_MAP[norm(row?.current_stage || row?.currentStageCode).replaceAll(' ', '_')];
  const fromExec = OTR_STAGE_MAP[norm(row?.exec_stage).replaceAll(' ', '_')];
  return fromProject || fromExec || 'DESIGN';
}

function quotationLabel(row, feedback) {
  if (feedback?.drawingQuoteStatus) return QUOTE_LABELS[feedback.drawingQuoteStatus] || labelFromCode(feedback.drawingQuoteStatus, QUOTE_LABELS);
  if (row.layout_approved_at || norm(row.layout_status) === 'FINAL_READY') return 'Final Ready';
  if (row.layout_status) return QUOTE_LABELS[norm(row.layout_status).replaceAll(' ', '_')] || labelFromCode(row.layout_status, QUOTE_LABELS);
  if (row.quote_status) return QUOTE_LABELS[norm(row.quote_status).replaceAll(' ', '_')] || labelFromCode(row.quote_status, QUOTE_LABELS);
  if (feedback?.quotationSentDate) return 'Sent';
  return 'Not Sent';
}

async function fetchProjects() {
  try {
    return await prisma.$queryRawUnsafe(`
      SELECT p.id, p.project_code, p.lead_id, p.name, p.status, p.current_stage,
             p.order_status, p.order_id, p.order_confirmed_at, p.order_confirmed_by, p.order_confirmed_by_name,
             p.closed_at, p.completed_at, p.otr_stage, p.updated_at, p.target_end_date, p.owner_id,
             p.otr_source, p.otr_customer, p.otr_location, p.otr_product, p.otr_po_status,
             p.otr_project_value, p.otr_remarks, p.otr_archived_at,
             l.company_name, l.contact_person, l.company_address, l.product, l.product_1, l.status AS lead_status,
             l.workflow_status, l.workflow_approved_at, l.workflow_approved_drawing_version, l.workflow_approved_bom_version,
             u.full_name AS owner_name,
             ord.status AS order_received_status,
             COALESCE(ord.completed_at, ord.updated_at, ord.started_at) AS order_received_at,
             ex.current_stage AS exec_stage,
             ex.received_at AS execution_received_at,
             q.status AS quote_status,
             ql.status AS layout_status,
             ql.approved_at AS layout_approved_at
      FROM projects p
      LEFT JOIN leads l ON l.id = p.lead_id
      LEFT JOIN users u ON u.id = p.owner_id
      LEFT JOIN LATERAL (
        SELECT status, completed_at, updated_at, started_at
        FROM post_design_stages
        WHERE project_id = p.id AND stage_code = 'ORDER_RECEIVED'
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
      ) ord ON true
      LEFT JOIN LATERAL (
        SELECT current_stage, received_at
        FROM post_design_executions
        WHERE project_id = p.id
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
      ) ex ON true
      LEFT JOIN LATERAL (
        SELECT status
        FROM quotations
        WHERE project_id = p.id
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
      ) q ON true
      LEFT JOIN LATERAL (
        SELECT status, approved_at
        FROM quotation_layouts
        WHERE project_id = p.id OR lead_id = p.lead_id
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
      ) ql ON true
      ORDER BY p.created_at DESC NULLS LAST
    `);
  } catch (error) {
    throw new AppError(503, 'Order conversion data could not be loaded.');
  }
}

async function feedbackByLead(ids) {
  const leadIds = [...new Set(ids.filter(Boolean))];
  if (!leadIds.length) return {};
  const rows = await prisma.customerFeedback.findMany({
    where: { leadId: { in: leadIds } },
    select: { leadId: true, quotationSentDate: true, drawingQuoteStatus: true },
  });
  return Object.fromEntries(rows.map((row) => [row.leadId, row]));
}

function shape(row, feedback) {
  const confirmed = isOrderConfirmed(row);
  const stage = confirmed ? otrStageCode(row) : null;
  const direct = String(row.otr_source || '').toUpperCase() === 'DIRECT';
  const value = row.otr_project_value == null || row.otr_project_value === ''
    ? null
    : Number(row.otr_project_value);
  return {
    id: row.id,
    orderId: row.order_id || null,
    direct,
    projectId: direct ? null : row.project_code,
    name: direct ? 'Direct OTR Order' : row.name,
    customerName: row.contact_person || row.otr_customer || row.company_name || (direct ? '—' : row.name) || '—',
    companyName: row.company_name || row.otr_customer || (direct ? '—' : row.name) || '—',
    customer: row.otr_customer || row.company_name || (direct ? '—' : row.name) || '—',
    location: row.otr_location || row.company_address || '—',
    productGroup: row.otr_product || row.product || row.product_1 || '—',
    salesPerson: row.owner_name || '—',
    ownerId: row.owner_id ? String(row.owner_id) : null,
    poStatusCode: row.otr_po_status || null,
    projectValue: Number.isFinite(value) ? value : null,
    entryRemarks: row.otr_remarks || '',
    orderDateInput: row.order_confirmed_at ? calendarDayKey(row.order_confirmed_at) : '',
    targetDateInput: row.target_end_date ? calendarDayKey(row.target_end_date) : '',
    archived: Boolean(row.otr_archived_at),
    projectStatus: labelFromCode(row.status, PROJECT_STATUS_LABELS),
    projectStatusCode: row.status,
    quotationStatus: quotationLabel(row, feedback),
    orderStatus: confirmed ? 'ORDER CONFIRMED' : 'Not Confirmed',
    orderStatusCode: confirmed ? ORDER_CONFIRMED : (row.order_status || null),
    storedOrderStatus: row.order_status || null,
    orderConfirmedAt: row.order_confirmed_at || (confirmed ? row.order_received_at : null),
    orderConfirmedBy: row.order_confirmed_by_name || null,
    completedAt: row.completed_at || row.closed_at || row.order_received_at || row.execution_received_at || null,
    workflowStatus: row.workflow_status || null,
    workflowStatusLabel: WORKFLOW_LABELS[workflowCode(row)] || labelFromCode(row.workflow_status, WORKFLOW_LABELS),
    approvalDate: row.workflow_approved_at || null,
    approvedDrawingVersion: row.workflow_approved_drawing_version ? `V${row.workflow_approved_drawing_version}` : '—',
    approvedBomVersion: row.workflow_approved_bom_version ? `V${row.workflow_approved_bom_version}` : '—',
    currentStage: stage ? stage.replaceAll('_', ' ') : labelFromCode(row.current_stage),
    currentStageCode: stage || row.current_stage,
    overallStatus: confirmed ? 'ORDER CONFIRMED' : (row.order_status || null),
    eligible: isEligible(row),
    confirmed,
  };
}

async function shapedProjects() {
  const rows = await fetchProjects();
  const feedback = await feedbackByLead(rows.map((row) => row.lead_id));
  return rows.map((row) => shape(row, feedback[row.lead_id]));
}

async function listEligible() {
  const items = await shapedProjects();
  const grouped = classifyConversion(items);
  return {
    items: grouped.awaiting,
    confirmed: grouped.confirmed,
    kpis: grouped.kpis,
    stages: OTR_STAGES,
  };
}

const OTR_STAGE_RANK = ['DESIGN', 'PROCUREMENT', 'PRODUCTION', 'QUALITY', 'DISPATCH', 'INSTALLATION', 'COMPLETED'];

function unlockedStages(items) {
  if (!items.length) return [];
  let max = 0;
  for (const item of items) {
    const code = String(item.currentStageCode || 'DESIGN').toUpperCase();
    const rank = OTR_STAGE_RANK.indexOf(code);
    if (rank > max) max = rank;
  }
  return OTR_STAGE_RANK.slice(0, max + 1);
}

async function listOtr() {
  const items = (await shapedProjects()).filter((item) => item.confirmed && item.orderId && !item.archived);
  return {
    items,
    stages: OTR_STAGES,
    unlockedStages: unlockedStages(items),
  };
}

async function nextOrderId(year) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT order_id FROM projects WHERE order_id LIKE 'ORD-${year}-%' ORDER BY order_id DESC LIMIT 1`,
  );
  const last = rows[0]?.order_id ? Number(String(rows[0].order_id).split('-').pop()) : 0;
  const next = Number.isNaN(last) ? 1 : last + 1;
  return `ORD-${year}-${String(next).padStart(4, '0')}`;
}

async function confirmOrder(id, user) {
  const rows = await fetchProjects();
  const project = rows.find((row) => String(row.id) === String(id));
  if (!project) throw new AppError(404, 'Project not found.');
  if (isOrderConfirmed(project)) {
    throw new AppError(409, 'This project is already order confirmed.');
  }
  if (!isEligible(project)) {
    throw new AppError(400, 'Only a completed project can be confirmed as an order.');
  }

  const year = new Date().getFullYear();
  const now = new Date();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const orderId = await nextOrderId(year);
    try {
      const updated = await prisma.$queryRaw`
        UPDATE projects
        SET order_status = ${ORDER_CONFIRMED},
            order_confirmed_at = ${now},
            order_confirmed_by = ${String(user.id)},
            order_confirmed_by_name = ${user.fullName || 'User'},
            order_id = ${orderId},
            otr_stage = 'DESIGN',
            approved_drawing_version = ${project.workflow_approved_drawing_version || null},
            approved_bom_version = ${project.workflow_approved_bom_version || null},
            completed_at = COALESCE(completed_at, closed_at, ${now}),
            updated_at = ${now}
        WHERE id = CAST(${id} AS uuid)
          AND (order_status IS NULL OR UPPER(order_status) <> ${ORDER_CONFIRMED})
        RETURNING id, project_code, order_id, order_status, order_confirmed_at, order_confirmed_by_name, otr_stage
      `;
      if (!updated[0]) throw new AppError(409, 'This project is already order confirmed.');
      await prisma.$executeRaw`
        UPDATE post_design_stages
        SET status = 'COMPLETED',
            completed_at = COALESCE(completed_at, ${now}),
            updated_at = ${now}
        WHERE project_id = CAST(${id} AS uuid)
          AND stage_code = 'ORDER_RECEIVED'
          AND UPPER(COALESCE(status, '')) NOT IN ('COMPLETED', 'CLOSED', 'DONE', 'COMPLETE')
      `;
      try {
        await logActivity({
          userId: user.id,
          action: 'ORDER_CONFIRMED',
          entity: 'Project',
          entityId: id,
          newValue: ORDER_CONFIRMED,
          description: `${project.project_code} confirmed as ${updated[0].order_id}. OTR stage DESIGN.`,
        });
      } catch (error) {
        console.error('Order confirmation was saved, but the activity log was not.', error);
      }
      try {
        const lifecycle = require('./lifecycleService');
        await lifecycle.record({
          projectId: id,
          leadId: project.lead_id,
          action: 'Order Confirmed',
          previousStatus: 'CUSTOMER_APPROVED',
          newStatus: 'DESIGN',
          user,
        });
      } catch (error) {
        console.error('Order confirmation was saved, but the workflow event was not.', error);
      }
      return {
        id: updated[0].id,
        projectId: updated[0].project_code,
        orderId: updated[0].order_id,
        orderStatus: 'ORDER CONFIRMED',
        orderConfirmedAt: updated[0].order_confirmed_at,
        orderConfirmedBy: updated[0].order_confirmed_by_name,
        currentStage: 'DESIGN',
        otrStage: updated[0].otr_stage,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      const message = String(error.message || '');
      if (message.includes('projects_order_id_key') || message.includes('23505')) continue;
      throw error;
    }
  }
  throw new AppError(409, 'Could not assign an order id. Try again.');
}

const PO_STATUSES = [
  { code: 'PENDING', label: 'Pending' },
  { code: 'ISSUED', label: 'Issued' },
  { code: 'RECEIVED', label: 'Received' },
  { code: 'NOT_ISSUED', label: 'Not issued' },
];

function textField(value, label, limit, required) {
  const text = String(value || '').trim().slice(0, limit);
  if (required && !text) throw new AppError(400, `${label} is required.`);
  return text || null;
}

function parseOrderDate(value, label, required) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new AppError(400, `${label} is required.`);
    return null;
  }
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new AppError(400, `${label} is not valid.`);
  return new Date(`${text}T00:00:00.000Z`);
}

function parseMoney(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new AppError(400, 'Project value cannot be negative.');
  return Math.round(number * 100) / 100;
}

function parsePoStatus(value) {
  if (value === undefined || value === null || value === '') return null;
  const code = String(value).trim().toUpperCase();
  if (!PO_STATUSES.some((item) => item.code === code)) throw new AppError(400, 'Choose a PO status.');
  return code;
}

async function assertSalesPerson(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw new AppError(400, 'Choose a sales person.');
  const rows = await prisma.$queryRaw`
    SELECT id::text AS id, full_name AS name
    FROM users
    WHERE id = CAST(${String(id)} AS uuid)
      AND COALESCE(is_active, true) = true
    LIMIT 1
  `;
  if (!rows[0]?.name) throw new AppError(400, 'Choose a sales person.');
  return rows[0];
}

function readEntry(body, { partial = false } = {}) {
  const data = body || {};
  return {
    customer: textField(data.customer, 'Customer', 200, !partial),
    location: textField(data.location, 'Location', 200, !partial),
    product: textField(data.productGroup, 'Product group', 200, !partial),
    salesPersonId: data.salesPersonId,
    orderDate: parseOrderDate(data.orderDate, 'Order date', !partial),
    projectValue: parseMoney(data.projectValue),
    poStatus: parsePoStatus(data.poStatus),
    targetDate: parseOrderDate(data.targetDate, 'Target date', false),
    remarks: textField(data.remarks, 'Remarks', 4000, false),
  };
}

async function nextOrderIdTx(tx, year) {
  const rows = await tx.$queryRaw`
    SELECT order_id FROM projects
    WHERE order_id LIKE ${`ORD-${year}-%`}
    ORDER BY order_id DESC
    LIMIT 1
  `;
  const last = rows[0]?.order_id ? Number(String(rows[0].order_id).split('-').pop()) : 0;
  const next = Number.isFinite(last) ? last + 1 : 1;
  return `ORD-${year}-${String(next).padStart(4, '0')}`;
}

async function createDirectOrder(body, user) {
  const fields = readEntry(body);
  const sales = await assertSalesPerson(fields.salesPersonId || body?.salesPersonId);
  const requestId = /^[0-9a-f-]{36}$/i.test(String(body?.requestId || '')) ? String(body.requestId) : null;
  const year = new Date().getFullYear();
  const now = new Date();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(8726401)`;
        if (requestId) {
          const existing = await tx.$queryRaw`
            SELECT id::text AS id, order_id FROM projects
            WHERE otr_request_id = CAST(${requestId} AS uuid)
            LIMIT 1
          `;
          if (existing[0]) return { ...existing[0], reused: true };
        }
        const orderId = await nextOrderIdTx(tx, year);
        const rows = await tx.$queryRaw`
          INSERT INTO projects (
            project_code, name, current_stage, status, owner_id,
            order_status, order_id, order_confirmed_at, order_confirmed_by, order_confirmed_by_name,
            otr_stage, otr_source, otr_customer, otr_location, otr_product, otr_po_status,
            otr_project_value, otr_remarks, otr_request_id, target_end_date, created_at, updated_at
          ) VALUES (
            ${orderId},
            'Direct OTR Order',
            'DESIGN',
            'PENDING',
            CAST(${sales.id} AS uuid),
            ${ORDER_CONFIRMED},
            ${orderId},
            ${fields.orderDate},
            ${String(user.id)},
            ${user.fullName || 'User'},
            'DESIGN',
            'DIRECT',
            ${fields.customer},
            ${fields.location},
            ${fields.product},
            ${fields.poStatus},
            ${fields.projectValue},
            ${fields.remarks},
            ${requestId ? Prisma.sql`CAST(${requestId} AS uuid)` : Prisma.sql`NULL`},
            ${fields.targetDate},
            ${now},
            ${now}
          )
          RETURNING id::text AS id, order_id
        `;
        await tx.$executeRaw`
          INSERT INTO project_stage_work (project_id, stage, status, target_at, updated_by_name)
          VALUES (CAST(${rows[0].id} AS uuid), 'DESIGN', 'PENDING', ${fields.targetDate}, ${user.fullName || 'User'})
          ON CONFLICT (project_id, stage) DO NOTHING
        `;
        return rows[0];
      });
      return { id: created.id, orderId: created.order_id, reused: Boolean(created.reused) };
    } catch (error) {
      const message = `${error?.message || ''} ${error?.meta?.message || ''}`;
      if (error?.meta?.code === '23505' || message.includes('23505') || message.includes('projects_order_id_key')) continue;
      throw error;
    }
  }
  throw new AppError(409, 'Could not assign an order id. Try again.');
}

async function loadOwnedOrder(id) {
  const rows = await prisma.$queryRaw`
    SELECT id::text AS id, order_id, otr_archived_at
    FROM projects
    WHERE id = CAST(${String(id)} AS uuid)
      AND order_id IS NOT NULL
      AND btrim(order_id) <> ''
    LIMIT 1
  `;
  if (!rows[0] || rows[0].otr_archived_at) throw new AppError(404, 'OTR order not found.');
  return rows[0];
}

async function updateDirectOrder(id, body, user) {
  await loadOwnedOrder(id);
  const fields = readEntry(body);
  const sales = await assertSalesPerson(fields.salesPersonId || body?.salesPersonId);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE projects
      SET owner_id = CAST(${sales.id} AS uuid),
          order_confirmed_at = ${fields.orderDate},
          otr_customer = ${fields.customer},
          otr_location = ${fields.location},
          otr_product = ${fields.product},
          otr_po_status = ${fields.poStatus},
          otr_project_value = ${fields.projectValue},
          otr_remarks = ${fields.remarks},
          target_end_date = ${fields.targetDate},
          updated_at = ${now}
      WHERE id = CAST(${String(id)} AS uuid)
        AND otr_archived_at IS NULL
    `;
    await tx.$executeRaw`
      INSERT INTO project_stage_work (project_id, stage, status, target_at, updated_by_name)
      VALUES (CAST(${String(id)} AS uuid), 'DESIGN', 'PENDING', ${fields.targetDate}, ${user.fullName || 'User'})
      ON CONFLICT (project_id, stage) DO UPDATE
      SET target_at = EXCLUDED.target_at,
          updated_by_name = EXCLUDED.updated_by_name
    `;
  });
  return { id, orderId: (await loadOwnedOrder(id)).order_id };
}

async function archiveDirectOrder(id, user) {
  const existing = await loadOwnedOrder(id);
  const now = new Date();
  await prisma.$executeRaw`
    UPDATE projects
    SET otr_archived_at = ${now},
        updated_at = ${now}
    WHERE id = CAST(${String(existing.id)} AS uuid)
      AND otr_archived_at IS NULL
  `;
  try {
    await logActivity({
      userId: user.id,
      action: 'OTR_ORDER_ARCHIVED',
      entity: 'Project',
      entityId: existing.id,
      description: `${existing.order_id} removed from OTR.`,
    });
  } catch (error) {
    console.error('OTR order was archived, but the activity log was not.', error);
  }
  return { id: existing.id };
}

async function salesPeople() {
  return prisma.$queryRaw`
    SELECT id::text AS id, full_name AS "fullName"
    FROM users
    WHERE full_name IS NOT NULL AND btrim(full_name) <> ''
      AND COALESCE(is_active, true) = true
    ORDER BY full_name ASC
  `;
}

module.exports = {
  listEligible,
  classifyConversion,
  hasConversionRecord,
  monthStamp,
  listOtr,
  confirmOrder,
  createDirectOrder,
  updateDirectOrder,
  archiveDirectOrder,
  salesPeople,
  PO_STATUSES,
  isEligible,
  isOrderConfirmed,
  otrStageCode,
  OTR_STAGES,
};
