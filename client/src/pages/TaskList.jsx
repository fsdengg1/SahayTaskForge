import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { fmtDate, labelOf } from '../utils/format';
import { useLookups } from '../hooks/useLookups';
import StatusBadge from '../components/StatusBadge';
import KpiCard from '../components/KpiCard';
import DataTable from '../components/DataTable';

export default function TaskList() {
  const lookups = useLookups();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({ items: [], cards: {} });
  const [outputs, setOutputs] = useState({ items: [] });
  const bucket = params.get('bucket') || '';

  useEffect(() => {
    function load() {
      api.get(`/tasks?${params.toString()}`).then(setData).catch(() => {});
      api.get('/leads?pageSize=20&sort=submissionDeadline&dir=asc').then(setOutputs).catch(() => {});
    }
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [params]);

  function setBucket(value) {
    const next = new URLSearchParams(params);
    if (value) next.set('bucket', value); else next.delete('bucket');
    setParams(next);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Work</p>
          <h2>Tasks</h2>
          <p>Work items across departments</p>
        </div>
      </div>
      <div className="kpi-grid">
        <KpiCard label="Pending" value={data.cards?.pending} onClick={() => setBucket('')} />
        <KpiCard label="In Progress" value={data.cards?.inProgress} onClick={() => setBucket('')} />
        <KpiCard label="Overdue" value={data.cards?.overdue} tone="danger" onClick={() => setBucket('overdue')} />
        <KpiCard label="Completed" value={data.cards?.completed} tone="ok" onClick={() => setBucket('completed')} />
      </div>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        {[['mine', 'My Tasks'], ['', 'All Tasks'], ['overdue', 'Overdue'], ['today', 'Due Today'], ['week', 'Due This Week'], ['completed', 'Completed']].map(([v, l]) => (
          <button key={l} className={`chip ${bucket === v ? 'on' : ''}`} type="button" onClick={() => {
            const next = new URLSearchParams(params);
            if (v === 'mine') { next.set('scope', 'mine'); next.delete('bucket'); }
            else { next.delete('scope'); if (v) next.set('bucket', v); else next.delete('bucket'); }
            setParams(next);
          }}>{l}</button>
        ))}
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Lead output tracking</h3>
        <DataTable
          rows={outputs.items}
          columns={[
            { key: 'leadId', label: 'Lead ID', render: (r) => <Link to={`/leads/${r.id}`}>{r.leadId}</Link> },
            { key: 'customer', label: 'Customer', render: (r) => r.customer?.companyName },
            { key: 'output', label: 'Output Required', render: (r) => r.outputRequiredLabel || labelOf(lookups, 'OUTPUT_REQUIRED', r.outputRequired) },
            { key: 'deadline', label: 'Submission Deadline', render: (r) => fmtDate(r.submissionDeadline) },
            { key: 'outputStatus', label: 'Status', render: (r) => <StatusBadge code={r.outputStatus} label={r.outputStatusLabel} /> },
          ]}
        />
      </div>
      <DataTable
        rows={data.items}
        columns={[
          { key: 'taskId', label: 'Task ID' },
          { key: 'name', label: 'Task' },
          { key: 'project', label: 'Project', render: (r) => r.project?.projectId || '—' },
          { key: 'dept', label: 'Department', render: (r) => r.department?.name || r.module || '—' },
          { key: 'who', label: 'Assigned', render: (r) => r.assignedTo?.fullName || '—' },
          { key: 'due', label: 'Due', render: (r) => fmtDate(r.dueDate) },
          { key: 'delay', label: 'Delay', render: (r) => r.delayDays ? `${r.delayDays} days` : '—' },
          { key: 'blocked', label: 'Blocked by', render: (r) => r.blockedBy?.map((b) => b.name).join(', ') || '—' },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.statusCode} /> },
        ]}
      />
    </div>
  );
}
