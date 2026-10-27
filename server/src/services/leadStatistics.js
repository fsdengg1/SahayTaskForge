const { calendarDayKey } = require('../utils/leadDeadline');

const CLOSED = new Set(['COMPLETED', 'WON', 'LOST', 'REJECTED']);
const LIVE = new Set(['IN_PROGRESS', 'LIVE']);
const PENDING = new Set(['PENDING', 'FOLLOW_UP', 'CUSTOMER_FOLLOW_UP', 'WAITING']);
const DEADLINE_PASSED = new Set(['OVERDUE', 'DELAYED_1_3', 'DELAYED_OVER_3']);

function statusCode(lead) {
  return String(lead?.statusCode || '').trim().toUpperCase().replace(/\s+/g, '_');
}

function isCompletedLead(lead) {
  return statusCode(lead) === 'COMPLETED';
}

function isOnHoldLead(lead) {
  return statusCode(lead) === 'ON_HOLD' || Boolean(lead?.outputOnHold) || lead?.outputStatus === 'ON_HOLD';
}

function isActiveLead(lead) {
  if (!lead || lead.archived) return false;
  return !CLOSED.has(statusCode(lead));
}

function isLiveLead(lead) {
  if (!lead || lead.archived) return false;
  return LIVE.has(statusCode(lead));
}

function isPendingFollowUp(lead) {
  if (!lead || lead.archived) return false;
  return PENDING.has(statusCode(lead));
}

function isDelayedLead(lead, now = new Date()) {
  if (!lead || lead.archived || isCompletedLead(lead) || lead.outputStatus === 'COMPLETED') return false;
  if (DEADLINE_PASSED.has(lead.outputStatus)) return true;
  const due = calendarDayKey(lead.nextFollowUpDate);
  const today = calendarDayKey(now);
  return Boolean(due && today && due < today);
}

function calculateLeadStatistics(leads, now = new Date()) {
  const counts = {
    totalLeads: 0,
    activeLeads: 0,
    completedLeads: 0,
    liveLeads: 0,
    pendingLeads: 0,
    delayedLeads: 0,
    onHoldLeads: 0,
  };
  for (const lead of leads || []) {
    if (!lead || lead.archived) continue;
    counts.totalLeads += 1;
    if (isActiveLead(lead)) counts.activeLeads += 1;
    if (isCompletedLead(lead)) counts.completedLeads += 1;
    if (isLiveLead(lead)) counts.liveLeads += 1;
    if (isPendingFollowUp(lead)) counts.pendingLeads += 1;
    if (isDelayedLead(lead, now)) counts.delayedLeads += 1;
    if (isOnHoldLead(lead)) counts.onHoldLeads += 1;
  }
  return counts;
}

module.exports = {
  calculateLeadStatistics,
  isActiveLead,
  isCompletedLead,
  isLiveLead,
  isPendingFollowUp,
  isDelayedLead,
  isOnHoldLead,
};
