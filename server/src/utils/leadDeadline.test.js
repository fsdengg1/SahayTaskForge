const { calculateLeadSubmissionDeadline, formatDeadlineDate, getOutputSubmissionStatus } = require('./leadDeadline');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const before = calculateLeadSubmissionDeadline(new Date('2026-09-20T04:30:00.000Z'));
assert(formatDeadlineDate(before) === '23-Sep-2026', `10:00 AM should be 23-Sep-2026, got ${formatDeadlineDate(before)}`);

const atCutoff = calculateLeadSubmissionDeadline(new Date('2026-09-20T09:30:00.000Z'));
assert(formatDeadlineDate(atCutoff) === '24-Sep-2026', `3:00 PM should be 24-Sep-2026, got ${formatDeadlineDate(atCutoff)}`);

const deadline = new Date(Date.UTC(2026, 8, 23));

const onTime = getOutputSubmissionStatus({
  submissionDeadline: deadline,
  now: new Date('2026-09-23T12:29:00.000Z'),
});
assert(onTime.status === 'ON_TIME', `5:59 PM should be ON TIME, got ${onTime.status}`);

const overdue = getOutputSubmissionStatus({
  submissionDeadline: deadline,
  now: new Date('2026-09-23T12:30:00.000Z'),
});
assert(overdue.status === 'OVERDUE', `6:00 PM should be OVERDUE, got ${overdue.status}`);

const delayed1 = getOutputSubmissionStatus({
  submissionDeadline: deadline,
  now: new Date('2026-09-24T05:30:00.000Z'),
});
assert(delayed1.status === 'DELAYED_1_3' && delayed1.label === 'DELAYED 1 DAY', `24-Sep should be DELAYED 1 DAY, got ${delayed1.label}`);

const delayed3 = getOutputSubmissionStatus({
  submissionDeadline: deadline,
  now: new Date('2026-09-26T05:30:00.000Z'),
});
assert(delayed3.status === 'DELAYED_1_3' && delayed3.delayDays === 3, `26-Sep should be 3-day delay, got ${delayed3.delayDays}`);

const delayedOver = getOutputSubmissionStatus({
  submissionDeadline: deadline,
  now: new Date('2026-09-27T05:30:00.000Z'),
});
assert(delayedOver.status === 'DELAYED_OVER_3', `27-Sep should be DELAYED >3 DAYS, got ${delayedOver.status}`);

const held = getOutputSubmissionStatus({
  submissionDeadline: deadline,
  now: new Date('2026-09-25T05:30:00.000Z'),
  outputOnHold: true,
});
assert(held.status === 'ON_HOLD', `On hold should override delayed, got ${held.status}`);

const done = getOutputSubmissionStatus({
  submissionDeadline: deadline,
  now: new Date('2026-09-27T05:30:00.000Z'),
  outputCompletedAt: new Date('2026-09-24T05:30:00.000Z'),
  outputDelayDays: 1,
});
assert(done.status === 'COMPLETED' && done.delayDays === 1, 'Completed should keep historical delay');

console.log('leadDeadline status examples passed');
