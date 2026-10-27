const assert = require('assert');
const {
  designPercent,
  formatDesignPercent,
  designStage,
  designStatus,
  delayDays,
  activityDelayDays,
  allActivitiesDone,
  activityStatusFromFile,
} = require('./designProgress');

const mixed = {
  SHOP: 'COMPLETED',
  BOM: 'IN_PROGRESS',
  MANUFACTURING_DRAWING: 'IN_PROGRESS',
  INSTALLATION_DRAWING: 'PENDING',
};
assert.strictEqual(designPercent(mixed), 50);
assert.strictEqual(formatDesignPercent(designPercent(mixed)), '50.0%');
assert.strictEqual(formatDesignPercent(25), '25.0%');
assert.strictEqual(formatDesignPercent(75), '75.0%');
assert.strictEqual(formatDesignPercent(100), '100.0%');

const approvedMix = {
  SHOP: 'APPROVED',
  BOM: 'COMPLETED',
  MANUFACTURING_DRAWING: 'APPROVED',
  INSTALLATION_DRAWING: 'IN_PROGRESS',
};
assert.strictEqual(designPercent(approvedMix), 87.5);
assert.strictEqual(designPercent({
  SHOP: 'COMPLETED',
  BOM: 'IN_PROGRESS',
  MANUFACTURING_DRAWING: 'PENDING',
  INSTALLATION_DRAWING: 'PENDING',
}), 37.5);
assert.strictEqual(designPercent({
  SHOP: 'COMPLETED',
  BOM: 'REVISION_REQUIRED',
  MANUFACTURING_DRAWING: 'ON_HOLD',
  INSTALLATION_DRAWING: 'PENDING',
}), 25);
assert.strictEqual(formatDesignPercent(87.5), '87.5%');
assert.strictEqual(designStage(mixed, 'PENDING').code, 'DRAWING');
assert.strictEqual(designStatus(mixed, 'PENDING').code, 'IN_PROGRESS');

const fresh = {
  SHOP: 'PENDING',
  BOM: 'PENDING',
  MANUFACTURING_DRAWING: 'PENDING',
  INSTALLATION_DRAWING: 'PENDING',
};
assert.strictEqual(designStage(fresh, 'PENDING').code, 'PENDING');
assert.strictEqual(designStatus(fresh, 'PENDING').code, 'PENDING');
assert.strictEqual(designPercent(fresh), 0);
assert.strictEqual(designStage(fresh, 'IN_PROGRESS').code, 'DRAWING');
assert.strictEqual(designStatus(fresh, 'IN_PROGRESS').code, 'IN_PROGRESS');
assert.strictEqual(designStage(fresh, 'ON_HOLD').code, 'ON_HOLD');
assert.strictEqual(designStatus(fresh, 'ON_HOLD').code, 'ON_HOLD');

const revision = { ...mixed, BOM: 'REVISION_REQUIRED' };
assert.strictEqual(designStage(revision, 'IN_PROGRESS').code, 'REVISION_REQUIRED');
assert.strictEqual(activityStatusFromFile('UPLOADED'), 'IN_PROGRESS');
assert.strictEqual(activityStatusFromFile('UNDER_REVIEW'), 'IN_PROGRESS');

const done = {
  SHOP: 'APPROVED',
  BOM: 'COMPLETED',
  MANUFACTURING_DRAWING: 'APPROVED',
  INSTALLATION_DRAWING: 'COMPLETED',
};
assert.strictEqual(allActivitiesDone(done), true);
assert.strictEqual(designPercent(done), 100);
assert.strictEqual(designStage(done, 'IN_PROGRESS').code, 'COMPLETED');
assert.strictEqual(designStatus(done, 'IN_PROGRESS').code, 'COMPLETED');
assert.strictEqual(designStage(done, 'ON_HOLD').code, 'ON_HOLD');

assert.strictEqual(delayDays(null, null, false, new Date('2026-09-04T10:00:00+05:30')), null);
assert.strictEqual(delayDays('2026-09-01', '2026-09-01', true), 0);
assert.strictEqual(delayDays('2026-09-10', '2026-09-01', true), 0);
assert.strictEqual(delayDays('2026-09-01', '2026-09-04', true), 3);
assert.strictEqual(delayDays('2026-09-10', null, false, new Date('2026-09-04T10:00:00+05:30')), 0);
assert.strictEqual(delayDays('2026-09-01', null, false, new Date('2026-09-04T10:00:00+05:30')), 3);

const oneDone = { ...fresh, SHOP: 'COMPLETED' };
assert.strictEqual(allActivitiesDone(oneDone), false);
assert.strictEqual(designStatus(oneDone, 'PENDING').code, 'IN_PROGRESS');
assert.strictEqual(designPercent(oneDone), 25);

const held = { ...done, INSTALLATION_DRAWING: 'ON_HOLD' };
assert.strictEqual(allActivitiesDone(held), false);
assert.strictEqual(designPercent({ ...fresh, SHOP: 'NOT_STARTED', BOM: 'ON_HOLD' }), 0);
assert.strictEqual(designStage({
  SHOP: 'NOT_STARTED',
  BOM: 'NOT_STARTED',
  MANUFACTURING_DRAWING: 'NOT_STARTED',
  INSTALLATION_DRAWING: 'NOT_STARTED',
}, 'PENDING').code, 'PENDING');

const today = new Date('2026-09-04T10:00:00+05:30');
assert.strictEqual(activityDelayDays(null, null, 'IN_PROGRESS', today), null);
assert.strictEqual(activityDelayDays('2026-09-01', '2026-09-04', 'COMPLETED', today), 3);
assert.strictEqual(activityDelayDays('2026-09-10', '2026-09-01', 'COMPLETED', today), 0);
assert.strictEqual(activityDelayDays('2026-09-10', '2026-09-01', 'APPROVED', today), 0);
assert.strictEqual(activityDelayDays('2026-09-01', null, 'COMPLETED', today), null);
assert.strictEqual(activityDelayDays('2026-09-01', null, 'IN_PROGRESS', today), 3);
assert.strictEqual(activityDelayDays('2026-09-10', null, 'ON_HOLD', today), 0);
assert.strictEqual(activityDelayDays('2026-09-01', '2026-09-01', 'COMPLETED', today), 0);

console.log('design progress passed');
