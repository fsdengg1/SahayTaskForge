const { prisma } = require('../prisma');
const { nextNumber } = require('../utils/numbering');
const { AppError } = require('../utils/errors');
const { logActivity } = require('../utils/activity');
const { createTask } = require('./taskService');
const { notifyByPermission } = require('../utils/notifications');

async function listVendors(query = {}) {
  return prisma.vendor.findMany({
    where: {
      ...(query.active === 'false' ? {} : { active: true }),
      ...(query.q
        ? {
            OR: [
              { vendorId: { contains: query.q, mode: 'insensitive' } },
              { companyName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { companyName: 'asc' },
    include: { _count: { select: { purchaseOrders: true, quotations: true } } },
  });
}

async function createVendor(data, user) {
  if (!data.companyName) throw new AppError(400, 'Vendor company name is needed.');
  const vendor = await prisma.vendor.create({
    data: {
      vendorId: await nextNumber('VENDOR'),
      companyName: data.companyName,
      contactPerson: data.contactPerson || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      categories: data.categories || null,
      performance: data.performance || null,
    },
  });
  await logActivity({ userId: user.id, action: 'VENDOR_CREATED', entity: 'Vendor', entityId: vendor.id, description: vendor.vendorId });
  return vendor;
}

async function updateVendor(id, data) {
  return prisma.vendor.update({
    where: { id },
    data: {
      companyName: data.companyName ?? undefined,
      contactPerson: data.contactPerson ?? undefined,
      phone: data.phone ?? undefined,
      email: data.email ?? undefined,
      address: data.address ?? undefined,
      categories: data.categories ?? undefined,
      active: data.active ?? undefined,
      performance: data.performance ?? undefined,
    },
  });
}

async function createRfq(data, user) {
  const rfq = await prisma.rfq.create({
    data: {
      rfqId: await nextNumber('RFQ'),
      projectId: data.projectId || null,
      title: data.title,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      remarks: data.remarks || null,
    },
    include: { quotations: { include: { vendor: true } }, project: true },
  });
  await logActivity({ userId: user.id, action: 'RFQ_CREATED', entity: 'Project', entityId: data.projectId || rfq.id, description: rfq.rfqId });
  return rfq;
}

async function addVendorQuote(rfqId, data, user) {
  const quote = await prisma.vendorQuotation.create({
    data: {
      rfqId,
      vendorId: data.vendorId,
      amount: data.amount != null ? Number(data.amount) : null,
      currency: data.currency || 'INR',
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      remarks: data.remarks || null,
    },
    include: { vendor: true },
  });
  await logActivity({ userId: user.id, action: 'VENDOR_QUOTE_ADDED', entity: 'Rfq', entityId: rfqId, description: 'Vendor quotation received' });
  return quote;
}

async function finalizeVendor(quoteId, user) {
  const quote = await prisma.vendorQuotation.findUnique({ where: { id: quoteId } });
  if (!quote) throw new AppError(404, 'Quotation not found.');
  await prisma.vendorQuotation.updateMany({ where: { rfqId: quote.rfqId }, data: { selected: false } });
  await prisma.vendorQuotation.update({ where: { id: quoteId }, data: { selected: true } });
  await prisma.rfq.update({ where: { id: quote.rfqId }, data: { statusCode: 'VENDOR_FINALIZED' } });
  await logActivity({ userId: user.id, action: 'VENDOR_FINALIZED', entity: 'Rfq', entityId: quote.rfqId, description: 'Vendor finalized' });
  return quote;
}

async function createPurchaseOrder(data, user) {
  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber: data.poNumber || (await nextNumber('PO')),
      projectId: data.projectId || null,
      vendorId: data.vendorId,
      expectedDelivery: data.expectedDelivery ? new Date(data.expectedDelivery) : null,
      currency: data.currency || 'INR',
      totalAmount: data.totalAmount != null ? Number(data.totalAmount) : null,
      remarks: data.remarks || null,
      statusCode: 'ISSUED',
      items: {
        create: (data.items || []).map((item) => ({
          description: item.description,
          quantity: Number(item.quantity || 0),
          unit: item.unit || null,
          unitPrice: item.unitPrice != null ? Number(item.unitPrice) : null,
        })),
      },
    },
    include: { vendor: true, items: true },
  });
  await logActivity({ userId: user.id, action: 'PO_CREATED', entity: 'Project', entityId: data.projectId || po.id, description: po.poNumber });
  return po;
}

async function receiveMaterial(data, user) {
  const grn = await prisma.goodsReceipt.create({
    data: {
      grnNumber: await nextNumber('GRN'),
      projectId: data.projectId || null,
      poId: data.poId || null,
      quantity: data.quantity != null ? Number(data.quantity) : null,
      remarks: data.remarks || null,
    },
  });
  if (data.poId) {
    await prisma.purchaseOrder.update({
      where: { id: data.poId },
      data: { actualDelivery: new Date(), statusCode: 'RECEIVED' },
    });
  }
  await logActivity({
    userId: user.id,
    action: 'MATERIAL_RECEIVED',
    entity: 'Project',
    entityId: data.projectId || grn.id,
    description: `${grn.grnNumber} received`,
  });
  return grn;
}

async function listProcurement(projectId) {
  return {
    rfqs: await prisma.rfq.findMany({
      where: projectId ? { projectId } : {},
      include: { quotations: { include: { vendor: true } }, project: { select: { projectId: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    purchaseOrders: await prisma.purchaseOrder.findMany({
      where: projectId ? { projectId } : {},
      include: { vendor: true, items: true, project: { select: { projectId: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    receipts: await prisma.goodsReceipt.findMany({
      where: projectId ? { projectId } : {},
      include: { po: true },
      orderBy: { receivedAt: 'desc' },
    }),
  };
}

async function ensureProduction(projectId, user) {
  let order = await prisma.productionOrder.findFirst({
    where: { projectId },
    include: { operations: { include: { updates: true }, orderBy: { sortOrder: 'asc' } } },
  });
  if (order) return order;
  const ops = await prisma.productionOperationConfig.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
  order = await prisma.productionOrder.create({
    data: {
      productionId: await nextNumber('PROD'),
      projectId,
      operations: {
        create: ops.map((op) => ({
          operationCode: op.code,
          name: op.name,
          sortOrder: op.sortOrder,
        })),
      },
    },
    include: { operations: { include: { updates: true }, orderBy: { sortOrder: 'asc' } } },
  });
  await logActivity({ userId: user?.id, action: 'PRODUCTION_CREATED', entity: 'Project', entityId: projectId, description: order.productionId });
  return order;
}

async function updateOperation(id, data, user) {
  const op = await prisma.productionOperation.update({
    where: { id },
    data: {
      plannedQty: data.plannedQty != null ? Number(data.plannedQty) : undefined,
      completedQty: data.completedQty != null ? Number(data.completedQty) : undefined,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
      completedDate: data.statusCode === 'COMPLETED' ? new Date() : undefined,
      assignedTeam: data.assignedTeam ?? undefined,
      statusCode: data.statusCode ?? undefined,
      remarks: data.remarks ?? undefined,
    },
  });
  if (data.message) {
    await prisma.productionUpdate.create({
      data: { operationId: id, message: data.message, quantity: data.completedQty != null ? Number(data.completedQty) : null },
    });
  }
  await logActivity({
    userId: user.id,
    action: 'PRODUCTION_UPDATED',
    entity: 'ProductionOperation',
    entityId: id,
    description: `${op.name} ${op.statusCode}`,
  });
  return prisma.productionOperation.findUnique({ where: { id }, include: { updates: true } });
}

async function createInspection(data, user) {
  const inspection = await prisma.qualityInspection.create({
    data: {
      inspectionId: await nextNumber('INSP'),
      projectId: data.projectId,
      typeCode: data.typeCode,
      inspectorId: user.id,
      quantity: data.quantity != null ? Number(data.quantity) : null,
      resultCode: data.resultCode,
      defect: data.defect || null,
      remarks: data.remarks || null,
      reworkRequired: data.resultCode === 'FAILED' || Boolean(data.reworkRequired),
      documentId: data.documentId || null,
      goodsReceiptId: data.goodsReceiptId || null,
    },
  });
  await logActivity({
    userId: user.id,
    action: data.resultCode === 'FAILED' ? 'QC_FAILED' : 'QC_RECORDED',
    entity: 'Project',
    entityId: data.projectId,
    description: `${inspection.inspectionId} ${data.resultCode}`,
  });
  if (inspection.reworkRequired) {
    await createTask({
      projectId: data.projectId,
      name: `Rework / rectification after ${data.typeCode} QC`,
      module: data.typeCode === 'INSTALLATION' ? 'INSTALLATION' : 'PRODUCTION',
      statusCode: 'NOT_STARTED',
      priorityCode: 'HIGH',
      sourceType: 'QC',
      sourceId: inspection.id,
      remarks: data.defect || data.remarks || 'QC failed',
    }, user);
    await logActivity({
      userId: user.id,
      action: 'REWORK_CREATED',
      entity: 'Project',
      entityId: data.projectId,
      description: `Rework created from ${inspection.inspectionId}`,
    });
    await notifyByPermission('quality.view', {
      title: 'QC failed',
      message: `${inspection.inspectionId} failed — rework created`,
      type: 'QC',
      entityType: 'Project',
      entityId: data.projectId,
      link: `/projects/${data.projectId}?tab=quality`,
    });
  }
  return inspection;
}

async function listInspections(projectId) {
  return prisma.qualityInspection.findMany({
    where: projectId ? { projectId } : {},
    include: { inspector: { select: { fullName: true } }, project: { select: { projectId: true, name: true } } },
    orderBy: { inspectedAt: 'desc' },
  });
}

async function getInstallation(projectId) {
  let inst = await prisma.installation.findFirst({
    where: { projectId },
    include: { visits: { include: { siteEngineer: { select: { fullName: true } } }, orderBy: { visitDate: 'desc' } }, activities: { orderBy: { sortOrder: 'asc' } }, readiness: true },
  });
  if (!inst) {
    inst = await prisma.installation.create({
      data: { projectId, statusCode: 'NOT_STARTED' },
      include: { visits: true, activities: true, readiness: true },
    });
  }
  return inst;
}

async function updateReadiness(installationId, items, user) {
  for (const item of items) {
    await prisma.siteReadinessItem.update({
      where: { installationId_itemCode: { installationId, itemCode: item.itemCode } },
      data: { statusCode: item.statusCode, reason: item.reason || null },
    });
  }
  const all = await prisma.siteReadinessItem.findMany({ where: { installationId } });
  const ready = all.filter((i) => i.statusCode === 'READY').length;
  const code = ready === all.length ? 'READY' : ready === 0 ? 'NOT_READY' : 'PARTIAL';
  const inst = await prisma.installation.update({
    where: { id: installationId },
    data: { readinessCode: code, readinessReason: items.find((i) => i.statusCode === 'NOT_READY')?.reason || null },
  });
  await logActivity({ userId: user.id, action: 'SITE_READINESS_UPDATED', entity: 'Project', entityId: inst.projectId, description: `Site ${code}` });
  return getInstallation(inst.projectId);
}

async function addVisit(installationId, data, user) {
  const visit = await prisma.installationVisit.create({
    data: {
      installationId,
      visitDate: data.visitDate ? new Date(data.visitDate) : new Date(),
      siteEngineerId: data.siteEngineerId || user.id,
      team: data.team || null,
      workCompleted: data.workCompleted || null,
      progressPercent: data.progressPercent != null ? Number(data.progressPercent) : null,
      issues: data.issues || null,
      remarks: data.remarks || null,
    },
  });
  await prisma.installation.update({ where: { id: installationId }, data: { statusCode: 'IN_PROGRESS' } });
  const inst = await prisma.installation.findUnique({ where: { id: installationId } });
  await logActivity({ userId: user.id, action: 'INSTALLATION_STARTED', entity: 'Project', entityId: inst.projectId, description: 'Installation visit recorded' });
  return visit;
}

async function updateInstallActivity(id, statusCode, user) {
  const act = await prisma.installationActivity.update({ where: { id }, data: { statusCode } });
  await logActivity({ userId: user.id, action: 'INSTALL_ACTIVITY_UPDATED', entity: 'InstallationActivity', entityId: id, description: `${act.label} ${statusCode}` });
  return act;
}

async function createPunch(data, user) {
  const punch = await prisma.punchPoint.create({
    data: {
      punchId: await nextNumber('PUNCH'),
      projectId: data.projectId,
      description: data.description,
      location: data.location || null,
      priorityCode: data.priorityCode || 'MEDIUM',
      assignedToId: data.assignedToId || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      remarks: data.remarks || null,
      photoDocumentId: data.photoDocumentId || null,
    },
  });
  await logActivity({ userId: user.id, action: 'PUNCH_POINT_CREATED', entity: 'Project', entityId: data.projectId, description: punch.punchId });
  return punch;
}

async function updatePunch(id, data, user) {
  const punch = await prisma.punchPoint.update({
    where: { id },
    data: {
      statusCode: data.statusCode ?? undefined,
      assignedToId: data.assignedToId ?? undefined,
      remarks: data.remarks ?? undefined,
      completedAt: data.statusCode === 'COMPLETED' || data.statusCode === 'VERIFIED' ? new Date() : undefined,
    },
  });
  await logActivity({ userId: user.id, action: 'PUNCH_UPDATED', entity: 'PunchPoint', entityId: id, oldValue: null, newValue: punch.statusCode, description: punch.punchId });
  return punch;
}

async function createHandover(data, user) {
  const openPunch = await prisma.punchPoint.count({
    where: { projectId: data.projectId, statusCode: { in: ['OPEN', 'IN_PROGRESS'] } },
  });
  if (openPunch && !data.forceAccept) {
    throw new AppError(400, 'Customer acceptance requires open punch points to be completed or explicitly approved.');
  }
  const handover = await prisma.handover.create({
    data: {
      projectId: data.projectId,
      handoverDate: data.handoverDate ? new Date(data.handoverDate) : new Date(),
      customerRepresentative: data.customerRepresentative || null,
      sahayRepresentativeId: data.sahayRepresentativeId || user.id,
      customerAccepted: Boolean(data.customerAccepted),
      remarks: data.remarks || null,
      documentId: data.documentId || null,
    },
  });
  await logActivity({
    userId: user.id,
    action: 'HANDOVER_COMPLETED',
    entity: 'Project',
    entityId: data.projectId,
    description: 'Handover recorded',
  });
  return handover;
}

async function createInvoice(data, user) {
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: data.invoiceNumber || (await nextNumber('INV')),
      projectId: data.projectId,
      invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
      amount: Number(data.amount),
      currency: data.currency || 'INR',
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      statusCode: 'INVOICED',
      remarks: data.remarks || null,
    },
  });
  await logActivity({ userId: user.id, action: 'INVOICE_CREATED', entity: 'Project', entityId: data.projectId, description: invoice.invoiceNumber });
  return invoice;
}

async function addPayment(invoiceId, data, user) {
  const payment = await prisma.payment.create({
    data: {
      invoiceId,
      paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
      amount: Number(data.amount),
      method: data.method || null,
      reference: data.reference || null,
      remarks: data.remarks || null,
    },
  });
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  let status = 'PARTIALLY_PAID';
  if (paid >= Number(invoice.amount)) status = 'PAID';
  else if (invoice.dueDate && new Date(invoice.dueDate) < new Date()) status = 'OVERDUE';
  await prisma.invoice.update({ where: { id: invoiceId }, data: { statusCode: status } });
  await logActivity({ userId: user.id, action: 'PAYMENT_RECORDED', entity: 'Invoice', entityId: invoiceId, description: `${payment.amount} received` });
  return prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
}

async function listFinance(projectId) {
  return prisma.invoice.findMany({
    where: projectId ? { projectId } : {},
    include: { payments: true, project: { select: { id: true, projectId: true, name: true, customer: { select: { companyName: true } } } } },
    orderBy: { invoiceDate: 'desc' },
  });
}

async function listApprovals() {
  return prisma.approval.findMany({
    include: {
      project: { select: { id: true, projectId: true, name: true } },
      document: { select: { originalName: true, categoryCode: true, revision: true } },
      submittedBy: { select: { fullName: true } },
      reviewer: { select: { fullName: true } },
    },
    orderBy: { submittedAt: 'desc' },
    take: 200,
  });
}

async function listIssues(query = {}, user = {}) {
  return require('./issueService').listWorkspace(query, user);
}

async function listActivity(query = {}) {
  const where = {};
  if (query.q) {
    where.OR = [
      { action: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
      { entity: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  if (query.entity) where.entity = query.entity;
  if (query.from || query.to) {
    where.timestamp = {};
    if (query.from) where.timestamp.gte = new Date(query.from);
    if (query.to) where.timestamp.lte = new Date(`${query.to}T23:59:59`);
  }
  return prisma.activityLog.findMany({
    where,
    include: { user: { select: { fullName: true, department: { select: { name: true } } } } },
    orderBy: { timestamp: 'desc' },
    take: Math.min(300, Number(query.pageSize) || 120),
  });
}

async function listProductionOrders() {
  return prisma.productionOrder.findMany({
    include: {
      project: { select: { id: true, projectId: true, name: true } },
      operations: { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

async function listInstallations() {
  return prisma.installation.findMany({
    include: {
      project: { select: { id: true, projectId: true, name: true, customer: { select: { companyName: true } } } },
      readiness: true,
      visits: { orderBy: { visitDate: 'desc' }, take: 1 },
      activities: true,
    },
    orderBy: { id: 'desc' },
    take: 100,
  });
}

async function listPunches() {
  return prisma.punchPoint.findMany({
    include: { project: { select: { id: true, projectId: true, name: true } }, assignedTo: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

async function listHandovers() {
  return prisma.handover.findMany({
    include: { project: { select: { id: true, projectId: true, name: true, customer: { select: { companyName: true } } } } },
    orderBy: { handoverDate: 'desc' },
    take: 100,
  });
}

async function createIssue(data, user) {
  return require('./issueService').createIssue(data, user);
}

module.exports = {
  listVendors,
  createVendor,
  updateVendor,
  createRfq,
  addVendorQuote,
  finalizeVendor,
  createPurchaseOrder,
  receiveMaterial,
  listProcurement,
  ensureProduction,
  updateOperation,
  createInspection,
  listInspections,
  getInstallation,
  updateReadiness,
  addVisit,
  updateInstallActivity,
  createPunch,
  updatePunch,
  createHandover,
  createInvoice,
  addPayment,
  listFinance,
  listApprovals,
  listIssues,
  listActivity,
  listProductionOrders,
  listInstallations,
  listPunches,
  listHandovers,
  createIssue,
};
