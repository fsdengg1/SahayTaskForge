import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLookups } from '../../hooks/useLookups';
import { fmtDate, fmtDateTime, labelOf, toInputDate } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import { ACTION_HINTS, PENDING_HINTS } from './customerFeedbackHints';

export default function CustomerFeedbackDetail() {
  const { id } = useParams();
  const { has } = useAuth();
  const lookups = useLookups();
  const navigate = useNavigate();
  const [row, setRow] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const canEdit = has('customer_feedback.edit', 'leads.edit');

  function load() {
    api.get(`/customer-feedback/${id}`).then((data) => {
      setRow(data);
      setForm({
        location: data.location || '',
        layoutSentDate: toInputDate(data.layoutSentDate),
        quotationSentDate: toInputDate(data.quotationSentDate),
        drawingQuoteStatus: data.drawingQuoteStatus || '',
        feedbackStatus: data.feedbackStatus || 'PENDING',
        customerFeedback: data.customerFeedback || '',
        feedbackDate: toInputDate(data.feedbackDate),
        pendingRequirement: data.pendingRequirement || '',
        nextAction: data.nextAction || '',
        responsiblePersonId: data.responsiblePersonId || '',
        nextFollowUpDate: toInputDate(data.nextFollowUpDate),
        finalStatus: data.finalStatus || 'FOLLOW_UP_REQUIRED',
        remarks: data.remarks || '',
      });
    }).catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
  }, [id]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await api.patch(`/customer-feedback/${id}`, form);
      setRow(updated);
      setNotice('Follow-up saved. Previous history is kept.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !row) return <div className="error-state">{error}</div>;
  if (!row) return <div className="loading">Loading…</div>;

  return (
    <div className="cf-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Sales & Pre-Sales</p>
          <h2>Customer Feedback</h2>
          <p>{row.leadId} · {row.customerName || 'Customer'}</p>
          <div className="btn-row">
            <StatusBadge code={row.feedbackStatus} label={labelOf(lookups, 'FEEDBACK_STATUS', row.feedbackStatus)} />
            <StatusBadge code={row.followUpStatus} label={row.followUpStatusLabel} />
            <StatusBadge code={row.finalStatus} label={labelOf(lookups, 'FEEDBACK_FINAL_STATUS', row.finalStatus)} />
          </div>
        </div>
        <div className="btn-row">
          <button className="btn secondary" type="button" onClick={() => navigate('/customer-feedback')}>Back to list</button>
          <Link className="btn ghost" to={`/leads/${row.leadRecordId}`}>Open Lead</Link>
        </div>
      </div>

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="notice err">{error}</div>}

      <div className="cf-detail-grid">
        <div className="card">
          <h3>Customer information</h3>
          <dl className="cf-dl">
            <div><dt>Customer Name</dt><dd>{row.customerName || '—'}</dd></div>
            <div><dt>Location</dt><dd>{row.location || '—'}</dd></div>
            <div><dt>Lead ID</dt><dd><Link to={`/leads/${row.leadRecordId}`}>{row.leadId}</Link></dd></div>
          </dl>
        </div>
        <div className="card">
          <h3>Sales information</h3>
          <dl className="cf-dl">
            <div><dt>Layout Sent Date</dt><dd>{fmtDate(row.layoutSentDate)}</dd></div>
            <div><dt>Layout Pending Days</dt><dd>{row.layoutPendingDays ?? 'Not Sent'}</dd></div>
            <div><dt>Quotation Sent Date</dt><dd>{fmtDate(row.quotationSentDate)}</dd></div>
            <div><dt>Quotation Pending Days</dt><dd>{row.quotationPendingDays ?? 'Not Sent'}</dd></div>
            <div><dt>Drawing & Quote Status</dt><dd><StatusBadge code={row.drawingQuoteStatus} label={labelOf(lookups, 'DRAWING_QUOTE_STATUS', row.drawingQuoteStatus)} /></dd></div>
          </dl>
        </div>
      </div>

      <form className="card cf-edit" onSubmit={save}>
        <h3>Update follow-up</h3>
        <div className="form-grid">
          <label className="field">Location<input value={form.location} disabled={!canEdit} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
          <label className="field">Layout Sent Date<input type="date" value={form.layoutSentDate} disabled={!canEdit} onChange={(e) => setForm({ ...form, layoutSentDate: e.target.value })} /></label>
          <label className="field">Quotation Sent Date<input type="date" value={form.quotationSentDate} disabled={!canEdit} onChange={(e) => setForm({ ...form, quotationSentDate: e.target.value })} /></label>
          <label className="field">Drawing & Quote Status
            <select value={form.drawingQuoteStatus} disabled={!canEdit} onChange={(e) => setForm({ ...form, drawingQuoteStatus: e.target.value })}>
              <option value="">Select</option>
              {(lookups.DRAWING_QUOTE_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </label>
          <label className="field">Feedback Status
            <select value={form.feedbackStatus} disabled={!canEdit} onChange={(e) => setForm({ ...form, feedbackStatus: e.target.value })}>
              {(lookups.FEEDBACK_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </label>
          <label className="field">Feedback Date<input type="date" value={form.feedbackDate} disabled={!canEdit} onChange={(e) => setForm({ ...form, feedbackDate: e.target.value })} /></label>
          <label className="field full">Customer Feedback<textarea value={form.customerFeedback} disabled={!canEdit} onChange={(e) => setForm({ ...form, customerFeedback: e.target.value })} /></label>
          <label className="field">Pending Requirement
            <input list="cf-pending-d" value={form.pendingRequirement} disabled={!canEdit} onChange={(e) => setForm({ ...form, pendingRequirement: e.target.value })} />
            <datalist id="cf-pending-d">{PENDING_HINTS.map((v) => <option key={v} value={v} />)}</datalist>
          </label>
          <label className="field">Next Action
            <input list="cf-actions-d" value={form.nextAction} disabled={!canEdit} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} />
            <datalist id="cf-actions-d">{ACTION_HINTS.map((v) => <option key={v} value={v} />)}</datalist>
          </label>
          <PeopleSelect value={form.responsiblePersonId} disabled={!canEdit} onChange={(responsiblePersonId) => setForm({ ...form, responsiblePersonId })} current={row.responsiblePerson} />
          <label className="field">Next Follow-up Date<input type="date" value={form.nextFollowUpDate} disabled={!canEdit} onChange={(e) => setForm({ ...form, nextFollowUpDate: e.target.value })} /></label>
          <label className="field">Final Status
            <select value={form.finalStatus} disabled={!canEdit} onChange={(e) => setForm({ ...form, finalStatus: e.target.value })}>
              {(lookups.FEEDBACK_FINAL_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </label>
          <label className="field full">Remarks<textarea value={form.remarks} disabled={!canEdit} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></label>
        </div>
        {canEdit && (
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn copper" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save follow-up'}</button>
          </div>
        )}
      </form>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Feedback history</h3>
        <div className="timeline">
          {(row.history || []).map((item) => (
            <div className="tl-item" key={item.id}>
              <strong>{fmtDate(item.date)} · {item.user}</strong>
              <p>{String(item.action || '').replaceAll('_', ' ')}</p>
              {item.customerFeedback && <p>Customer Feedback: {item.customerFeedback}</p>}
              {item.nextAction && <p>Next Action: {item.nextAction}</p>}
              {item.remarks && <p>{item.remarks}</p>}
              <small>{fmtDateTime(item.date)}</small>
            </div>
          ))}
          {!row.history?.length && <p className="cf-quiet">No follow-up history yet.</p>}
        </div>
      </div>
    </div>
  );
}

function PeopleSelect({ value, onChange, disabled, current }) {
  const [people, setPeople] = useState([]);
  useEffect(() => {
    api.get('/users?sales=true').then(setPeople).catch(() => setPeople([]));
  }, []);
  const options = people.length ? people : (current ? [current] : []);
  return (
    <label className="field">
      Responsible Person
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select</option>
        {options.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
      </select>
    </label>
  );
}
