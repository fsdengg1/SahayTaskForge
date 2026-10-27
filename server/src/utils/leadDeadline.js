const TIMEZONE = 'Asia/Kolkata';
const CREATION_CUTOFF_HOUR = 15;
const DEADLINE_CUTOFF_HOUR = 18;

const OUTPUT_LABELS = {
  BOM_DRAWINGS: 'Drawings + BOM',
  BOM: 'BOM',
  DRAWING: 'Drawing',
};

const STATUS_META = {
  COMPLETED: { label: 'COMPLETED', color: 'green' },
  ON_HOLD: { label: 'ON HOLD', color: 'yellow' },
  ON_TIME: { label: 'IN PROGRESS', color: 'green' },
  OVERDUE: { label: 'OVERDUE', color: 'red' },
  DELAYED_1_3: { label: 'DELAYED 1–3 DAYS', color: 'brown' },
  DELAYED_OVER_3: { label: 'DELAYED >3 DAYS', color: 'black' },
};

function kolkataParts(date = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function addCalendarDays(year, month, day, days) {
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function dateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function utcDateFromParts(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

function deadlineParts(deadline) {
  const due = new Date(deadline);
  return {
    year: due.getUTCFullYear(),
    month: due.getUTCMonth() + 1,
    day: due.getUTCDate(),
  };
}

function calendarDelayDays(deadline, at = new Date()) {
  if (!deadline) return 0;
  const due = deadlineParts(deadline);
  const now = kolkataParts(at);
  const start = Date.UTC(due.year, due.month - 1, due.day);
  const end = Date.UTC(now.year, now.month - 1, now.day);
  return Math.round((end - start) / 86400000);
}

function calculateLeadSubmissionDeadline(createdAt = new Date()) {
  const created = kolkataParts(createdAt);
  const days = created.hour >= CREATION_CUTOFF_HOUR ? 4 : 3;
  const due = addCalendarDays(created.year, created.month, created.day, days);
  return utcDateFromParts(due.year, due.month, due.day);
}

function calendarDayKey(value) {
  if (!value) return '';
  const text = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && String(value).length <= 10) return text;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (date.toISOString().endsWith('T00:00:00.000Z')) return date.toISOString().slice(0, 10);
  const parts = kolkataParts(date);
  return dateKey(parts.year, parts.month, parts.day);
}

function anchorForLeadDate(leadDate, now = new Date()) {
  const day = calendarDayKey(leadDate);
  if (!day) return now;
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  const clock = kolkataParts(now);
  return new Date(Date.UTC(year, month - 1, dayOfMonth, clock.hour, clock.minute, clock.second) - (5 * 60 + 30) * 60000);
}

function submissionDeadlineForLeadDate(leadDate, now = new Date()) {
  return calculateLeadSubmissionDeadline(anchorForLeadDate(leadDate, now));
}

function delayedLabel(delayDays) {
  if (delayDays === 1) return 'DELAYED 1 DAY';
  if (delayDays > 1 && delayDays <= 3) return `DELAYED ${delayDays} DAYS`;
  if (delayDays > 3) return 'DELAYED >3 DAYS';
  return STATUS_META.DELAYED_1_3.label;
}

function getOutputSubmissionStatus({
  submissionDeadline,
  now = new Date(),
  outputCompletedAt = null,
  outputOnHold = false,
  holdStartedAt = null,
  holdEndedAt = null,
  outputDelayDays = null,
} = {}) {
  const onHold = Boolean(outputOnHold || (holdStartedAt && !holdEndedAt));

  if (outputCompletedAt) {
    const delayDays = outputDelayDays == null
      ? calendarDelayDays(submissionDeadline, outputCompletedAt)
      : outputDelayDays;
    return {
      status: 'COMPLETED',
      label: STATUS_META.COMPLETED.label,
      color: STATUS_META.COMPLETED.color,
      delayDays: Math.max(0, delayDays),
    };
  }

  if (onHold) {
    return {
      status: 'ON_HOLD',
      label: STATUS_META.ON_HOLD.label,
      color: STATUS_META.ON_HOLD.color,
      delayDays: Math.max(0, calendarDelayDays(submissionDeadline, now)),
    };
  }

  if (!submissionDeadline) {
    return {
      status: 'ON_TIME',
      label: STATUS_META.ON_TIME.label,
      color: STATUS_META.ON_TIME.color,
      delayDays: 0,
    };
  }

  const nowParts = kolkataParts(now);
  const delayDays = calendarDelayDays(submissionDeadline, now);

  if (delayDays < 0 || (delayDays === 0 && nowParts.hour < DEADLINE_CUTOFF_HOUR)) {
    return {
      status: 'ON_TIME',
      label: STATUS_META.ON_TIME.label,
      color: STATUS_META.ON_TIME.color,
      delayDays: 0,
    };
  }

  if (delayDays === 0 && nowParts.hour >= DEADLINE_CUTOFF_HOUR) {
    return {
      status: 'OVERDUE',
      label: STATUS_META.OVERDUE.label,
      color: STATUS_META.OVERDUE.color,
      delayDays: 0,
    };
  }

  if (delayDays >= 1 && delayDays <= 3) {
    return {
      status: 'DELAYED_1_3',
      label: delayedLabel(delayDays),
      color: STATUS_META.DELAYED_1_3.color,
      delayDays,
    };
  }

  return {
    status: 'DELAYED_OVER_3',
    label: STATUS_META.DELAYED_OVER_3.label,
    color: STATUS_META.DELAYED_OVER_3.color,
    delayDays,
  };
}

function deadlinePreview(createdAt = new Date()) {
  const created = kolkataParts(createdAt);
  const deadline = calculateLeadSubmissionDeadline(createdAt);
  const computed = getOutputSubmissionStatus({ submissionDeadline: deadline, now: createdAt });
  return {
    createdAt,
    timezone: TIMEZONE,
    cutoffHour: CREATION_CUTOFF_HOUR,
    deadlineCutoffHour: DEADLINE_CUTOFF_HOUR,
    beforeCutoff: created.hour < CREATION_CUTOFF_HOUR,
    daysAdded: created.hour >= CREATION_CUTOFF_HOUR ? 4 : 3,
    submissionDeadline: deadline,
    ...computed,
    outputStatus: computed.status,
    outputStatusLabel: computed.label,
  };
}

function outputRequiredLabel(code) {
  return OUTPUT_LABELS[code] || code || '—';
}

function formatCalendarDate(year, month, day) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(day).padStart(2, '0')}-${months[month - 1]}-${year}`;
}

function formatDeadlineDate(deadline) {
  if (!deadline) return '—';
  const due = deadlineParts(deadline);
  return formatCalendarDate(due.year, due.month, due.day);
}

function formatIstDateTime(date = new Date()) {
  const p = kolkataParts(date);
  const hour12 = p.hour % 12 || 12;
  const ampm = p.hour >= 12 ? 'PM' : 'AM';
  return `${formatCalendarDate(p.year, p.month, p.day)} ${hour12}:${String(p.minute).padStart(2, '0')} ${ampm}`;
}

function istDayBounds(now = new Date()) {
  const today = kolkataParts(now);
  const start = utcDateFromParts(today.year, today.month, today.day);
  const next = addCalendarDays(today.year, today.month, today.day, 1);
  const end = utcDateFromParts(next.year, next.month, next.day);
  return { start, end, today };
}

function addUtcDays(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function activeOutputWhere() {
  return {
    outputCompletedAt: null,
    outputOnHold: false,
    submissionDeadline: { not: null },
  };
}

function outputStatusWhere(status, now = new Date()) {
  const { start, end, today } = istDayBounds(now);
  const afterSix = today.hour >= DEADLINE_CUTOFF_HOUR;
  const delay3Start = addUtcDays(start, -3);

  if (status === 'COMPLETED') return { outputCompletedAt: { not: null } };
  if (status === 'ON_HOLD') return { outputOnHold: true, outputCompletedAt: null };
  if (status === 'ON_TIME') {
    return {
      ...activeOutputWhere(),
      submissionDeadline: afterSix ? { gte: end } : { gte: start },
    };
  }
  if (status === 'OVERDUE') {
    if (!afterSix) return { id: { in: [] } };
    return { ...activeOutputWhere(), submissionDeadline: { gte: start, lt: end } };
  }
  if (status === 'DELAYED_1_3') {
    return { ...activeOutputWhere(), submissionDeadline: { gte: delay3Start, lt: start } };
  }
  if (status === 'DELAYED_OVER_3') {
    return { ...activeOutputWhere(), submissionDeadline: { lt: delay3Start } };
  }
  return {};
}

function istDateRange(value) {
  if (!value) return null;
  const raw = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(raw.getTime())) return null;
  const start = utcDateFromParts(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  return { start, end: addUtcDays(start, 1) };
}

function withDeadlineFields(lead, now = new Date()) {
  if (!lead) return lead;
  const computed = getOutputSubmissionStatus({
    submissionDeadline: lead.submissionDeadline,
    now,
    outputCompletedAt: lead.outputCompletedAt,
    outputOnHold: lead.outputOnHold,
    holdStartedAt: lead.holdStartedAt,
    holdEndedAt: lead.holdEndedAt,
    outputDelayDays: lead.outputDelayDays,
  });
  return {
    ...lead,
    outputRequiredLabel: outputRequiredLabel(lead.outputRequired),
    outputStatus: computed.status,
    outputStatusLabel: computed.label,
    outputStatusColor: computed.color,
    delayDays: computed.delayDays,
    deadlineStatus: computed.status,
  };
}

module.exports = {
  calculateLeadSubmissionDeadline,
  calendarDayKey,
  anchorForLeadDate,
  submissionDeadlineForLeadDate,
  getOutputSubmissionStatus,
  deadlinePreview,
  withDeadlineFields,
  kolkataParts,
  outputRequiredLabel,
  formatDeadlineDate,
  formatIstDateTime,
  istDayBounds,
  istDateRange,
  outputStatusWhere,
  calendarDelayDays,
  STATUS_META,
};
