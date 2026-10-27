import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { fmtDate, fmtDateTime } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';

const EMPTY_FILTERS = {
  q: '',
  project: '',
  po: '',
  material: '',
  supplier: '',
  status: '',
  poDate: '',
  expected: '',
  from: '',
  to: '',
};

const EMPTY_FORM = {
  projectId: '',
  poNumber: '',
  materialId: '',
  materialName: '',
  quantity: '',
  vendorId: '',
  poDate: '',
  expectedDate: '',
  status: 'PENDING',
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

export default function OtrProcurementPage() {
  const [data, setData] = useState(null);
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
    return api.get('/procurement/tracking')
      .then((payload) => {
        loaded.current = true;
        setData(payload);
        setError('');
      })
      .catch(() => {
        if (!options.silent || !loaded.current) {
          setData(null);
          setError('Unable to load Procurement records. Please try again.');
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
  const vendors = data?.vendors || [];
  const materials = data?.materials || [];
  const purchaseOrders = data?.purchaseOrders || [];
  const canEdit = Boolean(data?.canEdit);
  const selectedOrder = orders.find((order) => order.id === form.projectId) || formMode?.row || null;
  const selectedMaterial = materials.find((item) => item.id === form.materialId);
  const customMaterial = form.materialId === '__custom';

  const filtered = useMemo(() => items.filter((row) => {
    if (filters.q) {
      const hay = [row.projectCustomer, row.customer, row.projectLabel, row.orderNo, row.poNumber, row.materialName, row.supplier].join(' ').toLowerCase();
      if (!hay.includes(filters.q.trim().toLowerCase())) return false;
    }
    if (filters.project && row.projectCustomer !== filters.project) return false;
    if (filters.po && row.poNumber !== filters.po) return false;
    if (filters.material && row.materialName !== filters.material) return false;
    if (filters.supplier && row.supplier !== filters.supplier) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.poDate && dayKey(row.poAt) !== filters.poDate) return false;
    if (filters.expected && dayKey(row.expectedAt) !== filters.expected) return false;
    if (filters.from || filters.to) {
      const dates = [dayKey(row.poAt), dayKey(row.expectedAt)];
      if (!dates.some((value) => inRange(value, filters.from, filters.to))) return false;
    }
    return true;
  }), [items, filters]);

  const filtersOn = Object.values(filters).some(Boolean);
  const poOptions = [...new Set([
    ...purchaseOrders.filter((row) => !form.projectId || row.projectId === form.projectId).map((row) => row.poNumber),
    ...items.map((row) => row.poNumber),
  ].filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormMode({ mode: 'create' });
  }

  function applyPo(poNumber) {
    const known = purchaseOrders.find((row) => row.projectId === form.projectId && row.poNumber === poNumber);
    setForm((current) => ({
      ...current,
      poNumber,
      vendorId: known?.vendorId && !current.vendorId ? known.vendorId : current.vendorId,
      poDate: known?.poDateInput && !current.poDate ? known.poDateInput : current.poDate,
      expectedDate: known?.expectedDateInput && !current.expectedDate ? known.expectedDateInput : current.expectedDate,
    }));
  }

  async function openEdit(row) {
    setBusy('open');
    setNotice(null);
    try {
      const detail = await api.get(`/procurement/tracking/${row.id}`);
      setForm({
        projectId: detail.projectId,
        poNumber: detail.poNumber || '',
        materialId: detail.materialId || '__custom',
        materialName: detail.materialId ? '' : (detail.materialName || ''),
        quantity: detail.quantity === 0 || detail.quantity ? String(detail.quantity) : '',
        vendorId: detail.vendorId || '',
        poDate: detail.poDateInput || '',
        expectedDate: detail.expectedDateInput || '',
        status: detail.status || 'PENDING',
        remarks: detail.remarks || '',
      });
      setFormMode({ mode: 'edit', row: detail });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to open this procurement record.', error: true });
    } finally {
      setBusy('');
    }
  }

  function payload() {
    return {
      projectId: form.projectId,
      poNumber: form.poNumber,
      materialId: customMaterial ? null : form.materialId,
      materialName: customMaterial ? form.materialName : '',
      quantity: form.quantity === '' ? '' : Number(form.quantity),
      vendorId: form.vendorId,
      poDate: form.poDate || null,
      expectedDate: form.expectedDate || null,
      status: form.status,
      remarks: form.remarks,
    };
  }

  async function saveForm(event) {
    event.preventDefault();
    if (!formMode) return;
    setBusy('save');
    setNotice(null);
    try {
      if (formMode.mode === 'create') await api.post('/procurement/tracking', payload());
      else await api.patch(`/procurement/tracking/${formMode.row.id}`, payload());
      setNotice({
        text: formMode.mode === 'create'
          ? 'Procurement record created successfully.'
          : 'Procurement record updated successfully.',
        error: false,
      });
      setFormMode(null);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to save this procurement record.', error: true });
    } finally {
      setBusy('');
    }
  }

  async function confirmDelete() {
    if (!remove) return;
    setBusy('delete');
    setNotice(null);
    try {
      await api.delete(`/procurement/tracking/${remove.id}`);
      setNotice({ text: 'Procurement record deleted successfully.', error: false });
      setRemove(null);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to delete this procurement record.', error: true });
    } finally {
      setBusy('');
    }
  }

  async function openView(row) {
    setView(row);
    setHistory(null);
    try {
      const [detail, payloadHistory] = await Promise.all([
        api.get(`/procurement/tracking/${row.id}`),
        api.get(`/procurement/tracking/${row.id}/history`),
      ]);
      setView(detail);
      setHistory(payloadHistory.items || []);
    } catch (err) {
      setHistory({ error: err.message || 'Unable to open this procurement record.' });
    }
  }

  return (
    <div className="oc-page design-board production-board">
      <div className="page-head">
        <div>
          <p className="eyebrow">OTR</p>
          <h2>Procurement</h2>
          <p>Material lines for orders that have completed design. Completing every line moves the order to production.</p>
        </div>
        {canEdit && <button className="btn" type="button" onClick={openCreate}>+ Create Procurement</button>}
      </div>

      <form className="filters oc-filters" onSubmit={(event) => event.preventDefault()}>
        <input placeholder="Search" aria-label="Search" value={filters.q} onChange={(event) => setFilter('q', event.target.value)} />
        <select aria-label="Project / Customer" value={filters.project} onChange={(event) => setFilter('project', event.target.value)}>
          <option value="">Project / Customer</option>
          {unique(items, 'projectCustomer').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="PO No." value={filters.po} onChange={(event) => setFilter('po', event.target.value)}>
          <option value="">PO No.</option>
          {unique(items, 'poNumber').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Material" value={filters.material} onChange={(event) => setFilter('material', event.target.value)}>
          <option value="">Material</option>
          {unique(items, 'materialName').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Supplier" value={filters.supplier} onChange={(event) => setFilter('supplier', event.target.value)}>
          <option value="">Supplier</option>
          {unique(items, 'supplier').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Procurement Status" value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
          <option value="">Procurement Status</option>
          {statuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <input type="date" aria-label="PO Date" title="PO Date" value={filters.poDate} onChange={(event) => setFilter('poDate', event.target.value)} />
        <input type="date" aria-label="Expected Delivery" title="Expected Delivery" value={filters.expected} onChange={(event) => setFilter('expected', event.target.value)} />
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
          <strong>{filtersOn ? 'No procurement records match these filters.' : 'No procurement records available.'}</strong>
          {!filtersOn && canEdit && <button className="btn sm" type="button" onClick={openCreate}>+ Create Procurement</button>}
          {filtersOn && <button className="btn ghost sm" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Reset Filters</button>}
        </div>
      )}

      {!error && filtered.length > 0 && (
        <div className="table-wrap design-scroll">
          <table className="data procurement-sheet">
            <thead>
              <tr>
                <th>No.</th>
                <th>Project / Customer</th>
                <th>PO No.</th>
                <th>Material Required</th>
                <th>Qty</th>
                <th>Supplier</th>
                <th>PO Date</th>
                <th>Expected Delivery</th>
                <th>Procurement Status</th>
                <th>Remarks</th>
                <th className="is-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td><Clip value={row.projectCustomer} width={220} /></td>
                  <td>{blank(row.poNumber)}</td>
                  <td><Clip value={row.materialName} width={180} /></td>
                  <td className="num-cell" title={row.unit || undefined}>{row.quantityLabel}{row.unit ? ` ${row.unit}` : ''}</td>
                  <td><Clip value={row.supplier} width={160} /></td>
                  <td>{fmtDate(row.poAt)}</td>
                  <td>{fmtDate(row.expectedAt)}</td>
                  <td><StatusBadge code={row.status} label={row.statusLabel} /></td>
                  <td><Clip value={row.remarks || '—'} width={160} /></td>
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
        <Modal title={formMode.mode === 'create' ? 'Create Procurement' : `Edit ${formMode.row.poNumber || 'procurement'}`} onClose={() => !busy && setFormMode(null)} wide>
          <form className="form-grid" onSubmit={saveForm}>
            {formMode.mode === 'create' && orders.length === 0 && (
              <p className="design-note">No orders are ready for procurement. An order appears here after design is completed.</p>
            )}
            <h3 className="form-section">Order</h3>
            <label className="field">
              Project / Order
              <select required value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
                <option value="">Select project / order</option>
                {formMode.mode === 'edit' && formMode.row && !orders.some((order) => order.id === formMode.row.projectId) && (
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

            <h3 className="form-section">Purchase</h3>
            <label className="field">
              PO No.
              <input required list="procurement-po-numbers" value={form.poNumber} onChange={(event) => applyPo(event.target.value)} />
              <datalist id="procurement-po-numbers">
                {poOptions.map((value) => <option key={value} value={value} />)}
              </datalist>
            </label>
            <label className="field">
              Material Required
              <select required value={form.materialId} onChange={(event) => setForm({ ...form, materialId: event.target.value, materialName: event.target.value === '__custom' ? form.materialName : '' })}>
                <option value="">Select material</option>
                {materials.map((item) => <option key={item.id} value={item.id}>{item.name}{item.unit ? ` (${item.unit})` : ''}</option>)}
                {form.materialId && form.materialId !== '__custom' && !materials.some((item) => item.id === form.materialId) && formMode?.row && (
                  <option value={form.materialId}>{formMode.row.materialName}</option>
                )}
                <option value="__custom">Enter a material</option>
              </select>
            </label>
            {customMaterial && (
              <label className="field">
                Material name
                <input required value={form.materialName} onChange={(event) => setForm({ ...form, materialName: event.target.value })} />
              </label>
            )}
            <label className="field">
              Quantity{selectedMaterial?.unit ? ` (${selectedMaterial.unit})` : ''}
              <input required type="number" min="0" step={selectedMaterial?.unit && ['NOS', 'PCS', 'SET', 'EACH'].includes(String(selectedMaterial.unit).toUpperCase()) ? '1' : '0.001'} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />
            </label>
            <label className="field">
              Supplier
              <select required value={form.vendorId} onChange={(event) => setForm({ ...form, vendorId: event.target.value })}>
                <option value="">Select supplier</option>
                {form.vendorId && !vendors.some((item) => item.id === form.vendorId) && formMode?.row?.supplier && (
                  <option value={form.vendorId}>{formMode.row.supplier}</option>
                )}
                {vendors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>

            <h3 className="form-section">Delivery and status</h3>
            <label className="field">
              PO Date
              <input type="date" value={form.poDate} onChange={(event) => setForm({ ...form, poDate: event.target.value })} />
            </label>
            <label className="field">
              Expected Delivery
              <input type="date" value={form.expectedDate} onChange={(event) => setForm({ ...form, expectedDate: event.target.value })} />
            </label>
            <label className="field">
              Procurement Status
              <select required value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                {statuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
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
        <Modal title={view.poNumber || 'Procurement'} onClose={() => setView(null)} wide>
          <dl className="design-detail">
            <div><dt>Project / Customer</dt><dd>{blank(view.projectCustomer)}</dd></div>
            <div><dt>PO No.</dt><dd>{blank(view.poNumber)}</dd></div>
            <div><dt>Material Required</dt><dd>{blank(view.materialName)}</dd></div>
            <div><dt>Quantity</dt><dd>{view.quantityLabel || '—'}{view.unit ? ` ${view.unit}` : ''}</dd></div>
            <div><dt>Supplier</dt><dd>{blank(view.supplier)}</dd></div>
            <div><dt>PO Date</dt><dd>{fmtDate(view.poAt)}</dd></div>
            <div><dt>Expected Delivery</dt><dd>{fmtDate(view.expectedAt)}</dd></div>
            <div><dt>Procurement Status</dt><dd>{view.statusLabel || '—'}</dd></div>
            <div><dt>Remarks</dt><dd>{blank(view.remarks)}</dd></div>
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
        <Modal title="Delete procurement record" onClose={() => !busy && setRemove(null)}>
          <p>Are you sure you want to delete this procurement record?</p>
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
