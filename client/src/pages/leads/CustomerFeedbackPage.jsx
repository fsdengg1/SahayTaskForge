import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLookups } from '../../hooks/useLookups';
import { fmtDate, labelOf } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';
import { ACTION_HINTS, PENDING_HINTS } from './customerFeedbackHints';

const emptyFilters = {
  q: '',
  leadId: '',
  customer: '',
  responsiblePersonId: '',
  feedbackStatus: '',
  finalStatus: '',
  followUpStatus: '',
  followUpDate: '',
  location: '',
};

const emptyForm = {
  leadId: '',
  location: '',
  layoutSentDate: '',
  quotationSentDate: '',
  drawingQuoteStatus: 'SENT',
  feedbackStatus: 'PENDING',
  customerFeedback: '',
  feedbackDate: '',
  pendingRequirement: '',
  nextAction: 'Follow-up with Customer',
  responsiblePersonId: '',
  nextFollowUpDate: '',
  finalStatus: 'FOLLOW_UP_REQUIRED',
  remarks: '',
};

export default function CustomerFeedbackPage() {
  const { has } = useAuth();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(() => ({ ...emptyFilters, ...Object.fromEntries(params.entries()) }));
  const [data, setData] = useState({ items: [], kpis: {}, filters: { people: [], locations: [] } });
  const [leads, setLeads] = useState([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const applied = useMemo(() => Object.fromEntries(params.entries()), [params]);
  const filtersOn = Object.entries(applied).some(([k, v]) => k !== 'page' && v);

  function load() {
    api.get(`/customer-feedback?${params.toString()}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
    api.get('/leads?pageSize=100&archived=false').then((d) => setLeads(d.items || [])).catch(() => {});
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [params]);

  function applyFilters(e) {
    e?.preventDefault();
    const next = new URLSearchParams();
    Object.entries(draft).forEach(([k, v]) => { if (v) next.set(k, v); });
    setParams(next);
  }

  function clearFilters() {
    setDraft(emptyFilters);
    setParams(new URLSearchParams());
  }

  function setKpi(key, value) {
    const next = new URLSearchParams();
    if (value) next.set(key, value);
    setDraft({ ...emptyFilters, [key]: value || '' });
    setParams(next);
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api.post('/customer-feedback', form);
      setOpen(false);
      setForm(emptyForm);
      navigate(`/customer-feedback/${created.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const kpis = data.kpis || {};
  const canEdit = has('customer_feedback.create', 'customer_feedback.edit', 'leads.edit');

  return (
    <div className="cf-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Sales & Pre-Sales</p>
          <h2>Customer Feedback</h2>
          <p>Track customer responses, pending requirements and follow-up actions.</p>
        </div>
        {canEdit && <button className="btn copper" type="button" onClick={() => { setForm(emptyForm); setOpen(true); }}>+ Add Feedback</button>}
      </div>

      <div className="cf-kpis">
        <button type="button" className="cf-kpi" onClick={() => setKpi('', '')}><span>Total Feedback</span><strong>{kpis.total || 0}</strong></button>
        <button type="button" className="cf-kpi warn" onClick={() => setKpi('feedbackStatus', 'PENDING')}><span>Pending Feedback</span><strong>{kpis.pending || 0}</strong></button>
        <button type="button" className="cf-kpi ok" onClick={() => setKpi('feedbackStatus', 'RECEIVED')}><span>Feedback Received</span><strong>{kpis.received || 0}</strong></button>
        <button type="button" className="cf-kpi" onClick={() => setKpi('finalStatus', 'FOLLOW_UP_REQUIRED')}><span>Follow-up Required</span><strong>{kpis.followUpRequired || 0}</strong></button>
        <button type="button" className="cf-kpi warn" onClick={() => setKpi('followUpStatus', 'DUE_TODAY')}><span>Due Today</span><strong>{kpis.dueToday || 0}</strong></button>
        <button type="button" className="cf-kpi danger" onClick={() => setKpi('followUpStatus', 'OVERDUE')}><span>Overdue</span><strong>{kpis.overdue || 0}</strong></button>
      </div>

      <form className="cf-filters" onSubmit={applyFilters}>
        <input placeholder="Search" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
        <input placeholder="Lead ID" value={draft.leadId} onChange={(e) => setDraft({ ...draft, leadId: e.target.value })} />
        <input placeholder="Customer" value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} />
        <select value={draft.responsiblePersonId} onChange={(e) => setDraft({ ...draft, responsiblePersonId: e.target.value })}>
          <option value="">Responsible Person</option>
          {(data.filters?.people || []).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
        <select value={draft.feedbackStatus} onChange={(e) => setDraft({ ...draft, feedbackStatus: e.target.value })}>
          <option value="">Feedback Status</option>
          {(lookups.FEEDBACK_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <select value={draft.finalStatus} onChange={(e) => setDraft({ ...draft, finalStatus: e.target.value })}>
          <option value="">Final Status</option>
          {(lookups.FEEDBACK_FINAL_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <select value={draft.followUpStatus} onChange={(e) => setDraft({ ...draft, followUpStatus: e.target.value })}>
          <option value="">Follow-up Status</option>
          <option value="UPCOMING">Upcoming</option>
          <option value="DUE_TODAY">Due Today</option>
          <option value="OVERDUE">Overdue</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <input type="date" title="Follow-up Date" value={draft.followUpDate} onChange={(e) => setDraft({ ...draft, followUpDate: e.target.value })} />
        <select value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })}>
          <option value="">Location</option>
          {(data.filters?.locations || []).map((loc) => <option key={loc} value={loc}>{loc}</option>)}
        </select>
        <div className="cf-filter-actions">
          <button className="btn copper" type="submit">Apply</button>
          <button className="btn secondary" type="button" onClick={clearFilters}>Clear</button>
        </div>
      </form>

      {error && <div className="notice err">{error}</div>}

      {!data.items?.length ? (
        <div className="cf-empty">
          <strong>{filtersOn ? 'No feedback records match your filters.' : 'No customer feedback pending'}</strong>
          <p>{filtersOn ? 'Try a different search or clear the current filters.' : 'All customer follow-ups are currently clear.'}</p>
          {filtersOn
            ? <button className="btn secondary" type="button" onClick={clearFilters}>Clear Filters</button>
            : canEdit && <button className="btn copper" type="button" onClick={() => setOpen(true)}>+ Add Feedback</button>}
        </div>
      ) : (
        <div className="cf-scroll">
          <table className="cf-table">
            <thead>
              <tr>
                <th>Lead ID</th>
                <th>Customer Name</th>
                <th>Location</th>
                <th>Layout Sent Date</th>
                <th>Layout Pending Days</th>
                <th>Quotation Sent Date</th>
                <th>Quotation Pending Days</th>
                <th>Drawing & Quote Status</th>
                <th>Customer Feedback</th>
                <th>Feedback Date</th>
                <th>Pending Requirement</th>
                <th>Next Action</th>
                <th>Responsible Person</th>
                <th>Next Follow-up Date</th>
                <th>Final Status</th>
                <th>Remarks</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id} className={row.followUpStatus === 'OVERDUE' ? 'is-overdue' : ''} onClick={() => navigate(`/customer-feedback/${row.id}`)}>
                  <td data-label="Lead ID"><Link to={`/leads/${row.leadRecordId}`} onClick={(e) => e.stopPropagation()}>{row.leadId}</Link></td>
                  <td data-label="Customer">{row.customerName || '—'}</td>
                  <td data-label="Location">{row.location || '—'}</td>
                  <td data-label="Layout Sent">{fmtDate(row.layoutSentDate)}</td>
                  <td data-label="Layout Pending Days">{row.layoutPendingDays ?? 'Not Sent'}</td>
                  <td data-label="Quotation Sent">{fmtDate(row.quotationSentDate)}</td>
                  <td data-label="Quotation Pending Days">{row.quotationPendingDays ?? 'Not Sent'}</td>
                  <td data-label="Drawing & Quote"><StatusBadge code={row.drawingQuoteStatus} label={labelOf(lookups, 'DRAWING_QUOTE_STATUS', row.drawingQuoteStatus)} /></td>
                  <td data-label="Feedback" className="cf-clip">{row.customerFeedback || labelOf(lookups, 'FEEDBACK_STATUS', row.feedbackStatus)}</td>
                  <td data-label="Feedback Date">{fmtDate(row.feedbackDate)}</td>
                  <td data-label="Pending Requirement" className="cf-clip">{row.pendingRequirement || '—'}</td>
                  <td data-label="Next Action" className="cf-clip">{row.nextAction || '—'}</td>
                  <td data-label="Responsible">{row.responsiblePerson?.fullName || '—'}</td>
                  <td data-label="Next Follow-up" className={row.followUpStatus === 'OVERDUE' ? 'danger' : row.followUpStatus === 'DUE_TODAY' ? 'warn' : ''}>
                    <div>{fmtDate(row.nextFollowUpDate)}</div>
                    <StatusBadge code={row.followUpStatus} label={row.followUpStatusLabel} />
                  </td>
                  <td data-label="Final Status"><StatusBadge code={row.finalStatus} label={labelOf(lookups, 'FEEDBACK_FINAL_STATUS', row.finalStatus)} /></td>
                  <td data-label="Remarks" className="cf-clip">{row.remarks || '—'}</td>
                  <td data-label="Actions">
                    <button className="linkish" type="button" onClick={(e) => { e.stopPropagation(); navigate(`/customer-feedback/${row.id}`); }}>Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal title="Add Customer Feedback" onClose={() => setOpen(false)} wide>
          <form className="form-grid" onSubmit={create}>
            <label className="field">
              Lead
              <select value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })} required>
                <option value="">Select existing lead</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>{lead.leadId} — {lead.customer?.companyName}</option>
                ))}
              </select>
            </label>
            <label className="field">Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
            <label className="field">Layout Sent Date<input type="date" value={form.layoutSentDate} onChange={(e) => setForm({ ...form, layoutSentDate: e.target.value })} /></label>
            <label className="field">Quotation Sent Date<input type="date" value={form.quotationSentDate} onChange={(e) => setForm({ ...form, quotationSentDate: e.target.value })} /></label>
            <label className="field">Drawing & Quote Status
              <select value={form.drawingQuoteStatus} onChange={(e) => setForm({ ...form, drawingQuoteStatus: e.target.value })}>
                {(lookups.DRAWING_QUOTE_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </label>
            <label className="field">Feedback Status
              <select value={form.feedbackStatus} onChange={(e) => setForm({ ...form, feedbackStatus: e.target.value })}>
                {(lookups.FEEDBACK_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </label>
            <label className="field full">Customer Feedback<textarea value={form.customerFeedback} onChange={(e) => setForm({ ...form, customerFeedback: e.target.value })} /></label>
            <label className="field">Feedback Date<input type="date" value={form.feedbackDate} onChange={(e) => setForm({ ...form, feedbackDate: e.target.value })} /></label>
            <label className="field">Pending Requirement
              <input list="cf-pending" value={form.pendingRequirement} onChange={(e) => setForm({ ...form, pendingRequirement: e.target.value })} />
              <datalist id="cf-pending">{PENDING_HINTS.map((v) => <option key={v} value={v} />)}</datalist>
            </label>
            <label className="field">Next Action
              <input list="cf-actions" value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} />
              <datalist id="cf-actions">{ACTION_HINTS.map((v) => <option key={v} value={v} />)}</datalist>
            </label>
            <label className="field">Responsible Person
              <select value={form.responsiblePersonId} onChange={(e) => setForm({ ...form, responsiblePersonId: e.target.value })}>
                <option value="">Select</option>
                {(data.filters?.people || []).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </label>
            <label className="field">Next Follow-up Date<input type="date" value={form.nextFollowUpDate} onChange={(e) => setForm({ ...form, nextFollowUpDate: e.target.value })} /></label>
            <label className="field">Final Status
              <select value={form.finalStatus} onChange={(e) => setForm({ ...form, finalStatus: e.target.value })}>
                {(lookups.FEEDBACK_FINAL_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </label>
            <label className="field full">Remarks<textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></label>
            <div className="btn-row">
              <button className="btn copper" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              <button className="btn secondary" type="button" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}