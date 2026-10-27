const { prisma } = require('../prisma');
const existingLeads = require('./existingLeadStore');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function cleanDate(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function calendarDay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().endsWith('T00:00:00.000Z')) return date.toISOString().slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function monthLabel(key) {
  const [year, month] = String(key).split('-');
  const name = MONTHS[Number(month) - 1] || month;
  return `${name} ${year}`;
}

function classifyStatus(statusCode) {
  const code = String(statusCode || '').trim().toUpperCase();
  if (code === 'COMPLETED') return 'completed';
  if (code === 'REJECTED') return 'rejected';
  return 'active';
}

function inRange(day, from, to) {
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function countOn(buckets, day, field) {
  const key = day.slice(0, 7);
  const row = buckets.get(key) || emptyMonth(key);
  row[field] += 1;
  buckets.set(key, row);
}

function monthsBetween(start, end) {
  const out = [];
  let [year, month] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${year}-${String(month).padStart(2, '0')}`);
    if (out.length > 36) return null;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

function emptyMonth(key) {
  return {
    month: key,
    label: monthLabel(key),
    enquiries: 0,
    completed: 0,
    rejected: 0,
    quotationsSent: 0,
    layoutSent: 0,
  };
}

function buildSalesEnquiryDashboard(leads, feedbackByLeadId = {}, query = {}) {
  let from = cleanDate(query.from);
  let to = cleanDate(query.to);
  if (from && to && from > to) {
    const swap = from;
    from = to;
    to = swap;
  }

  const buckets = new Map();
  for (const lead of leads) {
    const leadDay = calendarDay(lead.leadDate);
    if (inRange(leadDay, from, to)) {
      countOn(buckets, leadDay, 'enquiries');
      const outcome = classifyStatus(lead.statusCode);
      if (outcome === 'completed') countOn(buckets, leadDay, 'completed');
      if (outcome === 'rejected') countOn(buckets, leadDay, 'rejected');
    }
    const feedback = feedbackByLeadId[lead.id] || {};
    const quotationDay = calendarDay(feedback.quotationSentDate);
    if (inRange(quotationDay, from, to)) countOn(buckets, quotationDay, 'quotationsSent');
    const layoutDay = calendarDay(feedback.layoutSentDate);
    if (inRange(layoutDay, from, to)) countOn(buckets, layoutDay, 'layoutSent');
  }

  let keys = [...buckets.keys()].sort();
  if (from && to) {
    const spanned = monthsBetween(from.slice(0, 7), to.slice(0, 7));
    if (spanned) keys = spanned;
  }

  const monthlyData = keys.map((key) => buckets.get(key) || emptyMonth(key));
  const totals = monthlyData.reduce((sum, row) => {
    sum.totalEnquiries += row.enquiries;
    sum.totalCompleted += row.completed;
    sum.totalRejected += row.rejected;
    sum.totalQuotationsSent += row.quotationsSent;
    sum.totalLayoutSent += row.layoutSent;
    return sum;
  }, {
    totalEnquiries: 0,
    totalCompleted: 0,
    totalRejected: 0,
    totalQuotationsSent: 0,
    totalLayoutSent: 0,
  });

  return { from, to, ...totals, monthlyData };
}

async function feedbackByLead(ids) {
  if (!ids.length) return {};
  try {
    const rows = await prisma.customerFeedback.findMany({
      where: { leadId: { in: ids } },
      select: { leadId: true, quotationSentDate: true, layoutSentDate: true },
    });
    return Object.fromEntries(rows.map((row) => [row.leadId, row]));
  } catch {
    return {};
  }
}

async function getSalesEnquiryDashboard(query = {}) {
  const leads = await existingLeads.matchingLeads({});
  const feedback = await feedbackByLead(leads.map((lead) => lead.id));
  return buildSalesEnquiryDashboard(leads, feedback, query);
}

module.exports = {
  getSalesEnquiryDashboard,
  buildSalesEnquiryDashboard,
  classifyStatus,
  calendarDay,
};
