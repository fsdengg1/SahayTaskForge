import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import KpiCard from '../components/KpiCard';
import DataTable from '../components/DataTable';

function HealthPill({ item }) {
  if (!item) return '—';
  return <span className={`health-pill tone-${item.tone || 'grey'}`}>{item.label}</span>;
}

export default function ProjectHealthPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/dashboard/management').then(setData).catch(() => {});
  }, []);
  if (!data) return <div className="loading">Loading project health…</div>;
  const rows = data.projectHealthRows || [];
  const count = (tone) => rows.filter((row) => row.overall?.tone === tone).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Executive</p>
          <h2>Project Health</h2>
          <p>Schedule, task, issue and approval health calculated from the current projects.</p>
        </div>
      </div>
      <div className="kpi-grid exec-kpis">
        <KpiCard label="On Track" value={count('green')} tone="ok" onClick={() => navigate('/projects')} />
        <KpiCard label="Attention Required" value={count('orange')} tone="warn" onClick={() => navigate('/projects')} />
        <KpiCard label="Delayed / Critical" value={count('red')} tone="danger" onClick={() => navigate('/projects?delayed=true')} />
        <KpiCard label="On Hold" value={count('yellow')} tone="warn" onClick={() => navigate('/projects?status=ON_HOLD')} />
      </div>
      {!rows.length && (
        <div className="empty">
          No projects available. <Link to="/leads">Convert Lead to Project</Link>
        </div>
      )}
      {rows.length > 0 && (
        <DataTable
          rows={rows}
          columns={[
            { key: 'project', label: 'Project Name', render: (r) => <button type="button" className="linkish" onClick={() => navigate(`/projects/${r.id}`)}>{r.projectId} · {r.name}</button> },
            { key: 'customer', label: 'Customer' },
            { key: 'progress', label: 'Overall Progress', render: (r) => `${r.progress ?? 0}%` },
            { key: 'schedule', label: 'Schedule Health', render: (r) => <HealthPill item={r.schedule} /> },
            { key: 'tasks', label: 'Task Health', render: (r) => <HealthPill item={r.tasks} /> },
            { key: 'issues', label: 'Issue Health', render: (r) => <HealthPill item={r.issues} /> },
            { key: 'approvals', label: 'Approval Health', render: (r) => <HealthPill item={r.approvals} /> },
            { key: 'overall', label: 'Overall Project Health', render: (r) => <HealthPill item={r.overall} /> },
          ]}
        />
      )}
    </div>
  );
}
