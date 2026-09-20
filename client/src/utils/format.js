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
  if (['COMPLETED', 'ON_TIME', 'WON', 'PASSED', 'PAID', 'ON_TRACK', 'APPROVED', 'VERIFIED', 'READY', 'RESOLVED', 'CLOSED'].includes(c)) return 'green';
  if (['IN_PROGRESS', 'QUOTATION_SENT', 'NEGOTIATION', 'ISSUED', 'OPEN', 'SUBMITTED'].includes(c)) return 'blue';
  if (['HIGH', 'VERY_HIGH'].includes(c)) return 'orange';
  if (['ON_HOLD', 'PENDING_REVIEW', 'QUOTATION_PENDING', 'PARTIAL', 'PARTIALLY_PAID', 'CONDITIONAL', 'MEDIUM', 'FOLLOW_UP', 'CUSTOMER_FOLLOW_UP'].includes(c)) return 'yellow';
  if (['DELAYED_1_3'].includes(c)) return 'brown';
  if (['DELAYED_OVER_3'].includes(c)) return 'black';
  if (['BLOCKED', 'FAILED', 'LOST', 'OVERDUE', 'REJECTED', 'CANCELLED', 'NOT_READY', 'CRITICAL'].includes(c)) return 'red';
  return 'grey';
}

export function toInputDate(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}
