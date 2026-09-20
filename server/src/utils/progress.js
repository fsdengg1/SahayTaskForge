const { prisma } = require('../prisma');

const COMPLETED = new Set(['COMPLETED']);

async function recalculateProjectProgress(projectId) {
  const [weights, stages] = await Promise.all([
    prisma.stageWeight.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.projectStageRecord.findMany({ where: { projectId } }),
  ]);
  const byCode = Object.fromEntries(stages.map((s) => [s.stageCode, s]));
  let earned = 0;
  let total = 0;
  for (const w of weights) {
    const weight = Number(w.weight);
    total += weight;
    const rec = byCode[w.stageCode];
    if (rec && COMPLETED.has(rec.statusCode)) earned += weight;
    else if (rec && rec.statusCode === 'IN_PROGRESS') earned += weight * 0.5;
  }
  const percent = total > 0 ? Number(((earned / total) * 100).toFixed(2)) : 0;
  await prisma.project.update({
    where: { id: projectId },
    data: { progressPercent: percent },
  });
  return percent;
}

function delayDays(targetDate, actualDate = new Date()) {
  if (!targetDate) return 0;
  const end = actualDate ? new Date(actualDate) : new Date();
  const target = new Date(targetDate);
  const diff = Math.ceil((end - target) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

module.exports = { recalculateProjectProgress, delayDays };
