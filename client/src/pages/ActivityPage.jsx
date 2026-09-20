import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { fmtDateTime } from '../utils/format';

export default function ActivityPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ q: '', entity: '', from: '', to: '' });

  useEffect(() => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) q.set(k, v); });
    api.get(`/activity?${q.toString()}`).then(setRows).catch(() => setRows([]));
  }, [filters]);

  function href(a) {
    if (a.entity === 'Project') return `/projects/${a.entityId}`;
    if (a.entity === 'Lead') return `/leads/${a.entityId}`;
    if (a.entity === 'Task') return '/tasks';
    return '/projects';
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Information</p>
          <h2>Activity History</h2>
          <p>Date, project, department, user and action across the organization.</p>
        </div>
      </div>
      <div className="filters">
        <input placeholder="Search action or description" defaultValue={filters.q} onBlur={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
        <select value={filters.entity} onChange={(e) => setFilters((f) => ({ ...f, entity: e.target.value }))}>
          <option value="">All entities</option>
          <option value="Lead">Lead</option>
          <option value="Project">Project</option>
          <option value="Task">Task</option>
          <option value="Invoice">Invoice</option>
        </select>
        <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
        <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
      </div>
      <div className="card">
        <div className="timeline">
          {rows.map((a) => (
            <div className="tl-item" key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(href(a))}>
              <strong>{fmtDateTime(a.timestamp)} — {a.action.replaceAll('_', ' ')}</strong>
              <p>{a.description}</p>
              <small>{a.user?.fullName || 'System'} · {a.user?.department?.name || a.entity} · {a.entity}</small>
            </div>
          ))}
          {!rows.length && <div className="empty">No activity recorded.</div>}
        </div>
      </div>
    </div>
  );
}
