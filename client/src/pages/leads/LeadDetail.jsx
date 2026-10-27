import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useLookups } from '../../hooks/useLookups';
import { fmtDate, fmtDateTime, labelOf, money } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { leadStatusLabel, productGroupLabel, statusOptions } from './leadFields';

export default function LeadDetail() {
  const { id } = useParams();
  const lookups = useLookups();
  const { has } = useAuth();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  function load() {
    api.get(`/leads/${id}`).then(setLead).catch((e) => setError(e.message));
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [id]);

  if (error) return <div className="error-state">{error}</div>;
  if (!lead) return <div className="loading">Loading…</div>;
  const req = lead.requirement || {};

  function openConvert() {
    setModalError('');
    const linked = lead.projects?.[0];
    const poDay = linked?.poDate ? String(linked.poDate).slice(0, 10) : '';
    setForm({
      name: linked?.name || lead.customer?.companyName || '',
      poNumber: linked?.poNumber || '',
      poDate: poDay.length >= 10 ? poDay.slice(0, 10) : '',
      currency: linked?.currency || lead.budgetCurrency || 'INR',
      currencyValue: linked?.currencyValue ?? lead.budgetAmount ?? '',
    });
    setModal('convert');
  }

  async function submitModal(e) {
    e.preventDefault();
    setModalError('');
    setSaving(true);
    try {
      if (modal === 'hold') await api.patch(`/leads/${id}/output-hold`, { onHold: true, reason: form.reason });
      if (modal === 'followup') await api.post(`/leads/${id}/followups`, form);
      if (modal === 'remark') await api.post(`/leads/${id}/remarks`, { body: form.body });
      if (modal === 'status') await api.patch(`/leads/${id}/status`, { statusCode: form.statusCode, reason: form.reason });
      if (modal === 'revision') await api.post(`/leads/${id}/revisions`, form);
      if (modal === 'document') {
        const fd = new FormData();
        fd.append('file', form.file);
        fd.append('categoryCode', form.categoryCode || 'OTHER');
        await api.post(`/leads/${id}/documents`, fd);
      }
      if (modal === 'convert') {
        const project = await api.post(`/leads/${id}/convert`, form);
        navigate(`/projects/${project.id}`);
        return;
      }
      setModal(null);
      setForm({});
      load();
    } catch (err) {
      setModalError(err.message || 'Unable to save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{lead.leadId}</h2>
          <p>{lead.customer?.companyName} · {lead.salesPerson?.fullName || 'Unassigned'}</p>
          <div className="btn-row">
            <StatusBadge code={lead.statusCode} label={leadStatusLabel(lead.statusCode, lookups)} />
            <StatusBadge code={lead.priorityCode} label={labelOf(lookups, 'PRIORITY', lead.priorityCode)} />
            <StatusBadge code={lead.outputStatus} label={lead.outputStatusLabel} />
          </div>
        </div>
        <div className="btn-row">
          {has('leads.edit') && <Link className="btn secondary" to={`/leads/${id}/edit`}>Edit</Link>}
          {has('leads.edit') && <button className="btn ghost" onClick={() => setModal('followup')}>Add Follow-up</button>}
          {(has('customer_feedback.create') || has('customer_feedback.edit') || has('leads.edit')) && (
            <button
              className="btn ghost"
              type="button"
              onClick={async () => {
                const record = lead.customerFeedback?.id
                  ? lead.customerFeedback
                  : await api.post(`/leads/${id}/customer-feedback`, {});
                navigate(`/customer-feedback/${record.id}`);
              }}
            >
              {lead.customerFeedback?.id ? 'Customer Feedback' : 'Send to Customer Feedback'}
            </button>
          )}
          {has('documents.upload') && <button className="btn ghost" onClick={() => setModal('document')}>Upload Document</button>}
          {has('leads.edit') && <button className="btn ghost" onClick={() => setModal('remark')}>Add Remark</button>}
          {has('leads.edit') && <button className="btn ghost" onClick={() => setModal('status')}>Change Status</button>}
          {has('leads.edit') && <button className="btn ghost" onClick={() => setModal('revision')}>Add Revision</button>}
          {has('leads.edit') && !lead.outputCompletedAt && <button className="btn ghost" onClick={() => api.patch(`/leads/${id}/output`, { completed: true }).then(load)}>Mark Output Submitted</button>}
          {has('leads.edit') && !lead.outputCompletedAt && !lead.outputOnHold && <button className="btn ghost" onClick={() => setModal('hold')}>Place On Hold</button>}
          {has('leads.edit') && lead.outputOnHold && <button className="btn ghost" onClick={() => api.patch(`/leads/${id}/output-hold`, { onHold: false }).then(load)}>Resume Output</button>}
          {has('leads.convert') && lead.statusCode === 'WON' && <button className="btn copper" type="button" onClick={openConvert}>Convert to Project</button>}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Customer information</h3>
          <p><strong>{lead.customer?.companyName}</strong></p>
          <p>Address: {lead.locationPending ? '—' : (lead.companyAddress || lead.location || '—')}</p>
          <p>Product Group: {productGroupLabel(lead.productGroup, lookups)}</p>
          <p>Sales Person: {lead.salesPerson?.fullName || 'Unassigned'}</p>
          <p>{lead.contact?.name} · {lead.contact?.designation}</p>
          <p>{lead.contact?.mobile} · {lead.contact?.email}</p>
          <p>Plant / Warehouse: {lead.plantLocation || '—'}</p>
        </div>
        <div className="card">
          <h3>Output & deadline</h3>
          <p>Output Required: {lead.outputRequiredLabel || labelOf(lookups, 'OUTPUT_REQUIRED', lead.outputRequired)}</p>
          <p>Created: {fmtDateTime(lead.createdAt)}</p>
          <p>Submission Deadline: {fmtDate(lead.submissionDeadline)}</p>
          <p>Status: <StatusBadge code={lead.outputStatus} label={lead.outputStatusLabel} /></p>
          {lead.outputOnHold && <p>Hold reason: {lead.holdReason || '—'} · since {fmtDateTime(lead.holdStartedAt)}</p>}
          {lead.outputCompletedAt && (
            <>
              <p>Completed: {fmtDateTime(lead.outputCompletedAt)}</p>
              <p>Completed by: {lead.outputCompletedBy?.fullName || '—'}</p>
              <p>Submission delay: {lead.outputDelayDays ?? lead.delayDays ?? 0} day{(lead.outputDelayDays ?? lead.delayDays ?? 0) === 1 ? '' : 's'}</p>
            </>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Qualification</h3>
          <p>Need: {lead.customerNeed || '—'}</p>
          <p>Next follow-up: {fmtDate(lead.nextFollowUpDate)}</p>
          <p>Expected order: {fmtDate(lead.expectedOrderDate)}</p>
          <p>Remarks: {lead.remarks || '—'}</p>
        </div>
        <div className="card">
          <h3>Requirement</h3>
          <p>{labelOf(lookups, 'REQUIREMENT_TYPE', req.requirementType)} · {labelOf(lookups, 'STORAGE_METHOD', req.storageMethodCode)}</p>
          <p>Material: {req.materialToStore || '—'}</p>
          <p>Qty: {req.requiredQuantity || '—'} · Levels: {req.noOfLevels || '—'}</p>
          <p>Load: {req.loadPerPalletKg || '—'} kg · Pallet: {req.palletMaterialSize || '—'}</p>
          <p>Rack: {req.rackLength} × {req.rackDepth} × {req.rackHeight}</p>
        </div>
        <div className="card">
          <h3>Site & handling</h3>
          <p>Area: {req.availableAreaLength} × {req.availableAreaWidth} · Height: {req.clearHeight}</p>
          <p>Floor: {req.floorCondition} · {req.floorLoadingCapacity}</p>
          <p>Available: {req.equipmentAvailable || '—'}</p>
          <p>Required: {req.equipmentRequired || '—'}</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Commercial</h3>
        <p>Budget: {money(lead.budgetAmount, lead.budgetCurrency)}</p>
        <p>Competitor: {lead.competitor || '—'} · Decision maker: {lead.decisionMaker || '—'}</p>
        <p>Quotation by: {fmtDate(lead.quotationRequiredBy)}</p>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Technical checklist</h3>
        {lead.checklist?.map((item) => (
          <div className="check-row" key={item.itemCode}>
            <div>
              <span>{item.label}</span>
              {item.completed && <small> · {item.completedBy?.fullName} · {fmtDate(item.completedAt)}</small>}
            </div>
            <button className={`toggle ${item.completed ? 'on' : ''}`} type="button" onClick={() => api.patch(`/leads/${id}/checklist/${item.itemCode}`, { completed: !item.completed }).then(load)} />
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Documents</h3>
          {(lead.documents || []).map((d) => (
            <div className="check-row" key={d.id}>
              <div>
                <strong>{d.originalName}</strong>
                <p>{labelOf(lookups, 'DOCUMENT_TYPE', d.categoryCode)} · {d.revision} · {fmtDate(d.uploadedAt)}</p>
              </div>
            </div>
          ))}
          {!lead.documents?.length && <div className="empty">No documents.</div>}
        </div>
        <div className="card">
          <h3>Revisions</h3>
          {(lead.revisions || []).map((r) => (
            <div className="check-row" key={r.id}>
              <div>
                <strong>{r.category} {r.revisionNumber}</strong>
                <p>{r.reason || '—'} · {fmtDate(r.createdAt)}</p>
              </div>
              <StatusBadge code={r.statusCode} />
            </div>
          ))}
          {!lead.revisions?.length && <div className="empty">No revisions yet.</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Follow-ups</h3>
        <div className="timeline">
          {(lead.followUps || []).map((f) => (
            <div className="tl-item" key={f.id}>
              <strong>{fmtDate(f.followUpDate)} · {labelOf(lookups, 'FOLLOW_UP_TYPE', f.typeCode)}</strong>
              <p>{f.discussion}</p>
              {f.customerFeedback && <p>Customer: {f.customerFeedback}</p>}
              <p>Next action: {f.nextAction || '—'} · Next follow-up: {fmtDate(f.nextFollowUpDate)}</p>
              <small>{f.salesPerson?.fullName}</small>
            </div>
          ))}
          {!lead.followUps?.length && <div className="empty">No follow-ups recorded.</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Activity timeline</h3>
        <div className="timeline">
          {(lead.activity || []).map((a) => (
            <div className="tl-item" key={a.id}>
              <strong>{(a.action || 'ACTIVITY').replaceAll('_', ' ')}</strong>
              <p>{a.description}</p>
              {a.oldValue && <p>{a.oldValue} → {a.newValue}</p>}
              <small>{a.user?.fullName} · {fmtDateTime(a.timestamp)}</small>
            </div>
          ))}
        </div>
      </div>

      {modal && (
        <Modal title={modal} onClose={() => setModal(null)}>
          <form onSubmit={submitModal} className="form-grid">
            {modal === 'followup' && (
              <>
                <label className="field">Follow-up Date<input type="date" onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} /></label>
                <label className="field">Type
                  <select onChange={(e) => setForm({ ...form, typeCode: e.target.value })}>
                    {(lookups.FOLLOW_UP_TYPE || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                  </select>
                </label>
                <label className="field full">Discussion<textarea onChange={(e) => setForm({ ...form, discussion: e.target.value })} /></label>
                <label className="field full">Customer Feedback<textarea onChange={(e) => setForm({ ...form, customerFeedback: e.target.value })} /></label>
                <label className="field">Next Action<input onChange={(e) => setForm({ ...form, nextAction: e.target.value })} /></label>
                <label className="field">Next Follow-up Date<input type="date" onChange={(e) => setForm({ ...form, nextFollowUpDate: e.target.value })} /></label>
                <label className="field full">Remarks<textarea onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></label>
              </>
            )}
            {modal === 'hold' && (
              <>
                <p className="full">Places output tracking on hold. The original submission deadline is kept.</p>
                <label className="field full">Hold reason<textarea onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
              </>
            )}
            {modal === 'remark' && <label className="field full">Remark<textarea onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>}
            {modal === 'status' && (
              <>
                <label className="field">Status
                  <select onChange={(e) => setForm({ ...form, statusCode: e.target.value })}>
                    {statusOptions(lookups).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                  </select>
                </label>
                <label className="field full">Reason<textarea onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
              </>
            )}
            {modal === 'revision' && (
              <>
                <label className="field">Category
                  <select onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {(lookups.REVISION_CATEGORY || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                  </select>
                </label>
                <label className="field">Reason<input onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
                <label className="field full">Customer Feedback<textarea onChange={(e) => setForm({ ...form, customerFeedback: e.target.value })} /></label>
              </>
            )}
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
            {modal === 'convert' && (
              <>
                <p className="full">
                  {lead.projects?.[0]
                    ? `Saves these details on ${lead.projects[0].projectId}.`
                    : 'Creates a project from this won lead and keeps the same lead linked.'}
                </p>
                <label className="field">Project Name
                  <input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <label className="field">PO Number
                  <input value={form.poNumber || ''} onChange={(e) => setForm({ ...form, poNumber: e.target.value })} />
                </label>
                <label className="field">PO Date
                  <input type="date" value={form.poDate || ''} onChange={(e) => setForm({ ...form, poDate: e.target.value })} />
                </label>
                <label className="field">Currency
                  <select value={form.currency || 'INR'} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                    {(lookups.CURRENCY?.length ? lookups.CURRENCY : [{ code: 'INR', label: 'INR' }]).map((s) => (
                      <option key={s.code} value={s.code}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field">Currency Value
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.currencyValue ?? ''}
                    onChange={(e) => setForm({ ...form, currencyValue: e.target.value })}
                  />
                </label>
              </>
            )}
            {modalError && <p className="form-error full">{modalError}</p>}
            <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
