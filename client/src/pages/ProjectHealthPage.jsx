import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { fmtDate, labelOf } from '../utils/format';
import { useLookups } from '../hooks/useLookups';
import KpiCard from '../components/KpiCard';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import DonutChart from '../components/DonutChart';

export default function ProjectHealthPage() {
  const lookups = useLookups();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/dashboard/management').then(setData).catch(() => {});
  }, []);
  if (!data) return <div className="loading">Loading project health…</div>;
  const health = data.projectHealth || [];
  const atRisk = health.find((h) => h.code === 'AT_RISK')?.count || 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Project Health</h2>
          <p>Portfolio health, department load, delays and upcoming deadlines.</p>
        </div>
      </div>
      <div className="kpi-grid exec-kpis">
        <KpiCard label="On Track" value={data.kpis?.onTrack} tone="ok" onClick={() => navigate('/projects?status=ON_TRACK')} />
        <KpiCard label="At Risk" value={atRisk} tone="warn" onClick={() => navigate('/projects')} />
        <KpiCard label="Delayed" value={data.kpis?.delayed} tone="danger" onClick={() => navigate('/projects?delayed=true')} />
        <KpiCard label="Blocked" value={data.kpis?.blocked} tone="danger" onClick={() => navigate('/projects?status=BLOCKED')} />
        <KpiCard label="On Hold" value={data.kpis?.onHold} tone="warn" onClick={() => navigate('/projects?status=ON_HOLD')} />
        <KpiCard label="Completed" value={data.kpis?.completed} tone="ok" onClick={() => navigate('/projects?status=COMPLETED')} />
      </div>
      <div className="grid-2">
        <div className="card">
          <h3>Health mix</h3>
          <DonutChart items={health} />
        </div>
        <div className="card">
          <h3>Department-wise health</h3>
          {(data.departmentWorkload || []).map((d) => (
            <div className="bar-row" key={d.name}>
              <span>{d.name}</span>
              <div className="track"><i style={{ width: `${Math.min(100, ((d.overdue + d.blocked + d.pending) / Math.max(1, d.active + d.completed)) * 100)}%` }} /></div>
              <strong>{d.overdue} ov · {d.blocked} blk</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Overdue tasks</h3>
          <DataTable
            rows={data.overdueActivities || []}
            empty="No overdue tasks."
            columns={[
              { key: 'name', label: 'Task' },
              { key: 'project', label: 'Project', render: (r) => r.project?.projectId || r.projectId },
              { key: 'dueDate', label: 'Due', render: (r) => fmtDate(r.dueDate) },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.statusCode || 'OVERDUE'} /> },
            ]}
          />
        </div>
        <div className="card">
          <h3>Upcoming deadlines</h3>
          <DataTable
            rows={data.upcomingDeadlines || []}
            empty="No upcoming deadlines."
            columns={[
              { key: 'name', label: 'Item' },
              { key: 'project', label: 'Project', render: (r) => r.project?.projectId || r.projectId },
              { key: 'dueDate', label: 'Due', render: (r) => fmtDate(r.dueDate || r.expectedCompletion) },
            ]}
          />
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Critical projects</h3>
        <DataTable
          rows={data.critical || []}
          empty="No critical projects."
          columns={[
            { key: 'projectId', label: 'Project', render: (r) => <button className="linkish" type="button" onClick={() => navigate(`/projects/${r.id}`)}>{r.projectId}</button> },
            { key: 'customer', label: 'Customer', render: (r) => r.customer?.companyName || r.customer },
            { key: 'stage', label: 'Stage', render: (r) => labelOf(lookups, 'PROJECT_STAGE', r.stage || r.currentStageCode) },
            { key: 'health', label: 'Health', render: (r) => <StatusBadge code={r.health || r.currentStatusCode} /> },
            { key: 'due', label: 'Expected', render: (r) => fmtDate(r.expectedCompletion) },
          ]}
        />
      </div>
    </div>
  );
}
