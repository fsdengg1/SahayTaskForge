require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const lookups = {
  LEAD_SOURCE: [
    ['DIRECT', 'Direct Enquiry'],
    ['WEBSITE', 'Website'],
    ['REFERRAL', 'Referral'],
    ['EXISTING', 'Existing Customer'],
    ['DEALER', 'Dealer / Partner'],
    ['EXHIBITION', 'Exhibition'],
    ['TENDER', 'Tender'],
    ['EMAIL', 'Email'],
    ['PHONE', 'Phone'],
    ['OTHER', 'Other'],
  ],
  OUTPUT_REQUIRED: [
    ['BOM_DRAWINGS', 'Drawings + BOM'],
    ['BOM', 'BOM'],
    ['DRAWING', 'Drawing'],
  ],
  OUTPUT_SUBMISSION_STATUS: [
    ['ON_TIME', 'IN PROGRESS'],
    ['OVERDUE', 'Overdue'],
    ['DELAYED_1_3', 'Delayed 1–3 Days'],
    ['DELAYED_OVER_3', 'Delayed >3 Days'],
    ['ON_HOLD', 'On Hold'],
    ['COMPLETED', 'Completed'],
  ],
  LEAD_STATUS: [
    ['NEW', 'New'],
    ['QUALIFICATION', 'Qualification'],
    ['REQUIREMENT_REVIEW', 'Requirement Review'],
    ['SITE_SURVEY_REQUIRED', 'Site Survey Required'],
    ['DESIGN_PENDING', 'Design Pending'],
    ['QUOTATION_PENDING', 'Quotation Pending'],
    ['QUOTATION_SENT', 'Quotation Sent'],
    ['CUSTOMER_FOLLOW_UP', 'Customer Follow-up'],
    ['REVISION_REQUIRED', 'Revision Required'],
    ['NEGOTIATION', 'Negotiation'],
    ['WON', 'Won'],
    ['LOST', 'Lost'],
    ['ON_HOLD', 'On Hold'],
  ],
  PRIORITY: [
    ['LOW', 'Low'],
    ['MEDIUM', 'Medium'],
    ['HIGH', 'High'],
    ['VERY_HIGH', 'Very High'],
    ['CRITICAL', 'Critical'],
  ],
  REQUIREMENT_TYPE: [
    ['NEW', 'New'],
    ['EXPANSION', 'Expansion'],
    ['MODIFICATION', 'Modification'],
  ],
  STORAGE_METHOD: [
    ['PALLET', 'Pallet Racking'],
    ['SELECTIVE', 'Selective Racking'],
    ['DRIVE_IN', 'Drive-In'],
    ['VNA', 'Very Narrow Aisle'],
    ['HEAVY_DUTY', 'Heavy Duty Rack'],
    ['MULTI_TIER', 'Multi-Tier'],
    ['LONG_SPAN', 'Long Span'],
    ['SHELVING', 'Shelving'],
    ['MOBILE', 'Mobile Racking'],
    ['SHUTTLE', 'Shuttle'],
    ['OTHER', 'Other'],
  ],
  EQUIPMENT_TYPE: [
    ['FORKLIFT', 'Forklift'],
    ['REACH_TRUCK', 'Reach Truck'],
    ['STACKER', 'Stacker'],
    ['HAND_PALLET', 'Hand Pallet Truck'],
    ['CRANE', 'Crane'],
    ['OTHER', 'Other'],
  ],
  FOLLOW_UP_TYPE: [
    ['PHONE', 'Phone'],
    ['EMAIL', 'Email'],
    ['MEETING', 'Meeting'],
    ['SITE_VISIT', 'Site Visit'],
    ['WHATSAPP', 'WhatsApp'],
    ['VIDEO', 'Video Call'],
    ['OTHER', 'Other'],
  ],
  FOLLOW_UP_STATUS: [
    ['OPEN', 'Open'],
    ['COMPLETED', 'Completed'],
    ['CANCELLED', 'Cancelled'],
  ],
  FEEDBACK_STATUS: [
    ['PENDING', 'Pending'],
    ['RECEIVED', 'Received'],
    ['NO_RESPONSE', 'No Response'],
    ['NOT_FEASIBLE', 'Not Feasible'],
    ['CLARIFICATION_REQUIRED', 'Clarification Required'],
  ],
  DRAWING_QUOTE_STATUS: [
    ['PENDING', 'Pending'],
    ['SENT', 'Sent'],
    ['REVISION_REQUIRED', 'Revision Required'],
    ['APPROVED', 'Approved'],
    ['ON_HOLD', 'On Hold'],
  ],
  FEEDBACK_FINAL_STATUS: [
    ['FOLLOW_UP_REQUIRED', 'Follow-up Required'],
    ['CUSTOMER_CONFIRMATION_PENDING', 'Customer Confirmation Pending'],
    ['AWAITING_CUSTOMER_RESPONSE', 'Awaiting Customer Response'],
    ['FEEDBACK_RECEIVED', 'Feedback Received'],
    ['QUOTATION_REVISION_REQUIRED', 'Quotation Revision Required'],
    ['LAYOUT_REVISION_REQUIRED', 'Layout Revision Required'],
    ['REQUIREMENT_PENDING', 'Requirement Pending'],
    ['NOT_FEASIBLE', 'Not Feasible'],
    ['CLOSED', 'Closed'],
  ],
  PROJECT_STAGE: [
    ['ORDER_REVIEW', 'Order Review'],
    ['DETAILED_DESIGN', 'Detailed Design'],
    ['DESIGN_APPROVAL', 'Design Approval'],
    ['BOM_MRP', 'BOM / MRP'],
    ['PROCUREMENT', 'Procurement'],
    ['MATERIAL_RECEIPT', 'Material Receipt'],
    ['PRODUCTION', 'Production'],
    ['PRODUCTION_QC', 'Production QC'],
    ['PACKING', 'Packing'],
    ['DISPATCH', 'Dispatch'],
    ['SITE_READINESS', 'Site Readiness'],
    ['INSTALLATION', 'Installation'],
    ['INSTALLATION_QC', 'Installation QC'],
    ['CUSTOMER_INSPECTION', 'Customer Inspection'],
    ['HANDOVER', 'Handover'],
    ['INVOICE_PAYMENT', 'Invoice / Payment'],
    ['PROJECT_CLOSURE', 'Project Closure'],
  ],
  PROJECT_STATUS: [
    ['NOT_STARTED', 'Not Started'],
    ['IN_PROGRESS', 'In Progress'],
    ['ON_TRACK', 'On Track'],
    ['PENDING', 'Pending'],
    ['BLOCKED', 'Blocked'],
    ['ON_HOLD', 'On Hold'],
    ['COMPLETED', 'Completed'],
    ['CANCELLED', 'Cancelled'],
  ],
  TASK_STATUS: [
    ['NOT_STARTED', 'Not Started'],
    ['IN_PROGRESS', 'In Progress'],
    ['COMPLETED', 'Completed'],
    ['BLOCKED', 'Blocked'],
    ['ON_HOLD', 'On Hold'],
    ['CANCELLED', 'Cancelled'],
  ],
  DOCUMENT_TYPE: [
    ['QUOTATION', 'Quotation'],
    ['LAYOUT', 'Layout'],
    ['BOQ', 'BOQ'],
    ['GA_DRAWING', 'GA Drawing'],
    ['MFG_DRAWING', 'Manufacturing Drawing'],
    ['INSTALL_DRAWING', 'Installation Drawing'],
    ['PURCHASE_ORDER', 'Purchase Order'],
    ['VENDOR_DOCUMENT', 'Vendor Document'],
    ['QC_REPORT', 'QC Report'],
    ['GRN', 'GRN'],
    ['DISPATCH', 'Dispatch Document'],
    ['SITE_PHOTO', 'Site Photo'],
    ['INSTALL_PHOTO', 'Installation Photo'],
    ['HANDOVER', 'Handover Document'],
    ['INVOICE', 'Invoice'],
    ['OTHER', 'Other'],
  ],
  DELAY_CATEGORY: [
    ['CUSTOMER', 'Customer'],
    ['DESIGN', 'Design'],
    ['PROCUREMENT', 'Procurement'],
    ['VENDOR', 'Vendor'],
    ['MATERIAL', 'Material'],
    ['PRODUCTION', 'Production'],
    ['QC', 'QC'],
    ['LOGISTICS', 'Logistics'],
    ['SITE', 'Site'],
    ['INSTALLATION', 'Installation'],
    ['INTERNAL', 'Internal'],
    ['OTHER', 'Other'],
  ],
  APPROVAL_STATUS: [
    ['PENDING_REVIEW', 'Pending Review'],
    ['APPROVED', 'Approved'],
    ['REJECTED', 'Rejected'],
    ['REVISION_REQUIRED', 'Revision Required'],
  ],
  INSPECTION_TYPE: [
    ['INCOMING', 'Incoming Material Inspection'],
    ['IN_PROCESS', 'In-process QC'],
    ['FINAL_PRODUCTION', 'Final Production QC'],
    ['INSTALLATION', 'Installation QC'],
  ],
  INSPECTION_RESULT: [
    ['PASSED', 'Passed'],
    ['FAILED', 'Failed'],
    ['CONDITIONAL', 'Conditional'],
  ],
  PUNCH_STATUS: [
    ['OPEN', 'Open'],
    ['IN_PROGRESS', 'In Progress'],
    ['COMPLETED', 'Resolved'],
    ['VERIFIED', 'Closed'],
  ],
  ISSUE_STATUS: [
    ['OPEN', 'Open'],
    ['IN_PROGRESS', 'In Progress'],
    ['BLOCKED', 'Blocked'],
    ['ON_HOLD', 'On Hold'],
    ['RESOLVED', 'Resolved'],
    ['CLOSED', 'Closed'],
  ],
  ISSUE_TYPE: [
    ['DESIGN', 'Design'],
    ['PROCUREMENT', 'Procurement'],
    ['MATERIAL', 'Material'],
    ['PRODUCTION', 'Production'],
    ['QUALITY', 'Quality'],
    ['STORES', 'Stores'],
    ['LOGISTICS', 'Logistics'],
    ['INSTALLATION', 'Installation'],
    ['CUSTOMER', 'Customer'],
    ['COMMERCIAL', 'Commercial'],
    ['DEPENDENCY', 'Dependency'],
    ['OTHER', 'Other'],
  ],
  PAYMENT_STATUS: [
    ['NOT_INVOICED', 'Not Invoiced'],
    ['INVOICED', 'Invoiced'],
    ['PARTIALLY_PAID', 'Partially Paid'],
    ['PAID', 'Paid'],
    ['OVERDUE', 'Overdue'],
  ],
  CURRENCY: [
    ['INR', 'INR'],
    ['USD', 'USD'],
    ['EUR', 'EUR'],
    ['AED', 'AED'],
    ['GBP', 'GBP'],
  ],
  INDUSTRY: [
    ['WAREHOUSE', 'Warehouse / 3PL'],
    ['MANUFACTURING', 'Manufacturing'],
    ['FMCG', 'FMCG'],
    ['AUTO', 'Automotive'],
    ['PHARMA', 'Pharma'],
    ['RETAIL', 'Retail'],
    ['COLD_STORAGE', 'Cold Storage'],
    ['OTHER', 'Other'],
  ],
  READINESS_STATUS: [
    ['READY', 'Ready'],
    ['NOT_READY', 'Not Ready'],
    ['PARTIAL', 'Partially Ready'],
  ],
  REVISION_CATEGORY: [
    ['QUOTATION', 'Quotation'],
    ['LAYOUT', 'Layout'],
    ['BOQ', 'BOQ'],
    ['REQUIREMENT', 'Requirement'],
  ],
};

const departments = [
  ['SALES', 'Sales'],
  ['DESIGN', 'Design'],
  ['PROCUREMENT', 'Procurement'],
  ['PRODUCTION', 'Production'],
  ['QC', 'Quality'],
  ['STORES', 'Stores'],
  ['LOGISTICS', 'Logistics'],
  ['INSTALLATION', 'Installation'],
  ['PROJECTS', 'Projects'],
  ['FINANCE', 'Finance'],
  ['MANAGEMENT', 'Management'],
  ['ADMIN', 'Administration'],
];

const permissions = [
  ['dashboard.view', 'View dashboard', 'dashboard'],
  ['dashboard.management', 'Management dashboard', 'dashboard'],
  ['dashboard.sales', 'Sales dashboard', 'dashboard'],
  ['dashboard.design', 'Design dashboard', 'dashboard'],
  ['dashboard.procurement', 'Procurement dashboard', 'dashboard'],
  ['dashboard.production', 'Production dashboard', 'dashboard'],
  ['dashboard.installation', 'Installation dashboard', 'dashboard'],
  ['leads.view', 'View leads', 'leads'],
  ['leads.create', 'Create leads', 'leads'],
  ['leads.edit', 'Edit leads', 'leads'],
  ['leads.convert', 'Convert leads', 'leads'],
  ['projects.view', 'View projects', 'projects'],
  ['projects.create', 'Create projects', 'projects'],
  ['projects.edit', 'Edit projects', 'projects'],
  ['projects.close', 'Close projects', 'projects'],
  ['tasks.view', 'View tasks', 'tasks'],
  ['tasks.edit', 'Edit tasks', 'tasks'],
  ['design.view', 'View design', 'design'],
  ['design.edit', 'Edit design', 'design'],
  ['procurement.view', 'View procurement', 'procurement'],
  ['procurement.edit', 'Edit procurement', 'procurement'],
  ['production.view', 'View production', 'production'],
  ['production.edit', 'Edit production', 'production'],
  ['quality.view', 'View quality', 'quality'],
  ['quality.edit', 'Edit quality', 'quality'],
  ['installation.view', 'View installation', 'installation'],
  ['installation.edit', 'Edit installation', 'installation'],
  ['documents.view', 'View documents', 'documents'],
  ['documents.upload', 'Upload documents', 'documents'],
  ['customers.view', 'View customers', 'customers'],
  ['customers.edit', 'Edit customers', 'customers'],
  ['customer_feedback.view', 'View customer feedback', 'customer_feedback'],
  ['customer_feedback.create', 'Create customer feedback', 'customer_feedback'],
  ['customer_feedback.edit', 'Edit customer feedback', 'customer_feedback'],
  ['vendors.view', 'View vendors', 'vendors'],
  ['vendors.edit', 'Edit vendors', 'vendors'],
  ['finance.view', 'View finance', 'finance'],
  ['finance.edit', 'Edit finance', 'finance'],
  ['reports.view', 'View reports', 'reports'],
  ['users.manage', 'Manage users', 'admin'],
  ['settings.manage', 'Manage settings', 'admin'],
  ['audit.view', 'View audit logs', 'admin'],
];

const roles = [
  { code: 'CEO', name: 'CEO', management: true, perms: 'ALL_VIEW' },
  { code: 'SAHAY_MD', name: 'Sahay MD', management: true, perms: 'ALL_VIEW' },
  { code: 'ENG_DIRECTOR', name: 'Engineering Director', management: true, perms: 'ALL_VIEW' },
  { code: 'CFT', name: 'CFT Member', management: true, perms: 'ALL_VIEW' },
  { code: 'SALES_MANAGER', name: 'Sales Manager', management: false, extra: ['dashboard.view', 'leads.view', 'leads.create', 'leads.edit', 'leads.convert', 'customers.view', 'customers.edit', 'customer_feedback.view', 'customer_feedback.create', 'customer_feedback.edit', 'dashboard.sales', 'projects.view', 'documents.view', 'documents.upload', 'reports.view', 'tasks.view'] },
  { code: 'SALES_EXEC', name: 'Sales Executive', management: false, extra: ['dashboard.view', 'leads.view', 'leads.create', 'leads.edit', 'customers.view', 'customers.edit', 'customer_feedback.view', 'customer_feedback.create', 'customer_feedback.edit', 'dashboard.sales', 'documents.view', 'documents.upload', 'tasks.view'] },
  { code: 'DESIGN_MANAGER', name: 'Design Manager', management: false, extra: ['design.view', 'design.edit', 'dashboard.design', 'projects.view', 'tasks.view', 'tasks.edit', 'documents.view', 'documents.upload'] },
  { code: 'DESIGN_ENG', name: 'Design Engineer', management: false, extra: ['design.view', 'design.edit', 'dashboard.design', 'projects.view', 'tasks.view', 'tasks.edit', 'documents.view', 'documents.upload'] },
  { code: 'PROC_MANAGER', name: 'Procurement Manager', management: false, extra: ['procurement.view', 'procurement.edit', 'vendors.view', 'vendors.edit', 'dashboard.procurement', 'projects.view', 'tasks.view', 'tasks.edit', 'documents.view', 'documents.upload'] },
  { code: 'PURCHASE_EXEC', name: 'Purchase Executive', management: false, extra: ['procurement.view', 'procurement.edit', 'vendors.view', 'dashboard.procurement', 'projects.view', 'tasks.view', 'documents.view', 'documents.upload'] },
  { code: 'PPC_MANAGER', name: 'PPC / Production Manager', management: false, extra: ['production.view', 'production.edit', 'dashboard.production', 'projects.view', 'tasks.view', 'tasks.edit', 'documents.view'] },
  { code: 'PROD_SUPER', name: 'Production Supervisor', management: false, extra: ['production.view', 'production.edit', 'dashboard.production', 'projects.view', 'tasks.view', 'tasks.edit'] },
  { code: 'QC_MANAGER', name: 'QC Manager', management: false, extra: ['quality.view', 'quality.edit', 'dashboard.production', 'projects.view', 'tasks.view', 'tasks.edit', 'documents.view', 'documents.upload'] },
  { code: 'QC_ENG', name: 'QC Engineer / Inspector', management: false, extra: ['quality.view', 'quality.edit', 'projects.view', 'tasks.view', 'tasks.edit', 'documents.view', 'documents.upload'] },
  { code: 'STORES', name: 'Stores Manager / Store Keeper', management: false, extra: ['procurement.view', 'production.view', 'projects.view', 'tasks.view', 'documents.view'] },
  { code: 'LOGISTICS', name: 'Logistics / Dispatch', management: false, extra: ['projects.view', 'tasks.view', 'tasks.edit', 'documents.view', 'documents.upload'] },
  { code: 'INSTALL_MANAGER', name: 'Installation Manager', management: false, extra: ['installation.view', 'installation.edit', 'dashboard.installation', 'projects.view', 'tasks.view', 'tasks.edit', 'documents.view', 'documents.upload'] },
  { code: 'SITE_ENG', name: 'Site Engineer', management: false, extra: ['installation.view', 'installation.edit', 'dashboard.installation', 'projects.view', 'tasks.view', 'tasks.edit', 'documents.view', 'documents.upload'] },
  { code: 'PROJECT_MANAGER', name: 'Project Manager', management: false, extra: ['projects.view', 'projects.edit', 'tasks.view', 'tasks.edit', 'documents.view', 'documents.upload', 'leads.view', 'design.view', 'procurement.view', 'production.view', 'quality.view', 'installation.view', 'finance.view', 'reports.view'] },
  { code: 'FINANCE', name: 'Finance / Accounts', management: false, extra: ['finance.view', 'finance.edit', 'projects.view', 'documents.view', 'documents.upload', 'reports.view'] },
  { code: 'ADMIN', name: 'Admin', management: true, perms: 'ALL' },
];

const viewPerms = permissions.filter((p) => p[0].includes('.view') || p[0].startsWith('dashboard.')).map((p) => p[0]);

async function upsertLookups() {
  for (const [type, items] of Object.entries(lookups)) {
    for (let i = 0; i < items.length; i += 1) {
      const [code, label] = items[i];
      await prisma.lookup.upsert({
        where: { type_code: { type, code } },
        update: { label, sortOrder: i + 1, active: true },
        create: { type, code, label, sortOrder: i + 1, active: true },
      });
    }
  }
}

async function main() {
  for (let i = 0; i < departments.length; i += 1) {
    const [code, name] = departments[i];
    await prisma.department.upsert({
      where: { code },
      update: { name, sortOrder: i + 1 },
      create: { code, name, sortOrder: i + 1 },
    });
  }

  const permRecords = {};
  for (const [code, name, module] of permissions) {
    const rec = await prisma.permission.upsert({
      where: { code },
      update: { name, module },
      create: { code, name, module },
    });
    permRecords[code] = rec;
  }

  for (const role of roles) {
    const rec = await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, isSystem: true, isManagement: role.management },
      create: {
        code: role.code,
        name: role.name,
        isSystem: true,
        isManagement: role.management,
      },
    });

    let codes = role.extra || [];
    if (role.perms === 'ALL') codes = permissions.map((p) => p[0]);
    if (role.perms === 'ALL_VIEW') codes = [...new Set([...viewPerms, 'documents.view', 'reports.view', 'audit.view'])];

    await prisma.rolePermission.deleteMany({ where: { roleId: rec.id } });
    await prisma.rolePermission.createMany({
      data: codes.filter((c) => permRecords[c]).map((c) => ({
        roleId: rec.id,
        permissionId: permRecords[c].id,
      })),
    });
  }

  await upsertLookups();

  const stages = lookups.PROJECT_STAGE;
  const deptByStage = {
    ORDER_REVIEW: 'SALES',
    DETAILED_DESIGN: 'DESIGN',
    DESIGN_APPROVAL: 'DESIGN',
    BOM_MRP: 'DESIGN',
    PROCUREMENT: 'PROCUREMENT',
    MATERIAL_RECEIPT: 'STORES',
    PRODUCTION: 'PRODUCTION',
    PRODUCTION_QC: 'QC',
    PACKING: 'PRODUCTION',
    DISPATCH: 'LOGISTICS',
    SITE_READINESS: 'INSTALLATION',
    INSTALLATION: 'INSTALLATION',
    INSTALLATION_QC: 'QC',
    CUSTOMER_INSPECTION: 'INSTALLATION',
    HANDOVER: 'PROJECTS',
    INVOICE_PAYMENT: 'FINANCE',
    PROJECT_CLOSURE: 'PROJECTS',
  };

  const equalWeight = (100 / stages.length).toFixed(2);
  for (let i = 0; i < stages.length; i += 1) {
    const [code, label] = stages[i];
    const dept = await prisma.department.findUnique({ where: { code: deptByStage[code] || 'PROJECTS' } });
    await prisma.stageWeight.upsert({
      where: { stageCode: code },
      update: { label, sortOrder: i + 1, departmentId: dept?.id },
      create: {
        stageCode: code,
        label,
        weight: equalWeight,
        sortOrder: i + 1,
        departmentId: dept?.id,
      },
    });
  }

  const prodOps = [
    ['MATERIAL', 'Material'],
    ['CUTTING', 'Cutting'],
    ['WELDING', 'Welding'],
    ['FABRICATION', 'Fabrication'],
    ['PAINTING', 'Painting'],
    ['ASSEMBLY', 'Assembly'],
  ];
  const prodDept = await prisma.department.findUnique({ where: { code: 'PRODUCTION' } });
  for (let i = 0; i < prodOps.length; i += 1) {
    const [code, name] = prodOps[i];
    await prisma.productionOperationConfig.upsert({
      where: { code },
      update: { name, sortOrder: i + 1, departmentId: prodDept?.id },
      create: { code, name, sortOrder: i + 1, departmentId: prodDept?.id },
    });
  }

  const closures = [
    ['OPEN_TASKS', 'No open tasks'],
    ['OPEN_PUNCH', 'No open punch points'],
    ['PENDING_QC', 'No pending QC'],
    ['PENDING_HANDOVER', 'Handover completed'],
    ['PENDING_DOCS', 'Required documents uploaded'],
    ['PENDING_INVOICE', 'Invoice raised'],
    ['OUTSTANDING', 'No outstanding payment (configurable)'],
  ];
  for (let i = 0; i < closures.length; i += 1) {
    const [code, label] = closures[i];
    await prisma.closureCondition.upsert({
      where: { code },
      update: { label, sortOrder: i + 1 },
      create: { code, label, required: code !== 'OUTSTANDING', sortOrder: i + 1 },
    });
  }

  for (const [key, prefix] of [
    ['LEAD', 'LEAD-'],
    ['PROJECT', 'PROJECT-'],
    ['TASK', 'TASK-'],
    ['CUSTOMER', 'CUST-'],
    ['VENDOR', 'VEND-'],
    ['DOC', 'DOC-'],
    ['RFQ', 'RFQ-'],
    ['PO', 'PO-'],
    ['GRN', 'GRN-'],
    ['INSP', 'INSP-'],
    ['PUNCH', 'PUNCH-'],
    ['INV', 'INV-'],
    ['PROD', 'PROD-'],
    ['ISSUE', 'ISSUE-'],
  ]) {
    await prisma.numberSequence.upsert({
      where: { key },
      update: { prefix },
      create: { key, prefix, padLength: 3, current: 0 },
    });
  }

  const adminDept = await prisma.department.findUnique({ where: { code: 'ADMIN' } });
  const adminRole = await prisma.role.findUnique({ where: { code: 'ADMIN' } });
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe@123';
  const hash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { username: process.env.ADMIN_USERNAME || 'admin' },
    update: {
      email: process.env.ADMIN_EMAIL || 'admin@sahayracks.local',
      fullName: process.env.ADMIN_NAME || 'System Admin',
      departmentId: adminDept?.id,
    },
    create: {
      username: process.env.ADMIN_USERNAME || 'admin',
      email: process.env.ADMIN_EMAIL || 'admin@sahayracks.local',
      fullName: process.env.ADMIN_NAME || 'System Admin',
      passwordHash: hash,
      departmentId: adminDept?.id,
    },
  });
  if (adminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
      update: {},
      create: { userId: admin.id, roleId: adminRole.id },
    });
  }

  console.log('Seed complete. Admin user:', admin.username);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
