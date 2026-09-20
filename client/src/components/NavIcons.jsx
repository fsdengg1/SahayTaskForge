const ICONS = {
  dashboard: 'M4 4h7v7H4V4zm9 0h7v5h-7V4zM4 13h7v7H4v-7zm9 7v-9h7v9h-7z',
  projects: 'M4 7h16v12H4V7zm2-3h7l2 3H6V4z',
  timeline: 'M4 12h16M8 6v12M16 8v8',
  health: 'M12 21s-7-4.4-7-10a4.5 4.5 0 0 1 7-3.7A4.5 4.5 0 0 1 19 11c0 5.6-7 10-7 10z',
  sales: 'M5 19V9l7-5 7 5v10H5zm4 0v-6h6v6',
  customers: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8.5 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 19a5 5 0 0 1 10 0M14 19a4 4 0 0 1 7 0',
  quotations: 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h3',
  followups: 'M12 7v5l3 2M12 21a9 9 0 1 0-9-9',
  tasks: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  issues: 'M12 8v5m0 3h.01M10.3 4.3 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z',
  approvals: 'M9 11l3 3 8-8M20 12a8 8 0 1 1-8-8',
  design: 'M4 16l6-6 3 3 7-7M14 5h5v5',
  drawings: 'M5 5h10l4 4v10H5V5zm10 0v4h4',
  procurement: 'M6 7h15l-2 8H8L6 7zm0 0L5 4H2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  vendors: 'M4 10h16v9H4v-9zm2-5h12l2 5H4l2-5z',
  orders: 'M7 4h10l2 4H5l2-4zM5 8h14v12H5V8zm4 4h6',
  planning: 'M4 6h16M8 3v3M16 3v3M5 6h14v14H5V6zm3 5h8M8 15h5',
  production: 'M3 18h18M5 18V9l4 3 3-5 3 5 4-3v9',
  quality: 'M9 12l2 2 5-5M6 4h12v16H6z',
  rework: 'M4 12a8 8 0 0 1 13.7-5.7L20 4v6h-6l2.2-2.2A6 6 0 1 0 18 12',
  stores: 'M3 10l9-6 9 6v10H3V10zm5 10v-6h8v6',
  grn: 'M4 6h12v12H4V6zm12 4h4l2 3v5h-6v-8zM8 18v-4h4v4',
  dispatch: 'M3 7h11v10H3V7zm11 3h5l3 3v4h-8V10zM6 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm11 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  installation: 'M4 20V10l8-6 8 6v10H4zm5 0v-6h6v6',
  readiness: 'M8 20V9l4-3 4 3v11M4 20h16M10 13h4',
  punch: 'M12 21a9 9 0 1 0-9-9m5 4 3 3 8-8',
  handover: 'M8 12h8M8 8h5M7 4h10v16H7z',
  finance: 'M12 3v18M8 7h6a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7',
  invoices: 'M7 4h10v16l-2-1-2 1-2-1-2 1-2-1V4zm3 5h4M10 13h4',
  payments: 'M4 8h16v10H4V8zm0 3h16M8 15h3',
  documents: 'M7 3h8l4 4v14H7V3zm8 0v4h4M10 12h6M10 16h6',
  activity: 'M4 12h4l2-6 4 12 2-6h4',
  reports: 'M5 19V9m7 10V5m7 14v-7',
  users: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 19a7 7 0 0 1 14 0',
  settings: 'M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7zM12 3v2M12 19v2M4.9 6.1l1.4 1.4M17.7 16.5l1.4 1.4M3 12h2M19 12h2M4.9 17.9l1.4-1.4M17.7 7.5l1.4-1.4',
  search: 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3',
  bell: 'M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9',
  logout: 'M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2M4 12h11M7 9l-3 3 3 3',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.5 10.7A3 3 0 0 0 12 15a3 3 0 0 0 2.7-1.6M9.9 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a16.8 16.8 0 0 1-3.2 3.9M6.1 6.2A16.5 16.5 0 0 0 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.9-.8',
  menu: 'M4 7h16M4 12h16M4 17h16',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7L20 8M20 8V4h-4',
};

const GROUP_ICONS = {
  Executive: 'dashboard',
  'Sales & Pre-Sales': 'sales',
  Sales: 'sales',
  'Project Execution': 'projects',
  Work: 'tasks',
  'Design & Engineering': 'design',
  Design: 'design',
  Procurement: 'procurement',
  'PPC & Production': 'production',
  Planning: 'planning',
  Production: 'production',
  Quality: 'quality',
  'Stores & Logistics': 'stores',
  Stores: 'stores',
  Logistics: 'dispatch',
  Installation: 'installation',
  Commercial: 'finance',
  Information: 'documents',
  Administration: 'settings',
  Overview: 'dashboard',
};

const ITEM_ICONS = {
  '/dashboard': 'dashboard',
  '/projects': 'projects',
  '/timeline': 'timeline',
  '/health': 'health',
  '/leads': 'sales',
  '/customers': 'customers',
  '/quotations': 'quotations',
  '/follow-ups': 'followups',
  '/tasks': 'tasks',
  '/issues': 'issues',
  '/approvals': 'approvals',
  '/design': 'design',
  '/drawings': 'drawings',
  '/procurement': 'procurement',
  '/vendors': 'vendors',
  '/purchase-orders': 'orders',
  '/planning': 'planning',
  '/production': 'production',
  '/quality': 'quality',
  '/rework': 'rework',
  '/stores': 'stores',
  '/grn': 'grn',
  '/stock': 'stores',
  '/dispatch': 'dispatch',
  '/installation': 'installation',
  '/site-readiness': 'readiness',
  '/punch-points': 'punch',
  '/handover': 'handover',
  '/finance': 'finance',
  '/invoices': 'invoices',
  '/payments': 'payments',
  '/documents': 'documents',
  '/activity': 'activity',
  '/reports': 'reports',
  '/users': 'users',
  '/settings': 'settings',
};

export function iconForGroup(name) {
  return GROUP_ICONS[name] || 'dashboard';
}

export function iconForItem(to) {
  return ITEM_ICONS[to] || 'projects';
}

export default function NavIcon({ name }) {
  const d = ICONS[name] || ICONS.dashboard;
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
