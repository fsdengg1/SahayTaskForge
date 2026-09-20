import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { fmtDate } from '../utils/format';
import KpiCard from '../components/KpiCard';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';

export default function InstallationPage({ focus } = {}) {
  const [dash, setDash] = useState(null);
  const [installs, setInstalls] = useState([]);
  const [punches, setPunches] = useState([]);
  const [handovers, setHandovers] = useState([]);

  useEffect(() => {
    api.get('/dashboard/installation').then(setDash).catch(() => {});
    api.get('/installations').then(setInstalls).catch(() => setInstalls([]));
    if (focus === 'punch' || !focus) api.get('/punch-points').then(setPunches).catch(() => setPunches([]));
    if (focus === 'handover' || !focus) api.get('/handovers').then(setHandovers).catch(() => setHandovers([]));
  }, [focus]);

  const title = {
    readiness: 'Site Readiness',
    punch: 'Punch Points',
    handover: 'Handover',
  }[focus] || 'Installation';

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Installation</p>
          <h2>{title}</h2>
          <p>Project-level installation progress. Open a project to record visits, readiness, punch points and handover.</p>
        </div>
      </div>
      {dash && !focus && (
        <div className="kpi-grid">
          <KpiCard label="Upcoming visits" value={dash.kpis.upcoming} />
          <KpiCard label="Site not ready" value={dash.kpis.notReady} tone="warn" />
          <KpiCard label="In progress" value={dash.kpis.inProgress} />
          <KpiCard label="Open punch points" value={dash.kpis.punches} tone="danger" />
          <KpiCard label="Handover pending" value={dash.kpis.handoverPending} />
        </div>
      )}
      {focus !== 'punch' && focus !== 'handover' && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>{focus === 'readiness' ? 'Site readiness by project' : 'Installation jobs'}</h3>
          <DataTable
            rows={installs}
            empty="No installation records yet. They appear when a project reaches site work."
            columns={[
              { key: 'project', label: 'Project', render: (r) => r.project ? <Link to={`/projects/${r.project.id}`}>{r.project.projectId}</Link> : '—' },
              { key: 'customer', label: 'Customer', render: (r) => r.project?.customer?.companyName || '—' },
              { key: 'ready', label: 'Readiness', render: (r) => <StatusBadge code={r.readinessCode || 'NOT_READY'} /> },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.statusCode} /> },
              { key: 'visit', label: 'Last visit', render: (r) => fmtDate(r.visits?.[0]?.visitDate) },
            ]}
          />
        </div>
      )}
      {focus !== 'readiness' && focus !== 'handover' && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>Punch points</h3>
          <DataTable
            rows={punches}
            empty="No punch points recorded."
            columns={[
              { key: 'punchId', label: 'Punch' },
              { key: 'project', label: 'Project', render: (r) => r.project ? <Link to={`/projects/${r.project.id}`}>{r.project.projectId}</Link> : '—' },
              { key: 'description', label: 'Issue' },
              { key: 'who', label: 'Assigned', render: (r) => r.assignedTo?.fullName || '—' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.statusCode} /> },
              { key: 'act', label: '', render: (r) => <Link to={`/punch-points/${r.id}`}>View</Link> },
            ]}
          />
        </div>
      )}
      {focus !== 'readiness' && focus !== 'punch' && (
        <div className="card">
          <h3>Handovers</h3>
          <DataTable
            rows={handovers}
            empty="No handovers recorded."
            columns={[
              { key: 'project', label: 'Project', render: (r) => r.project ? <Link to={`/projects/${r.project.id}`}>{r.project.projectId}</Link> : '—' },
              { key: 'customer', label: 'Customer', render: (r) => r.project?.customer?.companyName || '—' },
              { key: 'date', label: 'Date', render: (r) => fmtDate(r.handoverDate) },
              { key: 'accepted', label: 'Customer accepted', render: (r) => r.customerAccepted ? 'Yes' : 'Pending' },
            ]}
          />
        </div>
      )}
    </div>
  );
}
