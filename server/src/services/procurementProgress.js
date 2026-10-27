const STATUSES = [
  { code: 'PENDING', label: 'Pending' },
  { code: 'ORDERED', label: 'Ordered' },
  { code: 'IN_PRODUCTION', label: 'In Production' },
  { code: 'PARTIALLY_RECEIVED', label: 'Partially Received' },
  { code: 'RECEIVED', label: 'Received' },
  { code: 'COMPLETED', label: 'Completed' },
  { code: 'ON_HOLD', label: 'On Hold' },
];

const STATUS_LABELS = Object.fromEntries(STATUSES.map((row) => [row.code, row.label]));
const COUNT_UNITS = new Set(['NOS', 'NO', 'PCS', 'PC', 'SET', 'EACH', 'UNIT', 'PIECE', 'PIECES', 'QTY']);

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function labelOf(code) {
  if (!code) return '—';
  const key = normalize(code);
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseQuantity(value, unit) {
  if (value === undefined || value === null || value === '') return { error: 'Quantity must be greater than 0.' };
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return { error: 'Quantity must be greater than 0.' };
  const rounded = Math.round(number * 1000) / 1000;
  if (Math.abs(number - rounded) > 0.0000001) return { error: 'Quantity can have at most 3 decimal places.' };
  const countUnit = COUNT_UNITS.has(normalize(unit));
  if (countUnit && !Number.isInteger(rounded)) {
    return { error: 'Quantity for this unit must be a whole number.' };
  }
  return { value: rounded };
}

function formatQuantity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return String(number);
}

function deliveryError(poAt, expectedAt) {
  if (poAt && expectedAt && expectedAt < poAt) return 'Expected delivery cannot be before the PO date.';
  return null;
}

module.exports = {
  STATUSES,
  STATUS_LABELS,
  normalize,
  labelOf,
  parseQuantity,
  formatQuantity,
  deliveryError,
};
