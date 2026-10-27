const express = require('express');
const path = require('path');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { upload } = require('../middleware/upload');
const { asyncHandler } = require('../utils/asyncHandler');
const { AppError } = require('../utils/errors');
const { prisma } = require('../prisma');

const lookupService = require('../services/lookupService');
const customerService = require('../services/customerService');
const userService = require('../services/userService');
const taskService = require('../services/taskService');
const documentService = require('../services/documentService');
const ops = require('../services/opsService');
const dashboard = require('../services/dashboardService');
const reportService = require('../services/reportService');
const settingsService = require('../services/settingsService');
const searchService = require('../services/searchService');
const importService = require('../services/importService');

const authRoutes = require('./auth');
const leadRoutes = require('./leads');
const projectRoutes = require('./projects');
const designRoutes = require('./design');
const lifecycleRoutes = require('./lifecycle');
const productionTrackingRoutes = require('./productionTracking');
const installationTrackingRoutes = require('./installationTracking');
const manufacturingTrackingRoutes = require('./manufacturingTracking');
const procurementTrackingRoutes = require('./procurementTracking');
const vendorTrackingRoutes = require('./vendorTracking');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/leads', leadRoutes);
router.use('/projects', projectRoutes);
router.use('/design', designRoutes);
router.use('/lifecycle', lifecycleRoutes);
router.use('/production/tracking', productionTrackingRoutes);
router.use('/installation/tracking', installationTrackingRoutes);
router.use('/manufacturing/tracking', manufacturingTrackingRoutes);
router.use('/procurement/tracking', procurementTrackingRoutes);
router.use('/vendors/tracking', vendorTrackingRoutes);

router.get(
  '/lookups',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await lookupService.grouped());
  })
);

router.get(
  '/departments',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await lookupService.listDepartments());
  })
);

router.get(
  '/customers',
  authenticate,
  authorize('customers.view'),
  asyncHandler(async (req, res) => {
    res.json(await customerService.listCustomers(req.query));
  })
);

router.post(
  '/customers',
  authenticate,
  authorize('customers.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await customerService.createCustomer(req.body, req.user.id));
  })
);

router.get(
  '/customers/:id',
  authenticate,
  authorize('customers.view'),
  asyncHandler(async (req, res) => {
    res.json(await customerService.getCustomer(req.params.id));
  })
);

router.put(
  '/customers/:id',
  authenticate,
  authorize('customers.edit'),
  asyncHandler(async (req, res) => {
    res.json(await customerService.updateCustomer(req.params.id, req.body, req.user.id));
  })
);

router.delete(
  '/customers/:id',
  authenticate,
  authorize('customers.edit'),
  asyncHandler(async (req, res) => {
    res.json(await customerService.deleteCustomer(req.params.id, req.user.id));
  })
);

router.post(
  '/customers/:id/contacts',
  authenticate,
  authorize('customers.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await customerService.addContact(req.params.id, req.body));
  })
);

router.post(
  '/customers/:id/sites',
  authenticate,
  authorize('customers.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await customerService.addSite(req.params.id, req.body));
  })
);

router.get(
  '/users',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.query.sales === 'true') return res.json(await userService.salesUsers());
    if (!req.user.permissions.includes('users.manage') && !req.user.roles.some((r) => r.code === 'ADMIN')) {
      const users = await userService.listUsers({ ...req.query, pageSize: 100 });
      return res.json(users);
    }
    res.json(await userService.listUsers(req.query));
  })
);

router.post(
  '/users',
  authenticate,
  authorize('users.manage'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await userService.createUser(req.body, req.user));
  })
);

router.put(
  '/users/:id',
  authenticate,
  authorize('users.manage'),
  asyncHandler(async (req, res) => {
    res.json(await userService.updateUser(req.params.id, req.body, req.user));
  })
);

router.get(
  '/roles',
  authenticate,
  authorize('users.manage'),
  asyncHandler(async (req, res) => {
    res.json(await userService.listRoles());
  })
);

router.post(
  '/roles',
  authenticate,
  authorize('users.manage'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await userService.createRole(req.body, req.user));
  })
);

router.put(
  '/roles/:id',
  authenticate,
  authorize('users.manage'),
  asyncHandler(async (req, res) => {
    res.json(await userService.updateRole(req.params.id, req.body, req.user));
  })
);

router.get(
  '/permissions',
  authenticate,
  authorize('users.manage'),
  asyncHandler(async (req, res) => {
    res.json(await userService.listPermissions());
  })
);

router.get(
  '/tasks',
  authenticate,
  authorize('tasks.view'),
  asyncHandler(async (req, res) => {
    res.json(await taskService.listTasks(req.query, req.user));
  })
);

router.get(
  '/tasks/:id',
  authenticate,
  authorize('tasks.view'),
  asyncHandler(async (req, res) => {
    res.json(await taskService.getTask(req.params.id));
  })
);

router.patch(
  '/tasks/:id',
  authenticate,
  authorize('tasks.edit'),
  asyncHandler(async (req, res) => {
    res.json(await taskService.updateTask(req.params.id, req.body, req.user));
  })
);

router.post(
  '/tasks/:id/dependencies',
  authenticate,
  authorize('tasks.edit'),
  asyncHandler(async (req, res) => {
    res.json(await taskService.addDependency(req.params.id, req.body.dependsOnTaskId));
  })
);

router.post(
  '/tasks/:id/comments',
  authenticate,
  authorize('tasks.view'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await taskService.addTaskComment(req.params.id, req.body.body, req.user));
  })
);

router.get(
  '/documents',
  authenticate,
  authorize('documents.view'),
  asyncHandler(async (req, res) => {
    res.json(await documentService.listDocuments(req.query));
  })
);

router.post(
  '/documents',
  authenticate,
  authorize('documents.upload'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    res.status(201).json(
      await documentService.createDocumentFromFile({
        file: req.file,
        leadId: req.body.leadId || null,
        projectId: req.body.projectId || null,
        categoryCode: req.body.categoryCode,
        userId: req.user.id,
        revision: req.body.revision,
      })
    );
  })
);

router.post(
  '/documents/:id/archive',
  authenticate,
  authorize('documents.upload'),
  asyncHandler(async (req, res) => {
    res.json(await documentService.archiveDocument(req.params.id, req.user));
  })
);

router.get(
  '/documents/:id/file',
  authenticate,
  authorize('documents.view'),
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    res.sendFile(path.resolve(process.cwd(), doc.storagePath));
  })
);

router.post(
  '/approvals',
  authenticate,
  authorize('design.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await documentService.submitApproval(req.body, req.user));
  })
);

router.patch(
  '/approvals/:id',
  authenticate,
  authorize('design.edit'),
  asyncHandler(async (req, res) => {
    res.json(await documentService.decideApproval(req.params.id, req.body.statusCode, req.body.comments, req.user));
  })
);

router.get(
  '/vendors',
  authenticate,
  authorize('vendors.view'),
  asyncHandler(async (req, res) => {
    res.json(await ops.listVendors(req.query));
  })
);

router.post(
  '/vendors',
  authenticate,
  authorize('vendors.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await ops.createVendor(req.body, req.user));
  })
);

router.put(
  '/vendors/:id',
  authenticate,
  authorize('vendors.edit'),
  asyncHandler(async (req, res) => {
    res.json(await ops.updateVendor(req.params.id, req.body));
  })
);

router.get(
  '/procurement',
  authenticate,
  authorize('procurement.view'),
  asyncHandler(async (req, res) => {
    res.json(await ops.listProcurement(req.query.projectId));
  })
);

router.post(
  '/rfqs',
  authenticate,
  authorize('procurement.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await ops.createRfq(req.body, req.user));
  })
);

router.post(
  '/rfqs/:id/quotes',
  authenticate,
  authorize('procurement.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await ops.addVendorQuote(req.params.id, req.body, req.user));
  })
);

router.post(
  '/quotes/:id/finalize',
  authenticate,
  authorize('procurement.edit'),
  asyncHandler(async (req, res) => {
    res.json(await ops.finalizeVendor(req.params.id, req.user));
  })
);

router.post(
  '/purchase-orders',
  authenticate,
  authorize('procurement.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await ops.createPurchaseOrder(req.body, req.user));
  })
);

router.post(
  '/goods-receipts',
  authenticate,
  authorize('procurement.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await ops.receiveMaterial(req.body, req.user));
  })
);

router.get(
  '/production/:projectId',
  authenticate,
  authorize('production.view'),
  asyncHandler(async (req, res) => {
    res.json(await ops.ensureProduction(req.params.projectId, req.user));
  })
);

router.patch(
  '/production/operations/:id',
  authenticate,
  authorize('production.edit'),
  asyncHandler(async (req, res) => {
    res.json(await ops.updateOperation(req.params.id, req.body, req.user));
  })
);

router.get(
  '/quality',
  authenticate,
  authorize('quality.view'),
  asyncHandler(async (req, res) => {
    res.json(await ops.listInspections(req.query.projectId));
  })
);

router.post(
  '/quality',
  authenticate,
  authorize('quality.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await ops.createInspection(req.body, req.user));
  })
);

router.get(
  '/installation/:projectId',
  authenticate,
  authorize('installation.view'),
  asyncHandler(async (req, res) => {
    res.json(await ops.getInstallation(req.params.projectId));
  })
);

router.patch(
  '/installation/:id/readiness',
  authenticate,
  authorize('installation.edit'),
  asyncHandler(async (req, res) => {
    res.json(await ops.updateReadiness(req.params.id, req.body.items || [], req.user));
  })
);

router.post(
  '/installation/:id/visits',
  authenticate,
  authorize('installation.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await ops.addVisit(req.params.id, req.body, req.user));
  })
);

router.patch(
  '/installation/activities/:id',
  authenticate,
  authorize('installation.edit'),
  asyncHandler(async (req, res) => {
    res.json(await ops.updateInstallActivity(req.params.id, req.body.statusCode, req.user));
  })
);

router.post(
  '/punch-points',
  authenticate,
  authorize('installation.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await ops.createPunch(req.body, req.user));
  })
);

router.patch(
  '/punch-points/:id',
  authenticate,
  authorize('installation.edit'),
  asyncHandler(async (req, res) => {
    res.json(await ops.updatePunch(req.params.id, req.body, req.user));
  })
);

router.post(
  '/handovers',
  authenticate,
  authorize('installation.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await ops.createHandover(req.body, req.user));
  })
);

router.get(
  '/finance',
  authenticate,
  authorize('finance.view'),
  asyncHandler(async (req, res) => {
    res.json(await ops.listFinance(req.query.projectId));
  })
);

router.get(
  '/approvals',
  authenticate,
  authorize('design.view', 'projects.view', 'dashboard.management'),
  asyncHandler(async (_req, res) => {
    res.json(await ops.listApprovals());
  })
);

router.get(
  '/issues',
  authenticate,
  authorize('projects.view', 'dashboard.management'),
  asyncHandler(async (req, res) => {
    const issueService = require('../services/issueService');
    res.json(await issueService.listWorkspace(req.query, req.user));
  })
);

router.post(
  '/issues',
  authenticate,
  authorize('projects.edit', 'dashboard.management'),
  asyncHandler(async (req, res) => {
    const issueService = require('../services/issueService');
    res.status(201).json(await issueService.createIssue(req.body, req.user));
  })
);

router.get(
  '/issues/:id',
  authenticate,
  authorize('projects.view', 'dashboard.management'),
  asyncHandler(async (req, res) => {
    const issueService = require('../services/issueService');
    res.json(await issueService.getIssue(req.params.id, req.user));
  })
);

router.patch(
  '/issues/:id',
  authenticate,
  authorize('projects.edit', 'dashboard.management'),
  asyncHandler(async (req, res) => {
    const issueService = require('../services/issueService');
    res.json(await issueService.updateIssue(req.params.id, req.body, req.user));
  })
);

router.post(
  '/issues/:id/comments',
  authenticate,
  authorize('projects.view', 'dashboard.management'),
  asyncHandler(async (req, res) => {
    const issueService = require('../services/issueService');
    res.status(201).json(await issueService.addComment(req.params.id, req.body.body, req.user));
  })
);

router.post(
  '/issues/:id/documents',
  authenticate,
  authorize('documents.upload'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const issue = await prisma.issue.findUnique({ where: { id: req.params.id } });
    res.status(201).json(
      await documentService.createDocumentFromFile({
        file: req.file,
        projectId: issue?.projectId,
        issueId: req.params.id,
        categoryCode: req.body.categoryCode,
        userId: req.user.id,
        revision: req.body.revision,
      })
    );
  })
);

router.get(
  '/activity',
  authenticate,
  authorize('dashboard.view', 'dashboard.management', 'projects.view'),
  asyncHandler(async (req, res) => {
    res.json(await ops.listActivity(req.query));
  })
);

router.get(
  '/production',
  authenticate,
  authorize('production.view', 'dashboard.management'),
  asyncHandler(async (_req, res) => {
    res.json(await ops.listProductionOrders());
  })
);

router.get(
  '/installations',
  authenticate,
  authorize('installation.view', 'dashboard.management'),
  asyncHandler(async (_req, res) => {
    res.json(await ops.listInstallations());
  })
);

router.get(
  '/punch-points',
  authenticate,
  authorize('installation.view', 'dashboard.management'),
  asyncHandler(async (_req, res) => {
    res.json(await ops.listPunches());
  })
);

router.get(
  '/punch-points/:id',
  authenticate,
  authorize('installation.view', 'dashboard.management', 'projects.view'),
  asyncHandler(async (req, res) => {
    const issueService = require('../services/issueService');
    res.json(await issueService.getPunch(req.params.id));
  })
);

router.post(
  '/punch-points/:id/comments',
  authenticate,
  authorize('installation.edit', 'projects.view'),
  asyncHandler(async (req, res) => {
    const issueService = require('../services/issueService');
    res.status(201).json(await issueService.addPunchComment(req.params.id, req.body.body, req.user));
  })
);

router.get(
  '/handovers',
  authenticate,
  authorize('installation.view', 'dashboard.management'),
  asyncHandler(async (_req, res) => {
    res.json(await ops.listHandovers());
  })
);

router.post(
  '/invoices',
  authenticate,
  authorize('finance.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await ops.createInvoice(req.body, req.user));
  })
);

router.post(
  '/invoices/:id/payments',
  authenticate,
  authorize('finance.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await ops.addPayment(req.params.id, req.body, req.user));
  })
);

router.get(
  '/dashboard/management',
  authenticate,
  authorize('dashboard.management', 'dashboard.view'),
  asyncHandler(async (req, res) => {
    const executive = require('../services/executiveService');
    res.json(await executive.executive(req.query, req.user));
  })
);

router.get(
  '/dashboard/sales',
  authenticate,
  authorize('dashboard.sales', 'dashboard.management'),
  asyncHandler(async (req, res) => {
    res.json(await dashboard.sales());
  })
);

router.get(
  '/dashboard/design',
  authenticate,
  authorize('dashboard.design', 'dashboard.management'),
  asyncHandler(async (req, res) => {
    res.json(await dashboard.design());
  })
);

router.get(
  '/dashboard/procurement',
  authenticate,
  authorize('dashboard.procurement', 'dashboard.management'),
  asyncHandler(async (req, res) => {
    res.json(await dashboard.procurement());
  })
);

router.get(
  '/dashboard/production',
  authenticate,
  authorize('dashboard.production', 'dashboard.management'),
  asyncHandler(async (req, res) => {
    res.json(await dashboard.production());
  })
);

router.get(
  '/dashboard/installation',
  authenticate,
  authorize('dashboard.installation', 'dashboard.management'),
  asyncHandler(async (req, res) => {
    res.json(await dashboard.installation());
  })
);

router.get(
  '/customer-feedback',
  authenticate,
  authorize('customer_feedback.view', 'leads.view', 'dashboard.management'),
  asyncHandler(async (req, res) => {
    const customerFeedback = require('../services/customerFeedbackService');
    res.json(await customerFeedback.list(req.query));
  })
);

router.post(
  '/customer-feedback',
  authenticate,
  authorize('customer_feedback.create', 'customer_feedback.edit', 'leads.edit'),
  asyncHandler(async (req, res) => {
    const customerFeedback = require('../services/customerFeedbackService');
    res.status(201).json(await customerFeedback.create(req.body, req.user));
  })
);

router.get(
  '/customer-feedback/:id',
  authenticate,
  authorize('customer_feedback.view', 'leads.view', 'dashboard.management'),
  asyncHandler(async (req, res) => {
    const customerFeedback = require('../services/customerFeedbackService');
    res.json(await customerFeedback.getById(req.params.id));
  })
);

router.patch(
  '/customer-feedback/:id',
  authenticate,
  authorize('customer_feedback.edit', 'leads.edit'),
  asyncHandler(async (req, res) => {
    const customerFeedback = require('../services/customerFeedbackService');
    res.json(await customerFeedback.update(req.params.id, req.body, req.user));
  })
);

router.get(
  '/reports/:type',
  authenticate,
  authorize('reports.view'),
  asyncHandler(async (req, res) => {
    res.json(await reportService.run(req.params.type, req.query));
  })
);

router.get(
  '/search',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await searchService.globalSearch(req.query.q));
  })
);

router.get(
  '/notifications',
  authenticate,
  asyncHandler(async (req, res) => {
    const items = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
    res.json(items);
  })
);

router.patch(
  '/notifications/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const updated = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { readAt: new Date() },
    });
    if (!updated.count) throw new AppError(404, 'Notification not found.');
    res.json({ ok: true });
  })
);

router.post(
  '/notifications/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  })
);

router.get(
  '/settings/lookups',
  authenticate,
  authorize('settings.manage'),
  asyncHandler(async (req, res) => {
    res.json(await settingsService.listLookups(req.query.type));
  })
);

router.post(
  '/settings/lookups',
  authenticate,
  authorize('settings.manage'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await settingsService.upsertLookup(req.body));
  })
);

router.get(
  '/settings/stage-weights',
  authenticate,
  authorize('settings.manage'),
  asyncHandler(async (req, res) => {
    res.json(await settingsService.listStageWeights());
  })
);

router.put(
  '/settings/stage-weights',
  authenticate,
  authorize('settings.manage'),
  asyncHandler(async (req, res) => {
    res.json(await settingsService.updateStageWeights(req.body.items || []));
  })
);

router.get(
  '/settings/production-ops',
  authenticate,
  authorize('settings.manage'),
  asyncHandler(async (req, res) => {
    res.json(await settingsService.listProductionOps());
  })
);

router.post(
  '/settings/production-ops',
  authenticate,
  authorize('settings.manage'),
  asyncHandler(async (req, res) => {
    res.json(await settingsService.upsertProductionOp(req.body));
  })
);

router.get(
  '/settings/departments',
  authenticate,
  authorize('settings.manage'),
  asyncHandler(async (req, res) => {
    res.json(await settingsService.listDepartments());
  })
);

router.post(
  '/settings/departments',
  authenticate,
  authorize('settings.manage'),
  asyncHandler(async (req, res) => {
    res.json(await settingsService.upsertDepartment(req.body));
  })
);

router.get(
  '/settings/closure',
  authenticate,
  authorize('settings.manage'),
  asyncHandler(async (req, res) => {
    res.json(await settingsService.listClosure());
  })
);

router.patch(
  '/settings/closure/:id',
  authenticate,
  authorize('settings.manage'),
  asyncHandler(async (req, res) => {
    res.json(await settingsService.updateClosure(req.params.id, req.body));
  })
);

router.get(
  '/audit',
  authenticate,
  authorize('audit.view'),
  asyncHandler(async (req, res) => {
    res.json(await settingsService.listAudit(req.query));
  })
);

router.post(
  '/import/excel',
  authenticate,
  authorize('settings.manage'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    res.json(await importService.importWorkbook(req.file.path, req.user));
  })
);

module.exports = router;
