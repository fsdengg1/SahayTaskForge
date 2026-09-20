import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
      setRows(items.filter((p) => String(p.currentStageCode || '').includes(filters.department) || String(p.currentStageCode || '') === filters.department));
    }).catch(() => setRows([]));
  }, [filters]);

  function set(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Project Timeline</h2>
          <p>Start, expected completion, stage and progress across the same project portfolio.</p>
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
          <option value="DESIGN">Design</option>
          <option value="PROCUREMENT">Procurement</option>
          <option value="PRODUCTION">Production</option>
          <option value="QUALITY">Quality</option>
          <option value="DISPATCH">Logistics</option>
          <option value="INSTALL">Installation</option>
          <option value="HANDOVER">Handover</option>
          <option value="INVOICE">Finance</option>
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
        {rows.map((p) => (
          <div className="gantt-row" key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
            <div style={{ minWidth: 160 }}>
              <strong>{p.projectId}</strong>
              <p>{p.customer?.companyName}</p>
            </div>
            <div className="gantt-track">
              <i style={{ width: `${Math.max(8, p.progressPercent || 0)}%`, background: p.delayDays ? 'var(--red)' : 'var(--steel)' }} />
            </div>
            <div style={{ minWidth: 220 }}>
              <StatusBadge code={p.currentStatusCode} label={labelOf(lookups, 'PROJECT_STATUS', p.currentStatusCode)} />
              <p>{labelOf(lookups, 'PROJECT_STAGE', p.currentStageCode)}</p>
              <ProgressBar value={p.progressPercent} />
              <small>{fmtDate(p.startDate)} → {fmtDate(p.expectedCompletion)}</small>
            </div>
          </div>
        ))}
        {!rows.length && <div className="empty">No projects match these filters.</div>}
      </div>
    </div>
  );
}
