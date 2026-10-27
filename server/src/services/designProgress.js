const { calendarDayKey } = require('../utils/leadDeadline');

const ACTIVITIES = ['SHOP', 'BOM', 'MANUFACTURING_DRAWING', 'INSTALLATION_DRAWING'];

const ACTIVITY_LABELS = {
  SHOP: 'SHOP',
  BOM: 'BOM',
  MANUFACTURING_DRAWING: 'Manufacturing Drawing',
  INSTALLATION_DRAWING: 'Installation Drawing',
  DESIGN: 'Design',
};

const ACTIVITY_STATUSES = [
  { code: 'NOT_STARTED', label: 'Not Started' },
  { code: 'PENDING', label: 'Pending' },
  { code: 'IN_PROGRESS', label: 'In Progress' },
  { code: 'ON_HOLD', label: 'On Hold' },
  { code: 'REVISION_REQUIRED', label: 'Revision Required' },
  { code: 'COMPLETED', label: 'Completed' },
  { code: 'APPROVED', label: 'Approved' },
];

const OVERALL_STATUSES = [
  { code: 'PENDING', label: 'Pending' },
  { code: 'IN_PROGRESS', label: 'In Progress' },
  { code: 'ON_HOLD', label: 'On Hold' },
  { code: 'COMPLETED', label: 'Completed' },
];

const STAGE_OPTIONS = [
  { code: 'PENDING', label: 'Pending' },
  { code: 'DRAWING', label: 'Drawing' },
  { code: 'REVISION_REQUIRED', label: 'Revision Required' },
  { code: 'ON_HOLD', label: 'On Hold' },
  { code: 'COMPLETED', label: 'Completed' },
];

const STATUS_LABELS = Object.fromEntries(
  [...ACTIVITY_STATUSES, ...OVERALL_STATUSES, ...STAGE_OPTIONS].map((row) => [row.code, row.label]),
);

const DONE = new Set(['COMPLETED', 'APPROVED']);

function normalizeStatus(value) {
  return String(value || 'PENDING').trim().toUpperCase();
}

function isActivityStatus(value) {
  const code = normalizeStatus(value);
  return ACTIVITY_STATUSES.some((row) => row.code === code);
}

function statusLabel(code) {
  if (!code) return '—';
  const key = normalizeStatus(code);
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function isIdle(status) {
  const code = normalizeStatus(status);
  return code === 'PENDING' || code === 'NOT_STARTED';
}

function activityWeight(status) {
  const code = normalizeStatus(status);
  if (DONE.has(code)) return 100;
  if (code === 'IN_PROGRESS') return 50;
  return 0;
}

function activityMap(rows = []) {
  const map = Object.fromEntries(ACTIVITIES.map((key) => [key, 'PENDING']));
  for (const row of rows) {
    const key = String(row.activity || row.kind || '').toUpperCase();
    if (!ACTIVITIES.includes(key)) continue;
    map[key] = normalizeStatus(row.status);
  }
  return map;
}

function designPercent(map) {
  const total = ACTIVITIES.reduce((sum, key) => sum + activityWeight(map?.[key]), 0);
  return Math.round((total / ACTIVITIES.length) * 10) / 10;
}

function formatDesignPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0.0%';
  return `${number.toFixed(1)}%`;
}

function allActivitiesDone(map) {
  return ACTIVITIES.every((key) => DONE.has(normalizeStatus(map?.[key])));
}

function designStage(map, workStatus) {
  const hold = normalizeStatus(workStatus || 'PENDING');
  if (hold === 'ON_HOLD') return { code: 'ON_HOLD', label: 'On Hold' };
  const values = ACTIVITIES.map((key) => normalizeStatus(map?.[key]));
  if (values.some((status) => status === 'REVISION_REQUIRED')) {
    return { code: 'REVISION_REQUIRED', label: 'Revision Required' };
  }
  if (values.every((status) => DONE.has(status))) return { code: 'COMPLETED', label: 'Completed' };
  if (values.every((status) => isIdle(status)) && hold !== 'IN_PROGRESS') {
    return { code: 'PENDING', label: 'Pending' };
  }
  return { code: 'DRAWING', label: 'Drawing' };
}

function designStatus(map, workStatus) {
  const hold = normalizeStatus(workStatus || 'PENDING');
  if (hold === 'ON_HOLD') return { code: 'ON_HOLD', label: 'On Hold' };
  if (allActivitiesDone(map)) return { code: 'COMPLETED', label: 'Completed' };
  if (hold === 'IN_PROGRESS' || ACTIVITIES.some((key) => !isIdle(map?.[key]))) {
    return { code: 'IN_PROGRESS', label: 'In Progress' };
  }
  return { code: 'PENDING', label: 'Pending' };
}

function delayDays(targetAt, completedAt, done, now = new Date()) {
  if (!targetAt) return null;
  const target = calendarDayKey(targetAt);
  const end = calendarDayKey(done ? (completedAt || now) : now);
  if (!target || !end) return null;
  const diff = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${target}T00:00:00Z`)) / 86400000);
  return diff > 0 ? diff : 0;
}

function activityDelayDays(targetAt, completedAt, status, now = new Date()) {
  if (!targetAt) return null;
  const target = calendarDayKey(targetAt);
  if (!target) return null;
  const done = DONE.has(normalizeStatus(status));
  if (done && !completedAt) return null;
  const end = calendarDayKey(done ? completedAt : now);
  if (!end) return null;
  const diff = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${target}T00:00:00Z`)) / 86400000);
  return diff > 0 ? diff : 0;
}

function activityStatusFromFile(status) {
  const code = normalizeStatus(status);
  if (code === 'APPROVED') return 'APPROVED';
  if (['COMPLETED', 'COMPLETE', 'DONE'].includes(code)) return 'COMPLETED';
  if (code === 'REVISION_REQUIRED') return 'REVISION_REQUIRED';
  if (code === 'PENDING') return 'PENDING';
  if (['IN_PROGRESS', 'UPLOADED', 'UNDER_REVIEW', 'SUBMITTED'].includes(code)) return 'IN_PROGRESS';
  return null;
}

module.exports = {
  ACTIVITIES,
  ACTIVITY_LABELS,
  ACTIVITY_STATUSES,
  OVERALL_STATUSES,
  STAGE_OPTIONS,
  normalizeStatus,
  isActivityStatus,
  isIdle,
  statusLabel,
  activityWeight,
  activityMap,
  designPercent,
  formatDesignPercent,
  allActivitiesDone,
  designStage,
  designStatus,
  delayDays,
  activityDelayDays,
  activityStatusFromFile,
};
