import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useLookups } from '../../hooks/useLookups';
import { fmtDate, labelOf } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import ProgressBar from '../../components/ProgressBar';
import DataTable from '../../components/DataTable';

export default function ProjectList() {
  const lookups = useLookups();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({ items: [] });
  const q = Object.fromEntries(params.entries());

  useEffect(() => {
    const query = new URLSearchParams(params);
    if (!query.get('pageSize')) query.set('pageSize', '100');
    api.get(`/projects?${query.toString()}`).then(setData).catch(() => setData({ items: [] }));
  }, [params]);

  function set(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Executive</p>
          <h2>Projects</h2>
          <p>Projects linked from existing leads</p>
        </div>
      </div>
      <div className="chips" style={{ marginBottom: 12 }}>
        {[
          ['', 'All Projects'],
          ['active', 'Active'],
          ['delayed', 'Delayed'],
          ['BLOCKED', 'Blocked'],
          ['ON_HOLD', 'On Hold'],
          ['COMPLETED', 'Completed'],
        ].map(([value, label]) => {
          const on = value === 'delayed' ? q.delayed === 'true' : value === 'active' ? q.bucket === 'active' : q.status === value && !q.delayed && !q.bucket;
          const all = !value && !q.status && !q.delayed && !q.bucket;
          return (
            <button
              key={label}
              className={`chip ${all || on ? 'on' : ''}`}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete('status');
                next.delete('delayed');
                next.delete('bucket');
                if (value === 'delayed') next.set('delayed', 'true');
                else if (value === 'active') next.set('bucket', 'active');
                else if (value) next.set('status', value);
                setParams(next);
              }}
            >{label}</button>
          );
        })}
      </div>
      <div className="filters">
        <input placeholder="Search" defaultValue={q.q} onBlur={(e) => set('q', e.target.value)} />
        <select value={q.stage || ''} onChange={(e) => set('stage', e.target.value)}>
          <option value="">All stages</option>
          {(lookups.PROJECT_STAGE || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <select value={q.status || ''} onChange={(e) => set('status', e.target.value)}>
          <option value="">All statuses</option>
          {(lookups.PROJECT_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <select value={q.delayed || ''} onChange={(e) => set('delayed', e.target.value)}>
          <option value="">Delay</option>
          <option value="true">Delayed only</option>
        </select>
      </div>
      <DataTable
        rows={data.items}
        empty={<span>No projects available. <Link to="/leads">Convert Lead to Project</Link></span>}
        columns={[
          { key: 'projectId', label: 'Project ID', render: (r) => <Link to={`/projects/${r.id}`}>{r.projectId}</Link> },
          { key: 'name', label: 'Project Name' },
          { key: 'customer', label: 'Customer', render: (r) => r.customer?.companyName || '—' },
          { key: 'sales', label: 'Sales Person', render: (r) => r.salesPerson?.fullName || '—' },
          { key: 'product', label: 'Product Group', render: (r) => r.productGroup || r.productCategory || '—' },
          { key: 'location', label: 'Location', render: (r) => r.location || r.site?.address || '—' },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.currentStatusCode} label={r.statusLabel || labelOf(lookups, 'PROJECT_STATUS', r.currentStatusCode)} /> },
          { key: 'start', label: 'Start Date', render: (r) => fmtDate(r.startDate) },
          { key: 'deadline', label: 'Deadline', render: (r) => fmtDate(r.expectedCompletion) },
          { key: 'progress', label: 'Progress', render: (r) => <ProgressBar value={r.progressPercent} /> },
        ]}
      />
    </div>
  );
}
