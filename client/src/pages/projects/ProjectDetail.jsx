import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useLookups } from '../../hooks/useLookups';
import { fmtDate, fmtDateTime, labelOf, money } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import ProgressBar from '../../components/ProgressBar';
import Modal from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { isManagement } from '../../utils/roles';

const TABS = ['Overview', 'Timeline', 'Tasks', 'Design', 'Procurement', 'Production', 'Quality', 'Installation', 'Documents', 'Issues', 'Activity History'];

export default function ProjectDetail() {
  const { id } = useParams();
  const lookups = useLookups();
  const { has, user } = useAuth();
  const executive = isManagement(user);
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [prod, setProd] = useState(null);
  const [inst, setInst] = useState(null);

  function load() {
    api.get(`/projects/${id}`).then(setProject);
    if (has('production.view')) api.get(`/production/${id}`).then(setProd).catch(() => {});
    if (has('installation.view')) api.get(`/installation/${id}`).then(setInst).catch(() => {});
  }
  useEffect(load, [id]);

  if (!project) return <div className="loading">Loading…</div>;

  async function submit(e) {
    e.preventDefault();
    if (modal === 'status') await api.patch(`/projects/${id}/status`, form);
    if (modal === 'stage') await api.patch(`/projects/${id}/stage`, form);
    if (modal === 'task') await api.post(`/projects/${id}/tasks`, form);
    if (modal === 'comment') await api.post(`/projects/${id}/comments`, { body: form.body });
    if (modal === 'document') {
      const fd = new FormData();
      fd.append('file', form.file);
      fd.append('categoryCode', form.categoryCode || 'OTHER');
      await api.post(`/projects/${id}/documents`, fd);
    }
    if (modal === 'close') await api.post(`/projects/${id}/close`, { remarks: form.remarks });
    setModal(null);
    setForm({});
    load();
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{project.projectId}</h2>
          <p>{project.name} · {project.customer?.companyName}</p>
          <div className="btn-row">
            <StatusBadge code={project.currentStageCode} label={labelOf(lookups, 'PROJECT_STAGE', project.currentStageCode)} />
            <StatusBadge code={project.currentStatusCode} label={labelOf(lookups, 'PROJECT_STATUS', project.currentStatusCode)} />
            <ProgressBar value={project.progressPercent} />
          </div>
          <p>PM: {project.projectManager?.fullName || '—'}</p>
        </div>
        <div className="btn-row">
          {has('projects.edit') && <button className="btn ghost" onClick={() => setModal('stage')}>Change Stage</button>}
          {has('projects.edit') && <button className="btn ghost" onClick={() => setModal('status')}>Change Status</button>}
          {has('tasks.edit') && <button className="btn ghost" onClick={() => setModal('task')}>Add Task</button>}
          {has('documents.upload') && <button className="btn ghost" onClick={() => setModal('document')}>Upload Document</button>}
          <button className="btn ghost" onClick={() => setModal('comment')}>Add Comment</button>
          {has('projects.close') && <button className="btn copper" onClick={() => setModal('close')}>Close Project</button>}
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => <button key={t} className={tab === t ? 'active' : ''} type="button" onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Overview' && executive && (
        <ExecutiveProjectBlock project={project} lookups={lookups} />
      )}

      {tab === 'Overview' && (
        <div className="grid-2">
          <div className="card">
            <h3>Order</h3>
            <p>Lead: {project.lead?.leadId || '—'}</p>
            <p>PO: {project.poNumber || '—'} · {fmtDate(project.poDate)}</p>
            {has('finance.view') && <p>Value: {money(project.orderValue, project.currency)}</p>}
            <p>Start: {fmtDate(project.startDate)} · Expected: {fmtDate(project.expectedCompletion)}</p>
            <p>Sales: {project.salesPerson?.fullName || '—'}</p>
            <p>Site: {project.site?.name || project.site?.address || '—'}</p>
          </div>
          <div className="card">
            <h3>Department progress</h3>
            {project.stages.map((s) => (
              <div className="check-row" key={s.id}>
                <span>{labelOf(lookups, 'PROJECT_STAGE', s.stageCode)}</span>
                <StatusBadge code={s.statusCode} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'Timeline' && (
        <div className="card">
          <div className="timeline">
            {project.stages.map((s) => (
              <div className={`tl-item ${s.statusCode === 'COMPLETED' ? 'done' : s.stageCode === project.currentStageCode ? '' : 'upcoming'}`} key={s.id}>
                <strong>{labelOf(lookups, 'PROJECT_STAGE', s.stageCode)}</strong>
                <p>Start {fmtDate(s.startDate)} · Target {fmtDate(s.targetDate)} · Completed {fmtDate(s.completedDate)}</p>
                <StatusBadge code={s.statusCode} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'Tasks' && (
        <div className="card">
          {project.tasks.map((t) => (
            <div className="check-row" key={t.id}>
              <div>
                <strong>{t.taskId} {t.name}</strong>
                <p>{t.assignedTo?.fullName || 'Unassigned'} · due {fmtDate(t.dueDate)}</p>
                {t.blockers?.some((b) => b.dependsOn.statusCode !== 'COMPLETED') && (
                  <p>Blocked by: {t.blockers.map((b) => b.dependsOn.name).join(', ')}</p>
                )}
              </div>
              <StatusBadge code={t.statusCode} />
            </div>
          ))}
          {!project.tasks.length && <div className="empty">No tasks yet.</div>}
        </div>
      )}

      {tab === 'Design' && (
        <DesignTab project={project} lookups={lookups} onRefresh={load} />
      )}

      {tab === 'Procurement' && <ProcurementTab project={project} onRefresh={load} />}
      {tab === 'Production' && <ProductionTab prod={prod} onRefresh={load} />}
      {tab === 'Quality' && <QualityTab project={project} lookups={lookups} onRefresh={load} />}
      {tab === 'Installation' && <InstallTab inst={inst} project={project} onRefresh={load} />}

      {tab === 'Documents' && (
        <div className="card">
          {project.documents.map((d) => (
            <div className="check-row" key={d.id}>
              <div>
                <strong>{d.documentId} {d.originalName}</strong>
                <p>{labelOf(lookups, 'DOCUMENT_TYPE', d.categoryCode)} · {d.revision}</p>
              </div>
              <StatusBadge code={d.approvalStatus} />
            </div>
          ))}
        </div>
      )}

      {tab === 'Issues' && (
        <div className="card iss-card">
          <div className="iss-proj-stats">
            <span>Open {project.issues.filter((i) => !['RESOLVED', 'CLOSED'].includes(i.statusCode)).length}</span>
            <span>Blocked {project.issues.filter((i) => i.statusCode === 'BLOCKED' || i.isBlocking).length}</span>
            <span>Overdue {project.issues.filter((i) => i.dueDate && new Date(i.dueDate) < new Date() && !['RESOLVED', 'CLOSED'].includes(i.statusCode)).length}</span>
            <span>Resolved {project.issues.filter((i) => ['RESOLVED', 'CLOSED'].includes(i.statusCode)).length}</span>
          </div>
          {!project.issues.length && <div className="iss-empty slim">✓ No issues on this project.</div>}
          {project.issues.length > 0 && (
            <table className="iss-table">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Department</th>
                  <th>Owner</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {project.issues.map((i) => (
                  <tr key={i.id}>
                    <td>{i.issueNumber || i.title}<div>{i.title}</div></td>
                    <td>{i.department?.name || '—'}</td>
                    <td>{i.assignedTo?.fullName || '—'}</td>
                    <td><StatusBadge code={i.priorityCode} /></td>
                    <td><StatusBadge code={i.statusCode} /></td>
                    <td><Link to={`/issues/${i.id}`}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'Activity History' && (
        <div className="card">
          <div className="timeline">
            {(project.activity || []).map((a) => (
              <div className="tl-item" key={a.id}>
                <strong>{a.action.replaceAll('_', ' ')}</strong>
                <p>{a.description}</p>
                {a.oldValue && <p>{a.oldValue} → {a.newValue}</p>}
                <small>{a.user?.fullName} · {fmtDateTime(a.timestamp)}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <Modal title={modal} onClose={() => setModal(null)}>
          <form onSubmit={submit} className="form-grid">
            {modal === 'status' && (
              <>
                <label className="field">Status
                  <select onChange={(e) => setForm({ ...form, statusCode: e.target.value })}>
                    {(lookups.PROJECT_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                  </select>
                </label>
                <label className="field full">Reason<textarea onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
              </>
            )}
            {modal === 'stage' && (
              <>
                <label className="field">Stage
                  <select onChange={(e) => setForm({ ...form, stageCode: e.target.value })}>
                    {(lookups.PROJECT_STAGE || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                  </select>
                </label>
                <label className="field full">Reason<textarea onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
              </>
            )}
            {modal === 'task' && (
              <>
                <label className="field">Task Name<input onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <label className="field">Due Date<input type="date" onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
                <label className="field">Priority
                  <select onChange={(e) => setForm({ ...form, priorityCode: e.target.value })}>
                    {(lookups.PRIORITY || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                  </select>
                </label>
                <label className="field">Module<input placeholder="DESIGN / PRODUCTION..." onChange={(e) => setForm({ ...form, module: e.target.value })} /></label>
              </>
            )}
            {modal === 'comment' && <label className="field full">Comment<textarea onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>}
            {modal === 'document' && (
              <>
                <label className="field">Category
                  <select onChange={(e) => setForm({ ...form, categoryCode: e.target.value })}>
                    {(lookups.DOCUMENT_TYPE || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                  </select>
                </label>
                <label className="field">File<input type="file" onChange={(e) => setForm({ ...form, file: e.target.files[0] })} /></label>
              </>
            )}
            {modal === 'close' && <label className="field full">Closure remarks<textarea onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></label>}
            <button className="btn" type="submit">Save</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function DesignTab({ project, lookups, onRefresh }) {
  const [form, setForm] = useState({});
  return (
    <div className="grid-2">
      <div className="card">
        <h3>Approvals</h3>
        {project.approvals.map((a) => (
          <div className="check-row" key={a.id}>
            <div>
              <strong>{a.document?.originalName || 'Review'}</strong>
              <p>{a.comments || '—'}</p>
            </div>
            <div className="btn-row">
              <StatusBadge code={a.statusCode} />
              {a.statusCode === 'PENDING_REVIEW' && (
                <>
                  <button className="btn ghost" type="button" onClick={() => api.patch(`/approvals/${a.id}`, { statusCode: 'APPROVED' }).then(onRefresh)}>Approve</button>
                  <button className="btn ghost" type="button" onClick={() => api.patch(`/approvals/${a.id}`, { statusCode: 'REVISION_REQUIRED', comments: 'Revise and resubmit' }).then(onRefresh)}>Revise</button>
                </>
              )}
            </div>
          </div>
        ))}
        {!project.approvals.length && <div className="empty">No approvals.</div>}
      </div>
      <div className="card">
        <h3>Submit for review</h3>
        <label className="field">Document
          <select onChange={(e) => setForm({ ...form, documentId: e.target.value })}>
            <option value="">Select</option>
            {project.documents.map((d) => <option key={d.id} value={d.id}>{d.originalName}</option>)}
          </select>
        </label>
        <button className="btn" type="button" style={{ marginTop: 10 }} onClick={() => api.post('/approvals', { ...form, projectId: project.id }).then(onRefresh)}>Submit</button>
      </div>
    </div>
  );
}

function ProcurementTab({ project, onRefresh }) {
  const [vendors, setVendors] = useState([]);
  const [rfq, setRfq] = useState({ title: '' });
  useEffect(() => { api.get('/vendors').then(setVendors).catch(() => {}); }, []);
  return (
    <div className="grid-2">
      <div className="card">
        <h3>RFQs</h3>
        {project.rfqs.map((r) => (
          <div key={r.id} style={{ marginBottom: 12 }}>
            <strong>{r.rfqId} {r.title}</strong>
            {r.quotations.map((q) => (
              <div className="check-row" key={q.id}>
                <span>{q.vendor.companyName} · {q.currency} {q.amount}</span>
                {!q.selected && <button className="btn ghost" type="button" onClick={() => api.post(`/quotes/${q.id}/finalize`).then(onRefresh)}>Finalize</button>}
                {q.selected && <StatusBadge code="APPROVED" label="Selected" />}
              </div>
            ))}
          </div>
        ))}
        <label className="field">New RFQ title<input value={rfq.title} onChange={(e) => setRfq({ ...rfq, title: e.target.value })} /></label>
        <button className="btn" type="button" onClick={() => api.post('/rfqs', { ...rfq, projectId: project.id }).then(onRefresh)}>Create RFQ</button>
      </div>
      <div className="card">
        <h3>Purchase orders</h3>
        {project.purchaseOrders.map((p) => (
          <div className="check-row" key={p.id}>
            <div><strong>{p.poNumber}</strong><p>{p.vendor?.companyName}</p></div>
            <StatusBadge code={p.statusCode} />
          </div>
        ))}
        <CreatePo vendors={vendors} projectId={project.id} onRefresh={onRefresh} />
      </div>
    </div>
  );
}

function CreatePo({ vendors, projectId, onRefresh }) {
  const [form, setForm] = useState({ vendorId: '', totalAmount: '', items: [{ description: 'Material', quantity: 1 }] });
  return (
    <div style={{ marginTop: 12 }}>
      <label className="field">Vendor
        <select onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
          <option value="">Select</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.companyName}</option>)}
        </select>
      </label>
      <label className="field">Amount<input onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} /></label>
      <button className="btn" type="button" onClick={() => api.post('/purchase-orders', { ...form, projectId }).then(onRefresh)}>Create PO</button>
    </div>
  );
}

function ProductionTab({ prod, onRefresh }) {
  if (!prod) return <div className="empty">Open a project in production to initialize operations.</div>;
  return (
    <div className="card">
      <h3>{prod.productionId}</h3>
      {prod.operations.map((op) => (
        <div className="check-row" key={op.id}>
          <div>
            <strong>{op.name}</strong>
            <p>{op.completedQty || 0} / {op.plannedQty || 0} · {op.assignedTeam || '—'}</p>
          </div>
          <select defaultValue={op.statusCode} onChange={(e) => api.patch(`/production/operations/${op.id}`, { statusCode: e.target.value }).then(onRefresh)}>
            {['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'ON_HOLD'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

function QualityTab({ project, lookups, onRefresh }) {
  const [form, setForm] = useState({ typeCode: 'INCOMING', resultCode: 'PASSED' });
  return (
    <div className="card">
      {project.inspections.map((i) => (
        <div className="check-row" key={i.id}>
          <div>
            <strong>{i.inspectionId}</strong>
            <p>{labelOf(lookups, 'INSPECTION_TYPE', i.typeCode)} · {i.inspector?.fullName}</p>
          </div>
          <StatusBadge code={i.resultCode} />
        </div>
      ))}
      <div className="form-grid">
        <label className="field">Type
          <select onChange={(e) => setForm({ ...form, typeCode: e.target.value })}>
            {(lookups.INSPECTION_TYPE || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        </label>
        <label className="field">Result
          <select onChange={(e) => setForm({ ...form, resultCode: e.target.value })}>
            {(lookups.INSPECTION_RESULT || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        </label>
        <label className="field full">Defect / remarks<textarea onChange={(e) => setForm({ ...form, defect: e.target.value, remarks: e.target.value })} /></label>
      </div>
      <button className="btn" type="button" onClick={() => api.post('/quality', { ...form, projectId: project.id }).then(onRefresh)}>Record inspection</button>
    </div>
  );
}

function InstallTab({ inst, project, onRefresh }) {
  const [visit, setVisit] = useState({});
  if (!inst) return <div className="empty">Installation record not initialized.</div>;
  return (
    <div className="grid-2">
      <div className="card">
        <h3>Site readiness · {inst.readinessCode || 'NOT_READY'}</h3>
        {(inst.readiness || []).map((r) => (
          <div className="check-row" key={r.id}>
            <span>{r.label}</span>
            <select defaultValue={r.statusCode} onChange={(e) => api.patch(`/installation/${inst.id}/readiness`, { items: [{ itemCode: r.itemCode, statusCode: e.target.value }] }).then(onRefresh)}>
              <option>READY</option>
              <option>NOT_READY</option>
              <option value="PARTIAL">PARTIALLY READY</option>
            </select>
          </div>
        ))}
        <h3 style={{ marginTop: 16 }}>Activities</h3>
        {(inst.activities || []).map((a) => (
          <div className="check-row" key={a.id}>
            <span>{a.label}</span>
            <select defaultValue={a.statusCode} onChange={(e) => api.patch(`/installation/activities/${a.id}`, { statusCode: e.target.value }).then(onRefresh)}>
              <option>NOT_STARTED</option>
              <option>IN_PROGRESS</option>
              <option>COMPLETED</option>
            </select>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Visits</h3>
        {(inst.visits || []).map((v) => (
          <div key={v.id} className="check-row">
            <div>
              <strong>{fmtDate(v.visitDate)}</strong>
              <p>{v.workCompleted} · {v.progressPercent || 0}%</p>
            </div>
          </div>
        ))}
        <label className="field">Visit date<input type="date" onChange={(e) => setVisit({ ...visit, visitDate: e.target.value })} /></label>
        <label className="field">Work completed<textarea onChange={(e) => setVisit({ ...visit, workCompleted: e.target.value })} /></label>
        <button className="btn" type="button" onClick={() => api.post(`/installation/${inst.id}/visits`, visit).then(onRefresh)}>Add visit</button>
        <h3 style={{ marginTop: 16 }}>Punch points</h3>
        {project.punchPoints.map((p) => (
          <div className="check-row" key={p.id}>
            <div><strong>{p.punchId}</strong><p>{p.description}</p></div>
            <StatusBadge code={p.statusCode} />
          </div>
        ))}
      </div>
    </div>
  );
}

const LIFE = [
  { label: 'Enquiry', stages: [] },
  { label: 'Quotation', stages: [] },
  { label: 'Order', stages: ['ORDER_REVIEW'] },
  { label: 'Design', stages: ['DETAILED_DESIGN', 'DESIGN_APPROVAL', 'BOM_MRP'] },
  { label: 'Procurement', stages: ['PROCUREMENT', 'MATERIAL_RECEIPT'] },
  { label: 'Production', stages: ['PRODUCTION', 'PRODUCTION_QC', 'PACKING'] },
  { label: 'Dispatch', stages: ['DISPATCH'] },
  { label: 'Installation', stages: ['SITE_READINESS', 'INSTALLATION', 'INSTALLATION_QC', 'CUSTOMER_INSPECTION'] },
  { label: 'Handover', stages: ['HANDOVER'] },
  { label: 'Closure', stages: ['INVOICE_PAYMENT', 'PROJECT_CLOSURE'] },
];

const DEPT_STAGES = {
  Sales: ['ORDER_REVIEW'],
  Design: ['DETAILED_DESIGN', 'DESIGN_APPROVAL', 'BOM_MRP'],
  Procurement: ['PROCUREMENT', 'MATERIAL_RECEIPT'],
  Production: ['PRODUCTION', 'PACKING'],
  Quality: ['PRODUCTION_QC', 'INSTALLATION_QC'],
  Installation: ['SITE_READINESS', 'INSTALLATION', 'CUSTOMER_INSPECTION'],
  Finance: ['INVOICE_PAYMENT'],
};

function ExecutiveProjectBlock({ project, lookups }) {
  const byCode = Object.fromEntries((project.stages || []).map((s) => [s.stageCode, s]));
  function mark(step) {
    if (!step.stages.length) return project.lead ? 'done' : 'upcoming';
    if (step.stages.includes(project.currentStageCode)) return 'current';
    const recs = step.stages.map((c) => byCode[c]).filter(Boolean);
    if (recs.length && recs.every((s) => s.statusCode === 'COMPLETED')) return 'done';
    return 'upcoming';
  }
  function deptPct(codes) {
    const recs = codes.map((c) => byCode[c]).filter(Boolean);
    if (!recs.length) return 0;
    const done = recs.filter((s) => s.statusCode === 'COMPLETED').length;
    const mid = recs.filter((s) => s.statusCode === 'IN_PROGRESS').length;
    return Math.round(((done + mid * 0.5) / recs.length) * 100);
  }
  const issues = [];
  if (project.currentStatusCode === 'BLOCKED') issues.push(project.remarks || 'Project is blocked');
  (project.inspections || []).filter((i) => i.resultCode === 'FAILED').forEach((i) => issues.push(`QC failed: ${i.defect || i.inspectionId}`));
  (project.punchPoints || []).filter((p) => ['OPEN', 'IN_PROGRESS'].includes(p.statusCode)).forEach((p) => issues.push(`Punch point: ${p.description}`));
  const upcoming = (project.tasks || []).filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.statusCode)).slice(0, 5);

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3>Project lifecycle</h3>
      <div className="life">
        {LIFE.map((step) => {
          const state = mark(step);
          return (
            <div key={step.label} className={`life-step ${state}`}>
              <b>{state === 'done' ? '✓' : state === 'current' ? '●' : '○'}</b>
              <span>{step.label}</span>
            </div>
          );
        })}
      </div>
      <h3 style={{ marginTop: 16 }}>Department progress</h3>
      {Object.entries(DEPT_STAGES).map(([name, codes]) => (
        <div className="bar-row" key={name}>
          <span style={{ width: 110 }}>{name}</span>
          <div className="track"><i style={{ width: `${deptPct(codes)}%` }} /></div>
          <strong>{deptPct(codes)}%</strong>
        </div>
      ))}
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div>
          <h3>Current issues</h3>
          {!issues.length && <p>No open issues recorded.</p>}
          {issues.map((x) => <p key={x}>{x}</p>)}
        </div>
        <div>
          <h3>Upcoming activities</h3>
          {!upcoming.length && <p>No open tasks.</p>}
          {upcoming.map((t) => <p key={t.id}>{t.name} · {labelOf(lookups, 'TASK_STATUS', t.statusCode)}</p>)}
        </div>
      </div>
    </div>
  );
}
