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
  item('/customers', 'Customers', 'Sales & Pre-Sales'),
  item('/quotations', 'Quotations', 'Sales & Pre-Sales'),
  item('/follow-ups', 'Follow-ups', 'Sales & Pre-Sales'),

  item('/tasks', 'Tasks', 'Project Execution'),
  item('/issues', 'Issues', 'Project Execution'),
  item('/approvals', 'Approvals', 'Project Execution'),

  item('/design', 'Design', 'Design & Engineering'),
  item('/drawings', 'Drawings & BOQ', 'Design & Engineering'),

  item('/procurement', 'Procurement', 'Procurement'),
  item('/vendors', 'Vendors', 'Procurement'),
  item('/purchase-orders', 'Purchase Orders', 'Procurement'),

  item('/planning', 'PPC / Planning', 'PPC & Production'),
  item('/production', 'Production', 'PPC & Production'),

  item('/quality', 'Quality / QC', 'Quality'),
  item('/rework', 'Rework / NCR', 'Quality'),

  item('/stores', 'Stores', 'Stores & Logistics'),
  item('/grn', 'GRN / Material Receipt', 'Stores & Logistics'),
  item('/dispatch', 'Dispatch', 'Stores & Logistics'),

  item('/installation', 'Installation', 'Installation'),
  item('/site-readiness', 'Site Readiness', 'Installation'),
  item('/punch-points', 'Punch Points', 'Installation'),
  item('/handover', 'Handover', 'Installation'),

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

export function menuFor(user) {
  const codes = roleCodes(user);
  const has = (list) => codes.some((c) => list.includes(c));

  if (has(['CEO', 'SAHAY_MD', 'ENG_DIRECTOR', 'CFT', 'ADMIN'])) {
    return has(['ADMIN']) ? [...MANAGEMENT_MENU, ...ADMIN_MENU] : MANAGEMENT_MENU;
  }
  if (has(['SALES_MANAGER', 'SALES_EXEC', 'SALES_COORD'])) {
    return [
      item('/dashboard', 'Dashboard', 'Sales'),
      item('/leads', 'Leads', 'Sales'),
      item('/customers', 'Customers', 'Sales'),
      item('/quotations', 'Quotations', 'Sales'),
      item('/follow-ups', 'Follow-ups', 'Sales'),
      item('/projects', 'Projects', 'Work'),
      item('/tasks', 'Tasks', 'Work'),
      item('/documents', 'Documents', 'Work'),
    ];
  }
  if (has(['DESIGN_MANAGER', 'DESIGN_ENG'])) {
    return [
      item('/dashboard', 'Dashboard', 'Design'),
      item('/projects', 'Projects', 'Design'),
      item('/design', 'Design', 'Design'),
      item('/drawings', 'Drawings & BOQ', 'Design'),
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
  if (has(['PROC_MANAGER', 'PURCHASE_EXEC'])) {
    return [
      item('/dashboard', 'Dashboard', 'Procurement'),
      item('/projects', 'Projects', 'Procurement'),
      item('/procurement', 'Procurement', 'Procurement'),
      item('/vendors', 'Vendors', 'Procurement'),
      item('/purchase-orders', 'Purchase Orders', 'Procurement'),
      item('/tasks', 'Tasks', 'Work'),
      item('/documents', 'Documents', 'Work'),
    ];
  }
  if (has(['PPC_MANAGER'])) {
    return [
      item('/dashboard', 'Dashboard', 'Planning'),
      item('/projects', 'Projects', 'Planning'),
      item('/planning', 'Planning', 'Planning'),
      item('/tasks', 'Tasks', 'Planning'),
    ];
  }
  if (has(['PROD_SUPER'])) {
    return [
      item('/dashboard', 'Dashboard', 'Production'),
      item('/projects', 'Projects', 'Production'),
      item('/production', 'Production', 'Production'),
      item('/tasks', 'Tasks', 'Production'),
    ];
  }
  if (has(['QC_MANAGER', 'QC_ENG'])) {
    return [
      item('/dashboard', 'Dashboard', 'Quality'),
      item('/projects', 'Projects', 'Quality'),
      item('/quality', 'Quality', 'Quality'),
      item('/rework', 'Rework / NCR', 'Quality'),
      item('/documents', 'Documents', 'Quality'),
    ];
  }
  if (has(['STORES'])) {
    return [
      item('/dashboard', 'Dashboard', 'Stores'),
      item('/projects', 'Projects', 'Stores'),
      item('/stores', 'Stores', 'Stores'),
      item('/grn', 'GRN', 'Stores'),
      item('/stock', 'Stock', 'Stores'),
      item('/documents', 'Documents', 'Stores'),
    ];
  }
  if (has(['LOGISTICS'])) {
    return [
      item('/dashboard', 'Dashboard', 'Logistics'),
      item('/projects', 'Projects', 'Logistics'),
      item('/dispatch', 'Dispatch', 'Logistics'),
      item('/documents', 'Documents', 'Logistics'),
    ];
  }
  if (has(['INSTALL_MANAGER', 'SITE_ENG'])) {
    return [
      item('/dashboard', 'Dashboard', 'Installation'),
      item('/projects', 'Projects', 'Installation'),
      item('/installation', 'Installation', 'Installation'),
      item('/site-readiness', 'Site Readiness', 'Installation'),
      item('/punch-points', 'Punch Points', 'Installation'),
      item('/handover', 'Handover', 'Installation'),
      item('/documents', 'Documents', 'Installation'),
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
