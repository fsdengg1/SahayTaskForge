const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { uploadRoot } = require('../middleware/upload');
const { asyncHandler } = require('../utils/asyncHandler');
const { AppError } = require('../utils/errors');
const design = require('../services/designService');

const router = express.Router();
router.use(authenticate);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = path.join(uploadRoot, 'design', new Date().toISOString().slice(0, 7));
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
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(400, 'The file is larger than the allowed size.'));
    }
    return next(error.status ? error : new AppError(400, 'The file could not be uploaded.'));
  });
}

const view = authorize('design.view', 'projects.view', 'documents.view', 'dashboard.management');
const edit = authorize('design.edit', 'dashboard.management');

router.get('/', view, asyncHandler(async (req, res) => {
  res.json(await design.listProjects(req.user));
}));

router.post('/entry', edit, asyncHandler(async (req, res) => {
  res.status(201).json(await design.saveDesignEntry(req.body, req.user));
}));

router.get('/activity-log', view, asyncHandler(async (req, res) => {
  res.json(await design.listActivityLog(req.user));
}));

router.get('/files/:id', view, asyncHandler(async (req, res) => {
  const file = await design.fileForDownload(req.params.id);
  res.json({
    id: file.id,
    projectId: file.project_id,
    drawingName: file.drawing_name,
    fileName: file.file_name,
    fileType: file.file_type,
    version: file.version,
    status: file.status,
    remarks: file.remarks,
    uploadedBy: file.uploaded_by_name,
    uploadedAt: file.uploaded_at,
    sizeBytes: file.file_size,
  });
}));

router.get('/files/:id/download', view, asyncHandler(async (req, res) => {
  const file = await design.fileForDownload(req.params.id);
  res.download(path.resolve(file.storage_path), file.file_name);
}));

router.patch('/files/:id', edit, asyncHandler(async (req, res) => {
  res.json(await design.updateFile(req.params.id, req.body, req.user));
}));

router.delete('/files/:id', edit, asyncHandler(async (req, res) => {
  res.json(await design.removeFile(req.params.id, req.user));
}));

router.get('/:projectId/drawings', view, asyncHandler(async (req, res) => {
  res.json(await design.listFiles(req.params.projectId, 'DRAWING'));
}));

router.get('/:projectId/bom', view, asyncHandler(async (req, res) => {
  res.json(await design.listFiles(req.params.projectId, 'BOM'));
}));

router.post('/:projectId/drawings', edit, receiveFile, asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, 'Choose a drawing file to upload.');
  res.status(201).json(await design.uploadFile({
    projectId: req.params.projectId,
    kind: 'DRAWING',
    file: req.file,
    drawingName: req.body.drawingName,
    remarks: req.body.remarks,
    status: req.body.status,
    user: req.user,
  }));
}));

router.post('/:projectId/bom', edit, receiveFile, asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, 'Choose a BOM file to upload.');
  res.status(201).json(await design.uploadFile({
    projectId: req.params.projectId,
    kind: 'BOM',
    file: req.file,
    drawingName: req.body.drawingName || req.file.originalname,
    remarks: req.body.remarks,
    status: req.body.status,
    user: req.user,
  }));
}));

router.post('/:projectId/layout', edit, receiveFile, asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, 'Choose a layout file to upload.');
  res.status(201).json(await design.uploadFile({
    projectId: req.params.projectId,
    kind: 'LAYOUT',
    file: req.file,
    drawingName: req.body.drawingName || req.file.originalname,
    remarks: req.body.remarks,
    status: req.body.status,
    user: req.user,
  }));
}));

router.get('/:projectId/history', view, asyncHandler(async (req, res) => {
  res.json(await design.activityHistory(req.params.projectId, req.query.activity));
}));

router.get('/:projectId/activity-files', view, asyncHandler(async (req, res) => {
  res.json(await design.listActivityFiles(req.params.projectId));
}));

router.patch('/:projectId/tracking', edit, asyncHandler(async (req, res) => {
  res.json(await design.updateTracking(req.params.projectId, req.body, req.user));
}));

router.patch('/:projectId/activities/:activity', edit, asyncHandler(async (req, res) => {
  const activity = design.requireActivity(req.params.activity);
  res.json(await design.updateActivity(req.params.projectId, activity, req.body || {}, req.user));
}));

router.post('/:projectId/activities/:activity/files', edit, receiveFile, asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, 'Choose a file to upload.');
  const activity = design.requireActivity(req.params.activity);
  res.status(201).json(await design.uploadFile({
    projectId: req.params.projectId,
    kind: activity,
    file: req.file,
    drawingName: req.body.drawingName || req.file.originalname,
    remarks: req.body.remarks,
    status: req.body.status,
    user: req.user,
  }));
}));

router.post('/:projectId/complete', edit, asyncHandler(async (req, res) => {
  res.json(await design.completeDesign(req.params.projectId, req.user));
}));

module.exports = router;
