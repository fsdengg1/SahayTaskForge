require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const TEMP_PASSWORD = process.env.INITIAL_USER_PASSWORD || 'Password123!';

const USERS = [
  {
    fullName: 'Mr. Bernard',
    email: 'ceo@careyu.ai',
    department: 'MANAGEMENT',
    roles: ['CFT', 'CEO'],
  },
  {
    fullName: 'Mr. Sabarigiri',
    email: 'engg.director@careyu.ai',
    department: 'DESIGN',
    roles: ['CFT', 'ENG_DIRECTOR', 'DESIGN_MANAGER', 'ADMIN'],
  },
  {
    fullName: 'Mr. Arul Sahay MD',
    email: 'sahay@sahayindustries.com',
    department: 'MANAGEMENT',
    roles: ['CFT', 'SAHAY_MD'],
  },
  {
    fullName: 'Iswarya Mam',
    email: 'jaiguruatsahay@gmail.com',
    department: 'SALES',
    roles: ['SALES_MANAGER'],
  },
  {
    fullName: 'Puspa Mam',
    email: 'sales@sahayracks.org',
    department: 'SALES',
    roles: ['SALES_MANAGER'],
  },
  {
    fullName: 'Ms. Sumithra',
    email: 'sales@careyu.ai',
    department: 'SALES',
    roles: ['SALES_COORD'],
  },
  {
    fullName: 'Mr. Muthuraj',
    email: 'muthuraj3004@gmail.com',
    department: 'INSTALLATION',
    roles: ['INSTALL_MANAGER'],
  },
  {
    fullName: 'Mr. Nambirajan',
    email: 'nambirajan1626@gmail.com',
    department: 'PROCUREMENT',
    roles: ['PROC_MANAGER'],
  },
];

async function ensureSalesCoord() {
  const existing = await prisma.role.findUnique({ where: { code: 'SALES_COORD' } });
  if (existing) return existing;
  const exec = await prisma.role.findUnique({
    where: { code: 'SALES_EXEC' },
    include: { permissions: true },
  });
  return prisma.role.create({
    data: {
      code: 'SALES_COORD',
      name: 'Sales Coordinator',
      description: 'Pre-sales / sales coordination',
      isSystem: true,
      isManagement: false,
      permissions: exec?.permissions?.length
        ? { create: exec.permissions.map((p) => ({ permissionId: p.permissionId })) }
        : undefined,
    },
  });
}

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false
  `);

  await ensureSalesCoord();

  const hash = await bcrypt.hash(TEMP_PASSWORD, 12);
  const results = [];

  for (const spec of USERS) {
    const email = spec.email.trim().toLowerCase();
    const department = await prisma.department.findUnique({ where: { code: spec.department } });
    const roles = await prisma.role.findMany({ where: { code: { in: spec.roles } } });
    const missing = spec.roles.filter((code) => !roles.some((r) => r.code === code));
    if (missing.length) {
      throw new Error(`Missing roles for ${email}: ${missing.join(', ')}`);
    }

    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    let user;
    if (existing) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          fullName: spec.fullName,
          email,
          active: true,
          passwordHash: hash,
          departmentId: department?.id || existing.departmentId,
        },
      });
    } else {
      const usernameTaken = await prisma.user.findUnique({ where: { username: email } });
      user = await prisma.user.create({
        data: {
          username: usernameTaken ? `${email.split('@')[0]}.${Date.now().toString(36)}` : email,
          email,
          fullName: spec.fullName,
          passwordHash: hash,
          active: true,
          departmentId: department?.id || null,
        },
      });
    }

    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.createMany({
      data: roles.map((role) => ({ userId: user.id, roleId: role.id })),
    });
    await prisma.$executeRaw`UPDATE "User" SET "mustChangePassword" = false WHERE id = ${user.id}`;

    const stored = await prisma.user.findUnique({
      where: { id: user.id },
      include: { roles: { include: { role: true } } },
    });
    const looksHashed = typeof stored.passwordHash === 'string' && stored.passwordHash.startsWith('$2');
    results.push({
      action: existing ? 'updated' : 'created',
      email: stored.email,
      fullName: stored.fullName,
      username: stored.username,
      roles: stored.roles.map((r) => r.role.code),
      passwordHashed: looksHashed,
    });
  }

  const leadCount = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM leads`;
  const projectCount = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM projects`;

  console.log(JSON.stringify({
    users: results,
    leadsUnchanged: leadCount[0].n,
    projectsUnchanged: projectCount[0].n,
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
