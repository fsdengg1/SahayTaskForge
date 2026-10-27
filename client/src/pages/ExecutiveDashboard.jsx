import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useLookups } from '../hooks/useLookups';
import { labelOf } from '../utils/format';
import DonutChart from '../components/DonutChart';
import StatusBadge from '../components/StatusBadge';
import NavIcon from '../components/NavIcons';

const PERIODS = [
  ['all', 'All Active'],
  ['today', 'Today'],
  ['week', 'This Week'],
  ['month', 'This Month'],
  ['quarter', 'This Quarter'],
  ['year', 'This Year'],
  ['custom', 'Custom'],
];

const DEPT_ORDER = [
  'Sales',
  'Design & Engineering',
  'Projects',
  'Procurement',
  'PPC',
  'Production',
  'Quality',
  'Stores',
  'Logistics',
  'Installation',
  'Finance',
];

const DEPT_LABEL = {
  Projects: 'Project Management',
};

const DEPT_HREF = {
  Sales: '/leads',
  'Design & Engineering': '/design',
  Projects: '/projects',
  Procurement: '/procurement',
  PPC: '/planning',
  Production: '/production',
  Quality: '/quality',
  Stores: '/stores',
  Logistics: '/dispatch',
  Installation: '/installation',
  Finance: '/finance',
};

const emptyFilters = {
  period: 'all',
  from: '',
  to: '',
  customerId: '',
  projectManagerId: '',
  salesPersonId: '',
  stage: '',
  status: '',
  priority: '',
};

function compactInr(amount) {
  const value = Number(amount) || 0;
  if (value >= 10000000) return `₹${trimDec(value / 10000000)}Cr`;
  if (value >= 100000) return `₹${trimDec(value / 100000)}L`;
  if (value >= 1000) return `₹${trimDec(value / 1000)}K`;
  return `₹${value.toLocaleString('en-IN')}`;
}

function trimDec(n) {
  return n.toFixed(1).replace(/\.0$/, '');
}

function fmtTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).toUpperCase();
}

function fmtShort(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

function dayKey(value) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function CountCard({ title, items, empty, onSelect }) {
  const rows = items || [];
  const max = Math.max(1, ...rows.map((item) => item.count || 0));
  return (
    <div className="card exec-card">
      <h3>{title}</h3>
      {!rows.length && <div className="exec-empty muted">{empty}</div>}
      {rows.map((item) => (
        <button type="button" className="bar-row exec-count" key={item.code || item.label} onClick={() => onSelect(item)}>
          <span>{item.label}</span>
          <div className="track"><i style={{ width: `${Math.max(6, (item.count / max) * 100)}%` }} /></div>
          <strong>{item.count}</strong>
        </button>
      ))}
    </div>
  );
}

function deptProgress(dept) {
  const work = (dept.completed || 0) + (dept.pending || 0) + (dept.inProgress || 0) + (dept.blocked || 0);
  return work ? Math.round(((dept.completed || 0) / work) * 100) : 0;
}

export default function ExecutiveDashboard() {
  const lookups = useLookups();
  const navigate = useNavigate();
  const [filters, setFilters] = useState(emptyFilters);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const [deadlineBucket, setDeadlineBucket] = useState('7');

  const query = useMemo(() => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (!v || v === 'all') return;
      if (k === 'period' && v === 'custom') return;
      q.set(k, v);
    });
    return q.toString();
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    setError('');
    setRefreshing(true);
    api.get(`/dashboard/management?${query}`)
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setRefreshing(false); });
    return () => { cancelled = true; };
  }, [query, tick]);

  function set(key, value) {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === 'period' && value !== 'custom') {
        next.from = '';
        next.to = '';
      }
      return next;
    });
  }

  if (error && !data) return <div className="error-state">{error}</div>;
  if (!data) return <div className="loading">Loading portfolio…</div>;

  const kpis = data.kpis || {};
  const healthItems = data.projectHealth || [];
  const healthTotal = healthItems.reduce((sum, item) => sum + (item.count || 0), 0);

  const critical = [];
  const seen = new Set();
  for (const p of [...(data.critical || []), ...(data.timeline || [])]) {
    const needsAttention = ['DELAYED', 'BLOCKED', 'AT_RISK', 'ON_HOLD'].includes(p.health)
      || (p.issues && p.issues.length);
    if (!needsAttention || seen.has(p.id)) continue;
    seen.add(p.id);
    critical.push({
      ...p,
      issue: p.issue || p.issues?.[0] || String(p.health || '').replaceAll('_', ' '),
    });
  }

  const deadlines = (data.upcomingDeadlines || []).filter((d) => {
    if (deadlineBucket === 'today') return d.bucket === 'today';
    if (deadlineBucket === '3') return ['today', '3'].includes(d.bucket);
    return ['today', '3', '7'].includes(d.bucket);
  });

  const departments = DEPT_ORDER
    .map((name) => (data.departmentWorkload || []).find((row) => row.name === name))
    .filter(Boolean);
  const activities = (data.recentActivity || []).slice(0, 10);
  const pipeline = data.pipeline || [];
  const currentStageKey = pipeline.reduce((best, step) => (
    (step.count || 0) > (best.count || 0) ? step : best
  ), { count: 0, key: '' }).key;
  const activityGroups = activities.reduce((groups, item) => {
    const key = dayKey(item.timestamp);
    const last = groups[groups.length - 1];
    if (!last || last.date !== key) groups.push({ date: key, items: [item] });
    else last.items.push(item);
    return groups;
  }, []);

  const leadCards = [
    { key: 'totalLeads', label: 'Total Leads', value: kpis.totalLeads, hint: 'Lead records', onClick: () => navigate('/leads') },
    { key: 'activeLeads', label: 'Active Leads', value: kpis.activeLeads, hint: 'Not completed', onClick: () => navigate('/leads') },
    { key: 'completedLeads', label: 'Completed Leads', value: kpis.completedLeads, tone: 'ok', hint: 'Status completed', onClick: () => navigate('/leads?status=COMPLETED') },
    { key: 'liveLeads', label: 'Live / In Progress', value: kpis.liveLeads, hint: 'Status in progress', onClick: () => navigate('/leads?status=IN_PROGRESS') },
    { key: 'pendingLeads', label: 'Pending / Follow-up', value: kpis.pendingLeads, tone: 'warn', hint: 'Pending or follow-up', onClick: () => navigate('/lead-dashboard?scope=pending') },
    { key: 'delayedLeads', label: 'Delayed', value: kpis.delayedLeads, tone: 'danger', hint: 'Deadline or follow-up has passed', onClick: () => navigate('/lead-dashboard?scope=delayed') },
    { key: 'leadOnHold', label: 'On Hold', value: kpis.leadOnHold, tone: 'warn', hint: 'Status on hold', onClick: () => navigate('/leads?status=ON_HOLD') },
  ];
  const projectCards = [
    { key: 'total', label: 'Total Projects', value: kpis.totalProjects, hint: 'Converted from leads', onClick: () => navigate('/projects') },
    { key: 'active', label: 'Active Projects', value: kpis.activeProjects, hint: 'Still open', onClick: () => navigate('/projects?bucket=active') },
    { key: 'completedProjects', label: 'Completed Projects', value: kpis.completed, tone: 'ok', hint: 'Closed', onClick: () => navigate('/projects?status=COMPLETED') },
    { key: 'delayed', label: 'Delayed Projects', value: kpis.delayed, tone: 'danger', hint: kpis.delayed ? 'Past deadline' : 'None past deadline', onClick: () => navigate('/projects?delayed=true') },
    { key: 'onHold', label: 'Projects On Hold', value: kpis.onHold, tone: 'warn', hint: kpis.onHold ? 'Paused' : 'None on hold', onClick: () => navigate('/projects?status=ON_HOLD') },
  ];

  return (
    <div className="exec">
      <header className="exec-head">
        <div>
          <p className="eyebrow">Sahay Racks · Management</p>
          <h2>Executive Project Dashboard</h2>
          <p>Portfolio overview across sales, engineering, procurement, manufacturing and installation.</p>
        </div>
        <button
          className="btn secondary exec-refresh"
          type="button"
          disabled={refreshing}
          onClick={() => setTick((n) => n + 1)}
        >
          <NavIcon name="refresh" />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div className="exec-toolbar">
        <div className="exec-periods">
          {PERIODS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`chip ${filters.period === value ? 'on' : ''}`}
              onClick={() => set('period', value)}
            >
              {label}
            </button>
          ))}
          {filters.period === 'custom' && (
            <>
              <input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
              <input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />
            </>
          )}
        </div>
        <div className="exec-selects">
          <select value={filters.customerId} onChange={(e) => set('customerId', e.target.value)}>
            <option value="">Customer</option>
            {(data.filters?.customers || []).map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </select>
          <select value={filters.projectManagerId} onChange={(e) => set('projectManagerId', e.target.value)}>
            <option value="">Project Manager</option>
            {(data.filters?.managers || []).map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
          </select>
          <select value={filters.salesPersonId} onChange={(e) => set('salesPersonId', e.target.value)}>
            <option value="">Sales Person</option>
            {(data.filters?.salesPeople || []).map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
          </select>
          <select value={filters.stage} onChange={(e) => set('stage', e.target.value)}>
            <option value="">Stage</option>
            {(lookups.PROJECT_STAGE || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Status</option>
            {(lookups.PROJECT_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
          <select value={filters.priority} onChange={(e) => set('priority', e.target.value)}>
            <option value="">Priority</option>
            {(lookups.PRIORITY || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
          <button className="btn secondary exec-clear" type="button" onClick={() => setFilters(emptyFilters)}>Clear</button>
        </div>
      </div>

      <section className="exec-kpis-row exec-kpis-5">
        {leadCards.map((card) => (
          <button key={card.key} type="button" className={`exec-kpi ${card.tone || ''}`} onClick={card.onClick}>
            <span>{card.label}</span>
            <strong>{card.value ?? 0}</strong>
            <em>{card.hint}</em>
          </button>
        ))}
      </section>
      <section className="exec-kpis-row exec-kpis-5">
        {projectCards.map((card) => (
          <button key={card.key} type="button" className={`exec-kpi ${card.tone || ''}`} onClick={card.onClick}>
            <span>{card.label}</span>
            <strong>{card.value ?? 0}</strong>
            <em>{card.hint}</em>
          </button>
        ))}
      </section>

      <section className="exec-split">
        <CountCard title="Leads by Status" items={data.leadsByStatus} empty="No leads available" onSelect={(item) => navigate(`/leads?status=${item.code}`)} />
        <CountCard title="Projects by Status" items={data.projectsByStatus} empty="No projects available" onSelect={(item) => navigate(`/projects?status=${item.code}`)} />
      </section>
      <section className="exec-split">
        <CountCard title="Projects by Department" items={data.projectsByDepartment} empty="No projects available" onSelect={() => navigate('/projects')} />
        <div className="card exec-card">
          <h3>Upcoming Deadlines</h3>
          {!(data.upcomingDeadlines || []).length && <div className="exec-empty muted">No upcoming deadlines</div>}
          {(data.upcomingDeadlines || []).slice(0, 8).map((item) => (
            <button type="button" className="exec-deadline" key={item.id} onClick={() => navigate(item.href || '/projects')}>
              <strong>{item.project?.projectId || item.detail}</strong>
              <span>{item.name}</span>
              <em>{fmtShort(item.dueDate)}</em>
            </button>
          ))}
        </div>
      </section>

      {data.values && (
        <section className="exec-values">
          <div className="exec-value">
            <span>Total Order Value</span>
            <strong>{compactInr(data.values.total)}</strong>
          </div>
          <div className="exec-value">
            <span>Active Project Value</span>
            <strong>{compactInr(data.values.active)}</strong>
          </div>
          <div className="exec-value">
            <span>Completed Value</span>
            <strong>{compactInr(data.values.completed)}</strong>
          </div>
        </section>
      )}

      <section className="exec-split">
        <div className="card exec-card">
          <h3>Project Pipeline</h3>
          <div className="exec-pipe">
            {pipeline.map((step, index) => (
              <button
                type="button"
                className={`exec-pipe-step ${step.count ? 'has' : ''} ${step.key === currentStageKey && step.count ? 'current' : ''}`}
                key={step.key}
                onClick={() => navigate(step.href)}
              >
                <i className="exec-pipe-idx">{String(index + 1).padStart(2, '0')}</i>
                <span className="exec-pipe-name">{step.label}</span>
                <b className="exec-pipe-count">{step.count}</b>
              </button>
            ))}
          </div>
        </div>

        <div className="card exec-card">
          <h3>Project Health</h3>
          <DonutChart
            items={healthItems}
            centerCaption="TOTAL PROJECTS"
            onSelect={(item) => {
              if (item.code === 'DELAYED') navigate('/projects?delayed=true');
              else if (item.code === 'AT_RISK') navigate('/projects');
              else navigate(`/projects?status=${item.code === 'COMPLETED' ? 'COMPLETED' : item.code}`);
            }}
          />
          {!healthTotal && <p className="exec-quiet">No projects in the current filter.</p>}
        </div>
      </section>

      {data.customerFollowUps && (
        <section className="card exec-card cf-dash" style={{ marginTop: 14 }}>
          <h3>Customer Follow-ups</h3>
          <div className="cf-dash-grid">
            <button type="button" onClick={() => navigate('/customer-feedback?followUpStatus=DUE_TODAY')}>
              <span>Due Today</span><strong>{data.customerFollowUps.dueToday || 0}</strong>
            </button>
            <button type="button" className="danger" onClick={() => navigate('/customer-feedback?followUpStatus=OVERDUE')}>
              <span>Overdue</span><strong>{data.customerFollowUps.overdue || 0}</strong>
            </button>
            <button type="button" onClick={() => navigate('/customer-feedback?finalStatus=AWAITING_CUSTOMER_RESPONSE')}>
              <span>Awaiting Customer Response</span><strong>{data.customerFollowUps.awaiting || 0}</strong>
            </button>
            <button type="button" className="ok" onClick={() => navigate('/customer-feedback?feedbackStatus=RECEIVED')}>
              <span>Feedback Received</span><strong>{data.customerFollowUps.received || 0}</strong>
            </button>
          </div>
        </section>
      )}

      <section className="exec-attn">
        <div className="card exec-card">
          <h3>Projects Requiring Attention</h3>
          {(data.attentionIssues || []).length > 0 ? (
            <table className="exec-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Customer</th>
                  <th>Stage</th>
                  <th>Issue</th>
                  <th>Owner</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.attentionIssues.map((row) => (
                  <tr key={row.id} onClick={() => navigate(`/issues/${row.id}`)}>
                    <td className="exec-proj">{row.projectCode}</td>
                    <td>{row.customerName || '—'}</td>
                    <td>{labelOf(lookups, 'PROJECT_STAGE', row.project?.currentStageCode)}</td>
                    <td className="exec-issue">{row.title}</td>
                    <td>{row.owner || '—'}</td>
                    <td>{fmtShort(row.dueDate)}</td>
                    <td><StatusBadge code={row.statusCode} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : !critical.length ? (
            <div className="exec-empty">✓ No projects currently require management attention.</div>
          ) : (
            <table className="exec-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Customer</th>
                  <th>Stage</th>
                  <th>Issue</th>
                  <th>Owner</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {critical.map((p) => (
                  <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
                    <td className="exec-proj">{p.projectId}</td>
                    <td>{p.customer || '—'}</td>
                    <td>{labelOf(lookups, 'PROJECT_STAGE', p.stage)}</td>
                    <td className="exec-issue">{p.issue || String(p.health || '').replaceAll('_', ' ')}</td>
                    <td>{p.projectManager || '—'}</td>
                    <td>{fmtShort(p.expectedCompletion)}</td>
                    <td><StatusBadge code={p.health || p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card exec-card">
          <div className="exec-card-head">
            <h3>Upcoming Deadlines</h3>
            <div className="exec-mini-tabs">
              {[['today', 'Today'], ['3', 'Next 3 Days'], ['7', 'Next 7 Days']].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={deadlineBucket === value ? 'on' : ''}
                  onClick={() => setDeadlineBucket(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {!deadlines.length && <div className="exec-empty muted">No deadlines in this window</div>}
          {deadlines.length > 0 && (
            <table className="exec-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Activity</th>
                  <th>Department</th>
                  <th>Due Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {deadlines.slice(0, 8).map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => navigate(d.href || (d.project?.id ? `/projects/${d.project.id}` : '/tasks'))}
                  >
                    <td className="exec-proj">{d.project?.projectId || '—'}</td>
                    <td>{d.name}</td>
                    <td>{d.department}</td>
                    <td>{fmtShort(d.dueDate)}</td>
                    <td><StatusBadge code={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="card exec-card exec-full">
        <h3>Department Progress</h3>
        <div className="exec-dept-head">
          <span>Department</span>
          <span>Active</span>
          <span>Pending</span>
          <span>Overdue</span>
          <span>Progress</span>
        </div>
        {departments.map((dept) => {
          const pct = deptProgress(dept);
          return (
            <button
              type="button"
              className="exec-dept-row"
              key={dept.name}
              onClick={() => navigate(DEPT_HREF[dept.name] || `/tasks?q=${encodeURIComponent(dept.name)}`)}
            >
              <strong>{DEPT_LABEL[dept.name] || dept.name}</strong>
              <span>{dept.active || 0}</span>
              <span>{dept.pending || 0}</span>
              <span className={dept.overdue ? 'danger' : ''}>{dept.overdue || 0}</span>
              <div className="exec-dept-bar">
                <i style={{ width: `${pct}%` }} />
              </div>
              <em>{pct}%</em>
            </button>
          );
        })}
      </section>

      <section className="card exec-card exec-full">
        <div className="exec-card-head">
          <h3>Recent Activity</h3>
          <button className="linkish" type="button" onClick={() => navigate('/activity')}>View all activity →</button>
        </div>
        {!activities.length && <div className="exec-empty muted">No recent activity</div>}
        {activityGroups.map((group) => (
          <div className="exec-day" key={group.date}>
            <div className="exec-day-label">{group.date}</div>
            {group.items.map((item) => (
              <button type="button" className="exec-act" key={item.id} onClick={() => navigate(item.href)}>
                <time>{fmtTime(item.timestamp)}</time>
                <span className="exec-dept-tag">{item.department}</span>
                <span>
                  {item.projectId ? <b>{item.projectId}</b> : null}
                  {item.projectId ? ' — ' : ''}
                  {item.description || item.action.replaceAll('_', ' ')}
                </span>
                <em>{item.user || '—'}</em>
              </button>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
