const { prisma } = require('../prisma');

async function ensureSequence(key, prefix, padLength = 3) {
  await prisma.numberSequence.upsert({
    where: { key },
    update: {},
    create: { key, prefix, padLength, current: 0 },
  });
}

async function nextNumber(key) {
  if (key === 'ISSUE') await ensureSequence('ISSUE', 'ISSUE-');
  const seq = await prisma.numberSequence.update({
    where: { key },
    data: { current: { increment: 1 } },
  });
  return `${seq.prefix}${String(seq.current).padStart(seq.padLength, '0')}`;
}

module.exports = { nextNumber, ensureSequence };
