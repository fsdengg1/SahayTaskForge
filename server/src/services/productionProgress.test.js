const assert = require('assert');
const {
  parseProgress,
  formatProgress,
  productionDelayDays,
  canComplete,
} = require('./productionProgress');

assert.strictEqual(parseProgress(0).value, 0);
assert.strictEqual(parseProgress(65).value, 65);
assert.strictEqual(parseProgress('80').value, 80);
assert.strictEqual(parseProgress(100).value, 100);
assert.ok(parseProgress(-1).error);
assert.ok(parseProgress(101).error);
assert.ok(parseProgress('').error);
assert.strictEqual(formatProgress(0), '0%');
assert.strictEqual(formatProgress(10), '10%');
assert.strictEqual(formatProgress(65), '65%');
assert.strictEqual(formatProgress(100), '100%');
assert.strictEqual(formatProgress(65.5), '65.5%');

const today = new Date('2026-09-29T10:00:00+05:30');
assert.strictEqual(productionDelayDays(null, null, 'IN_PROGRESS', today), null);
assert.strictEqual(productionDelayDays('2026-10-10', null, 'IN_PROGRESS', today), 0);
assert.strictEqual(productionDelayDays('2026-09-01', null, 'IN_PROGRESS', today), 28);
assert.strictEqual(productionDelayDays('2026-09-01', '2026-09-04', 'COMPLETED', today), 3);
assert.strictEqual(productionDelayDays('2026-09-10', '2026-09-04', 'COMPLETED', today), 0);
assert.strictEqual(productionDelayDays('2026-09-01', null, 'COMPLETED', today), null);
assert.strictEqual(canComplete('PACKING', 'PASSED'), true);
assert.strictEqual(canComplete('ASSEMBLY', 'PASSED'), false);
assert.strictEqual(canComplete('PACKING', 'PENDING'), false);

console.log('production progress passed');
