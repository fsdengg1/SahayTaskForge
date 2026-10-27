const assert = require('assert');
const { isEligible, isOrderConfirmed, otrStageCode } = require('./orderConversionService');

const waiting = {
  status: 'IN_PROGRESS',
  workflow_status: 'CUSTOMER_APPROVED',
  order_status: null,
  order_received_status: null,
};
assert.strictEqual(isEligible(waiting), true, 'customer approved project is eligible');
assert.strictEqual(isOrderConfirmed(waiting), false);

const received = { ...waiting, order_received_status: 'COMPLETED' };
assert.strictEqual(isOrderConfirmed(received), true, 'completed ORDER_RECEIVED is already confirmed');
assert.strictEqual(isEligible(received), false, 'confirmed projects stay off the conversion list');

const notApproved = { status: 'COMPLETED', workflow_status: 'DESIGN', order_status: null };
assert.strictEqual(isEligible(notApproved), false, 'design submission is not ready for conversion');

const confirmedField = { status: 'COMPLETED', workflow_status: 'CUSTOMER_APPROVED', order_status: 'ORDER_CONFIRMED' };
assert.strictEqual(isEligible(confirmedField), false);
assert.strictEqual(isOrderConfirmed(confirmedField), true);

const { classifyConversion } = require('./orderConversionService');
const grouped = classifyConversion([
  { id: 'a', workflow_status: 'CUSTOMER_APPROVED', order_status: null },
  { id: 'b', workflow_status: 'CUSTOMER_REVIEW', order_status: null },
  { id: 'c', workflow_status: 'NEW', order_status: null },
  { id: 'd', workflow_status: 'CUSTOMER_APPROVED', order_status: 'ORDER_CONFIRMED', order_id: 'ORD-2026-0001', order_confirmed_at: '2026-09-24T05:40:14.342Z' },
  { id: 'd', workflow_status: 'CUSTOMER_APPROVED', order_id: 'ORD-2026-0001', order_confirmed_at: '2026-09-24T05:40:14.342Z' },
  { id: 'e', workflow_status: 'DESIGN', order_received_status: 'COMPLETED' },
], new Date('2026-10-26T05:00:00.000Z'));
assert.strictEqual(grouped.kpis.awaiting, 2, 'approval pipeline is awaiting');
assert.strictEqual(grouped.kpis.confirmed, 1, 'a confirmed order is counted once');
assert.strictEqual(grouped.kpis.month, 0, 'September confirmation is outside October');
assert.strictEqual(grouped.awaiting.some((row) => row.id === 'c'), false, 'new projects stay off the list');
assert.strictEqual(grouped.awaiting.some((row) => row.id === 'e'), false, 'legacy received stage is not awaiting');
assert.strictEqual(grouped.confirmed.some((row) => row.id === 'e'), false, 'a stage flag without an order is not a conversion');

const thisMonth = classifyConversion([
  { id: 'f', order_id: 'ORD-2026-0002', order_confirmed_at: '2026-10-02T04:00:00.000Z' },
], new Date('2026-10-26T05:00:00.000Z'));
assert.strictEqual(thisMonth.kpis.month, 1, 'October confirmation counts for this month');
assert.strictEqual(thisMonth.kpis.awaiting, 0);

assert.strictEqual(otrStageCode({ otr_stage: 'DESIGN', current_stage: 'POST_DESIGN' }), 'DESIGN');
assert.strictEqual(otrStageCode({ exec_stage: 'DESIGN_CLEARANCE' }), 'DESIGN');
assert.strictEqual(otrStageCode({ current_stage: 'INSTALLATION', exec_stage: 'DESIGN_CLEARANCE' }), 'INSTALLATION');

console.log('order conversion eligibility passed');
