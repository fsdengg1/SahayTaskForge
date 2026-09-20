import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useLookups } from '../../hooks/useLookups';
import { fmtDate, labelOf } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import DataTable from '../../components/DataTable';
import { useAuth } from '../../context/AuthContext';

export default function LeadList() {
  const lookups = useLookups();
  const { has } = useAuth();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState({ items: [], total: 0, page: 1 });
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [error, setError] = useState('');
  const q = Object.fromEntries(params.entries());

  function load() {
    api.get(`/leads?${params.toString()}`).then(setData).catch((e) => setError(e.message));
  }

  useEffect(() => {
    api.get('/customers?pageSize=100').then((d) => setCustomers(d.items || [])).catch(() => {});
    api.get('/users?sales=true').then(setSales).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [params]);

  function set(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.set('page', '1');
    setParams(next);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Sales & Pre-Sales</p>
          <h2>Leads</h2>
          <p>{data.total} records · output submission tracking</p>
        </div>
        {has('leads.create') && <Link className="btn copper" to="/leads/new">+ Create Lead</Link>}
      </div>
      <div className="filters">
        <input placeholder="Search" defaultValue={q.q} onBlur={(e) => set('q', e.target.value)} />
        <select value={q.outputRequired || ''} onChange={(e) => set('outputRequired', e.target.value)}>
          <option value="">All outputs</option>
          {(lookups.OUTPUT_REQUIRED || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <select value={q.outputStatus || ''} onChange={(e) => set('outputStatus', e.target.value)}>
          <option value="">All</option>
          {(lookups.OUTPUT_SUBMISSION_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <select value={q.status || ''} onChange={(e) => set('status', e.target.value)}>
          <option value="">All statuses</option>
          {(lookups.LEAD_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          {['APPROVED', 'SUBMITTED', 'FOLLOW_UP'].filter((code) => !(lookups.LEAD_STATUS || []).some((s) => s.code === code)).map((code) => (
            <option key={code} value={code}>{code.replaceAll('_', ' ')}</option>
          ))}
        </select>
        <select value={q.archived || ''} onChange={(e) => set('archived', e.target.value)}>
          <option value="">Active</option>
          <option value="true">Archived</option>
          <option value="all">All</option>
        </select>
        <select value={q.salesPersonId || ''} onChange={(e) => set('salesPersonId', e.target.value)}>
          <option value="">All sales persons</option>
          {sales.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
        <select value={q.customerId || ''} onChange={(e) => set('customerId', e.target.value)}>
          <option value="">All customers</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
        </select>
        <input type="date" title="Created date" value={q.createdDate || ''} onChange={(e) => set('createdDate', e.target.value)} />
        <input type="date" title="Deadline date" value={q.deadlineDate || ''} onChange={(e) => set('deadlineDate', e.target.value)} />
      </div>
      {error && <div className="notice err">{error}</div>}
      <DataTable
        rows={data.items}
        empty="No leads found."
        columns={[
          { key: 'leadId', label: 'Lead ID', render: (r) => <Link to={`/leads/${r.id}`}>{r.leadId}</Link> },
          { key: 'customer', label: 'Customer', render: (r) => r.customer?.companyName },
          { key: 'output', label: 'Output Required', render: (r) => r.outputRequiredLabel || labelOf(lookups, 'OUTPUT_REQUIRED', r.outputRequired) },
          { key: 'sales', label: 'Sales Person', render: (r) => r.salesPerson?.fullName || '—' },
          { key: 'priority', label: 'Priority', render: (r) => <StatusBadge code={r.priorityCode} label={labelOf(lookups, 'PRIORITY', r.priorityCode)} /> },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.statusCode} label={labelOf(lookups, 'LEAD_STATUS', r.statusCode)} /> },
          { key: 'deadline', label: 'Submission Deadline', render: (r) => fmtDate(r.submissionDeadline) },
          { key: 'outputStatus', label: 'Deadline Status', render: (r) => <StatusBadge code={r.outputStatus} label={r.outputStatusLabel} /> },
          { key: 'eod', label: 'Expected Order Date', render: (r) => fmtDate(r.expectedOrderDate) },
          { key: 'created', label: 'Created', render: (r) => fmtDate(r.createdAt) },
          { key: 'act', label: 'Actions', render: (r) => (
            <span className="btn-row">
              <button className="btn ghost" type="button" onClick={() => navigate(`/leads/${r.id}`)}>View</button>
              {has('leads.edit') && <button className="btn ghost" type="button" onClick={() => navigate(`/leads/${r.id}/edit`)}>Edit</button>}
            </span>
          ) },
        ]}
      />
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn secondary" type="button" disabled={data.page <= 1} onClick={() => set('page', String(data.page - 1))}>Previous</button>
        <span>Page {data.page} of {data.pageCount || 1}</span>
        <button className="btn secondary" type="button" disabled={data.page >= (data.pageCount || 1)} onClick={() => set('page', String(data.page + 1))}>Next</button>
      </div>
    </div>
  );
}
