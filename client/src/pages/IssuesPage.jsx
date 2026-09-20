import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLookups } from '../hooks/useLookups';
import { fmtDate, labelOf } from '../utils/format';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';

const emptyFilters = {
  q: '',
  projectId: '',
  departmentId: '',
  priority: '',
  status: '',
  issueType: '',
  assignedToId: '',
  due: '',
};

const emptyForm = {
  projectId: '',
  title: '',
  description: '',
  issueType: 'OTHER',
  departmentId: '',
  priorityCode: 'MEDIUM',
  assignedToId: '',
  dueDate: '',
  isBlocking: false,
  blockedDepartmentId: '',
  requiredAction: '',
  file: null,
  categoryCode: 'OTHER',
};

export default function IssuesPage() {
  const { has } = useAuth();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams();
    Object.entries(applied).forEach(([k, v]) => { if (v) q.set(k, v); });
    api.get(`/issues?${q}`).then(setData).catch((e) => setError(e.message));
  }, [applied]);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api.post('/issues', {
        ...form,
        isBlocking: Boolean(form.isBlocking),
        departmentId: form.departmentId || null,
        assignedToId: form.assignedToId || null,
        blockedDepartmentId: form.blockedDepartmentId || null,
      });
      if (form.file && created.id) {
        const fd = new FormData();
        fd.append('file', form.file);
        fd.append('categoryCode', form.categoryCode || 'OTHER');
        await api.post(`/issues/${created.id}/documents`, fd);
      }
      setOpen(false);
      setForm(emptyForm);
      setApplied({ ...applied });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data && !error) return <div className="loading">Loading issues…</div>;
  const summary = data?.summary || {};
  const issues = data?.issues || [];
  const punches = data?.openPunches || data?.punches?.filter((p) => ['OPEN', 'IN_PROGRESS'].includes(p.statusCode)) || [];
  const canCreate = has('projects.edit') || has('dashboard.management');

  return (
    <div className="iss">
      <header className="iss-head">
        <div>
          <p className="eyebrow">Project Execution</p>
          <h2>Issues</h2>
          <p>Track project blockers, delays, dependencies and unresolved actions.</p>
        </div>
        {canCreate && <button className="btn copper" type="button" onClick={() => setOpen(true)}>+ Create Issue</button>}
      </header>

      <section className="iss-summary">
        {[
          ['Open Issues', summary.open],
          ['Blocked', summary.blocked],
          ['High Priority', summary.highPriority],
          ['Overdue', summary.overdue],
          ['Due Today', summary.dueToday],
          ['On Hold', summary.onHold],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value ?? 0}</strong>
          </div>
        ))}
      </section>

      <div className="iss-toolbar">
        <input placeholder="Search" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
        <select value={draft.projectId} onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}>
          <option value="">Project</option>
          {(data?.filters?.projects || []).map((p) => <option key={p.id} value={p.id}>{p.projectId}</option>)}
        </select>
        <select value={draft.departmentId} onChange={(e) => setDraft({ ...draft, departmentId: e.target.value })}>
          <option value="">Department</option>
          {(data?.filters?.departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
          <option value="">Priority</option>
          {(lookups.PRIORITY || []).filter((p) => ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(p.code)).map((p) => (
            <option key={p.code} value={p.code}>{p.label}</option>
          ))}
        </select>
        <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
          <option value="">Status</option>
          {(lookups.ISSUE_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <select value={draft.issueType} onChange={(e) => setDraft({ ...draft, issueType: e.target.value })}>
          <option value="">Issue Type</option>
          {(lookups.ISSUE_TYPE || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <select value={draft.assignedToId} onChange={(e) => setDraft({ ...draft, assignedToId: e.target.value })}>
          <option value="">Responsible Person</option>
          {(data?.filters?.users || []).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
        <select value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })}>
          <option value="">Due Date</option>
          <option value="today">Due today</option>
          <option value="week">Due this week</option>
          <option value="overdue">Overdue</option>
        </select>
        <span className="iss-toolbar-actions">
          <button className="btn" type="button" onClick={() => setApplied({ ...draft })}>Apply</button>
          <button className="btn secondary" type="button" onClick={() => { setDraft(emptyFilters); setApplied(emptyFilters); }}>Clear</button>
        </span>
      </div>

      {error && <div className="notice err">{error}</div>}

      {issues.length > 0 && (
        <section className="card iss-card">
          <h3>Management Attention</h3>
          {!(data.attention || []).length && (
            <div className="iss-empty slim">✓ No critical issues requiring management attention.</div>
          )}
          {(data.attention || []).length > 0 && (
            <>
              <p className="iss-attn-count">{data.attention.length} issue{data.attention.length === 1 ? '' : 's'} require attention</p>
              <div className="iss-attn-list">
                {data.attention.map((row) => (
                  <button type="button" className="iss-attn" key={row.id} onClick={() => navigate(`/issues/${row.id}`)}>
                    <div>
                      <strong>{row.projectCode}</strong>
                      <p>{row.title}</p>
                    </div>
                    <span>{row.departmentName}</span>
                    <StatusBadge code={row.statusCode} />
                    {row.overdue
                      ? <em className="overdue">OVERDUE · {row.overdueDays} {row.overdueDays === 1 ? 'DAY' : 'DAYS'}</em>
                      : <em>{row.ageLabel}</em>}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <section className="card iss-card">
        <h3>Project Issues</h3>
        {!issues.length && (
          <div className="iss-empty">
            <strong>✓ No open issues</strong>
            <p>All projects are currently clear.</p>
            {canCreate && <button className="btn copper" type="button" onClick={() => setOpen(true)}>+ Create Issue</button>}
          </div>
        )}
        {issues.length > 0 && (
          <div className="iss-scroll">
            <table className="iss-table">
              <thead>
                <tr>
                  <th>Issue ID</th>
                  <th>Project</th>
                  <th>Issue</th>
                  <th>Department</th>
                  <th>Priority</th>
                  <th>Owner</th>
                  <th>Raised</th>
                  <th>Due</th>
                  <th>Age</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((row) => (
                  <tr key={row.id} className={row.isBlocking || row.statusCode === 'BLOCKED' ? 'blocking' : ''}>
                    <td data-label="Issue ID" className="iss-id">{row.issueNumber}</td>
                    <td data-label="Project"><Link to={`/projects/${row.project?.id}`}>{row.projectCode}</Link></td>
                    <td data-label="Issue">
                      {row.title}
                      {row.isBlocking && <small className="block-tag">BLOCKING PROJECT{row.blockedDepartment ? ` · ${row.blockedDepartment.name}` : ''}</small>}
                    </td>
                    <td data-label="Department">{row.departmentName}</td>
                    <td data-label="Priority"><StatusBadge code={row.priorityCode} /></td>
                    <td data-label="Owner">{row.owner}</td>
                    <td data-label="Raised">{fmtDate(row.createdAt)}</td>
                    <td data-label="Due">{fmtDate(row.dueDate)}</td>
                    <td data-label="Age" className={row.age >= 7 ? 'danger' : row.age >= 3 ? 'warn' : ''}>{row.ageLabel}</td>
                    <td data-label="Status">
                      <StatusBadge code={row.statusCode} />
                      {row.overdue && <small className="overdue">OVERDUE · {row.overdueDays} {row.overdueDays === 1 ? 'DAY' : 'DAYS'}</small>}
                    </td>
                    <td data-label="Action"><Link to={`/issues/${row.id}`}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card iss-card">
        <h3>Installation Punch Points</h3>
        {!punches.length && (
          <div className="iss-empty slim">
            <strong>✓ No open installation punch points.</strong>
            <p><Link className="btn ghost" to="/installation">View Installation</Link></p>
          </div>
        )}
        {punches.length > 0 && (
          <div className="iss-scroll">
            <table className="iss-table">
              <thead>
                <tr>
                  <th>Punch Point ID</th>
                  <th>Project</th>
                  <th>Location</th>
                  <th>Description</th>
                  <th>Assigned To</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Age</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {punches.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Punch">{row.punchId}</td>
                    <td data-label="Project"><Link to={`/projects/${row.project?.id}`}>{row.project?.projectId}</Link></td>
                    <td data-label="Location">{row.location || '—'}</td>
                    <td data-label="Description">{row.description}</td>
                    <td data-label="Assigned">{row.assignedTo?.fullName || '—'}</td>
                    <td data-label="Due">{fmtDate(row.dueDate)}</td>
                    <td data-label="Status">
                      <StatusBadge
                        code={row.statusCode}
                        label={labelOf(lookups, 'PUNCH_STATUS', row.statusCode)}
                      />
                    </td>
                    <td data-label="Age">{row.ageLabel}</td>
                    <td data-label="Action"><Link to={`/punch-points/${row.id}`}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && (
        <Modal title="Create Issue" onClose={() => setOpen(false)} wide>
          <form className="form-grid" onSubmit={create}>
            <label className="field">
              Project
              <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                <option value="">Select project</option>
                {(data?.filters?.projects || []).map((p) => <option key={p.id} value={p.id}>{p.projectId} — {p.name}</option>)}
              </select>
            </label>
            <label className="field">
              Issue Title
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="field full">
              Issue Description
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="field">
              Issue Type
              <select value={form.issueType} onChange={(e) => setForm({ ...form, issueType: e.target.value })}>
                {(lookups.ISSUE_TYPE || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </label>
            <label className="field">
              Department
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">Select department</option>
                {(data?.filters?.departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className="field">
              Priority
              <select value={form.priorityCode} onChange={(e) => setForm({ ...form, priorityCode: e.target.value })}>
                {(lookups.PRIORITY || []).filter((p) => ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(p.code)).map((p) => (
                  <option key={p.code} value={p.code}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Responsible Person
              <select value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
                <option value="">Select person</option>
                {(data?.filters?.users || []).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </label>
            <label className="field">
              Due Date
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </label>
            <label className="field">
              Is Blocking?
              <select value={form.isBlocking ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, isBlocking: e.target.value === 'yes' })}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
            <label className="field">
              Blocked Department
              <select value={form.blockedDepartmentId} onChange={(e) => setForm({ ...form, blockedDepartmentId: e.target.value })}>
                <option value="">None</option>
                {(data?.filters?.departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className="field full">
              Required Action
              <textarea value={form.requiredAction} onChange={(e) => setForm({ ...form, requiredAction: e.target.value })} />
            </label>
            <label className="field">
              Attachment
              <input type="file" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })} />
            </label>
            <div className="full btn-row">
              <button className="btn copper" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create Issue'}</button>
              <button className="btn secondary" type="button" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
