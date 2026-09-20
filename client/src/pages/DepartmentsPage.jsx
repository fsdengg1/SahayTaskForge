import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import KpiCard from '../components/KpiCard';

export default function DepartmentsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/dashboard/management').then(setData).catch(() => {});
  }, []);
  if (!data) return <div className="loading">Loading departments…</div>;
  const max = Math.max(1, ...data.bottlenecks.map((b) => b.load));
  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Departments</h2>
          <p>Where work is open, overdue or blocked — factual counts only.</p>
        </div>
      </div>
      <div className="card">
        {data.departmentWorkload.map((d) => (
          <div key={d.name} style={{ marginBottom: 16, cursor: 'pointer' }} onClick={() => navigate('/tasks')}>
            <strong>{d.name}</strong>
            <div className="kpi-grid" style={{ marginTop: 8 }}>
              <KpiCard label="Active" value={d.active} />
              <KpiCard label="Pending" value={d.pending} />
              <KpiCard label="Overdue" value={d.overdue} tone={d.overdue ? 'danger' : ''} />
              <KpiCard label="Blocked" value={d.blocked} tone={d.blocked ? 'danger' : ''} />
              <KpiCard label="Completed" value={d.completed} tone="ok" />
            </div>
            <div className="bar-row">
              <div className="track heat"><i style={{ width: `${((d.pending + d.overdue + d.blocked) / max) * 100}%` }} /></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
