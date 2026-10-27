const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { uploadRoot } = require('../middleware/upload');
const { asyncHandler } = require('../utils/asyncHandler');
const { AppError } = require('../utils/errors');
const lifecycle = require('../services/lifecycleService');

const router = express.Router();
router.use(authenticate);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = path.join(uploadRoot, 'presales', new Date().toISOString().slice(0, 7));
    fs.mkdirSync(folder, { recursive: true });
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 25) * 1024 * 1024 },
}).single('file');

function receiveFile(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return next(new AppError(400, 'The file is larger than the allowed size.'));
    return next(new AppError(400, 'The file could not be uploaded.'));
  });
}

const view = authorize('design.view', 'leads.view', 'projects.view', 'dashboard.management');

router.get('/presales', view, asyncHandler(async (req, res) => {
  res.json(await lifecycle.listPresales(req.user));
}));

router.get('/presales/files/:id/download', view, asyncHandler(async (req, res) => {
  const file = await lifecycle.fileForDownload(req.params.id);
  res.download(path.resolve(file.storage_path), file.file_name);
}));

router.post('/presales/:leadId/drawing', authorize('design.edit', 'dashboard.management'), receiveFile, asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, 'Choose a drawing file to upload.');
  res.status(201).json(await lifecycle.uploadPresales({
    leadId: req.params.leadId,
    kind: 'PRE_DRAWING',
    file: req.file,
    drawingName: req.body.drawingName,
    remarks: req.body.remarks,
    user: req.user,
  }));
}));

router.post('/presales/:leadId/bom', authorize('design.edit', 'dashboard.management'), receiveFile, asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, 'Choose a BOM file to upload.');
  res.status(201).json(await lifecycle.uploadPresales({
    leadId: req.params.leadId,
    kind: 'PRE_BOM',
    file: req.file,
    drawingName: req.body.drawingName || req.file.originalname,
    remarks: req.body.remarks,
    user: req.user,
  }));
}));

router.post('/presales/:leadId/submit', authorize('design.edit', 'dashboard.management'), asyncHandler(async (req, res) => {
  res.json(await lifecycle.submitToSales(req.params.leadId, req.user));
}));

router.post('/presales/:leadId/send', authorize('leads.edit', 'dashboard.management'), asyncHandler(async (req, res) => {
  res.json(await lifecycle.sendToCustomer(req.params.leadId, req.user));
}));

router.post('/presales/:leadId/approve', authorize('leads.edit', 'dashboard.management'), asyncHandler(async (req, res) => {
  res.json(await lifecycle.approveCustomer(req.params.leadId, req.body.remarks, req.user));
}));

router.post('/presales/:leadId/negotiate', authorize('leads.edit', 'dashboard.management'), asyncHandler(async (req, res) => {
  res.json(await lifecycle.startNegotiation(req.params.leadId, req.body.remarks, req.user));
}));

router.post('/presales/:leadId/revision', authorize('leads.edit', 'dashboard.management'), asyncHandler(async (req, res) => {
  res.json(await lifecycle.requestRevision(req.params.leadId, req.body.remarks, req.user));
}));

const orderEdit = authorize('projects.edit', 'dashboard.management');

router.post('/orders', orderEdit, asyncHandler(async (req, res) => {
  const orders = require('../services/orderConversionService');
  res.status(201).json(await orders.createDirectOrder(req.body, req.user));
}));

router.patch('/orders/:id', orderEdit, asyncHandler(async (req, res) => {
  const orders = require('../services/orderConversionService');
  res.json(await orders.updateDirectOrder(req.params.id, req.body, req.user));
}));

router.delete('/orders/:id', orderEdit, asyncHandler(async (req, res) => {
  const orders = require('../services/orderConversionService');
  res.json(await orders.archiveDirectOrder(req.params.id, req.user));
}));

router.get('/dashboard', view, asyncHandler(async (req, res) => {
  res.json(await lifecycle.dashboard(req.user));
}));

router.get('/production-flow', view, asyncHandler(async (req, res) => {
  res.json(await lifecycle.listProductionFlow(req.user));
}));

router.get('/execution/:stage', view, asyncHandler(async (req, res) => {
  res.json(await lifecycle.listExecution(req.params.stage, req.user));
}));

router.post('/execution/:stage/:projectId/:action', view, asyncHandler(async (req, res) => {
  res.json(await lifecycle.actOnStage(req.params.projectId, req.params.stage, req.params.action, req.body, req.user));
}));

module.exports = router;
