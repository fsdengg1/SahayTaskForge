import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useLookups } from '../hooks/useLookups';
import { fmtDate, labelOf } from '../utils/format';
import KpiCard from '../components/KpiCard';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';

export default function DesignPage() {
  const lookups = useLookups();
  const [dash, setDash] = useState(null);
  const [tasks, setTasks] = useState({ items: [] });
  useEffect(() => {
    api.get('/dashboard/design').then(setDash).catch(() => {});
    api.get('/tasks?module=DESIGN').then(setTasks).catch(() => {});
  }, []);
  return (
    <div>
      <div className="page-head"><div><p className="eyebrow">Design & Engineering</p><h2>Design</h2><p>Drawings, BOQ, approvals and revisions</p></div></div>
      {dash && (
        <div className="kpi-grid">
          <KpiCard label="Assigned tasks" value={dash.kpis.assigned} />
          <KpiCard label="Pending approvals" value={dash.kpis.pendingApprovals} tone="warn" />
          <KpiCard label="Overdue" value={dash.kpis.overdue} tone="danger" />
          <KpiCard label="Revision requests" value={dash.kpis.revisions} />
          <KpiCard label="Completed" value={dash.kpis.completed} tone="ok" />
          <KpiCard label="In Progress" value={dash.kpis.outputOnTime} tone="ok" />
          <KpiCard label="Overdue" value={dash.kpis.outputOverdue} tone="danger" />
          <KpiCard label="Delayed 1–3 Days" value={dash.kpis.outputDelayed13} tone="warn" />
          <KpiCard label="Delayed >3 Days" value={dash.kpis.outputDelayedOver3} />
        </div>
      )}
      {(dash?.outputTracking || []).length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Lead output tracking</h3>
          <DataTable
            rows={dash.outputTracking}
            columns={[
              { key: 'leadId', label: 'Lead ID', render: (r) => <Link to={`/leads/${r.id}`}>{r.leadId}</Link> },
              { key: 'customer', label: 'Customer', render: (r) => r.customer?.companyName },
              { key: 'output', label: 'Output Required', render: (r) => r.outputRequiredLabel || labelOf(lookups, 'OUTPUT_REQUIRED', r.outputRequired) },
              { key: 'deadline', label: 'Submission Deadline', render: (r) => fmtDate(r.submissionDeadline) },
              { key: 'outputStatus', label: 'Status', render: (r) => <StatusBadge code={r.outputStatus} label={r.outputStatusLabel} /> },
            ]}
          />
        </div>
      )}
      <DataTable
        rows={tasks.items}
        columns={[
          { key: 'taskId', label: 'Task' },
          { key: 'name', label: 'Name' },
          { key: 'project', label: 'Project', render: (r) => r.project ? <Link to={`/projects/${r.project.id}`}>{r.project.projectId}</Link> : '—' },
          { key: 'who', label: 'Assigned Engineer', render: (r) => r.assignedTo?.fullName || '—' },
          { key: 'start', label: 'Start', render: (r) => fmtDate(r.startDate) },
          { key: 'due', label: 'Due Date', render: (r) => fmtDate(r.dueDate) },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.statusCode} /> },
          { key: 'delay', label: 'Delay', render: (r) => r.delayDays ? `${r.delayDays} days` : '—' },
          { key: 'rev', label: 'Revision', render: (r) => r.revision || r.remarks || '—' },
        ]}
      />
    </div>
  );
}
