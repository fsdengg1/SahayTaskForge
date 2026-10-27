const { buildSalesEnquiryDashboard, classifyStatus } = require('./salesEnquiryDashboardService');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(classifyStatus('IN_PROGRESS') === 'active', 'IN_PROGRESS / LIVE is not completed');
assert(classifyStatus('WON') === 'active', 'WON is not the Completed status');
assert(classifyStatus('LOST') === 'active', 'LOST is not the Rejected status');
assert(classifyStatus('COMPLETED') === 'completed', 'COMPLETED maps to completed');
assert(classifyStatus('Rejected') === 'rejected', 'Rejected maps to rejected');

const leads = [
  { id: 'a', leadDate: '2026-09-02', statusCode: 'NEW' },
  { id: 'b', leadDate: '2026-09-10', statusCode: 'COMPLETED' },
  { id: 'c', leadDate: '2026-09-18', statusCode: 'REJECTED' },
  { id: 'd', leadDate: '2026-08-20', statusCode: 'FOLLOW_UP' },
  { id: 'e', leadDate: '2026-09-22', statusCode: 'IN_PROGRESS' },
  { id: 'f', leadDate: '2026-09-25', statusCode: 'WON' },
  { id: 'g', leadDate: '2026-09-26', statusCode: 'LOST' },
];
const feedback = {
  a: { quotationSentDate: '2026-10-05', layoutSentDate: null },
  b: { quotationSentDate: null, layoutSentDate: '2026-09-12' },
  e: { quotationSentDate: '2026-09-23', layoutSentDate: '2026-09-23' },
};

const all = buildSalesEnquiryDashboard(leads, feedback, {});
assert(all.totalEnquiries === 7, `expected 7 enquiries, got ${all.totalEnquiries}`);
assert(all.totalCompleted === 1, `expected 1 completed, got ${all.totalCompleted}`);
assert(all.totalRejected === 1, `expected 1 rejected, got ${all.totalRejected}`);
assert(all.totalQuotationsSent === 2, `expected 2 quotations, got ${all.totalQuotationsSent}`);
assert(all.totalLayoutSent === 2, `expected 2 layouts, got ${all.totalLayoutSent}`);

const august = all.monthlyData.find((row) => row.month === '2026-08');
const september = all.monthlyData.find((row) => row.month === '2026-09');
const october = all.monthlyData.find((row) => row.month === '2026-10');
assert(august.enquiries === 1 && august.quotationsSent === 0, 'August follows the lead date');
assert(september.enquiries === 6 && september.completed === 1 && september.rejected === 1, 'September status counts use the lead date');
assert(september.quotationsSent === 1 && september.layoutSent === 2, 'September sent counts use sent dates');
assert(october.enquiries === 0 && october.quotationsSent === 1, 'October quotation is grouped by quotation sent date');
assert(
  all.totalEnquiries === all.monthlyData.reduce((sum, row) => sum + row.enquiries, 0)
  && all.totalQuotationsSent === all.monthlyData.reduce((sum, row) => sum + row.quotationsSent, 0),
  'KPI totals match the monthly columns',
);

const septemberOnly = buildSalesEnquiryDashboard(leads, feedback, { from: '2026-09-01', to: '2026-09-30' });
assert(septemberOnly.totalEnquiries === 6, 'September filter counts leads by lead date');
assert(septemberOnly.totalCompleted === 1 && septemberOnly.totalRejected === 1, 'status counts stay inside the lead-date filter');
assert(septemberOnly.totalQuotationsSent === 1, 'October quotation is outside the September filter');
assert(septemberOnly.totalLayoutSent === 2, 'layouts are filtered by layout sent date');

const octoberOnly = buildSalesEnquiryDashboard(leads, feedback, { from: '2026-10-01', to: '2026-10-31' });
assert(octoberOnly.totalEnquiries === 0 && octoberOnly.totalQuotationsSent === 1, 'October filter counts the quotation sent date only');

console.log('sales enquiry dashboard aggregation passed');
