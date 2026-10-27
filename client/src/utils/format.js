export function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return `${fmtDate(value)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}`;
}

export function money(amount, currency = 'INR') {
  if (amount == null || amount === '') return '—';
  return `${currency} ${Number(amount).toLocaleString('en-IN')}`;
}

export function labelOf(lookups, type, code) {
  const row = (lookups[type] || []).find((x) => x.code === code);
  return row?.label || code || '—';
}

export function statusTone(code = '') {
  const c = String(code).toUpperCase();
  if (['COMPLETED', 'ON_TIME', 'WON', 'PASSED', 'PAID', 'ON_TRACK', 'APPROVED', 'VERIFIED', 'READY', 'RESOLVED', 'CLOSED', 'RECEIVED', 'FEEDBACK_RECEIVED', 'AVAILABLE', 'DISPATCHED', 'DELIVERED'].includes(c)) return 'green';
  if (['IN_PROGRESS', 'QUOTATION_SENT', 'NEGOTIATION', 'ISSUED', 'OPEN', 'SUBMITTED', 'SENT', 'UPCOMING', 'NEW', 'UPLOADED', 'DRAWING', 'MONITORING', 'MATERIAL', 'CUTTING', 'FABRICATION', 'WELDING', 'ASSEMBLY', 'PAINTING', 'PACKING', 'INSTALLATION', 'DRAWING_APPROVAL', 'MATERIAL_READY', 'MANUFACTURING', 'ORDERED', 'IN_PRODUCTION'].includes(c)) return 'blue';
  if (['WAITING'].includes(c)) return 'yellow';
  if (['HIGH', 'VERY_HIGH'].includes(c)) return 'orange';
  if (['ON_HOLD', 'PENDING_REVIEW', 'UNDER_REVIEW', 'QUOTATION_PENDING', 'PARTIAL', 'PARTIALLY_PAID', 'PARTIALLY_RECEIVED', 'CONDITIONAL', 'MEDIUM', 'FOLLOW_UP', 'CUSTOMER_FOLLOW_UP', 'PENDING', 'FOLLOW_UP_REQUIRED', 'DUE_TODAY', 'FOLLOW_UP_DUE', 'AWAITING_CUSTOMER_RESPONSE', 'CUSTOMER_CONFIRMATION_PENDING', 'REQUIREMENT_PENDING', 'CLARIFICATION_REQUIRED', 'NO_RESPONSE', 'REVISION_REQUIRED', 'NOT_STARTED'].includes(c)) return 'yellow';
  if (['DELAYED_1_3'].includes(c)) return 'brown';
  if (['DELAYED_OVER_3'].includes(c)) return 'black';
  if (['BLOCKED', 'FAILED', 'LOST', 'OVERDUE', 'REJECTED', 'CANCELLED', 'NOT_READY', 'CRITICAL', 'NOT_FEASIBLE', 'REWORK', 'DELAYED'].includes(c)) return 'red';
  return 'grey';
}

export function toInputDate(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}
