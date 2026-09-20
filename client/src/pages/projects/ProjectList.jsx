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
    api.get(`/projects?${params.toString()}`).then(setData).catch(() => setData({ items: [] }));
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
          <p className="eyebrow">Project Execution</p>
          <h2>Projects</h2>
          <p>Confirmed orders in execution</p>
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
        columns={[
          { key: 'projectId', label: 'Project ID', render: (r) => <Link to={`/projects/${r.id}`}>{r.projectId}</Link> },
          { key: 'name', label: 'Project Name' },
          { key: 'customer', label: 'Customer', render: (r) => r.customer?.companyName },
          { key: 'stage', label: 'Stage', render: (r) => labelOf(lookups, 'PROJECT_STAGE', r.currentStageCode) },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.currentStatusCode} label={labelOf(lookups, 'PROJECT_STATUS', r.currentStatusCode)} /> },
          { key: 'progress', label: 'Progress', render: (r) => <ProgressBar value={r.progressPercent} /> },
          { key: 'pm', label: 'Project Manager', render: (r) => r.projectManager?.fullName || '—' },
          { key: 'ecd', label: 'Expected Completion', render: (r) => fmtDate(r.expectedCompletion) },
          { key: 'delay', label: 'Delay', render: (r) => r.delayDays ? `${r.delayDays} days` : '—' },
        ]}
      />
    </div>
  );
}
