const { prisma } = require('../prisma');
const { nextNumber } = require('../utils/numbering');
const { parsePagination, paginated, parseSort } = require('../utils/pagination');
const { AppError } = require('../utils/errors');
const { logActivity } = require('../utils/activity');

function include() {
  return { contacts: true, sites: true, _count: { select: { leads: true, projects: true } } };
}

async function findOrCreateCustomer(data, userId) {
  if (data.customerId) {
    const existing = await prisma.customer.findUnique({ where: { id: data.customerId }, include: include() });
    if (existing) return existing;
  }
  if (data.companyName) {
    const match = await prisma.customer.findFirst({
      where: { companyName: { equals: data.companyName.trim(), mode: 'insensitive' }, archived: false },
      include: include(),
    });
    if (match) return match;
  }
  return createCustomer(data, userId);
}

async function createCustomer(data, userId) {
  if (!data.companyName?.trim()) throw new AppError(400, 'Customer / Company Name is needed.');
  const customerId = await nextNumber('CUSTOMER');
  const customer = await prisma.customer.create({
    data: {
      customerId,
      companyName: data.companyName.trim(),
      industry: data.industry || null,
      address: data.address || data.companyAddress || null,
      phone: data.phone || data.mobile || null,
      email: data.email || null,
      notes: data.notes || null,
    },
    include: include(),
  });
  await logActivity({
    userId,
    action: 'CUSTOMER_CREATED',
    entity: 'Customer',
    entityId: customer.id,
    description: `Customer ${customer.customerId} created`,
  });
  return customer;
}

async function listCustomers(query) {
  const { skip, take, page, pageSize } = parsePagination(query);
  const where = {
    archived: query.archived === 'true' ? true : false,
    ...(query.q
      ? {
          OR: [
            { customerId: { contains: query.q, mode: 'insensitive' } },
            { companyName: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: include(),
      skip,
      take,
      orderBy: parseSort(query, ['companyName', 'customerId', 'createdAt'], 'createdAt'),
    }),
    prisma.customer.count({ where }),
  ]);
  return paginated(items, total, page, pageSize);
}

async function getCustomer(id) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      ...include(),
      leads: { select: { id: true, leadId: true, statusCode: true, createdAt: true } },
      projects: { select: { id: true, projectId: true, name: true, currentStageCode: true, currentStatusCode: true } },
    },
  });
  if (!customer) throw new AppError(404, 'Customer not found.');
  return customer;
}

async function updateCustomer(id, data, userId) {
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Customer not found.');
  const customer = await prisma.customer.update({
    where: { id },
    data: {
      companyName: data.companyName ?? existing.companyName,
      industry: data.industry ?? existing.industry,
      address: data.address ?? existing.address,
      phone: data.phone ?? existing.phone,
      email: data.email ?? existing.email,
      notes: data.notes ?? existing.notes,
    },
    include: include(),
  });
  await logActivity({ userId, action: 'CUSTOMER_UPDATED', entity: 'Customer', entityId: id, description: 'Customer updated' });
  return customer;
}

async function addContact(customerId, data) {
  return prisma.customerContact.create({
    data: {
      customerId,
      name: data.name,
      designation: data.designation || null,
      mobile: data.mobile || null,
      email: data.email || null,
      isPrimary: Boolean(data.isPrimary),
    },
  });
}

async function addSite(customerId, data) {
  return prisma.customerSite.create({
    data: {
      customerId,
      name: data.name,
      address: data.address || null,
      plantType: data.plantType || null,
    },
  });
}

module.exports = {
  findOrCreateCustomer,
  createCustomer,
  listCustomers,
  getCustomer,
  updateCustomer,
  addContact,
  addSite,
};
