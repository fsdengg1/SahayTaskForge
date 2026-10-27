const { calendarDayKey } = require('../utils/leadDeadline');

const STAGES = [
  { code: 'NOT_STARTED', label: 'Not Started' },
  { code: 'INSTALLATION', label: 'Installation' },
  { code: 'COMPLETED', label: 'Completed' },
];

const READINESS = [
  { code: 'READY', label: 'Ready' },
  { code: 'NOT_READY', label: 'Not Ready' },
];

const INSTALL_STATUSES = [
  { code: 'NOT_STARTED', label: 'Not Started' },
  { code: 'IN_PROGRESS', label: 'In Progress' },
  { code: 'ON_HOLD', label: 'On Hold' },
  { code: 'COMPLETED', label: 'Completed' },
];

const HANDOVER_STATUSES = [
  { code: 'PENDING', label: 'Pending' },
  { code: 'IN_PROGRESS', label: 'In Progress' },
  { code: 'COMPLETED', label: 'Completed' },
];

const STAGE_LABELS = Object.fromEntries(STAGES.map((row) => [row.code, row.label]));
const STATUS_LABELS = Object.fromEntries(
  [...READINESS, ...INSTALL_STATUSES, ...HANDOVER_STATUSES].map((row) => [row.code, row.label]),
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

function stageFromProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 'NOT_STARTED';
  if (number >= 100) return 'COMPLETED';
  return 'INSTALLATION';
}

function applyProgress(status, progress) {
  if (normalize(status) === 'COMPLETED') return { value: 100, stage: 'COMPLETED' };
  if (progress === undefined || progress === null || progress === '') {
    return { error: 'Installation % is required.' };
  }
  const number = Number(progress);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    return { error: 'Installation % must be between 0 and 100.' };
  }
  const value = Math.round(number * 10) / 10;
  return { value, stage: stageFromProgress(value) };
}

function formatProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const rounded = Math.round(number * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded}%`;
}

function installationDelayDays(plannedAt, completedAt, status, now = new Date()) {
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

module.exports = {
  STAGES,
  READINESS,
  INSTALL_STATUSES,
  HANDOVER_STATUSES,
  STAGE_LABELS,
  normalize,
  labelOf,
  stageFromProgress,
  applyProgress,
  formatProgress,
  installationDelayDays,
};
