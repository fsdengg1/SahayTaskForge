const { prisma } = require('../prisma');

async function globalSearch(q) {
  if (!q || q.trim().length < 2) return [];
  const term = q.trim();
  const [leads, projects, customers, users] = await Promise.all([
    prisma.lead.findMany({
      where: {
        OR: [
          { leadId: { contains: term, mode: 'insensitive' } },
          { customer: { companyName: { contains: term, mode: 'insensitive' } } },
          { contact: { name: { contains: term, mode: 'insensitive' } } },
        ],
      },
      include: { customer: true },
      take: 8,
    }),
    prisma.project.findMany({
      where: {
        OR: [
          { projectId: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
          { orderNumber: { contains: term, mode: 'insensitive' } },
          { poNumber: { contains: term, mode: 'insensitive' } },
          { customer: { companyName: { contains: term, mode: 'insensitive' } } },
        ],
      },
      include: { customer: true },
      take: 8,
    }),
    prisma.customer.findMany({
      where: {
        OR: [
          { customerId: { contains: term, mode: 'insensitive' } },
          { companyName: { contains: term, mode: 'insensitive' } },
        ],
      },
      take: 6,
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { fullName: { contains: term, mode: 'insensitive' } },
          { username: { contains: term, mode: 'insensitive' } },
        ],
      },
      take: 6,
      select: { id: true, fullName: true, username: true },
    }),
  ]);

  return [
    ...leads.map((l) => ({ type: 'Lead', id: l.id, label: l.leadId, sub: l.customer.companyName, href: `/leads/${l.id}` })),
    ...projects.map((p) => ({ type: 'Project', id: p.id, label: p.projectId, sub: p.name, href: `/projects/${p.id}` })),
    ...customers.map((c) => ({ type: 'Customer', id: c.id, label: c.customerId, sub: c.companyName, href: `/customers/${c.id}` })),
    ...users.map((u) => ({ type: 'User', id: u.id, label: u.fullName, sub: u.username, href: `/users` })),
  ];
}

module.exports = { globalSearch };
