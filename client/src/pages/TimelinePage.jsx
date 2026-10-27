import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useLookups } from '../hooks/useLookups';
import { fmtDate, labelOf } from '../utils/format';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';

export default function TimelinePage() {
  const lookups = useLookups();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ customerId: '', projectManagerId: '', salesPersonId: '', department: '', stage: '', status: '', from: '', to: '' });

  useEffect(() => {
    api.get('/customers?pageSize=100').then((d) => setCustomers(d.items || [])).catch(() => {});
    api.get('/users?pageSize=100').then((d) => setUsers(d.items || d || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const q = new URLSearchParams({ pageSize: '100' });
    Object.entries(filters).forEach(([k, v]) => { if (v && k !== 'department') q.set(k, v); });
    api.get(`/projects?${q.toString()}`).then((d) => {
      const items = d.items || [];
      if (!filters.department) return setRows(items);
      setRows(items.filter((p) => p.department === filters.department || String(p.currentStageCode || '').includes(filters.department)));
    }).catch(() => setRows([]));
  }, [filters]);

  function set(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Executive</p>
          <h2>Project Timeline</h2>
          <p>Start, deadline, status, progress and milestones from the current projects.</p>
        </div>
      </div>
      <div className="filters">
        <select value={filters.customerId} onChange={(e) => set('customerId', e.target.value)}>
          <option value="">All customers</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
        </select>
        <select value={filters.projectManagerId} onChange={(e) => set('projectManagerId', e.target.value)}>
          <option value="">All project managers</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
        <select value={filters.salesPersonId} onChange={(e) => set('salesPersonId', e.target.value)}>
          <option value="">All sales persons</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
        <select value={filters.department} onChange={(e) => set('department', e.target.value)}>
          <option value="">All departments</option>
          <option value="Sales">Sales</option>
          <option value="Design & Engineering">Design & Engineering</option>
          <option value="Procurement">Procurement</option>
          <option value="Production">Production</option>
          <option value="Quality">Quality</option>
          <option value="Installation">Installation</option>
          <option value="Logistics">Logistics</option>
        </select>
        <select value={filters.stage} onChange={(e) => set('stage', e.target.value)}>
          <option value="">All stages</option>
          {(lookups.PROJECT_STAGE || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">All statuses</option>
          {(lookups.PROJECT_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
        <input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />
      </div>
      <div className="card">
        {rows.map((p) => {
          const tone = p.overall?.tone || (p.delayed ? 'red' : p.onHold ? 'yellow' : 'green');
          const track = tone === 'red' ? 'var(--danger)' : tone === 'yellow' ? 'var(--warning)' : tone === 'orange' ? 'var(--accent)' : 'var(--success)';
          return (
            <div className={`gantt-row health-${tone}`} key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
              <div style={{ minWidth: 180 }}>
                <strong>{p.projectId}</strong>
                <p>{p.name}</p>
                <p>{p.customer?.companyName}</p>
              </div>
              <div className="gantt-track">
                <i style={{ width: `${Math.max(p.progressPercent ? 8 : 0, p.progressPercent || 0)}%`, background: track }} />
              </div>
              <div style={{ minWidth: 240 }}>
                <StatusBadge code={p.overall?.code || p.currentStatusCode} label={p.overall?.label || p.statusLabel || labelOf(lookups, 'PROJECT_STATUS', p.currentStatusCode)} />
                <p>{p.stageLabel || labelOf(lookups, 'PROJECT_STAGE', p.currentStageCode)}</p>
                <ProgressBar value={p.progressPercent} />
                <small>{fmtDate(p.startDate)} → {fmtDate(p.expectedCompletion)}</small>
                {(p.milestones || []).length > 0 && (
                  <ul className="tl-milestones">
                    {p.milestones.map((item) => (
                      <li key={item.id}>{item.name} · {item.status || 'Open'} · {fmtDate(item.startDate)} – {fmtDate(item.endDate)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
        {!rows.length && (
          <div className="empty">
            No projects available. <Link to="/leads">Convert Lead to Project</Link>
          </div>
        )}
      </div>
    </div>
  );
}
