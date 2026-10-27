import StatusBadge from '../../components/StatusBadge';

export const LEAD_STATUSES = [
  { code: 'NEW', label: 'New' },
  { code: 'COMPLETED', label: 'Completed' },
  { code: 'WAITING', label: 'Waiting' },
  { code: 'PENDING', label: 'Pending' },
  { code: 'FOLLOW_UP', label: 'Follow Up' },
  { code: 'SUBMITTED', label: 'Submitted' },
  { code: 'APPROVED', label: 'Approved' },
  { code: 'ON_HOLD', label: 'On Hold' },
];

export function leadStatusLabel(code, lookups) {
  if (String(code || '').toUpperCase() === 'IN_PROGRESS') return 'LIVE';
  const known = LEAD_STATUSES.find((item) => item.code === code);
  if (known) return known.label;
  const row = (lookups?.LEAD_STATUS || []).find((item) => item.code === code);
  if (row?.label && row.label !== code && String(row.code).toUpperCase() !== 'IN_PROGRESS') return row.label;
  if (!code) return '—';
  return String(code).toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function trackStatusLabel(code, lookups) {
  if (code === 'ON_TIME') return 'IN PROGRESS';
  const row = (lookups?.OUTPUT_SUBMISSION_STATUS || []).find((item) => item.code === code);
  if (row?.label) return row.label;
  if (!code) return '—';
  return String(code).replaceAll('_', ' ');
}

export function statusOptions(lookups, current) {
  const map = new Map(LEAD_STATUSES.map((item) => [item.code, item.label]));
  for (const item of lookups?.LEAD_STATUS || []) {
    if (!map.has(item.code)) map.set(item.code, item.label);
  }
  if (current && !map.has(current)) map.set(current, leadStatusLabel(current, lookups));
  if (map.has('IN_PROGRESS')) map.set('IN_PROGRESS', 'LIVE');
  return [...map.entries()].map(([code, label]) => ({ code, label }));
}

export function enquiryTypeLabel(value) {
  const text = String(value || '').trim();
  if (!text) return '—';
  const key = text.toLowerCase();
  if (key === 'new' || key === 'new_enquiry' || key.includes('new enquiry')) return 'New Enquiry';
  if (key.includes('repeat')) return 'Repeat Enquiry';
  return text;
}

export function outputRequiredDisplay(row, lookups) {
  const code = String(row?.outputRequired || '').trim();
  const raw = String(row?.outputRequiredLabel || '').trim();
  const lookup = (lookups?.OUTPUT_REQUIRED || []).find((item) => item.code === code)?.label || '';
  const text = `${code} ${raw} ${lookup}`.toLowerCase();
  if (code === 'BOM_DRAWINGS' || /drawings?\s*(\+|\/|&|and)\s*bom|bom\s*(\+|\/|&|and)\s*drawings?/.test(text)) return 'Drawings + BOM';
  if (code === 'DRAWING' || /\bonly drawings\b/.test(text)) return 'Only Drawings';
  if (code === 'BOM' || /\bonly bom\b/.test(text)) return 'Only BOM';
  return raw || lookup || '—';
}

export function productGroupLabel(value, lookups) {
  if (!value) return '—';
  const storage = (lookups?.STORAGE_METHOD || []).find((item) => item.code === value);
  return storage?.label || value;
}

export function LocationValue({ pending, label }) {
  if (pending || !label || label === 'Location Pending') {
    return <StatusBadge code="PENDING" label="Location Pending" />;
  }
  return label;
}
