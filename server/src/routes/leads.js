const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { upload } = require('../middleware/upload');
const { asyncHandler } = require('../utils/asyncHandler');
const leadService = require('../services/leadService');
const { createDocumentFromFile } = require('../services/documentService');

const router = express.Router();
router.use(authenticate);

function parseBody(body) {
  const data = { ...body };
  ['equipmentAvailable', 'equipmentRequired', 'checklist'].forEach((key) => {
    if (typeof data[key] === 'string') {
      try {
        data[key] = JSON.parse(data[key]);
      } catch {
        data[key] = data[key].split(',').filter(Boolean);
      }
    }
  });
  ['sitePhotosAvailable', 'layoutAvailable'].forEach((key) => {
    if (data[key] === 'true') data[key] = true;
    if (data[key] === 'false') data[key] = false;
  });
  return data;
}

router.get(
  '/',
  authorize('leads.view'),
  asyncHandler(async (req, res) => {
    res.json(await leadService.listLeads(req.query, req.user));
  })
);

router.get(
  '/deadline-preview',
  authorize('leads.view'),
  asyncHandler(async (req, res) => {
    res.json(leadService.getDeadlinePreview(req.query));
  })
);

router.get(
  '/dashboard',
  authorize('leads.view'),
  asyncHandler(async (req, res) => {
    const leadDashboard = require('../services/leadDashboardService');
    res.json(await leadDashboard.getDashboard(req.query));
  })
);

router.get(
  '/sales-enquiry-dashboard',
  authorize('leads.view'),
  asyncHandler(async (req, res) => {
    const salesEnquiry = require('../services/salesEnquiryDashboardService');
    res.json(await salesEnquiry.getSalesEnquiryDashboard(req.query));
  })
);

router.post(
  '/:id/customer-feedback',
  authorize('customer_feedback.create', 'customer_feedback.edit', 'leads.edit'),
  asyncHandler(async (req, res) => {
    const customerFeedback = require('../services/customerFeedbackService');
    res.json(await customerFeedback.openForLead(req.params.id, req.user, req.body || {}));
  })
);

router.post(
  '/',
  authorize('leads.create'),
  upload.fields([
    { name: 'photos', maxCount: 8 },
    { name: 'drawings', maxCount: 8 },
  ]),
  asyncHandler(async (req, res) => {
    const files = [...(req.files?.photos || []), ...(req.files?.drawings || [])];
    const lead = await leadService.createLead(parseBody(req.body), { ...req.user, ip: req.ip }, files);
    res.status(201).json({ message: 'Lead created successfully.', lead });
  })
);

router.get(
  '/:id',
  authorize('leads.view'),
  asyncHandler(async (req, res) => {
    res.json(await leadService.getLead(req.params.id));
  })
);

router.put(
  '/:id',
  authorize('leads.edit'),
  asyncHandler(async (req, res) => {
    res.json(await leadService.updateLead(req.params.id, parseBody(req.body), req.user));
  })
);

router.patch(
  '/:id/status',
  authorize('leads.edit'),
  asyncHandler(async (req, res) => {
    res.json(await leadService.changeStatus(req.params.id, req.body.statusCode, req.body.reason, req.user));
  })
);

router.patch(
  '/:id/output',
  authorize('leads.edit'),
  asyncHandler(async (req, res) => {
    res.json(await leadService.markOutputSubmitted(req.params.id, req.body.completed !== false, req.user));
  })
);

router.patch(
  '/:id/output-hold',
  authorize('leads.edit'),
  asyncHandler(async (req, res) => {
    res.json(await leadService.setOutputHold(req.params.id, req.body || {}, req.user));
  })
);

router.post(
  '/:id/followups',
  authorize('leads.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await leadService.addFollowUp(req.params.id, req.body, req.user));
  })
);

router.post(
  '/:id/revisions',
  authorize('leads.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await leadService.addRevision(req.params.id, req.body, req.user));
  })
);

router.patch(
  '/:id/checklist/:itemCode',
  authorize('leads.edit'),
  asyncHandler(async (req, res) => {
    res.json(await leadService.toggleChecklist(req.params.id, req.params.itemCode, Boolean(req.body.completed), req.user));
  })
);

router.post(
  '/:id/remarks',
  authorize('leads.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await leadService.addRemark(req.params.id, req.body.body, req.user));
  })
);

router.post(
  '/:id/documents',
  authorize('documents.upload'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const doc = await createDocumentFromFile({
      file: req.file,
      leadId: req.params.id,
      categoryCode: req.body.categoryCode,
      userId: req.user.id,
    });
    res.status(201).json(doc);
  })
);

router.post(
  '/:id/convert',
  authorize('leads.convert'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await leadService.convertToProject(req.params.id, req.body, req.user));
  })
);

router.post(
  '/:id/archive',
  authorize('leads.edit'),
  asyncHandler(async (req, res) => {
    res.json(await leadService.archiveLead(req.params.id, req.user));
  })
);

module.exports = router;
