const assert = require('assert');
const {
  applyProgress,
  formatProgress,
  installationDelayDays,
  stageFromProgress,
} = require('./installationProgress');

assert.strictEqual(stageFromProgress(0), 'NOT_STARTED');
assert.strictEqual(stageFromProgress(25), 'INSTALLATION');
assert.strictEqual(stageFromProgress(60), 'INSTALLATION');
assert.strictEqual(stageFromProgress(100), 'COMPLETED');
assert.deepStrictEqual(applyProgress('IN_PROGRESS', 60), { value: 60, stage: 'INSTALLATION' });
assert.deepStrictEqual(applyProgress('COMPLETED', 40), { value: 100, stage: 'COMPLETED' });
assert.deepStrictEqual(applyProgress('COMPLETED', ''), { value: 100, stage: 'COMPLETED' });
assert.ok(applyProgress('IN_PROGRESS', '').error);
assert.ok(applyProgress('IN_PROGRESS', 101).error);
assert.ok(applyProgress('IN_PROGRESS', -1).error);
assert.strictEqual(formatProgress(0), '0%');
assert.strictEqual(formatProgress(25), '25%');
assert.strictEqual(formatProgress(60), '60%');
assert.strictEqual(formatProgress(100), '100%');

const today = new Date('2026-09-29T10:00:00+05:30');
assert.strictEqual(installationDelayDays(null, null, 'IN_PROGRESS', today), null);
assert.strictEqual(installationDelayDays('2026-10-10', null, 'IN_PROGRESS', today), 0);
assert.strictEqual(installationDelayDays('2026-09-01', null, 'IN_PROGRESS', today), 28);
assert.strictEqual(installationDelayDays('2026-09-01', '2026-09-04', 'COMPLETED', today), 3);
assert.strictEqual(installationDelayDays('2026-09-10', '2026-09-01', 'COMPLETED', today), 0);
assert.strictEqual(installationDelayDays('2026-09-01', '2026-09-01', 'COMPLETED', today), 0);

console.log('installation progress passed');
