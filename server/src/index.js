require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const api = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { AppError } = require('./utils/errors');

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedOrigins = [process.env.CLIENT_ORIGIN, 'http://localhost:5173'].filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || /\.ngrok(-free)?\.(dev|app|io)$/.test(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);
app.set('json replacer', (key, value) => {
  if (value && typeof value === 'object' && typeof value.toNumber === 'function' && value.constructor?.name === 'Decimal') {
    return Number(value);
  }
  return value;
});
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', authenticateUploads, express.static(path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads')));

function authenticateUploads(req, res, next) {
  if (req.path) return next();
  next();
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'Sahay Racks Project Tracking System' });
});

app.use('/api', api);

app.use((req, res, next) => {
  next(new AppError(404, 'The requested resource was not found.'));
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Sahay Racks API listening on ${port}`);
});
