import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useLookups } from '../../hooks/useLookups';
import { fmtDate, fmtDateTime, statusTone } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import DataTable from '../../components/DataTable';
import { LEAD_STATUSES, leadStatusLabel, trackStatusLabel } from './leadFields';

const TONE_COLOR = {
  green: 'var(--success)',
  blue: 'var(--primary)',
  yellow: 'var(--warning)',
  orange: 'var(--accent)',
  red: 'var(--danger)',
  brown: 'var(--sahay-brown)',
  black: 'var(--ink)',
  grey: 'var(--muted)',
};

const TRACK_TONE = {
  ON_TIME: 'green',
  COMPLETED: 'green',
  DELAYED: 'brown',
  DELAYED_1_3: 'brown',
  DELAYED_OVER_3: 'black',
  OVERDUE: 'red',
  ON_HOLD: 'yellow',
};

const DEADLINE_LABELS = {
  ON_TIME: 'On Time',
  OVERDUE: 'Overdue',
  DELAYED: 'Delayed',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
};

const OUTPUT_CODES = ['BOM_DRAWINGS', 'BOM', 'DRAWING'];

function chartTone(code) {
  if (code === 'NEW' || code === 'LOW') return 'blue';
  if (code === 'DELAYED') return 'brown';
  if (code === 'PENDING') return 'orange';
  if (TRACK_TONE[code]) return TRACK_TONE[code];
  return statusTone(code);
}

function barColor(item) {
  if (item.tone && TONE_COLOR[item.tone]) return TONE_COLOR[item.tone];
  if (item.code) return TONE_COLOR[chartTone(item.code)] || 'var(--primary)';
  return 'var(--primary)';
}

function outputOptionLabel(item) {
  if (item.code === 'BOM_DRAWINGS') return 'Drawings + BOM';
  if (item.code === 'BOM') return 'Only BOM';
  if (item.code === 'DRAWING') return 'Only Drawings';
  return item.label;
}

function lookupLabel(lookups, type, code, fallback) {
  const row = (lookups[type] || []).find((item) => item.code === code);
  return row?.label || fallback || code;
}

function leadsHref(params) {
  const next = new URLSearchParams();
  ['q', 'outputRequired', 'status', 'location', 'archived', 'salesPersonId', 'customerId', 'customerName', 'from', 'to', 'priority'].forEach((key) => {
    if (params.get(key)) next.set(key, params.get(key));
  });
  const track = params.get('outputStatus');
  if (track && track !== 'DELAYED') next.set('outputStatus', track);
  next.set('returnTo', 'lead-dashboard');
  return `/leads?${next.toString()}`;
}

function trackRowClass(row) {
  if (row.track === 'OVERDUE') return 'ld-overdue';
  if (row.dueToday) return 'ld-due-today';
  if (row.track === 'DELAYED_1_3' || row.track === 'DELAYED_OVER_3') return 'ld-delayed';
  if (row.track === 'ON_HOLD') return 'ld-hold';
  if (row.track === 'ON_TIME') return 'ld-ontime';
  if (row.track === 'COMPLETED') return 'ld-done';
  return undefined;
}

function fillCounts(items, codes, labelFor) {
  const byCode = new Map((items || []).map((item) => [item.code, item]));
  const ordered = codes.map((code) => {
    const current = byCode.get(code);
    return current ? { ...current, label: labelFor(current) } : { code, label: labelFor({ code, label: code }), count: 0 };
  });
  const extras = (items || []).filter((item) => !codes.includes(item.code) && item.count > 0);
  return [...ordered, ...extras];
}

function Metric({ label, value, hint, tone, active, onClick }) {
  return (
    <button type="button" className={`ld-metric ${tone || ''} ${active ? 'is-on' : ''}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
      <em>{hint}</em>
    </button>
  );
}

function HBars({ title, items, activeKey, onSelect, aside }) {
  const rows = items || [];
  return (
    <section className="card ld-card">
      <div className="ld-card-head">
        <h3>{title}</h3>
        {aside}
      </div>
      {!rows.length ? <div className="empty">No data available</div> : (
        <div className="ld-hbars">
          {rows.map((item) => {
            const key = item.key || item.code;
            const max = Math.max(...rows.map((row) => row.count), 1);
            return (
              <button
                key={key}
                type="button"
                className={`ld-hbar ${activeKey === key ? 'is-on' : ''}`}
                onClick={() => onSelect(item)}
                aria-label={`${item.label}, ${item.count} leads`}
              >
                <span className="ld-hbar-name" title={item.label}>{item.label}</span>
                <span className="ld-hbar-track">
                  <i style={{ width: item.count ? `${Math.max(4, (item.count / max) * 100)}%` : '0%', background: barColor(item) }} />
                </span>
                <strong>{item.count}</strong>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function LeadDashboard() {
  const lookups = useLookups();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [search, setSearch] = useState(params.get('q') || '');
  const [showAllCustomers, setShowAllCustomers] = useState(false);
  const q = Object.fromEntries(params.entries());

  function load() {
    api.get(`/leads/dashboard?${params.toString()}`)
      .then((next) => {
        setData(next);
        setError('');
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    api.get('/customers?pageSize=100').then((rows) => setCustomers(rows.items || [])).catch(() => {});
    api.get('/users?sales=true').then(setSales).catch(() => {});
  }, []);

  useEffect(() => {
    setSearch(params.get('q') || '');
    load();
    const timer = setInterval(load, 30000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [params]);

  function set(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  function toggle(key, value, { scroll = false } = {}) {
    const next = new URLSearchParams(params);
    if (params.get(key) === value) next.delete(key);
    else next.set(key, value);
    if (key === 'outputStatus') {
      next.delete('scope');
      next.delete('status');
    }
    if (key === 'scope') {
      next.delete('outputStatus');
      next.delete('status');
    }
    if (key === 'status') {
      next.delete('scope');
      next.delete('outputStatus');
    }
    if (key === 'customerId') next.delete('customerName');
    if (key === 'customerName') next.delete('customerId');
    setParams(next);
    if (scroll) {
      window.setTimeout(() => {
        document.getElementById('upcoming-deadlines')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }

  function reset() {
    setShowAllCustomers(false);
    setParams(new URLSearchParams());
  }

  const filtersOn = [...params.keys()].length > 0;
  const statusItems = (data?.statusDistribution || []).map((item) => ({
    ...item,
    label: leadStatusLabel(item.code, lookups) || item.label,
  }));
  const outputItems = fillCounts(data?.outputDistribution, OUTPUT_CODES, outputOptionLabel)
    .map((item) => ({ ...item, tone: 'blue' }));
  const deadlineItems = fillCounts(data?.deadlineDistribution, ['ON_TIME', 'OVERDUE', 'DELAYED'], (item) => (
    DEADLINE_LABELS[item.code] || item.label
  ));
  const priorityItems = fillCounts(data?.priorityDistribution, ['HIGH', 'MEDIUM', 'LOW'], (item) => (
    lookupLabel(lookups, 'PRIORITY', item.code, item.label)
  ));
  const salesItems = (data?.salesPersonDistribution || []).map((item) => ({
    ...item,
    key: item.id || 'unassigned',
  }));
  const customerItems = (data?.customerDistribution || []).map((item) => ({
    ...item,
    key: item.customerId ? `id:${item.customerId}` : `name:${item.customerName.toLowerCase()}`,
    tone: 'blue',
  }));
  const visibleCustomers = showAllCustomers ? customerItems : customerItems.slice(0, 10);
  const typeOptions = [];
  const seenTypes = new Set();
  for (const item of [...(lookups.REQUIREMENT_TYPE || []), ...(data?.leadTypes || [])]) {
    const code = String(item.code || '').toUpperCase();
    if (!code || seenTypes.has(code)) continue;
    seenTypes.add(code);
    typeOptions.push({ code, label: item.label });
  }
  const statusOptions = data?.statusOptions?.length ? data.statusOptions : LEAD_STATUSES;
  const customerKey = q.customerId ? `id:${q.customerId}` : (q.customerName ? `name:${q.customerName.toLowerCase()}` : '');
  const noLeads = data && data.totalLeads === 0 && !filtersOn;
  const noMatch = data && data.matchedCount === 0;

  return (
    <div className="ld-page leads-page">
      <div className="page-head ld-head">
        <div>
          <h2>Lead Dashboard</h2>
          <p>Sales & Pre-Sales — Lead overview and performance tracking</p>
        </div>
        <Link className="btn ghost sm" to={leadsHref(params)}>View Leads</Link>
      </div>

      <div className="filters ld-filters">
        <div className="ld-filter-row primary">
          <input
            placeholder="Search"
            aria-label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => set('q', search.trim())}
            onKeyDown={(e) => { if (e.key === 'Enter') set('q', search.trim()); }}
          />
          <select value={q.status || ''} onChange={(e) => {
            if (e.target.value === 'PENDING') {
              navigate('/leads?view=pending&returnTo=lead-dashboard');
              return;
            }
            set('status', e.target.value);
          }} aria-label="Status">
            <option value="">Status</option>
            {statusOptions.map((item) => <option key={item.code} value={item.code}>{leadStatusLabel(item.code, lookups) || item.label}</option>)}
          </select>
          <select value={q.outputRequired || ''} onChange={(e) => set('outputRequired', e.target.value)} aria-label="Output">
            <option value="">Output</option>
            {(lookups.OUTPUT_REQUIRED || []).map((item) => <option key={item.code} value={item.code}>{outputOptionLabel(item)}</option>)}
            <option value="__none">Not specified</option>
          </select>
          <select value={q.leadType || ''} onChange={(e) => set('leadType', e.target.value)} aria-label="Lead type">
            <option value="">Lead Type</option>
            {typeOptions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
          <select value={q.salesPersonId || ''} onChange={(e) => set('salesPersonId', e.target.value)} aria-label="Sales person">
            <option value="">Sales Person</option>
            {sales.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}
            <option value="unassigned">Unassigned</option>
          </select>
        </div>
        <div className="ld-filter-row secondary">
          <select value={q.customerId || ''} onChange={(e) => {
            const next = new URLSearchParams(params);
            next.delete('customerName');
            if (e.target.value) next.set('customerId', e.target.value);
            else next.delete('customerId');
            setParams(next);
          }} aria-label="Customer">
            <option value="">Customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName}</option>)}
          </select>
          <select value={q.location || ''} onChange={(e) => set('location', e.target.value)} aria-label="Location">
            <option value="">Location</option>
            {(data?.locations || []).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
          <input type="date" title="From date" aria-label="From date" value={q.from || ''} onChange={(e) => set('from', e.target.value)} />
          <input type="date" title="To date" aria-label="To date" value={q.to || ''} onChange={(e) => set('to', e.target.value)} />
          <select value={q.archived || ''} onChange={(e) => set('archived', e.target.value)} aria-label="Lead activity">
            <option value="">Active</option>
            <option value="true">Archived</option>
            <option value="all">All</option>
          </select>
          <button className="btn ghost sm ld-reset" type="button" onClick={reset} disabled={!filtersOn}>Reset Filters</button>
        </div>
      </div>

      {filtersOn && (
        <div className="ld-chips">
          {q.priority && <button type="button" className="ld-chip" onClick={() => set('priority', '')}>Priority: {lookupLabel(lookups, 'PRIORITY', q.priority, q.priority)}</button>}
          {q.outputStatus && <button type="button" className="ld-chip" onClick={() => set('outputStatus', '')}>Track: {q.outputStatus === 'DELAYED' ? 'Delayed' : (DEADLINE_LABELS[q.outputStatus] || trackStatusLabel(q.outputStatus, lookups))}</button>}
          {q.feedback && <button type="button" className="ld-chip" onClick={() => set('feedback', '')}>Feedback: {(data?.feedbackDistribution || []).find((item) => item.code === q.feedback)?.label || q.feedback}</button>}
          {q.scope === 'active' && <button type="button" className="ld-chip" onClick={() => set('scope', '')}>Active leads</button>}
          {q.scope === 'pending' && <button type="button" className="ld-chip" onClick={() => set('scope', '')}>Pending / Follow-up</button>}
          {q.scope === 'delayed' && <button type="button" className="ld-chip" onClick={() => set('scope', '')}>Overdue</button>}
          {q.scope === 'hold' && <button type="button" className="ld-chip" onClick={() => set('scope', '')}>On Hold</button>}
          {q.location && <button type="button" className="ld-chip" onClick={() => set('location', '')}>Location: {(data?.locations || []).find((item) => item.code === q.location)?.label || q.location}</button>}
          {q.customerName && <button type="button" className="ld-chip" onClick={() => set('customerName', '')}>Customer: {q.customerName}</button>}
        </div>
      )}

      {error && <div className="notice err">{error}</div>}
      {!data && !error && <div className="loading">Loading…</div>}

      {data && (
        <>
          <div className="ld-kpi-block">
            <div className="ld-kpis">
              <Metric label="Total Leads" value={data.totalLeads} hint="All records" onClick={() => {
                const next = new URLSearchParams(params);
                next.delete('scope');
                next.delete('status');
                next.delete('outputStatus');
                setParams(next);
              }} />
              <Metric label="Active Leads" value={data.activeLeads} hint="Still open" active={q.scope === 'active'} onClick={() => toggle('scope', 'active')} />
              <Metric label="Completed" value={data.completedLeads} hint="Finished" tone="ok" active={q.status === 'COMPLETED'} onClick={() => toggle('status', 'COMPLETED')} />
              <Metric label="In Progress" value={data.liveLeads} hint="Live" active={q.status === 'IN_PROGRESS'} onClick={() => toggle('status', 'IN_PROGRESS')} />
              <Metric label="Pending / Follow-up" value={data.pendingLeads} hint="Needs action" tone="warn" active={q.scope === 'pending'} onClick={() => toggle('scope', 'pending')} />
              <Metric label="Overdue" value={data.delayedLeads} hint="Past deadline" tone="danger" active={q.scope === 'delayed'} onClick={() => toggle('scope', 'delayed')} />
            </div>
            <button type="button" className={`ld-secondary ${q.scope === 'hold' ? 'is-on' : ''}`} onClick={() => toggle('scope', 'hold')}>
              On hold <strong>{data.onHoldLeads ?? 0}</strong>
            </button>
          </div>

          {noMatch ? (
            <div className="card ld-empty">
              <div className="empty">{noLeads ? 'No leads available' : 'No leads match the selected filters.'}</div>
              {noLeads && <Link className="btn sm" to="/leads/new">Create Lead</Link>}
            </div>
          ) : (
            <>
              <div className="ld-grid">
                <HBars title="Leads by Status" items={statusItems} activeKey={q.status || ''} onSelect={(item) => {
                  if (item.code === 'PENDING') {
                    navigate('/leads?view=pending&returnTo=lead-dashboard');
                    return;
                  }
                  toggle('status', item.code, { scroll: true });
                }} />
                <HBars title="Leads by Output Requirement" items={outputItems} activeKey={q.outputRequired || ''} onSelect={(item) => toggle('outputRequired', item.code)} />
              </div>
              <div className="ld-grid">
                <HBars
                  title="Lead Deadline Tracking"
                  items={deadlineItems}
                  activeKey={q.outputStatus || ''}
                  onSelect={(item) => toggle('outputStatus', item.code)}
                />
                <HBars title="Lead Priority" items={priorityItems} activeKey={q.priority || ''} onSelect={(item) => toggle('priority', item.code)} />
              </div>
              <div className="ld-grid">
                <section className="card ld-card">
                  <div className="ld-card-head"><h3>Sales Person Workload</h3></div>
                  {!salesItems.length ? <div className="empty">No data available</div> : (
                    <div className="ld-work">
                      <div className="ld-work-head">
                        <span>Sales Person</span>
                        <span>Active</span>
                        <span>Completed</span>
                        <span>Pending</span>
                      </div>
                      {salesItems.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className={`ld-work-row ${q.salesPersonId === (item.id || 'unassigned') ? 'is-on' : ''}`}
                          onClick={() => toggle('salesPersonId', item.id || 'unassigned')}
                        >
                          <span title={item.label}>{item.label}</span>
                          <b>{item.active ?? 0}</b>
                          <b>{item.completed ?? 0}</b>
                          <b>{item.pending ?? 0}</b>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
                <HBars
                  title="Customer Distribution"
                  items={visibleCustomers}
                  activeKey={customerKey}
                  onSelect={(item) => (item.customerId ? toggle('customerId', item.customerId) : toggle('customerName', item.customerName))}
                  aside={customerItems.length > 10 ? (
                    <button className="btn ghost sm" type="button" onClick={() => setShowAllCustomers((current) => !current)}>
                      {showAllCustomers ? 'Show top 10' : 'View all'}
                    </button>
                  ) : null}
                />
              </div>
              {((data.locationDistribution || []).length > 0 || (data.feedbackDistribution || []).length > 0) && (
                <div className="ld-grid">
                  {(data.locationDistribution || []).length > 0 && (
                    <HBars
                      title="Leads by Location"
                      items={(data.locationDistribution || []).map((item) => ({ ...item, key: item.code }))}
                      activeKey={q.location || ''}
                      onSelect={(item) => toggle('location', item.code)}
                    />
                  )}
                  {(data.feedbackDistribution || []).length > 0 && (
                    <HBars
                      title="Customer Feedback"
                      items={data.feedbackDistribution}
                      activeKey={q.feedback || ''}
                      onSelect={(item) => toggle('feedback', item.code)}
                    />
                  )}
                </div>
              )}

              <section className="card ld-card" id="upcoming-deadlines">
                <div className="ld-card-head">
                  <div>
                    <h3>Upcoming Deadlines</h3>
                    {filtersOn && <p className="ld-sub">Nearest deadlines in this selection.</p>}
                  </div>
                  <Link className="linkish" to={leadsHref(params)}>View Leads</Link>
                </div>
                <DataTable
                  fit
                  rows={data.upcomingDeadlines}
                  empty="No upcoming deadlines."
                  rowClass={trackRowClass}
                  columns={[
                    { key: 'lead', label: 'Lead / Customer', width: '28%', wrap: true, render: (row) => (
                      <span className="ld-stack">
                        <Link to={`/leads/${row.id}`}>{row.leadId}</Link>
                        <em>{row.customer}</em>
                      </span>
                    ) },
                    { key: 'output', label: 'Output', width: '16%', wrap: true },
                    { key: 'sales', label: 'Sales Person', width: '18%', wrap: true, render: (row) => row.salesPerson },
                    { key: 'deadline', label: 'Deadline', width: '18%', render: (row) => (
                      <span className="ld-deadline">
                        {fmtDate(row.deadline)}
                        {row.dueToday && <em>Due today</em>}
                      </span>
                    ) },
                    { key: 'status', label: 'Status', width: '20%', render: (row) => (
                      <span className="ld-status-pair">
                        {row.statusCode === 'PENDING'
                          ? <button className="badge-btn" type="button" onClick={() => navigate('/leads?view=pending&returnTo=lead-dashboard')} aria-label="Open pending list"><StatusBadge code={row.statusCode} label={leadStatusLabel(row.statusCode, lookups)} /></button>
                          : <StatusBadge code={row.statusCode} label={leadStatusLabel(row.statusCode, lookups)} />}
                        <StatusBadge code={row.track} label={row.trackLabel} />
                      </span>
                    ) },
                  ]}
                />
              </section>

              <section className="card ld-card">
                <div className="ld-card-head"><h3>Recent Lead Activity</h3></div>
                <DataTable
                  fit
                  rows={data.recentActivity || []}
                  empty="No recent activity"
                  columns={[
                    { key: 'lead', label: 'Lead', width: '18%', render: (row) => (
                      row.leadRecordId
                        ? <Link to={`/leads/${row.leadRecordId}`}>{row.leadCode || 'Lead'}</Link>
                        : (row.leadCode || '—')
                    ) },
                    { key: 'activity', label: 'Activity', width: '34%', wrap: true, title: (row) => row.description, render: (row) => row.label },
                    { key: 'by', label: 'Updated By', width: '22%', wrap: true, render: (row) => row.userName || '—' },
                    { key: 'date', label: 'Date', width: '26%', render: (row) => fmtDateTime(row.timestamp) },
                  ]}
                />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
