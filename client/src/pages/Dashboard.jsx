import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLookups } from '../hooks/useLookups';
import { fmtDate, labelOf } from '../utils/format';
import { isManagement } from '../utils/roles';
import KpiCard from '../components/KpiCard';
import StatusBadge from '../components/StatusBadge';
import ExecutiveDashboard from './ExecutiveDashboard';

export default function Dashboard() {
  const { user } = useAuth();
  if (isManagement(user)) return <ExecutiveDashboard />;

  const [params] = useSearchParams();
  const view = params.get('view');
  const navigate = useNavigate();
  const lookups = useLookups();
  const [mgmt, setMgmt] = useState(null);
  const [sales, setSales] = useState(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function load() {
      Promise.allSettled([
        api.get('/dashboard/management').then(setMgmt),
        api.get('/dashboard/sales').then(setSales),
      ]).then((results) => {
        const failed = results.filter((r) => r.status === 'rejected' && r.reason?.status !== 403);
        if (failed.length && results.every((r) => r.status === 'rejected')) {
          setError(failed[0].reason?.message || 'Unable to load data.');
        }
        setReady(true);
      });
    }
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [view]);

  if (error) return <div className="error-state">{error}</div>;
  if (!ready) return <div className="loading">Loading…</div>;
  if (!mgmt && !sales) return <div className="empty">No dashboard is available for this role.</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Sahay Racks · Operations</p>
          <h2>Operations overview</h2>
          <p>What needs action, what is delayed, and where each project sits.</p>
        </div>
      </div>

      {mgmt && (
        <>
          <div className="kpi-grid">
            <KpiCard label="Total Leads" value={mgmt.kpis.totalLeads} onClick={() => navigate('/leads')} />
            <KpiCard label="Open Leads" value={mgmt.kpis.openLeads} onClick={() => navigate('/leads')} />
            <KpiCard label="Won Leads" value={mgmt.kpis.wonLeads} tone="ok" onClick={() => navigate('/leads?status=WON')} />
            <KpiCard label="Lost Leads" value={mgmt.kpis.lostLeads} onClick={() => navigate('/leads?status=LOST')} />
            <KpiCard label="Total Projects" value={mgmt.kpis.totalProjects} onClick={() => navigate('/projects')} />
            <KpiCard label="Active Projects" value={mgmt.kpis.activeProjects} onClick={() => navigate('/projects')} />
            <KpiCard label="On Track" value={mgmt.kpis.onTrack} tone="ok" onClick={() => navigate('/projects?status=ON_TRACK')} />
            <KpiCard label="Delayed" value={mgmt.kpis.delayed} tone="danger" onClick={() => navigate('/projects?delayed=true')} />
            <KpiCard label="Blocked" value={mgmt.kpis.blocked} tone="danger" onClick={() => navigate('/projects?status=BLOCKED')} />
            <KpiCard label="On Hold" value={mgmt.kpis.onHold} tone="warn" onClick={() => navigate('/projects?status=ON_HOLD')} />
            <KpiCard label="Completed" value={mgmt.kpis.completed} tone="ok" onClick={() => navigate('/projects?status=COMPLETED')} />
          </div>

          <div className="grid-2">
            <div className="card">
              <h3>Project pipeline</h3>
              {mgmt.pipeline.map((p) => (
                <div className="bar-row" key={p.label}>
                  <span style={{ width: 110 }}>{p.label}</span>
                  <div className="track"><i style={{ width: `${Math.min(100, p.count * 12)}%` }} /></div>
                  <strong>{p.count}</strong>
                </div>
              ))}
            </div>
            <div className="card">
              <h3>Department progress</h3>
              {Object.entries(mgmt.departmentProgress || {}).map(([name, v]) => (
                <div className="bar-row" key={name}>
                  <span style={{ width: 110 }}>{name}</span>
                  <div className="track"><i style={{ width: `${v.percent}%` }} /></div>
                  <strong>{v.percent}%</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="grid-2" style={{ marginTop: 14 }}>
            <div className="card">
              <h3>Overdue tasks</h3>
              {(mgmt.overdueTasks || []).length === 0 && <div className="empty">No overdue tasks.</div>}
              {(mgmt.overdueTasks || []).map((t) => (
                <div className="check-row" key={t.id} onClick={() => navigate('/tasks?bucket=overdue')} style={{ cursor: 'pointer' }}>
                  <div>
                    <strong>{t.name}</strong>
                    <p>{t.project?.projectId} · {t.assignedTo || 'Unassigned'} · {t.delayDays} days</p>
                  </div>
                  <StatusBadge code="OVERDUE" />
                </div>
              ))}
            </div>
            <div className="card">
              <h3>Critical projects</h3>
              {(mgmt.criticalProjects || []).length === 0 && <div className="empty">No critical projects.</div>}
              {(mgmt.criticalProjects || []).map((p) => (
                <div className="check-row" key={p.id} onClick={() => navigate(`/projects/${p.id}`)} style={{ cursor: 'pointer' }}>
                  <div>
                    <strong>{p.projectId}</strong>
                    <p>{p.customer} · {labelOf(lookups, 'PROJECT_STAGE', p.stage)}</p>
                  </div>
                  <StatusBadge code={p.status} />
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <h3>Recent activity</h3>
            <div className="timeline">
              {(mgmt.recentActivity || []).map((a) => (
                <div className="tl-item" key={a.id}>
                  <strong>{a.action.replaceAll('_', ' ')}</strong>
                  <p>{a.description}</p>
                  <small>{a.user?.fullName} · {fmtDate(a.timestamp)}</small>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {sales && (
        <div style={{ marginTop: 22 }}>
          <h3>Sales</h3>
          <div className="kpi-grid">
            <KpiCard label="New Leads" value={sales.kpis.newLeads} onClick={() => navigate('/leads?status=NEW')} />
            <KpiCard label="Follow-ups today" value={sales.kpis.dueToday} tone="warn" onClick={() => navigate('/leads')} />
            <KpiCard label="Follow-ups overdue" value={sales.kpis.overdue} tone="danger" onClick={() => navigate('/leads?overdue=true')} />
            <KpiCard label="Quotation pending" value={sales.kpis.quotationPending} onClick={() => navigate('/leads?status=QUOTATION_PENDING')} />
            <KpiCard label="Quotation sent" value={sales.kpis.quotationSent} onClick={() => navigate('/leads?status=QUOTATION_SENT')} />
            <KpiCard label="Negotiation" value={sales.kpis.negotiation} onClick={() => navigate('/leads?status=NEGOTIATION')} />
            <KpiCard label="Won" value={sales.kpis.won} tone="ok" onClick={() => navigate('/leads?status=WON')} />
            <KpiCard label="Lost" value={sales.kpis.lost} onClick={() => navigate('/leads?status=LOST')} />
          </div>
          <h3 style={{ marginTop: 22 }}>Output Submission</h3>
          <div className="kpi-grid">
            <KpiCard label="On Time" value={sales.kpis.outputOnTime} tone="ok" onClick={() => navigate('/leads?outputStatus=ON_TIME')} />
            <KpiCard label="Overdue" value={sales.kpis.outputOverdue} tone="danger" onClick={() => navigate('/leads?outputStatus=OVERDUE')} />
            <KpiCard label="Delayed 1–3 Days" value={sales.kpis.outputDelayed13} tone="warn" onClick={() => navigate('/leads?outputStatus=DELAYED_1_3')} />
            <KpiCard label="Delayed >3 Days" value={sales.kpis.outputDelayedOver3} onClick={() => navigate('/leads?outputStatus=DELAYED_OVER_3')} />
            <KpiCard label="On Hold" value={sales.kpis.outputOnHold} tone="warn" onClick={() => navigate('/leads?outputStatus=ON_HOLD')} />
            <KpiCard label="Completed" value={sales.kpis.outputCompleted} tone="ok" onClick={() => navigate('/leads?outputStatus=COMPLETED')} />
          </div>
          {(sales.outputTracking || []).length > 0 && (
            <div className="card" style={{ marginTop: 14 }}>
              <h3>Output tracking</h3>
              {sales.outputTracking.map((lead) => (
                <div className="check-row" key={lead.id} onClick={() => navigate(`/leads/${lead.id}`)} style={{ cursor: 'pointer' }}>
                  <div>
                    <strong>{lead.leadId}</strong>
                    <p>{lead.customer?.companyName} · {lead.outputRequiredLabel || lead.outputRequired} · Deadline {fmtDate(lead.submissionDeadline)}</p>
                  </div>
                  <StatusBadge code={lead.outputStatus} label={lead.outputStatusLabel} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
