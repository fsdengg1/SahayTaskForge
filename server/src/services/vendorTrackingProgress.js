const { calendarDayKey } = require('../utils/leadDeadline');

const MANUFACTURING = [
  { code: 'NOT_STARTED', label: 'Not Started' },
  { code: 'IN_PROGRESS', label: 'In Progress' },
  { code: 'COMPLETED', label: 'Completed' },
  { code: 'ON_HOLD', label: 'On Hold' },
];

const STATUSES = [
  { code: 'PENDING', label: 'Pending' },
  { code: 'IN_PROGRESS', label: 'In Progress' },
  { code: 'DELIVERED', label: 'Delivered' },
  { code: 'DELAYED', label: 'Delayed' },
  { code: 'ON_HOLD', label: 'On Hold' },
  { code: 'COMPLETED', label: 'Completed' },
];

const MANUFACTURING_LABELS = Object.fromEntries(MANUFACTURING.map((row) => [row.code, row.label]));
const STATUS_LABELS = Object.fromEntries(STATUSES.map((row) => [row.code, row.label]));

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function labelOf(code, labels = STATUS_LABELS) {
  if (!code) return '—';
  const key = normalize(code);
  if (labels[key]) return labels[key];
  return key.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function dayDiff(startAt, endAt) {
  const start = calendarDayKey(startAt);
  const end = calendarDayKey(endAt);
  if (!start || !end) return null;
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}

function formatDays(days) {
  if (days == null) return '—';
  return `${days} ${days === 1 ? 'Day' : 'Days'}`;
}

function leadTime(poAt, deliveryAt, now = new Date()) {
  if (!poAt) return { days: null, label: '—' };
  const days = dayDiff(poAt, deliveryAt || now);
  if (days == null || days < 0) return { days: null, label: '—' };
  return { days, label: formatDays(days) };
}

function delayDays(requiredAt, deliveryAt, now = new Date()) {
  if (!requiredAt) return null;
  const diff = dayDiff(requiredAt, deliveryAt || now);
  if (diff == null) return null;
  return Math.max(0, diff);
}

function derivedStatus({ manufacturing, deliveryAt, requiredAt }, now = new Date()) {
  const making = normalize(manufacturing) || 'NOT_STARTED';
  if (deliveryAt && making === 'COMPLETED') return 'COMPLETED';
  if (deliveryAt) return 'DELIVERED';
  if (making === 'ON_HOLD') return 'ON_HOLD';
  const required = calendarDayKey(requiredAt);
  const today = calendarDayKey(now);
  if (required && today && required < today) return 'DELAYED';
  if (making === 'IN_PROGRESS' || making === 'COMPLETED') return 'IN_PROGRESS';
  return 'PENDING';
}

module.exports = {
  MANUFACTURING,
  STATUSES,
  MANUFACTURING_LABELS,
  STATUS_LABELS,
  normalize,
  labelOf,
  leadTime,
  delayDays,
  derivedStatus,
  formatDays,
};
