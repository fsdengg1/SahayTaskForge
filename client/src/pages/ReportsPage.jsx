import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useLookups } from '../hooks/useLookups';
import { fmtDate, labelOf, money } from '../utils/format';
import DataTable from '../components/DataTable';
import KpiCard from '../components/KpiCard';
import ProgressBar from '../components/ProgressBar';
import StatusBadge from '../components/StatusBadge';

const REPORTS = [
  ['lead-conversion', 'Lead Conversion'],
  ['lead-status', 'Lead Status'],
  ['sales-followup', 'Sales Follow-up'],
  ['project-status', 'Project Status'],
  ['project-delay', 'Project Delay'],
  ['department-progress', 'Department Progress'],
  ['design-delay', 'Design Delay'],
  ['procurement-delay', 'Procurement Delay'],
  ['production-progress', 'Production Progress'],
  ['installation-progress', 'Installation Progress'],
  ['customer-projects', 'Customer-wise Projects'],
  ['salesperson-leads', 'Salesperson-wise Leads'],
  ['project-completion', 'Project Completion'],
  ['quality-report', 'Quality Report'],
  ['order-value', 'Order Value Report'],
];

function shapeReport(type, data, lookups) {
  if (!data) return { title: '', kpis: [], columns: [], rows: [] };

  if (type === 'lead-conversion') {
    return {
      title: 'Lead conversion',
      kpis: [
        { label: 'Total leads', value: data.total },
        { label: 'Won', value: data.won, tone: 'ok' },
        { label: 'Lost', value: data.lost },
        { label: 'Conversion', value: `${data.conversionRate}%`, tone: 'ok' },
      ],
      columns: [
        { key: 'metric', label: 'Metric' },
        { key: 'value', label: 'Value' },
      ],
      rows: [
        { key: 't', metric: 'Total leads', value: data.total },
        { key: 'w', metric: 'Won', value: data.won },
        { key: 'l', metric: 'Lost', value: data.lost },
        { key: 'c', metric: 'Conversion rate', value: `${data.conversionRate}%` },
      ],
    };
  }

  if (type === 'lead-status') {
    const rows = (data || []).map((r, i) => ({
      key: r.statusCode || i,
      status: r.statusCode,
      count: r._count,
    }));
    return {
      title: 'Leads by status',
      columns: [
        { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.status} label={labelOf(lookups, 'LEAD_STATUS', r.status)} /> },
        { key: 'count', label: 'Leads' },
      ],
      rows,
    };
  }

  if (type === 'sales-followup') {
    return {
      title: 'Open lead follow-ups',
      columns: [
        { key: 'leadId', label: 'Lead ID', render: (r) => <Link to={`/leads/${r.id}`}>{r.leadId}</Link> },
        { key: 'customer', label: 'Customer', render: (r) => r.customer?.companyName },
        { key: 'sales', label: 'Sales person', render: (r) => r.salesPerson?.fullName || '—' },
        { key: 'output', label: 'Output Required', render: (r) => r.outputRequiredLabel || labelOf(lookups, 'OUTPUT_REQUIRED', r.outputRequired) },
        { key: 'deadline', label: 'Submission Deadline', render: (r) => fmtDate(r.submissionDeadline) },
        { key: 'outputStatus', label: 'Status', render: (r) => <StatusBadge code={r.outputStatus} label={r.outputStatusLabel} /> },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.statusCode} label={labelOf(lookups, 'LEAD_STATUS', r.statusCode)} /> },
        { key: 'next', label: 'Next follow-up', render: (r) => fmtDate(r.nextFollowUpDate) },
        { key: 'last', label: 'Last discussion', render: (r) => r.followUps?.[0]?.discussion || '—' },
      ],
      rows: data || [],
    };
  }

  if (type === 'project-status') {
    return {
      title: 'Projects by current stage and status',
      columns: [
        { key: 'projectId', label: 'Project ID', render: (r) => <Link to={`/projects/${r.id}`}>{r.projectId}</Link> },
        { key: 'name', label: 'Project' },
        { key: 'customer', label: 'Customer', render: (r) => r.customer?.companyName },
        { key: 'stage', label: 'Stage', render: (r) => labelOf(lookups, 'PROJECT_STAGE', r.currentStageCode) },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.currentStatusCode} label={labelOf(lookups, 'PROJECT_STATUS', r.currentStatusCode)} /> },
        { key: 'pm', label: 'Project manager', render: (r) => r.projectManager?.fullName || '—' },
        { key: 'due', label: 'Expected completion', render: (r) => fmtDate(r.expectedCompletion) },
        { key: 'progress', label: 'Progress', render: (r) => <ProgressBar value={r.progressPercent} /> },
      ],
      rows: data || [],
    };
  }

  if (type === 'project-delay') {
    return {
      title: 'Delayed projects',
      columns: [
        { key: 'projectId', label: 'Project ID', render: (r) => <Link to={`/projects/${r.id}`}>{r.projectId}</Link> },
        { key: 'name', label: 'Project' },
        { key: 'customer', label: 'Customer', render: (r) => r.customer?.companyName },
        { key: 'due', label: 'Target date', render: (r) => fmtDate(r.expectedCompletion) },
        { key: 'delayDays', label: 'Delay days' },
        { key: 'reason', label: 'Latest reason', render: (r) => r.delays?.[0]?.reason || r.remarks || '—' },
      ],
      rows: data || [],
    };
  }

  if (type === 'department-progress') {
    return {
      title: 'Department progress across projects',
      columns: [
        { key: 'name', label: 'Department' },
        { key: 'completed', label: 'Completed' },
        { key: 'inProgress', label: 'In progress' },
        { key: 'pending', label: 'Not started' },
        { key: 'total', label: 'Projects' },
        { key: 'percent', label: 'Complete', render: (r) => <ProgressBar value={r.percent} /> },
      ],
      rows: (data || []).map((r) => ({ ...r, key: r.name })),
    };
  }

  if (type === 'design-delay' || type === 'procurement-delay') {
    return {
      title: type === 'design-delay' ? 'Overdue design tasks' : 'Overdue procurement tasks',
      columns: [
        { key: 'taskId', label: 'Task ID' },
        { key: 'name', label: 'Task' },
        { key: 'project', label: 'Project', render: (r) => r.project ? <Link to={`/projects/${r.project.id}`}>{r.project.projectId}</Link> : '—' },
        { key: 'who', label: 'Assigned to', render: (r) => r.assignedTo?.fullName || '—' },
        { key: 'due', label: 'Due date', render: (r) => fmtDate(r.dueDate) },
        { key: 'delayDays', label: 'Delay days' },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.statusCode} /> },
      ],
      rows: data || [],
    };
  }

  if (type === 'production-progress') {
    return {
      title: 'Production progress',
      columns: [
        { key: 'productionId', label: 'Production ID' },
        { key: 'project', label: 'Project', render: (r) => r.project ? <Link to={`/projects/${r.project.id}`}>{r.project.projectId}</Link> : '—' },
        { key: 'ops', label: 'Operations done', render: (r) => {
          const done = (r.operations || []).filter((o) => o.statusCode === 'COMPLETED').length;
          return `${done} / ${(r.operations || []).length}`;
        } },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.statusCode} /> },
      ],
      rows: data || [],
    };
  }

  if (type === 'installation-progress') {
    return {
      title: 'Installation progress',
      columns: [
        { key: 'project', label: 'Project', render: (r) => r.project ? <Link to={`/projects/${r.project.id}`}>{r.project.projectId}</Link> : '—' },
        { key: 'ready', label: 'Site readiness', render: (r) => <StatusBadge code={r.readinessCode || 'NOT_READY'} /> },
        { key: 'visits', label: 'Visits', render: (r) => r.visits?.length || 0 },
        { key: 'acts', label: 'Activities done', render: (r) => {
          const done = (r.activities || []).filter((a) => a.statusCode === 'COMPLETED').length;
          return `${done} / ${(r.activities || []).length}`;
        } },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.statusCode} /> },
      ],
      rows: (data || []).map((r) => ({ ...r, key: r.id })),
    };
  }

  if (type === 'customer-projects') {
    return {
      title: 'Customer-wise projects',
      columns: [
        { key: 'customerId', label: 'Customer ID', render: (r) => <Link to={`/customers/${r.id}`}>{r.customerId}</Link> },
        { key: 'companyName', label: 'Company' },
        { key: 'leads', label: 'Leads', render: (r) => r._count?.leads ?? 0 },
        { key: 'projects', label: 'Projects', render: (r) => r._count?.projects ?? 0 },
        { key: 'names', label: 'Project IDs', render: (r) => (r.projects || []).map((p) => p.projectId).join(', ') || '—' },
      ],
      rows: data || [],
    };
  }

  if (type === 'salesperson-leads') {
    return {
      title: 'Salesperson-wise leads',
      columns: [
        { key: 'salesperson', label: 'Sales person' },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.status} label={labelOf(lookups, 'LEAD_STATUS', r.status)} /> },
        { key: 'count', label: 'Leads' },
      ],
      rows: (data || []).map((r, i) => ({ ...r, key: `${r.salesperson}-${r.status}-${i}` })),
    };
  }

  if (type === 'quality-report') {
    return {
      title: 'Quality report',
      columns: [
        { key: 'inspectionId', label: 'Inspection' },
        { key: 'project', label: 'Project', render: (r) => r.project ? <Link to={`/projects/${r.project.id}`}>{r.project.projectId}</Link> : '—' },
        { key: 'type', label: 'Type', render: (r) => labelOf(lookups, 'INSPECTION_TYPE', r.typeCode) },
        { key: 'who', label: 'Inspector', render: (r) => r.inspector?.fullName || '—' },
        { key: 'when', label: 'Date', render: (r) => fmtDate(r.inspectedAt) },
        { key: 'result', label: 'Result', render: (r) => <StatusBadge code={r.resultCode} /> },
      ],
      rows: data || [],
    };
  }

  if (type === 'order-value') {
    return {
      title: 'Order value',
      columns: [
        { key: 'projectId', label: 'Project', render: (r) => <Link to={`/projects/${r.id}`}>{r.projectId}</Link> },
        { key: 'customer', label: 'Customer', render: (r) => r.customer?.companyName },
        { key: 'value', label: 'Order value', render: (r) => money(r.orderValue, r.currency) },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.currentStatusCode} /> },
      ],
      rows: data || [],
    };
  }

  if (type === 'project-completion') {
    return {
      title: 'Completed projects',
      columns: [
        { key: 'projectId', label: 'Project ID', render: (r) => <Link to={`/projects/${r.id}`}>{r.projectId}</Link> },
        { key: 'name', label: 'Project' },
        { key: 'customer', label: 'Customer', render: (r) => r.customer?.companyName },
        { key: 'closed', label: 'Closed on', render: (r) => fmtDate(r.closureDate || r.actualCompletion) },
        { key: 'by', label: 'Closed by', render: (r) => r.closedBy?.fullName || '—' },
        { key: 'value', label: 'Order value', render: (r) => money(r.orderValue, r.currency) },
      ],
      rows: data || [],
    };
  }

  return { title: 'Report', columns: [], rows: [] };
}

function csvValue(row, col) {
  if (col.csv) return col.csv(row);
  const raw = row[col.key];
  if (raw == null) return '';
  if (typeof raw === 'object') return raw.projectId || raw.companyName || raw.fullName || raw.name || '';
  return raw;
}

export default function ReportsPage() {
  const lookups = useLookups();
  const [type, setType] = useState('department-progress');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const view = useMemo(() => shapeReport(type, data, lookups), [type, data, lookups]);

  async function run() {
    setError('');
    setBusy(true);
    try {
      const q = new URLSearchParams();
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      setData(await api.get(`/reports/${type}${q.toString() ? `?${q}` : ''}`));
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const cols = view.columns;
    const header = cols.map((c) => c.label).join(',');
    const lines = view.rows.map((row) => cols.map((c) => JSON.stringify(String(csvValue(row, c) ?? ''))).join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${type}.csv`;
    a.click();
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Information</p>
          <h2>Reports</h2>
          <p>Choose a report and run it. Numbers come from live project data.</p>
        </div>
      </div>
      <div className="filters">
        <select value={type} onChange={(e) => { setType(e.target.value); setData(null); }}>
          {REPORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn" type="button" onClick={run} disabled={busy}>{busy ? 'Running…' : 'Run'}</button>
        {data && <button className="btn secondary" type="button" onClick={exportCsv}>Export CSV</button>}
      </div>
      {error && <div className="notice err">{error}</div>}
      {!data && !error && <div className="empty">Select a report and click Run.</div>}
      {data && (
        <>
          {view.kpis?.length > 0 && (
            <div className="kpi-grid">
              {view.kpis.map((k) => <KpiCard key={k.label} label={k.label} value={k.value} tone={k.tone} />)}
            </div>
          )}
          <div className="card">
            <h3>{view.title}</h3>
            <DataTable columns={view.columns} rows={view.rows} empty="No rows for this report." />
          </div>
        </>
      )}
    </div>
  );
}
