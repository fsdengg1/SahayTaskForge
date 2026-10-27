import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { fmtDate, money } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';

const FLOW = ['ORDER CONFIRMED', 'DESIGN', 'PROCUREMENT', 'PRODUCTION', 'QUALITY', 'DISPATCH', 'INSTALLATION', 'COMPLETED'];

const EMPTY_FORM = {
  customer: '',
  location: '',
  productGroup: '',
  salesPersonId: '',
  orderDate: '',
  projectValue: '',
  poStatus: '',
  targetDate: '',
  remarks: '',
};

function blank(value) {
  return value && value !== '—' ? value : '—';
}

export default function OtrDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState('');
  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [requestId, setRequestId] = useState('');
  const [view, setView] = useState(null);
  const [remove, setRemove] = useState(null);

  function load() {
    setError('');
    return api.get('/lifecycle/dashboard')
      .then((payload) => {
        setData(payload);
        setError('');
      })
      .catch(() => {
        setData(null);
        setError('Unable to load OTR data. Please try again.');
      });
  }

  useEffect(() => { load(); }, []);

  const counts = data?.counts || {};
  const items = data?.items || [];
  const salesPeople = data?.salesPeople || [];
  const poStatuses = data?.poStatuses || [];
  const canEdit = Boolean(data?.canEdit);
  const cards = [
    ['Total Orders', counts.total],
    ['Design', counts.design],
    ['Procurement', counts.procurement],
    ['Production', counts.production],
    ['Installation', counts.installation],
    ['Completed', counts.completed],
  ];

  function openCreate() {
    setForm(EMPTY_FORM);
    setRequestId(crypto.randomUUID());
    setFormMode({ mode: 'create' });
    setNotice(null);
  }

  function openEdit(row) {
    setForm({
      customer: row.customer && row.customer !== '—' ? row.customer : '',
      location: row.location && row.location !== '—' ? row.location : '',
      productGroup: row.productGroup && row.productGroup !== '—' ? row.productGroup : '',
      salesPersonId: row.ownerId || '',
      orderDate: row.orderDateInput || '',
      projectValue: row.projectValue ?? '',
      poStatus: row.poStatusCode || '',
      targetDate: row.targetDateInput || (row.targetAt ? String(row.targetAt).slice(0, 10) : ''),
      remarks: row.entryRemarks || '',
    });
    setFormMode({ mode: 'edit', row });
    setNotice(null);
  }

  function payload() {
    return {
      ...form,
      projectValue: form.projectValue === '' ? null : Number(form.projectValue),
      requestId: formMode?.mode === 'create' ? requestId : undefined,
    };
  }

  async function saveForm(event) {
    event.preventDefault();
    if (!formMode) return;
    setBusy('save');
    setNotice(null);
    try {
      if (formMode.mode === 'create') await api.post('/lifecycle/orders', payload());
      else await api.patch(`/lifecycle/orders/${formMode.row.id}`, payload());
      setNotice({
        text: formMode.mode === 'create' ? 'OTR order created successfully.' : 'OTR order updated successfully.',
        error: false,
      });
      setFormMode(null);
      await load();
    } catch (err) {
      setNotice({ text: err.message || 'Unable to save this OTR order.', error: true });
    } finally {
      setBusy('');
    }
  }

  async function confirmDelete() {
    if (!remove) return;
    setBusy('delete');
    setNotice(null);
    try {
      await api.delete(`/lifecycle/orders/${remove.id}`);
      setNotice({ text: 'OTR order deleted successfully.', error: false });
      setRemove(null);
      await load();
    } catch (err) {
      setNotice({ text: err.message || 'Unable to delete this OTR order.', error: true });
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="oc-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">OTR</p>
          <h2>OTR Dashboard</h2>
          <p>Orders in the OTR workflow and the stage each one is in.</p>
        </div>
        {canEdit && <button className="btn" type="button" onClick={openCreate}>+ Create OTR Order</button>}
      </div>
      {notice && <div className={`notice${notice.error ? ' err' : ''}`}>{notice.text}</div>}
      {error && (
        <div className="oc-state">
          <strong>{error}</strong>
          <button className="btn sm" type="button" onClick={load}>Retry</button>
        </div>
      )}
      {!error && !data && <div className="oc-state">Loading…</div>}
      {data && (
        <>
          <div className="ld-kpis">
            {cards.map(([label, value]) => (
              <div className="kpi" key={label}><span className="kpi-label">{label}</span><strong>{value ?? 0}</strong></div>
            ))}
          </div>
          <div className="otr-flow" aria-label="OTR workflow">
            {FLOW.map((stage, index) => (
              <span key={stage}>
                {index > 0 && <i aria-hidden="true" />}
                {stage}
              </span>
            ))}
          </div>
          {items.length === 0 ? (
            <div className="oc-state">
              <strong>No OTR orders available.</strong>
              {canEdit && <button className="btn sm" type="button" onClick={openCreate}>+ Create OTR Order</button>}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Project ID</th>
                    <th>Project Name</th>
                    <th>Customer</th>
                    <th>Location</th>
                    <th>Product Group</th>
                    <th>Sales Person</th>
                    <th>Order Confirmed Date</th>
                    <th>Current Stage</th>
                    <th>Stage Status</th>
                    <th>Target Date</th>
                    <th>Pending Days</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td>{row.orderId || '—'}</td>
                      <td>{row.direct || !row.projectId ? '—' : <Link to={`/projects/${row.id}`}>{row.projectId}</Link>}</td>
                      <td>{row.direct ? 'Direct OTR Order' : (row.name || '—')}</td>
                      <td>{blank(row.customer)}</td>
                      <td>{blank(row.location)}</td>
                      <td>{blank(row.productGroup)}</td>
                      <td>{blank(row.salesPerson)}</td>
                      <td>{fmtDate(row.orderConfirmedAt)}</td>
                      <td><StatusBadge code={row.currentStageCode} label={row.currentStage} /></td>
                      <td><StatusBadge code={row.workStatus} label={String(row.workStatus || 'PENDING').replaceAll('_', ' ')} /></td>
                      <td>{fmtDate(row.targetAt)}</td>
                      <td>{row.pendingDays ?? 0}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn sm ghost" type="button" onClick={() => setView(row)}>View</button>
                          {canEdit && <button className="btn sm ghost" type="button" onClick={() => openEdit(row)}>Edit</button>}
                          {canEdit && <button className="btn sm danger" type="button" onClick={() => setRemove(row)}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {formMode && (
        <Modal title={formMode.mode === 'create' ? 'Create OTR Order' : `Edit ${formMode.row.orderId || 'order'}`} onClose={() => !busy && setFormMode(null)} wide>
          <form className="form-grid" onSubmit={saveForm}>
            {formMode.mode === 'edit' && (
              <label className="field">
                Order ID
                <input value={formMode.row.orderId || ''} readOnly />
              </label>
            )}
            <label className="field">
              Customer
              <input required value={form.customer} onChange={(event) => setForm({ ...form, customer: event.target.value })} />
            </label>
            <label className="field">
              Location
              <input required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
            </label>
            <label className="field">
              Product Group
              <input required value={form.productGroup} onChange={(event) => setForm({ ...form, productGroup: event.target.value })} />
            </label>
            <label className="field">
              Sales Person
              <select required value={form.salesPersonId} onChange={(event) => setForm({ ...form, salesPersonId: event.target.value })}>
                <option value="">Select</option>
                {salesPeople.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
                {form.salesPersonId && !salesPeople.some((person) => person.id === form.salesPersonId) && formMode?.row && (
                  <option value={form.salesPersonId}>{formMode.row.salesPerson}</option>
                )}
              </select>
            </label>
            <label className="field">
              Order Date
              <input required type="date" value={form.orderDate} onChange={(event) => setForm({ ...form, orderDate: event.target.value })} />
            </label>
            <label className="field">
              Project Value
              <input type="number" min="0" step="0.01" value={form.projectValue} onChange={(event) => setForm({ ...form, projectValue: event.target.value })} />
            </label>
            <label className="field">
              PO Status
              <select value={form.poStatus} onChange={(event) => setForm({ ...form, poStatus: event.target.value })}>
                <option value="">Select</option>
                {poStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            <label className="field">
              Target Date
              <input type="date" value={form.targetDate} onChange={(event) => setForm({ ...form, targetDate: event.target.value })} />
            </label>
            <label className="field full">
              Remarks
              <textarea rows={3} value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} />
            </label>
            <div className="form-actions">
              <button className="btn ghost" type="button" disabled={busy === 'save'} onClick={() => setFormMode(null)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {view && (
        <Modal title={view.orderId || 'OTR order'} onClose={() => setView(null)} wide>
          <dl className="design-detail">
            <div><dt>Order ID</dt><dd>{blank(view.orderId)}</dd></div>
            <div><dt>Project ID</dt><dd>{view.direct || !view.projectId ? '—' : view.projectId}</dd></div>
            <div><dt>Project Name</dt><dd>{view.direct ? 'Direct OTR Order' : blank(view.name)}</dd></div>
            <div><dt>Customer</dt><dd>{blank(view.customer)}</dd></div>
            <div><dt>Location</dt><dd>{blank(view.location)}</dd></div>
            <div><dt>Product Group</dt><dd>{blank(view.productGroup)}</dd></div>
            <div><dt>Sales Person</dt><dd>{blank(view.salesPerson)}</dd></div>
            <div><dt>Order Date</dt><dd>{fmtDate(view.orderConfirmedAt)}</dd></div>
            <div><dt>Project Value</dt><dd>{view.projectValue == null ? '—' : money(view.projectValue)}</dd></div>
            <div><dt>PO Status</dt><dd>{blank(poStatuses.find((item) => item.code === view.poStatusCode)?.label || view.poStatusCode)}</dd></div>
            <div><dt>Target Date</dt><dd>{fmtDate(view.targetAt)}</dd></div>
            <div><dt>Current Stage</dt><dd>{blank(view.currentStage)}</dd></div>
            <div><dt>Stage Status</dt><dd>{String(view.workStatus || 'PENDING').replaceAll('_', ' ')}</dd></div>
            <div><dt>Remarks</dt><dd>{blank(view.entryRemarks)}</dd></div>
          </dl>
        </Modal>
      )}

      {remove && (
        <Modal title="Delete OTR order" onClose={() => !busy && setRemove(null)}>
          <p>Are you sure you want to delete this OTR order?</p>
          <div className="form-actions">
            <button className="btn ghost" type="button" disabled={busy === 'delete'} onClick={() => setRemove(null)}>Cancel</button>
            <button className="btn danger" type="button" disabled={busy === 'delete'} onClick={confirmDelete}>
              {busy === 'delete' ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
