const { prisma } = require('../src/prisma');
const { calculateLeadSubmissionDeadline } = require('../src/utils/leadDeadline');

async function main() {
  const leads = await prisma.lead.findMany({ where: { submissionDeadline: null } });
  for (const lead of leads) {
    const deadline = calculateLeadSubmissionDeadline(lead.createdAt);
    await prisma.lead.update({
      where: { id: lead.id },
      data: { submissionDeadline: deadline },
    });
    console.log(lead.leadId, lead.createdAt.toISOString(), deadline.toISOString().slice(0, 10));
  }
  console.log('backfilled', leads.length);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
