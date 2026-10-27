const assert = require('assert');
const { deliveryError, parseQuantity } = require('./procurementProgress');

assert.strictEqual(parseQuantity(2.5, 'KG').value, 2.5);
assert.strictEqual(parseQuantity('4', 'NOS').value, 4);
assert.ok(parseQuantity(0, 'KG').error);
assert.ok(parseQuantity(-2, 'KG').error);
assert.ok(parseQuantity(1.25, 'NOS').error);
assert.ok(parseQuantity(1.2345, 'KG').error);
assert.strictEqual(parseQuantity('', 'KG').error, 'Quantity must be greater than 0.');

const po = new Date('2026-09-01T00:00:00.000Z');
const early = new Date('2026-08-31T00:00:00.000Z');
const later = new Date('2026-09-10T00:00:00.000Z');
assert.ok(deliveryError(po, early));
assert.strictEqual(deliveryError(po, later), null);
assert.strictEqual(deliveryError(null, early), null);

console.log('procurement progress passed');
