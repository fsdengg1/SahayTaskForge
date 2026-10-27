const { calendarDayKey } = require('../utils/leadDeadline');

const STATUSES = [
  { code: 'NOT_STARTED', label: 'Not Started' },
  { code: 'DRAWING_APPROVAL', label: 'Drawing Approval' },
  { code: 'MATERIAL_READY', label: 'Material Ready' },
  { code: 'MANUFACTURING', label: 'Manufacturing' },
  { code: 'DISPATCHED', label: 'Dispatched' },
  { code: 'DELIVERED', label: 'Delivered' },
  { code: 'ON_HOLD', label: 'On Hold' },
];

const STATUS_LABELS = Object.fromEntries(STATUSES.map((row) => [row.code, row.label]));

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function labelOf(code) {
  if (!code) return '—';
  const key = normalize(code);
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function inclusiveDays(startAt, endAt) {
  const start = calendarDayKey(startAt);
  const end = calendarDayKey(endAt);
  if (!start || !end) return null;
  const diff = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
  if (diff < 0) return null;
  return diff + 1;
}

function formatSpan(days, open) {
  if (days == null) return '—';
  const unit = days === 1 ? 'Day' : 'Days';
  return open ? `${days}+ ${unit}` : `${days} ${unit}`;
}

function manufacturingTime(startedAt, completedAt, now = new Date()) {
  if (!startedAt) return { days: null, open: false, label: '—' };
  if (completedAt) {
    const days = inclusiveDays(startedAt, completedAt);
    return { days, open: false, label: formatSpan(days, false) };
  }
  const days = inclusiveDays(startedAt, now);
  return { days, open: true, label: formatSpan(days, true) };
}

function leadTime(poAt, deliveryAt, startedAt, completedAt, now = new Date()) {
  if (!poAt) return { days: null, open: false, label: '—' };
  if (deliveryAt) {
    const days = inclusiveDays(poAt, deliveryAt);
    return { days, open: false, label: formatSpan(days, false) };
  }
  const ongoing = Boolean(startedAt) && !completedAt;
  if (!ongoing) return { days: null, open: false, label: '—' };
  const days = inclusiveDays(poAt, now);
  return { days, open: true, label: formatSpan(days, true) };
}

function derivedStatus(dates) {
  const row = dates || {};
  if (row.deliveryAt) return 'DELIVERED';
  if (row.dispatchAt || row.completedAt) return 'DISPATCHED';
  if (row.startedAt || row.materialAt) return 'MANUFACTURING';
  if (row.drawingAt) return 'MATERIAL_READY';
  if (row.poAt) return 'DRAWING_APPROVAL';
  return 'NOT_STARTED';
}

module.exports = {
  STATUSES,
  STATUS_LABELS,
  normalize,
  labelOf,
  inclusiveDays,
  formatSpan,
  manufacturingTime,
  leadTime,
  derivedStatus,
};
