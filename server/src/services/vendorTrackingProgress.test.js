const assert = require('assert');
const { delayDays, derivedStatus, leadTime } = require('./vendorTrackingProgress');

const today = new Date('2026-09-30T10:00:00+05:30');
const po = new Date('2026-09-01T00:00:00.000Z');
const required = new Date('2026-09-20T00:00:00.000Z');
const delivery = new Date('2026-09-15T00:00:00.000Z');
const lateDelivery = new Date('2026-09-24T00:00:00.000Z');

assert.deepStrictEqual(leadTime(po, delivery, today), { days: 14, label: '14 Days' });
assert.deepStrictEqual(leadTime(po, null, today), { days: 29, label: '29 Days' });
assert.strictEqual(leadTime(null, delivery, today).label, '—');
assert.strictEqual(delayDays(required, lateDelivery, today), 4);
assert.strictEqual(delayDays(required, null, today), 10);
assert.strictEqual(delayDays(new Date('2026-10-05T00:00:00.000Z'), null, today), 0);
assert.strictEqual(delayDays(null, delivery, today), null);

assert.strictEqual(derivedStatus({ manufacturing: 'NOT_STARTED' }, today), 'PENDING');
assert.strictEqual(derivedStatus({ manufacturing: 'IN_PROGRESS', requiredAt: required }, today), 'DELAYED');
assert.strictEqual(derivedStatus({ manufacturing: 'IN_PROGRESS', requiredAt: new Date('2026-10-05T00:00:00.000Z') }, today), 'IN_PROGRESS');
assert.strictEqual(derivedStatus({ manufacturing: 'ON_HOLD' }, today), 'ON_HOLD');
assert.strictEqual(derivedStatus({ manufacturing: 'IN_PROGRESS', deliveryAt: delivery }, today), 'DELIVERED');
assert.strictEqual(derivedStatus({ manufacturing: 'COMPLETED', deliveryAt: delivery }, today), 'COMPLETED');

console.log('vendor tracking progress passed');
