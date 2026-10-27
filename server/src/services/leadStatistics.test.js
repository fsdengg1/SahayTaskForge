const assert = require('assert');
const { calculateLeadStatistics } = require('./leadStatistics');

const now = new Date('2026-09-28T08:00:00.000Z');
const leads = [
  { statusCode: 'FOLLOW_UP', submissionDeadline: '2026-09-20', outputStatus: 'DELAYED_OVER_3', nextFollowUpDate: null },
  { statusCode: 'PENDING', outputStatus: 'ON_TIME', nextFollowUpDate: '2026-09-30' },
  { statusCode: 'IN_PROGRESS', outputStatus: 'ON_TIME', nextFollowUpDate: '2026-09-27' },
  { statusCode: 'COMPLETED', outputStatus: 'COMPLETED' },
  { statusCode: 'ON_HOLD', outputStatus: 'ON_HOLD', outputOnHold: true },
  { statusCode: 'NEW', outputStatus: 'OVERDUE' },
  { statusCode: 'LOST', outputStatus: 'ON_TIME' },
  { archived: true, statusCode: 'FOLLOW_UP', outputStatus: 'ON_TIME' },
];

const stats = calculateLeadStatistics(leads, now);
assert.strictEqual(stats.totalLeads, 7);
assert.strictEqual(stats.completedLeads, 1);
assert.strictEqual(stats.activeLeads, 5);
assert.strictEqual(stats.liveLeads, 1);
assert.strictEqual(stats.pendingLeads, 2);
assert.strictEqual(stats.onHoldLeads, 1);
assert.strictEqual(stats.delayedLeads, 3);

console.log('lead statistics ok');
