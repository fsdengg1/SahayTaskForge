const { calendarDayKey } = require('../utils/leadDeadline');

const STAGES = [
  { code: 'MATERIAL', label: 'Material' },
  { code: 'CUTTING', label: 'Cutting' },
  { code: 'FABRICATION', label: 'Fabrication' },
  { code: 'WELDING', label: 'Welding' },
  { code: 'ASSEMBLY', label: 'Assembly' },
  { code: 'PAINTING', label: 'Painting' },
  { code: 'PACKING', label: 'Packing' },
];

const MATERIAL_STATUSES = [
  { code: 'AVAILABLE', label: 'Available' },
  { code: 'PARTIAL', label: 'Partial' },
  { code: 'PENDING', label: 'Pending' },
];

const QC_STATUSES = [
  { code: 'PENDING', label: 'Pending' },
  { code: 'IN_PROGRESS', label: 'In Progress' },
  { code: 'PASSED', label: 'Passed' },
  { code: 'FAILED', label: 'Failed' },
  { code: 'REWORK', label: 'Rework' },
];

const PRODUCTION_STATUSES = [
  { code: 'NOT_STARTED', label: 'Not Started' },
  { code: 'IN_PROGRESS', label: 'In Progress' },
  { code: 'ON_TRACK', label: 'On Track' },
  { code: 'MONITORING', label: 'Monitoring' },
  { code: 'ON_HOLD', label: 'On Hold' },
  { code: 'COMPLETED', label: 'Completed' },
];

const STAGE_LABELS = Object.fromEntries(STAGES.map((row) => [row.code, row.label]));
const STATUS_LABELS = Object.fromEntries(
  [...MATERIAL_STATUSES, ...QC_STATUSES, ...PRODUCTION_STATUSES].map((row) => [row.code, row.label]),
);

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function labelOf(code, labels = STATUS_LABELS) {
  if (!code) return '—';
  const key = normalize(code);
  if (labels[key]) return labels[key];
  if (STAGE_LABELS[key]) return STAGE_LABELS[key];
  return key.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseProgress(value) {
  if (value === undefined || value === null || value === '') {
    return { error: 'Production % is required.' };
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    return { error: 'Production % must be between 0 and 100.' };
  }
  return { value: Math.round(number * 10) / 10 };
}

function formatProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const rounded = Math.round(number * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
}

function productionDelayDays(plannedAt, completedAt, status, now = new Date()) {
  if (!plannedAt) return null;
  const planned = calendarDayKey(plannedAt);
  if (!planned) return null;
  const done = normalize(status) === 'COMPLETED';
  if (done && !completedAt) return null;
  const end = calendarDayKey(done ? completedAt : now);
  if (!end) return null;
  const diff = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${planned}T00:00:00Z`)) / 86400000);
  return diff > 0 ? diff : 0;
}

function canComplete(stage, qcStatus) {
  return normalize(stage) === 'PACKING' && normalize(qcStatus) === 'PASSED';
}

module.exports = {
  STAGES,
  MATERIAL_STATUSES,
  QC_STATUSES,
  PRODUCTION_STATUSES,
  STAGE_LABELS,
  normalize,
  labelOf,
  parseProgress,
  formatProgress,
  productionDelayDays,
  canComplete,
};
