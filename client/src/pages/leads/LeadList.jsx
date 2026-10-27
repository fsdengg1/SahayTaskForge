import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useLookups } from '../../hooks/useLookups';
import { fmtDate, labelOf } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import DataTable from '../../components/DataTable';
import { useAuth } from '../../context/AuthContext';
import { LEAD_STATUSES, LocationValue, leadStatusLabel, outputRequiredDisplay, productGroupLabel, trackStatusLabel } from './leadFields';
import PendingList from './PendingList';

function dashboardQuery(params) {
  const next = new URLSearchParams(params);
  next.delete('returnTo');
  next.delete('page');
  return next.toString();
}

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

  const pendingView = q.view === 'pending' || q.status === 'PENDING';

  function load() {
    const query = new URLSearchParams(params);
    if (!query.get('pageSize')) query.set('pageSize', '100');
    if (pendingView) {
      query.delete('status');
      query.set('view', 'pending');
      query.set('pageSize', '100');
      query.set('sort', 'leadDate');
      query.set('dir', 'asc');
    }
    api.get(`/leads?${query.toString()}`).then(setData).catch((e) => setError(e.message));
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
    if (key === 'status' && value === 'PENDING') {
      next.delete('status');
      next.set('view', 'pending');
      next.set('page', '1');
      setParams(next);
      return;
    }
    if (key === 'status') next.delete('view');
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.set('page', '1');
    setParams(next);
  }

  function closePending() {
    const next = new URLSearchParams(params);
    next.delete('view');
    next.delete('status');
    next.set('page', '1');
    setParams(next);
  }

  return (
    <div className="leads-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Sales & Pre-Sales</p>
          <h2>{pendingView ? 'Pending List' : 'Leads'}</h2>
          <p>{pendingView ? `${data.total} open enquiries · drawing and layout status` : `${data.total} records · output submission tracking`}</p>
        </div>
        <span className="btn-row">
          {pendingView && <button className="btn ghost" type="button" onClick={closePending}>All leads</button>}
          {q.returnTo === 'lead-dashboard' && (
            <Link className="btn ghost" to={`/lead-dashboard?${dashboardQuery(params)}`}>Back to Lead Dashboard</Link>
          )}
          {has('leads.create') && <Link className="btn copper" to="/leads/new">+ Create Lead</Link>}
        </span>
      </div>
      <div className="filters leads-filters">
        <input placeholder="Search" defaultValue={q.q} onBlur={(e) => set('q', e.target.value)} />
        <select value={q.outputRequired || ''} onChange={(e) => set('outputRequired', e.target.value)}>
          <option value="">All outputs</option>
          {(lookups.OUTPUT_REQUIRED || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <select value={q.outputStatus || ''} onChange={(e) => set('outputStatus', e.target.value)}>
          <option value="">All</option>
          {(lookups.OUTPUT_SUBMISSION_STATUS || []).map((s) => <option key={s.code} value={s.code}>{trackStatusLabel(s.code, lookups)}</option>)}
        </select>
        <select value={pendingView ? 'PENDING' : (q.status || '')} onChange={(e) => set('status', e.target.value)}>
          <option value="">All statuses</option>
          {(data.statuses?.length ? data.statuses : LEAD_STATUSES).map((s) => <option key={s.code} value={s.code}>{leadStatusLabel(s.code, lookups) || s.label}</option>)}
        </select>
        <select value={q.location || ''} onChange={(e) => set('location', e.target.value)}>
          <option value="">All locations</option>
          {(data.locations || []).map((loc) => <option key={loc.code} value={loc.code}>{loc.label}</option>)}
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
      {pendingView ? (
        <PendingList rows={data.items} lookups={lookups} page={data.page} pageSize={data.pageSize || 100} />
      ) : (
      <DataTable
        fit
        rows={data.items}
        empty="No leads found."
        columns={[
          { key: 'leadId', label: 'Lead ID', width: '10%', cellClass: 'is-clip', title: (r) => r.leadId, render: (r) => <Link className="cell-clip" to={`/leads/${r.id}`}>{r.leadId}</Link> },
          { key: 'customer', label: 'Company Name', width: '10%', wrap: true, cellClass: 'is-clamp', title: (r) => r.customer?.companyName, render: (r) => <span className="cell-clamp">{r.customer?.companyName || '—'}</span> },
          { key: 'location', label: 'Location', width: '10%', wrap: true, cellClass: 'is-clamp', title: (r) => (r.locationPending || !r.location ? 'Location Pending' : r.location), render: (r) => (
            r.locationPending || !r.location || r.location === 'Location Pending'
              ? <LocationValue pending label={r.location} />
              : <span className="cell-clamp">{r.location}</span>
          ) },
          { key: 'productGroup', label: 'Product Group', width: '13%', wrap: true, cellClass: 'is-product', title: (r) => productGroupLabel(r.productGroup, lookups), render: (r) => <span className="cell-product">{productGroupLabel(r.productGroup, lookups)}</span> },
          { key: 'output', label: 'Output', width: '12%', wrap: true, cellClass: 'is-output', title: (r) => outputRequiredDisplay(r, lookups), render: (r) => <span className="cell-output">{outputRequiredDisplay(r, lookups)}</span> },
          { key: 'sales', label: 'Sales Person', width: '9%', cellClass: 'is-clip', title: (r) => r.salesPerson?.fullName || '—', render: (r) => <span className="cell-clip">{r.salesPerson?.fullName || '—'}</span> },
          { key: 'priority', label: 'Priority', width: '7%', render: (r) => <StatusBadge code={r.priorityCode} label={labelOf(lookups, 'PRIORITY', r.priorityCode)} /> },
          { key: 'status', label: 'Status', width: '7%', render: (r) => (
            r.statusCode === 'PENDING'
              ? <button className="badge-btn" type="button" onClick={() => set('status', 'PENDING')} aria-label="Open pending list"><StatusBadge code={r.statusCode} label={leadStatusLabel(r.statusCode, lookups)} /></button>
              : <StatusBadge code={r.statusCode} label={leadStatusLabel(r.statusCode, lookups)} />
          ) },
          { key: 'deadline', label: 'Deadline', width: '7%', cellClass: 'is-clip', title: (r) => fmtDate(r.submissionDeadline), render: (r) => <span className="cell-clip">{fmtDate(r.submissionDeadline)}</span> },
          { key: 'outputStatus', label: 'Track', width: '8%', title: (r) => r.outputStatusLabel, render: (r) => <StatusBadge code={r.outputStatus} label={r.outputStatusLabel} /> },
          { key: 'act', label: 'Actions', width: '7%', align: 'right', cellClass: 'is-actions', render: (r) => (
            <span className="table-actions">
              <button className="linkish" type="button" onClick={() => navigate(`/leads/${r.id}`)}>View</button>
              {has('leads.edit') && <button className="linkish" type="button" onClick={() => navigate(`/leads/${r.id}/edit`)}>Edit</button>}
            </span>
          ) },
        ]}
      />
      )}
      <div className="btn-row pager">
        <button className="btn secondary" type="button" disabled={data.page <= 1} onClick={() => set('page', String(data.page - 1))}>Previous</button>
        <span>Page {data.page} of {data.pageCount || 1}</span>
        <button className="btn secondary" type="button" disabled={data.page >= (data.pageCount || 1)} onClick={() => set('page', String(data.page + 1))}>Next</button>
      </div>
    </div>
  );
}
