const assert = require('assert');
const {
  derivedStatus,
  inclusiveDays,
  leadTime,
  manufacturingTime,
} = require('./manufacturingLeadTime');

const today = new Date('2026-09-29T10:00:00+05:30');
const start = new Date('2026-09-07T00:00:00.000Z');
const complete = new Date('2026-09-12T00:00:00.000Z');
const po = new Date('2026-09-01T00:00:00.000Z');
const delivery = new Date('2026-09-15T00:00:00.000Z');

assert.strictEqual(inclusiveDays(start, complete), 6);
assert.deepStrictEqual(manufacturingTime(start, complete, today), { days: 6, open: false, label: '6 Days' });
assert.deepStrictEqual(manufacturingTime(start, null, today), { days: 23, open: true, label: '23+ Days' });
assert.strictEqual(manufacturingTime(null, null, today).label, '—');
assert.deepStrictEqual(leadTime(po, delivery, start, complete, today), { days: 15, open: false, label: '15 Days' });
assert.deepStrictEqual(leadTime(po, null, start, null, today), { days: 29, open: true, label: '29+ Days' });
assert.strictEqual(leadTime(null, null, start, null, today).label, '—');
assert.strictEqual(leadTime(po, null, null, null, today).label, '—');
assert.strictEqual(leadTime(po, null, start, complete, today).label, '—');

assert.strictEqual(derivedStatus({}), 'NOT_STARTED');
assert.strictEqual(derivedStatus({ poAt: po }), 'DRAWING_APPROVAL');
assert.strictEqual(derivedStatus({ poAt: po, drawingAt: start }), 'MATERIAL_READY');
assert.strictEqual(derivedStatus({ materialAt: start }), 'MANUFACTURING');
assert.strictEqual(derivedStatus({ startedAt: start }), 'MANUFACTURING');
assert.strictEqual(derivedStatus({ completedAt: complete }), 'DISPATCHED');
assert.strictEqual(derivedStatus({ dispatchAt: delivery }), 'DISPATCHED');
assert.strictEqual(derivedStatus({ completedAt: complete, deliveryAt: delivery }), 'DELIVERED');

console.log('manufacturing lead time passed');
