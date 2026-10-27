import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { fmtDate, fmtDateTime } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';

const EMPTY_FILTERS = {
  q: '',
  orderNo: '',
  customer: '',
  location: '',
  product: '',
  stage: '',
  material: '',
  qc: '',
  responsible: '',
  status: '',
  from: '',
  to: '',
};

const EMPTY_FORM = {
  projectId: '',
  startedDate: '',
  plannedDate: '',
  completedDate: '',
  stage: '',
  progress: '',
  materialStatus: '',
  qcStatus: '',
  responsibleId: '',
  followUpDate: '',
  status: '',
  remarks: '',
};

function dayKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function unique(items, key) {
  return [...new Set(items.map((item) => item[key]).filter((value) => value && value !== '—'))]
    .sort((a, b) => String(a).localeCompare(String(b)));
}

function Clip({ value, width = 160 }) {
  const text = value && value !== '—' ? String(value) : '—';
  return (
    <span className="design-clip" style={{ maxWidth: width }} title={text === '—' ? undefined : text}>
      {text}
    </span>
  );
}

function DelayDays({ days }) {
  if (days == null) return '—';
  return <span className={`sheet-delay ${days > 0 ? 'late' : 'ok'}`}>{days}</span>;
}

function Percent({ value, label }) {
  const width = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="design-pct" title={label}>
      <div className="progress" aria-hidden="true"><span style={{ width: `${width}%` }} /></div>
      <strong>{label}</strong>
    </div>
  );
}

function blank(value) {
  return value && value !== '—' ? value : '—';
}

export default function OtrProductionPage() {
  const [data, setData] = useState(null);
  const [flow, setFlow] = useState({ items: [], canEdit: false });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [view, setView] = useState(null);
  const [history, setHistory] = useState(null);
  const [remove, setRemove] = useState(null);
  const loaded = useRef(false);

  const load = useCallback((options = {}) => {
    if (!options.silent) setError('');
    const tracking = api.get('/production/tracking')
      .then((payload) => {
        loaded.current = true;
        setData(payload);
        setError('');
      })
      .catch(() => {
        if (!options.silent || !loaded.current) {
          setData(null);
          setError('Unable to load Production records. Please try again.');
        }
      });
    const downstream = api.get('/lifecycle/production-flow')
      .then((payload) => {
        setFlow({
          canEdit: Boolean(payload.canEdit),
          items: (payload.items || []).filter((row) => row.currentStageCode === 'QUALITY' || row.currentStageCode === 'DISPATCH'),
        });
      })
      .catch(() => {
        if (!options.silent) setFlow({ items: [], canEdit: false });
      });
    return Promise.all([tracking, downstream]);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load({ silent: true });
    }, 15000);
    function onFocus() { load({ silent: true }); }
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const items = data?.items || [];
  const orders = data?.orders || [];
  const stages = data?.stages || [];
  const materialStatuses = data?.materialStatuses || [];
  const qcStatuses = data?.qcStatuses || [];
  const statuses = data?.statuses || [];
  const assignees = data?.assignees || [];
  const canEdit = Boolean(data?.canEdit);
  const selectedOrder = orders.find((order) => order.id === form.projectId) || (formMode?.row ? formMode.row : null);

  const filtered = useMemo(() => items.filter((row) => {
    if (filters.q) {
      const hay = [row.orderNo, row.customer, row.location, row.product, row.responsibleName].join(' ').toLowerCase();
      if (!hay.includes(filters.q.trim().toLowerCase())) return false;
    }
    if (filters.orderNo && row.orderNo !== filters.orderNo) return false;
    if (filters.customer && row.customer !== filters.customer) return false;
    if (filters.location && row.location !== filters.location) return false;
    if (filters.product && row.product !== filters.product) return false;
    if (filters.stage && row.stage !== filters.stage) return false;
    if (filters.material && row.materialStatus !== filters.material) return false;
    if (filters.qc && row.qcStatus !== filters.qc) return false;
    if (filters.responsible && row.responsibleName !== filters.responsible) return false;
    if (filters.status && row.status !== filters.status) return false;
    const orderDay = dayKey(row.orderDate);
    if (filters.from && (!orderDay || orderDay < filters.from)) return false;
    if (filters.to && (!orderDay || orderDay > filters.to)) return false;
    return true;
  }), [items, filters]);

  const filtersOn = Object.values(filters).some(Boolean);

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormMode({ mode: 'create' });
  }

  function openEdit(row) {
    setForm({
      projectId: row.projectId,
      startedDate: row.startedDateInput || '',
      plannedDate: row.plannedDateInput || '',
      completedDate: row.completedDateInput || '',
      stage: row.stage || '',
      progress: row.progress === 0 || row.progress ? String(row.progress) : '',
      materialStatus: row.materialStatus || '',
      qcStatus: row.qcStatus || '',
      responsibleId: row.responsibleId || '',
      followUpDate: row.followUpInput || '',
      status: row.status || '',
      remarks: row.remarks || '',
    });
    setFormMode({ mode: 'edit', row });
  }

  function payload() {
    const body = {
      stage: form.stage,
      progress: form.progress === '' ? '' : Number(form.progress),
      materialStatus: form.materialStatus,
      qcStatus: form.qcStatus,
      status: form.status,
      responsibleId: form.responsibleId || null,
      startedDate: form.startedDate || null,
      plannedDate: form.plannedDate || null,
      followUpDate: form.followUpDate || null,
      remarks: form.remarks,
    };
    if (form.status === 'COMPLETED' && form.completedDate) body.completedDate = form.completedDate;
    if (formMode?.mode === 'create') body.projectId = form.projectId;
    return body;
  }

  async function saveForm(event) {
    event.preventDefault();
    if (!formMode) return;
    setBusy('save');
    setNotice(null);
    try {
      if (formMode.mode === 'create') {
        await api.post('/production/tracking', payload());
        setNotice({ text: 'Production record created successfully.', error: false });
      } else {
        await api.patch(`/production/tracking/${formMode.row.id}`, payload());
        setNotice({ text: 'Production record updated successfully.', error: false });
      }
      setFormMode(null);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to save this production record.', error: true });
    } finally {
      setBusy('');
    }
  }

  async function confirmDelete() {
    if (!remove) return;
    setBusy('delete');
    setNotice(null);
    try {
      await api.delete(`/production/tracking/${remove.id}`);
      setNotice({ text: 'Production record deleted successfully.', error: false });
      setRemove(null);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to delete this production record.', error: true });
    } finally {
      setBusy('');
    }
  }

  async function openView(row) {
    setView(row);
    setHistory(null);
    try {
      const payloadHistory = await api.get(`/production/tracking/${row.id}/history`);
      setHistory(payloadHistory.items || []);
    } catch (err) {
      setHistory({ error: err.message || 'Unable to load production history.' });
    }
  }

  async function flowAct(row, action) {
    setBusy(row.id + action);
    setNotice(null);
    try {
      await api.post(`/lifecycle/execution/${row.currentStageCode}/${row.id}/${action}`, {});
      setNotice({ text: 'Saved.', error: false });
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to update this stage.', error: true });
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="oc-page design-board production-board">
      <div className="page-head">
        <div>
          <p className="eyebrow">OTR</p>
          <h2>Production</h2>
          <p>Production records for orders released from procurement. Packing and a passed QC complete this stage and release the order to quality.</p>
        </div>
        {canEdit && <button className="btn" type="button" onClick={openCreate}>+ Create Production</button>}
      </div>

      <form className="filters oc-filters" onSubmit={(event) => event.preventDefault()}>
        <input placeholder="Search" aria-label="Search" value={filters.q} onChange={(event) => setFilter('q', event.target.value)} />
        <select aria-label="Order No" value={filters.orderNo} onChange={(event) => setFilter('orderNo', event.target.value)}>
          <option value="">Order No.</option>
          {unique(items, 'orderNo').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Customer" value={filters.customer} onChange={(event) => setFilter('customer', event.target.value)}>
          <option value="">Customer</option>
          {unique(items, 'customer').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Location" value={filters.location} onChange={(event) => setFilter('location', event.target.value)}>
          <option value="">Location</option>
          {unique(items, 'location').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Product" value={filters.product} onChange={(event) => setFilter('product', event.target.value)}>
          <option value="">Product</option>
          {unique(items, 'product').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Production Stage" value={filters.stage} onChange={(event) => setFilter('stage', event.target.value)}>
          <option value="">Production Stage</option>
          {stages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <select aria-label="Material Status" value={filters.material} onChange={(event) => setFilter('material', event.target.value)}>
          <option value="">Material Status</option>
          {materialStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <select aria-label="QC Status" value={filters.qc} onChange={(event) => setFilter('qc', event.target.value)}>
          <option value="">QC Status</option>
          {qcStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <select aria-label="Responsible Person" value={filters.responsible} onChange={(event) => setFilter('responsible', event.target.value)}>
          <option value="">Responsible Person</option>
          {unique(items, 'responsibleName').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Status" value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
          <option value="">Status</option>
          {statuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <input type="date" aria-label="Date from" title="Date from" value={filters.from} onChange={(event) => setFilter('from', event.target.value)} />
        <input type="date" aria-label="Date to" title="Date to" value={filters.to} onChange={(event) => setFilter('to', event.target.value)} />
        <button className="btn ghost sm" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Reset Filters</button>
      </form>

      {notice && <div className={`notice${notice.error ? ' err' : ''}`}>{notice.text}</div>}
      {error && (
        <div className="oc-state">
          <strong>{error}</strong>
          <button className="btn sm" type="button" onClick={() => load()}>Retry</button>
        </div>
      )}
      {!error && !data && <div className="oc-state">Loading…</div>}
      {!error && data && filtered.length === 0 && (
        <div className="oc-state">
          <strong>{filtersOn ? 'No production records match these filters.' : 'No production records available.'}</strong>
          {!filtersOn && canEdit && <button className="btn sm" type="button" onClick={openCreate}>Create Production</button>}
          {filtersOn && <button className="btn ghost sm" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Reset Filters</button>}
        </div>
      )}

      {!error && filtered.length > 0 && (
        <div className="table-wrap design-scroll">
          <table className="data production-sheet">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Order No.</th>
                <th>Order Date</th>
                <th>Customer</th>
                <th>Location</th>
                <th>Product</th>
                <th>Production Start</th>
                <th>Planned Completion</th>
                <th>Actual Completion</th>
                <th>Production %</th>
                <th>Current Stage</th>
                <th>Material Status</th>
                <th>QC Status</th>
                <th>Responsible Person</th>
                <th>Next Follow Up</th>
                <th>Delay Days</th>
                <th>Status</th>
                <th>Remarks</th>
                <th className="is-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>{blank(row.orderNo)}</td>
                  <td>{fmtDate(row.orderDate)}</td>
                  <td><Clip value={row.customer} width={180} /></td>
                  <td><Clip value={row.location} width={150} /></td>
                  <td><Clip value={row.product} width={140} /></td>
                  <td>{fmtDate(row.startedAt)}</td>
                  <td>{fmtDate(row.plannedAt)}</td>
                  <td>{fmtDate(row.completedAt)}</td>
                  <td><Percent value={row.progress} label={row.progressLabel} /></td>
                  <td><StatusBadge code={row.stage} label={row.stageLabel} /></td>
                  <td><StatusBadge code={row.materialStatus} label={row.materialLabel} /></td>
                  <td><StatusBadge code={row.qcStatus} label={row.qcLabel} /></td>
                  <td><Clip value={row.responsibleName || '—'} width={150} /></td>
                  <td>{fmtDate(row.followUpAt)}</td>
                  <td><DelayDays days={row.delayDays} /></td>
                  <td><StatusBadge code={row.status} label={row.statusLabel} /></td>
                  <td><Clip value={row.remarks || '—'} width={180} /></td>
                  <td className="is-actions">
                    <div className="row-actions">
                      <button className="btn sm ghost" type="button" onClick={() => openView(row)}>View</button>
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

      {flow.items.length > 0 && (
        <section>
          <h3>Quality and dispatch</h3>
          <p className="design-note">These orders have left production. Quality approval releases dispatch, and dispatch releases installation.</p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {flow.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.orderId || '—'}</td>
                    <td>{row.customer}</td>
                    <td><StatusBadge code={row.currentStageCode} label={row.currentStage} /></td>
                    <td><StatusBadge code={row.workStatus} label={String(row.workStatus || '').replaceAll('_', ' ')} /></td>
                    <td className="row-actions">
                      {flow.canEdit && row.workStatus === 'PENDING' && (
                        <button className="btn sm" type="button" disabled={Boolean(busy)} onClick={() => flowAct(row, 'start')}>Start</button>
                      )}
                      {flow.canEdit && !['PENDING', 'COMPLETED', 'APPROVED', 'DISPATCHED'].includes(row.workStatus) && (
                        <button className="btn sm" type="button" disabled={Boolean(busy)} onClick={() => flowAct(row, 'complete')}>
                          {row.currentStageCode === 'QUALITY' ? 'Approve' : 'Complete'}
                        </button>
                      )}
                      {flow.canEdit && row.currentStageCode === 'QUALITY' && !['PENDING', 'APPROVED', 'REJECTED'].includes(row.workStatus) && (
                        <button className="btn sm danger" type="button" disabled={Boolean(busy)} onClick={() => flowAct(row, 'reject')}>Rework</button>
                      )}
                      {flow.canEdit && row.workStatus !== 'ON_HOLD' && !['COMPLETED', 'APPROVED', 'DISPATCHED'].includes(row.workStatus) && (
                        <button className="btn sm ghost" type="button" disabled={Boolean(busy)} onClick={() => flowAct(row, 'hold')}>On Hold</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {formMode && (
        <Modal title={formMode.mode === 'create' ? 'Create Production' : `Edit ${formMode.row.orderNo || 'production'}`} onClose={() => !busy && setFormMode(null)} wide>
          <form className="form-grid" onSubmit={saveForm}>
            {formMode.mode === 'create' && orders.length === 0 && (
              <p className="design-note">No orders are ready for production. An order appears here after procurement is completed.</p>
            )}
            <label className="field">
              Order No.
              <select
                required
                value={form.projectId}
                disabled={formMode.mode === 'edit'}
                onChange={(event) => setForm({ ...form, projectId: event.target.value })}
              >
                <option value="">Select order</option>
                {formMode.mode === 'edit' && formMode.row && (
                  <option value={formMode.row.projectId}>{formMode.row.orderNo || formMode.row.projectCode}</option>
                )}
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>{order.orderNo || order.projectCode}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Order Date
              <input value={selectedOrder ? fmtDate(selectedOrder.orderDate) : ''} readOnly />
            </label>
            <label className="field">
              Customer
              <input value={selectedOrder?.customer && selectedOrder.customer !== '—' ? selectedOrder.customer : ''} readOnly />
            </label>
            <label className="field">
              Location
              <input value={selectedOrder?.location && selectedOrder.location !== '—' ? selectedOrder.location : ''} readOnly />
            </label>
            <label className="field">
              Product
              <input value={selectedOrder?.product && selectedOrder.product !== '—' ? selectedOrder.product : ''} readOnly />
            </label>
            <label className="field">
              Production Start Date
              <input type="date" value={form.startedDate} onChange={(event) => setForm({ ...form, startedDate: event.target.value })} />
            </label>
            <label className="field">
              Planned Completion Date
              <input type="date" value={form.plannedDate} onChange={(event) => setForm({ ...form, plannedDate: event.target.value })} />
            </label>
            <label className="field">
              Production Stage
              <select required value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })}>
                <option value="">Select stage</option>
                {stages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                {form.stage && !stages.some((item) => item.code === form.stage) && <option value={form.stage}>{form.stage}</option>}
              </select>
            </label>
            <label className="field">
              Production %
              <input
                required
                type="number"
                min="0"
                max="100"
                step="1"
                value={form.progress}
                onChange={(event) => setForm({ ...form, progress: event.target.value })}
              />
            </label>
            <label className="field">
              Material Status
              <select required value={form.materialStatus} onChange={(event) => setForm({ ...form, materialStatus: event.target.value })}>
                <option value="">Select material status</option>
                {materialStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            <label className="field">
              QC Status
              <select required value={form.qcStatus} onChange={(event) => setForm({ ...form, qcStatus: event.target.value })}>
                <option value="">Select QC status</option>
                {qcStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            <label className="field">
              Responsible Person
              <select value={form.responsibleId} onChange={(event) => setForm({ ...form, responsibleId: event.target.value })}>
                <option value="">Unassigned</option>
                {formMode.row?.responsibleName && form.responsibleId && !assignees.some((person) => person.id === form.responsibleId) && (
                  <option value={form.responsibleId}>{formMode.row.responsibleName}</option>
                )}
                {assignees.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
              </select>
            </label>
            <label className="field">
              Next Follow Up Date
              <input type="date" value={form.followUpDate} onChange={(event) => setForm({ ...form, followUpDate: event.target.value })} />
            </label>
            <label className="field">
              Status
              <select required value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="">Select status</option>
                {statuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            {form.status === 'COMPLETED' && (
              <label className="field">
                Actual Completion
                <input type="date" value={form.completedDate} onChange={(event) => setForm({ ...form, completedDate: event.target.value })} />
              </label>
            )}
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
        <Modal title={view.orderNo || 'Production'} onClose={() => setView(null)} wide>
          <dl className="design-detail">
            <div><dt>Order No.</dt><dd>{blank(view.orderNo)}</dd></div>
            <div><dt>Order Date</dt><dd>{fmtDate(view.orderDate)}</dd></div>
            <div><dt>Customer</dt><dd>{blank(view.customer)}</dd></div>
            <div><dt>Location</dt><dd>{blank(view.location)}</dd></div>
            <div><dt>Product</dt><dd>{blank(view.product)}</dd></div>
            <div><dt>Production Start</dt><dd>{fmtDate(view.startedAt)}</dd></div>
            <div><dt>Planned Completion</dt><dd>{fmtDate(view.plannedAt)}</dd></div>
            <div><dt>Actual Completion</dt><dd>{fmtDate(view.completedAt)}</dd></div>
            <div><dt>Production %</dt><dd>{view.progressLabel}</dd></div>
            <div><dt>Current Stage</dt><dd>{view.stageLabel}</dd></div>
            <div><dt>Material Status</dt><dd>{view.materialLabel}</dd></div>
            <div><dt>QC Status</dt><dd>{view.qcLabel}</dd></div>
            <div><dt>Responsible Person</dt><dd>{blank(view.responsibleName)}</dd></div>
            <div><dt>Next Follow Up</dt><dd>{fmtDate(view.followUpAt)}</dd></div>
            <div><dt>Delay Days</dt><dd>{view.delayDays == null ? '—' : view.delayDays}</dd></div>
            <div><dt>Status</dt><dd>{view.statusLabel}</dd></div>
            <div><dt>Remarks</dt><dd>{blank(view.remarks)}</dd></div>
          </dl>
          <h3>History</h3>
          {history?.error && <p className="form-error">{history.error}</p>}
          {!history && <p>Loading…</p>}
          {Array.isArray(history) && history.length === 0 && <p className="design-note">No history has been recorded for this production record yet.</p>}
          {Array.isArray(history) && history.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Change</th>
                    <th>Previous</th>
                    <th>New</th>
                    <th>User</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td>{fmtDateTime(item.createdAt)}</td>
                      <td>{item.action}{item.field && item.field !== '—' ? ` · ${item.field}` : ''}</td>
                      <td>{item.previousValue}</td>
                      <td>{item.newValue}</td>
                      <td>{item.userName}</td>
                      <td>{item.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {remove && (
        <Modal title="Delete production record" onClose={() => !busy && setRemove(null)}>
          <p>Are you sure you want to delete this production record?</p>
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
