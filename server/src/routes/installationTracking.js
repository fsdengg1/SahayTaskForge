const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { uploadRoot } = require('../middleware/upload');
const { asyncHandler } = require('../utils/asyncHandler');
const { AppError } = require('../utils/errors');
const installation = require('../services/installationService');

const router = express.Router();
router.use(authenticate);

const view = authorize('installation.view', 'projects.view', 'dashboard.management');
const edit = authorize('installation.edit', 'dashboard.management');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = path.join(uploadRoot, 'installation', new Date().toISOString().slice(0, 7));
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
    if (error.code === 'LIMIT_FILE_SIZE') return next(new AppError(400, 'The photo is larger than the allowed size.'));
    return next(error.status ? error : new AppError(400, 'The photo could not be uploaded.'));
  });
}

router.get('/', view, asyncHandler(async (req, res) => {
  res.json(await installation.listTracking(req.user));
}));

router.post('/', edit, asyncHandler(async (req, res) => {
  res.status(201).json(await installation.createRecord(req.body, req.user));
}));

router.get('/photos/:photoId/download', view, asyncHandler(async (req, res) => {
  const photo = await installation.photoForDownload(req.params.photoId);
  res.download(path.resolve(photo.storage_path), photo.file_name);
}));

router.delete('/photos/:photoId', edit, asyncHandler(async (req, res) => {
  res.json(await installation.removePhoto(req.params.photoId, req.user));
}));

router.get('/:id/history', view, asyncHandler(async (req, res) => {
  res.json(await installation.history(req.params.id));
}));

router.get('/:id', view, asyncHandler(async (req, res) => {
  res.json(await installation.getRecord(req.params.id));
}));

router.patch('/:id', edit, asyncHandler(async (req, res) => {
  res.json(await installation.updateRecord(req.params.id, req.body, req.user));
}));

router.delete('/:id', edit, asyncHandler(async (req, res) => {
  res.json(await installation.archiveRecord(req.params.id, req.user));
}));

router.post('/:id/photos', edit, receiveFile, asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, 'Choose a site photo to upload.');
  res.status(201).json(await installation.addPhoto(req.params.id, req.file, req.user));
}));

module.exports = router;
