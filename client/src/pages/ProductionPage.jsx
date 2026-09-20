import { useEffect, useState } from 'react';
import { api } from '../services/api';
import KpiCard from '../components/KpiCard';
import StatusBadge from '../components/StatusBadge';

export default function ProductionPage({ mode } = {}) {
  const [dash, setDash] = useState(null);
  const [orders, setOrders] = useState([]);
  useEffect(() => {
    api.get('/dashboard/production').then(setDash).catch(() => {});
    api.get('/production').then(setOrders).catch(() => setOrders([]));
  }, []);
  return (
    <div>
      <div className="page-head"><div><p className="eyebrow">{mode === 'planning' ? 'PPC' : 'Manufacturing'}</p><h2>{mode === 'planning' ? 'PPC / Planning' : 'Production'}</h2><p>{mode === 'planning' ? 'Production planning, work orders and schedules from live project operations.' : 'Operations, completed quantity and bottlenecks on the same project record.'}</p></div></div>
      {dash && (
        <div className="kpi-grid">
          <KpiCard label="Production projects" value={dash.kpis.productionProjects} />
          <KpiCard label="Delayed operations" value={dash.kpis.delayed} tone="danger" />
          <KpiCard label="Rework" value={dash.kpis.rework} tone="warn" />
          <KpiCard label="Completed" value={dash.kpis.completed} tone="ok" />
        </div>
      )}
      <div className="card">
        <h3>Open operations</h3>
        {(dash?.today || []).map((op) => (
          <div className="check-row" key={op.id}>
            <div>
              <strong>{op.name}</strong>
              <p>{op.productionOrder?.project?.projectId}</p>
            </div>
            <StatusBadge code={op.statusCode} />
          </div>
        ))}
        {!dash?.today?.length && <div className="empty">No open production operations.</div>}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>{mode === 'planning' ? 'Work orders' : 'Production orders'}</h3>
        {orders.map((o) => {
          const done = (o.operations || []).filter((op) => op.statusCode === 'COMPLETED').length;
          const total = (o.operations || []).length || 1;
          return (
            <div className="check-row" key={o.id}>
              <div>
                <strong>{o.productionId}</strong>
                <p>{o.project?.projectId} · {done}/{total} operations complete</p>
              </div>
              <StatusBadge code={o.statusCode} />
            </div>
          );
        })}
        {!orders.length && <div className="empty">No production orders yet. They are created from a project.</div>}
      </div>
    </div>
  );
}
