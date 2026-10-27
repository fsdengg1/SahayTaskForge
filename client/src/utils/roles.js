export const MGMT = ['CEO', 'SAHAY_MD', 'ENG_DIRECTOR', 'CFT', 'ADMIN'];

export function roleCodes(user) {
  return (user?.roles || []).map((r) => r.code || r.role?.code).filter(Boolean);
}

export function isManagement(user) {
  return roleCodes(user).some((c) => MGMT.includes(c));
}

export function primaryRole(user) {
  const codes = roleCodes(user);
  return codes[0] || '';
}

function item(to, label, group) {
  return { to, label, group };
}

const MANAGEMENT_MENU = [
  item('/dashboard', 'Dashboard', 'Executive'),
  item('/projects', 'Projects', 'Executive'),
  item('/timeline', 'Project Timeline', 'Executive'),
  item('/health', 'Project Health', 'Executive'),

  item('/leads', 'Leads', 'Sales & Pre-Sales'),
  item('/lead-dashboard', 'Lead Dashboard', 'Sales & Pre-Sales'),
  item('/sales-enquiry-dashboard', 'Sales Enquiry Dashboard', 'Sales & Pre-Sales'),
  item('/order-conversion', 'Project to Order Conversion', 'Sales & Pre-Sales'),
  item('/customers', 'Customers', 'Sales & Pre-Sales'),
  item('/quotations', 'Quotations', 'Sales & Pre-Sales'),
  item('/follow-ups', 'Follow-ups', 'Sales & Pre-Sales'),
  item('/customer-feedback', 'Customer Feedback', 'Sales & Pre-Sales'),

  item('/tasks', 'Tasks', 'Project Execution'),
  item('/issues', 'Issues', 'Project Execution'),
  item('/approvals', 'Approvals', 'Project Execution'),

  item('/finance', 'Finance', 'Commercial'),
  item('/invoices', 'Invoices', 'Commercial'),
  item('/payments', 'Payments', 'Commercial'),

  item('/documents', 'Documents', 'Information'),
  item('/activity', 'Activity History', 'Information'),
  item('/reports', 'Reports', 'Information'),
];

const ADMIN_MENU = [
  item('/users', 'Users & Roles', 'Administration'),
  item('/settings', 'Settings', 'Administration'),
];

const COMMON_GROUPS = new Set([
  'Executive',
  'Project Execution',
  'Commercial',
  'Information',
  'Administration',
]);

const DESIGN_MENU = [
  item('/design/presales', 'Pre-Sales Design', 'DESIGN'),
];

const OTR_MENU = [
  item('/otr', 'OTR Dashboard', 'OTR'),
  item('/otr/design', 'Design', 'OTR'),
  item('/otr/design-activity-log', 'Design Activity Log', 'OTR'),
  item('/otr/procurement', 'Procurement', 'OTR'),
  item('/otr/production', 'Production', 'OTR'),
  item('/otr/manufacturing-lead-time', 'Manufacturing & Lead Time', 'OTR'),
  item('/otr/installation', 'Installation', 'OTR'),
  item('/otr/vendor-management', 'Vendor Management', 'OTR'),
];

const COMMON_MENU = [
  ...MANAGEMENT_MENU.filter((entry) => COMMON_GROUPS.has(entry.group)),
  ...OTR_MENU,
  ...DESIGN_MENU,
  ...ADMIN_MENU,
];

const GROUP_ORDER = [
  'Executive',
  'Sales & Pre-Sales',
  'OTR',
  'DESIGN',
  'Sales',
  'Project Execution',
  'Work',
  'Commercial',
  'Information',
  'Administration',
  'Overview',
];

function withCommonSections(roleItems) {
  const seen = new Set();
  const grouped = new Map();
  for (const entry of [...COMMON_MENU, ...roleItems]) {
    if (seen.has(entry.to)) continue;
    seen.add(entry.to);
    const list = grouped.get(entry.group) || [];
    list.push(entry);
    grouped.set(entry.group, list);
  }
  const rank = new Map(GROUP_ORDER.map((name, index) => [name, index]));
  return [...grouped.entries()]
    .sort((a, b) => (rank.get(a[0]) ?? 99) - (rank.get(b[0]) ?? 99))
    .flatMap(([, entries]) => entries);
}

function sectionsFor(user) {
  const codes = roleCodes(user);
  const has = (list) => codes.some((c) => list.includes(c));

  if (has(['CEO', 'SAHAY_MD', 'ENG_DIRECTOR', 'CFT', 'ADMIN'])) {
    return MANAGEMENT_MENU;
  }
  if (has(['SALES_MANAGER', 'SALES_EXEC', 'SALES_COORD'])) {
    return [
      item('/dashboard', 'Dashboard', 'Sales'),
      item('/leads', 'Leads', 'Sales & Pre-Sales'),
      item('/lead-dashboard', 'Lead Dashboard', 'Sales & Pre-Sales'),
      item('/sales-enquiry-dashboard', 'Sales Enquiry Dashboard', 'Sales & Pre-Sales'),
      item('/order-conversion', 'Project to Order Conversion', 'Sales & Pre-Sales'),
      item('/customers', 'Customers', 'Sales & Pre-Sales'),
      item('/quotations', 'Quotations', 'Sales & Pre-Sales'),
      item('/follow-ups', 'Follow-ups', 'Sales & Pre-Sales'),
      item('/customer-feedback', 'Customer Feedback', 'Sales & Pre-Sales'),
      item('/projects', 'Projects', 'Work'),
      item('/tasks', 'Tasks', 'Work'),
      item('/documents', 'Documents', 'Work'),
    ];
  }
  if (has(['DESIGN_MANAGER', 'DESIGN_ENG'])) {
    return [
      item('/dashboard', 'Dashboard', 'Sales & Pre-Sales'),
      item('/projects', 'Projects', 'Work'),
      item('/tasks', 'Tasks', 'Work'),
      item('/documents', 'Documents', 'Work'),
    ];
  }
  if (has(['PROJECT_MANAGER'])) {
    return [
      item('/dashboard', 'Dashboard', 'Executive'),
      item('/projects', 'Projects', 'Executive'),
      item('/timeline', 'Project Timeline', 'Executive'),
      item('/health', 'Project Health', 'Executive'),
      item('/tasks', 'Tasks', 'Project Execution'),
      item('/issues', 'Issues', 'Project Execution'),
      item('/documents', 'Documents', 'Information'),
    ];
  }
  if (has(['PROC_MANAGER', 'PURCHASE_EXEC', 'PPC_MANAGER', 'PROD_SUPER', 'QC_MANAGER', 'QC_ENG', 'STORES', 'LOGISTICS', 'INSTALL_MANAGER', 'SITE_ENG'])) {
    return [
      item('/dashboard', 'Dashboard', 'Sales & Pre-Sales'),
      item('/projects', 'Projects', 'Work'),
      item('/tasks', 'Tasks', 'Work'),
      item('/documents', 'Documents', 'Work'),
    ];
  }
  if (has(['FINANCE'])) {
    return [
      item('/dashboard', 'Dashboard', 'Commercial'),
      item('/projects', 'Projects', 'Commercial'),
      item('/finance', 'Finance', 'Commercial'),
      item('/invoices', 'Invoices', 'Commercial'),
      item('/payments', 'Payments', 'Commercial'),
      item('/reports', 'Reports', 'Commercial'),
    ];
  }
  return [
    item('/dashboard', 'Dashboard', 'Overview'),
    item('/projects', 'Projects', 'Overview'),
  ];
}

export function menuFor(user) {
  return withCommonSections(sectionsFor(user));
}
