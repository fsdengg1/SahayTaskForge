const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { AppError } = require('../utils/errors');

const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

const allowed = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'application/zip',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = path.join(uploadRoot, new Date().toISOString().slice(0, 7));
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
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const spreadsheet = ext === '.xlsx' || ext === '.xls';
    const looseType = !file.mimetype || file.mimetype === 'application/octet-stream';
    if (!allowed.has(file.mimetype) && !(spreadsheet && looseType)) {
      return cb(new AppError(400, 'This file type is not allowed.'));
    }
    cb(null, true);
  },
});

module.exports = { upload, uploadRoot };
