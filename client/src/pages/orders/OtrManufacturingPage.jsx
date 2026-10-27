import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { fmtDate, fmtDateTime } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';

const EMPTY_FILTERS = {
  q: '',
  customer: '',
  project: '',
  status: '',
  po: '',
  manufacturing: '',
  delivery: '',
  from: '',
  to: '',
};

const EMPTY_FORM = {
  projectId: '',
  poDate: '',
  drawingApprovalDate: '',
  materialReadyDate: '',
  manufacturingStartDate: '',
  manufacturingCompleteDate: '',
  dispatchDate: '',
  deliveryDate: '',
  status: 'NOT_STARTED',
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

function todayKey() {
  return dayKey(new Date());
}

function unique(items, key) {
  return [...new Set(items.map((item) => item[key]).filter((value) => value && value !== '—'))]
    .sort((a, b) => String(a).localeCompare(String(b)));
}

function inclusiveDays(start, end) {
  if (!start || !end) return null;
  const diff = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
  if (diff < 0) return null;
  return diff + 1;
}

function formatSpan(days, open) {
  if (days == null) return '—';
  const unit = days === 1 ? 'Day' : 'Days';
  return open ? `${days}+ ${unit}` : `${days} ${unit}`;
}

function derivedStatus(form) {
  if (form.deliveryDate) return 'DELIVERED';
  if (form.dispatchDate || form.manufacturingCompleteDate) return 'DISPATCHED';
  if (form.manufacturingStartDate || form.materialReadyDate) return 'MANUFACTURING';
  if (form.drawingApprovalDate) return 'MATERIAL_READY';
  if (form.poDate) return 'DRAWING_APPROVAL';
  return 'NOT_STARTED';
}

function manufacturingLabel(form) {
  if (!form.manufacturingStartDate) return '—';
  if (form.manufacturingCompleteDate) return formatSpan(inclusiveDays(form.manufacturingStartDate, form.manufacturingCompleteDate), false);
  return formatSpan(inclusiveDays(form.manufacturingStartDate, todayKey()), true);
}

function leadLabel(form) {
  if (!form.poDate) return '—';
  if (form.deliveryDate) return formatSpan(inclusiveDays(form.poDate, form.deliveryDate), false);
  if (form.manufacturingStartDate && !form.manufacturingCompleteDate) {
    return formatSpan(inclusiveDays(form.poDate, todayKey()), true);
  }
  return '—';
}

function Clip({ value, width = 180 }) {
  const text = value && value !== '—' ? String(value) : '—';
  return (
    <span className="design-clip" style={{ maxWidth: width }} title={text === '—' ? undefined : text}>
      {text}
    </span>
  );
}

function blank(value) {
  return value && value !== '—' ? value : '—';
}

function inRange(value, from, to) {
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

export default function OtrManufacturingPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [statusTouched, setStatusTouched] = useState(false);
  const [view, setView] = useState(null);
  const [history, setHistory] = useState(null);
  const [remove, setRemove] = useState(null);
  const loaded = useRef(false);

  const load = useCallback((options = {}) => {
    if (!options.silent) setError('');
    return api.get('/manufacturing/tracking')
      .then((payload) => {
        loaded.current = true;
        setData(payload);
        setError('');
      })
      .catch(() => {
        if (!options.silent || !loaded.current) {
          setData(null);
          setError('Unable to load Manufacturing & Lead Time records. Please try again.');
        }
      });
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
  const statuses = data?.statuses || [];
  const canEdit = Boolean(data?.canEdit);
  const selectedOrder = orders.find((order) => order.id === form.projectId) || formMode?.row || null;

  const filtered = useMemo(() => items.filter((row) => {
    if (filters.q) {
      const hay = [row.customer, row.orderNo, row.projectCode, row.projectLabel].join(' ').toLowerCase();
      if (!hay.includes(filters.q.trim().toLowerCase())) return false;
    }
    if (filters.customer && row.customer !== filters.customer) return false;
    if (filters.project && row.projectLabel !== filters.project) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.po && dayKey(row.poAt) !== filters.po) return false;
    if (filters.manufacturing) {
      const start = dayKey(row.manufacturingStartedAt);
      const complete = dayKey(row.manufacturingCompletedAt);
      if (start !== filters.manufacturing && complete !== filters.manufacturing) return false;
    }
    if (filters.delivery && dayKey(row.deliveryAt) !== filters.delivery) return false;
    if (filters.from || filters.to) {
      const dates = [
        dayKey(row.poAt),
        dayKey(row.drawingApprovalAt),
        dayKey(row.materialReadyAt),
        dayKey(row.manufacturingStartedAt),
        dayKey(row.manufacturingCompletedAt),
        dayKey(row.dispatchAt),
        dayKey(row.deliveryAt),
      ];
      if (!dates.some((value) => inRange(value, filters.from, filters.to))) return false;
    }
    return true;
  }), [items, filters]);

  const filtersOn = Object.values(filters).some(Boolean);

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setStatusTouched(false);
    setFormMode({ mode: 'create' });
  }

  function applyOrder(projectId) {
    const order = orders.find((item) => item.id === projectId);
    setForm((current) => {
      const next = {
        ...current,
        projectId,
        poDate: order?.poDateInput || '',
      };
      if (!statusTouched) next.status = derivedStatus(next);
      return next;
    });
  }

  function setDate(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (!statusTouched) next.status = derivedStatus(next);
      return next;
    });
  }

  function useCalculatedStatus() {
    setStatusTouched(false);
    setForm((current) => ({ ...current, status: derivedStatus(current) }));
  }

  async function openEdit(row) {
    setBusy('open');
    setNotice(null);
    try {
      const detail = await api.get(`/manufacturing/tracking/${row.id}`);
      setForm({
        projectId: detail.projectId,
        poDate: detail.poDateInput || '',
        drawingApprovalDate: detail.drawingApprovalDateInput || '',
        materialReadyDate: detail.materialReadyDateInput || '',
        manufacturingStartDate: detail.manufacturingStartDateInput || '',
        manufacturingCompleteDate: detail.manufacturingCompleteDateInput || '',
        dispatchDate: detail.dispatchDateInput || '',
        deliveryDate: detail.deliveryDateInput || '',
        status: detail.status || 'NOT_STARTED',
      });
      setStatusTouched(Boolean(detail.statusLocked));
      setFormMode({ mode: 'edit', row: detail });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to open this record.', error: true });
    } finally {
      setBusy('');
    }
  }

  function payload() {
    return {
      ...(formMode?.mode === 'create' ? { projectId: form.projectId } : {}),
      poDate: form.poDate || null,
      drawingApprovalDate: form.drawingApprovalDate || null,
      materialReadyDate: form.materialReadyDate || null,
      manufacturingStartDate: form.manufacturingStartDate || null,
      manufacturingCompleteDate: form.manufacturingCompleteDate || null,
      dispatchDate: form.dispatchDate || null,
      deliveryDate: form.deliveryDate || null,
      status: form.status,
      statusOverride: statusTouched,
    };
  }

  async function saveForm(event) {
    event.preventDefault();
    if (!formMode) return;
    setBusy('save');
    setNotice(null);
    try {
      if (formMode.mode === 'create') await api.post('/manufacturing/tracking', payload());
      else await api.patch(`/manufacturing/tracking/${formMode.row.id}`, payload());
      setNotice({
        text: formMode.mode === 'create'
          ? 'Manufacturing & Lead Time record created successfully.'
          : 'Manufacturing & Lead Time record updated successfully.',
        error: false,
      });
      setFormMode(null);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to save this record.', error: true });
    } finally {
      setBusy('');
    }
  }

  async function confirmDelete() {
    if (!remove) return;
    setBusy('delete');
    setNotice(null);
    try {
      await api.delete(`/manufacturing/tracking/${remove.id}`);
      setNotice({ text: 'Manufacturing & Lead Time record deleted successfully.', error: false });
      setRemove(null);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to delete this record.', error: true });
    } finally {
      setBusy('');
    }
  }

  async function openView(row) {
    setView(row);
    setHistory(null);
    try {
      const [detail, payloadHistory] = await Promise.all([
        api.get(`/manufacturing/tracking/${row.id}`),
        api.get(`/manufacturing/tracking/${row.id}/history`),
      ]);
      setView(detail);
      setHistory(payloadHistory.items || []);
    } catch (err) {
      setHistory({ error: err.message || 'Unable to open this record.' });
    }
  }

  const suggested = derivedStatus(form);

  return (
    <div className="oc-page design-board production-board">
      <div className="page-head">
        <div>
          <p className="eyebrow">OTR</p>
          <h2>Manufacturing & Lead Time</h2>
          <p>Milestone dates for confirmed orders. Manufacturing time and lead time are calculated from those dates.</p>
        </div>
        {canEdit && <button className="btn" type="button" onClick={openCreate}>+ Create Manufacturing & Lead Time</button>}
      </div>

      <form className="filters oc-filters" onSubmit={(event) => event.preventDefault()}>
        <input placeholder="Search" aria-label="Search" value={filters.q} onChange={(event) => setFilter('q', event.target.value)} />
        <select aria-label="Customer" value={filters.customer} onChange={(event) => setFilter('customer', event.target.value)}>
          <option value="">Customer</option>
          {unique(items, 'customer').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Project / Order" value={filters.project} onChange={(event) => setFilter('project', event.target.value)}>
          <option value="">Project / Order</option>
          {unique(items, 'projectLabel').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Status" value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
          <option value="">Status</option>
          {statuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <input type="date" aria-label="PO Date" title="PO Date" value={filters.po} onChange={(event) => setFilter('po', event.target.value)} />
        <input type="date" aria-label="Manufacturing Date" title="Manufacturing Date" value={filters.manufacturing} onChange={(event) => setFilter('manufacturing', event.target.value)} />
        <input type="date" aria-label="Delivery Date" title="Delivery Date" value={filters.delivery} onChange={(event) => setFilter('delivery', event.target.value)} />
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
          <strong>{filtersOn ? 'No Manufacturing & Lead Time records match these filters.' : 'No Manufacturing & Lead Time records available.'}</strong>
          {!filtersOn && canEdit && <button className="btn sm" type="button" onClick={openCreate}>+ Create Manufacturing & Lead Time</button>}
          {filtersOn && <button className="btn ghost sm" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Reset Filters</button>}
        </div>
      )}

      {!error && filtered.length > 0 && (
        <div className="table-wrap design-scroll">
          <table className="data manufacturing-sheet">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Customer</th>
                <th>Project / Order</th>
                <th>PO Date</th>
                <th>Drawing Approval</th>
                <th>Material Ready</th>
                <th>Manufacturing Start</th>
                <th>Manufacturing Complete</th>
                <th>Dispatch Date</th>
                <th>Delivery Date</th>
                <th>Manufacturing Time</th>
                <th>Lead Time</th>
                <th>Status</th>
                <th className="is-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td><Clip value={row.customer} width={180} /></td>
                  <td><Clip value={row.projectLabel} width={150} /></td>
                  <td>{fmtDate(row.poAt)}</td>
                  <td>{fmtDate(row.drawingApprovalAt)}</td>
                  <td>{fmtDate(row.materialReadyAt)}</td>
                  <td>{fmtDate(row.manufacturingStartedAt)}</td>
                  <td>{fmtDate(row.manufacturingCompletedAt)}</td>
                  <td>{fmtDate(row.dispatchAt)}</td>
                  <td>{fmtDate(row.deliveryAt)}</td>
                  <td>{row.manufacturingTimeLabel === '—' ? '—' : <span className={`sheet-delay ${row.manufacturingOpen ? 'hold' : 'ok'}`}>{row.manufacturingTimeLabel}</span>}</td>
                  <td>{row.leadTimeLabel === '—' ? '—' : <span className={`sheet-delay ${row.leadOpen ? 'hold' : 'ok'}`}>{row.leadTimeLabel}</span>}</td>
                  <td><StatusBadge code={row.status} label={row.statusLabel} /></td>
                  <td className="is-actions">
                    <div className="row-actions">
                      <button className="btn sm ghost" type="button" onClick={() => openView(row)}>View</button>
                      {canEdit && <button className="btn sm ghost" type="button" disabled={Boolean(busy)} onClick={() => openEdit(row)}>Edit</button>}
                      {canEdit && <button className="btn sm danger" type="button" onClick={() => setRemove(row)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formMode && (
        <Modal title={formMode.mode === 'create' ? 'Create Manufacturing & Lead Time' : `Edit ${formMode.row.projectLabel || 'record'}`} onClose={() => !busy && setFormMode(null)} wide>
          <form className="form-grid" onSubmit={saveForm}>
            {formMode.mode === 'create' && orders.length === 0 && (
              <p className="design-note">No confirmed orders are available for a new Manufacturing & Lead Time record.</p>
            )}
            <h3 className="form-section">Order</h3>
            <label className="field">
              Project / Order
              <select required value={form.projectId} disabled={formMode.mode === 'edit'} onChange={(event) => applyOrder(event.target.value)}>
                <option value="">Select project / order</option>
                {formMode.mode === 'edit' && formMode.row && (
                  <option value={formMode.row.projectId}>{formMode.row.projectLabel}</option>
                )}
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>{order.orderNo || order.projectCode}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Customer
              <input value={selectedOrder?.customer && selectedOrder.customer !== '—' ? selectedOrder.customer : ''} readOnly />
            </label>

            <h3 className="form-section">Milestone dates</h3>
            <label className="field">
              PO Date
              <input type="date" value={form.poDate} onChange={(event) => setDate('poDate', event.target.value)} />
            </label>
            <label className="field">
              Drawing Approval Date
              <input type="date" value={form.drawingApprovalDate} onChange={(event) => setDate('drawingApprovalDate', event.target.value)} />
            </label>
            <label className="field">
              Material Ready Date
              <input type="date" value={form.materialReadyDate} onChange={(event) => setDate('materialReadyDate', event.target.value)} />
            </label>
            <label className="field">
              Manufacturing Start Date
              <input type="date" value={form.manufacturingStartDate} onChange={(event) => setDate('manufacturingStartDate', event.target.value)} />
            </label>
            <label className="field">
              Manufacturing Complete Date
              <input type="date" value={form.manufacturingCompleteDate} onChange={(event) => setDate('manufacturingCompleteDate', event.target.value)} />
            </label>
            <label className="field">
              Dispatch Date
              <input type="date" value={form.dispatchDate} onChange={(event) => setDate('dispatchDate', event.target.value)} />
            </label>
            <label className="field">
              Delivery Date
              <input type="date" value={form.deliveryDate} onChange={(event) => setDate('deliveryDate', event.target.value)} />
            </label>

            <h3 className="form-section">Time and status</h3>
            <label className="field">
              Manufacturing Time
              <input value={manufacturingLabel(form)} readOnly />
            </label>
            <label className="field">
              Lead Time
              <input value={leadLabel(form)} readOnly />
            </label>
            <label className="field">
              Status
              <select required value={form.status} onChange={(event) => { setStatusTouched(true); setForm({ ...form, status: event.target.value }); }}>
                {statuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                {!statuses.some((item) => item.code === form.status) && <option value={form.status}>{form.status}</option>}
              </select>
            </label>
            {statusTouched && suggested !== form.status && (
              <p className="design-note">
                Calculated status is {statuses.find((item) => item.code === suggested)?.label || suggested}.
                {' '}
                <button className="btn sm ghost" type="button" onClick={useCalculatedStatus}>Use calculated status</button>
              </p>
            )}
            <div className="form-actions">
              <button className="btn ghost" type="button" disabled={busy === 'save'} onClick={() => setFormMode(null)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {view && (
        <Modal title={view.projectLabel || 'Manufacturing & Lead Time'} onClose={() => setView(null)} wide>
          <dl className="design-detail">
            <div><dt>Customer</dt><dd>{blank(view.customer)}</dd></div>
            <div><dt>Project / Order</dt><dd>{blank(view.projectLabel)}</dd></div>
            <div><dt>PO Date</dt><dd>{fmtDate(view.poAt)}</dd></div>
            <div><dt>Drawing Approval Date</dt><dd>{fmtDate(view.drawingApprovalAt)}</dd></div>
            <div><dt>Material Ready Date</dt><dd>{fmtDate(view.materialReadyAt)}</dd></div>
            <div><dt>Manufacturing Start Date</dt><dd>{fmtDate(view.manufacturingStartedAt)}</dd></div>
            <div><dt>Manufacturing Complete Date</dt><dd>{fmtDate(view.manufacturingCompletedAt)}</dd></div>
            <div><dt>Dispatch Date</dt><dd>{fmtDate(view.dispatchAt)}</dd></div>
            <div><dt>Delivery Date</dt><dd>{fmtDate(view.deliveryAt)}</dd></div>
            <div><dt>Manufacturing Time</dt><dd>{view.manufacturingTimeLabel || '—'}</dd></div>
            <div><dt>Lead Time</dt><dd>{view.leadTimeLabel || '—'}</dd></div>
            <div><dt>Status</dt><dd>{view.statusLabel || '—'}</dd></div>
          </dl>
          <h3>History</h3>
          {history?.error && <p className="form-error">{history.error}</p>}
          {!history && <p>Loading…</p>}
          {Array.isArray(history) && history.length === 0 && <p className="design-note">No history has been recorded yet.</p>}
          {Array.isArray(history) && history.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Change</th>
                    <th>Previous</th>
                    <th>New</th>
                    <th>Changed By</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {remove && (
        <Modal title="Delete Manufacturing & Lead Time record" onClose={() => !busy && setRemove(null)}>
          <p>Are you sure you want to delete this Manufacturing & Lead Time record?</p>
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
