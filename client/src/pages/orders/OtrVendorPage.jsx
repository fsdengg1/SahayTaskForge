import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { fmtDate, fmtDateTime } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';

const EMPTY_FILTERS = {
  q: '',
  vendor: '',
  po: '',
  project: '',
  material: '',
  manufacturing: '',
  status: '',
  poDate: '',
  required: '',
  delivery: '',
  from: '',
  to: '',
};

const EMPTY_FORM = {
  vendorId: '',
  vendorName: '',
  procurementId: '',
  projectId: '',
  poNumber: '',
  materialId: '',
  materialName: '',
  quantity: '',
  poDate: '',
  requiredDate: '',
  manufacturingStatus: 'NOT_STARTED',
  dispatchDate: '',
  deliveryDate: '',
  status: 'PENDING',
};

function dayKey(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
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

function spanDays(start, end) {
  if (!start || !end) return null;
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}

function derivedStatus(form) {
  const making = form.manufacturingStatus || 'NOT_STARTED';
  if (form.deliveryDate && making === 'COMPLETED') return 'COMPLETED';
  if (form.deliveryDate) return 'DELIVERED';
  if (making === 'ON_HOLD') return 'ON_HOLD';
  if (form.requiredDate && form.requiredDate < todayKey()) return 'DELAYED';
  if (making === 'IN_PROGRESS' || making === 'COMPLETED') return 'IN_PROGRESS';
  return 'PENDING';
}

function leadLabel(form) {
  if (!form.poDate) return '—';
  const days = spanDays(form.poDate, form.deliveryDate || todayKey());
  if (days == null || days < 0) return '—';
  return `${days} ${days === 1 ? 'Day' : 'Days'}`;
}

function delayLabel(form) {
  if (!form.requiredDate) return '—';
  const days = spanDays(form.requiredDate, form.deliveryDate || todayKey());
  if (days == null) return '—';
  return String(Math.max(0, days));
}

function Clip({ value, width = 170 }) {
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

function compareRows(left, right, sort) {
  const dir = sort.dir === 'desc' ? -1 : 1;
  const read = (row) => {
    if (sort.key === 'vendor') return row.vendorName || '';
    if (sort.key === 'po') return row.poAt || '';
    if (sort.key === 'required') return row.requiredAt || '';
    if (sort.key === 'delivery') return row.deliveryAt || '';
    if (sort.key === 'lead') return row.leadDays == null ? null : row.leadDays;
    if (sort.key === 'delay') return row.delayDays == null ? null : row.delayDays;
    return row.statusLabel || '';
  };
  const a = read(left);
  const b = read(right);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number') return (a - b) * dir;
  return String(a).localeCompare(String(b)) * dir;
}

export default function OtrVendorPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState({ key: 'vendor', dir: 'asc' });
  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [statusTouched, setStatusTouched] = useState(false);
  const [view, setView] = useState(null);
  const [history, setHistory] = useState(null);
  const [remove, setRemove] = useState(null);
  const loaded = useRef(false);

  const load = useCallback((options = {}) => {
    if (!options.silent) setError('');
    return api.get('/vendors/tracking')
      .then((payload) => {
        loaded.current = true;
        setData(payload);
        setError('');
      })
      .catch(() => {
        if (!options.silent || !loaded.current) {
          setData(null);
          setError('Unable to load vendor records. Please try again.');
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
  const vendors = data?.vendors || [];
  const materials = data?.materials || [];
  const orders = data?.orders || [];
  const lines = data?.procurementLines || [];
  const manufacturing = data?.manufacturing || [];
  const statuses = data?.statuses || [];
  const canEdit = Boolean(data?.canEdit);
  const canCreateVendor = Boolean(data?.canCreateVendor);
  const newVendor = form.vendorId === '__new';
  const newPo = form.procurementId === '__new';
  const projectChoices = useMemo(() => {
    const choices = [...orders];
    const current = formMode?.row;
    if (current?.projectId && !choices.some((order) => order.id === current.projectId)) {
      choices.unshift({
        id: current.projectId,
        orderNo: current.orderNo,
        projectCode: current.projectCode,
        customer: current.customer,
      });
    }
    return choices;
  }, [orders, formMode]);
  const selectedOrder = projectChoices.find((order) => order.id === form.projectId) || null;
  const selectedMaterial = materials.find((item) => item.id === form.materialId);

  const filtered = useMemo(() => {
    const rows = items.filter((row) => {
      if (filters.q) {
        const hay = [row.vendorName, row.poNumber, row.projectCustomer, row.customer, row.projectLabel, row.materialName].join(' ').toLowerCase();
        if (!hay.includes(filters.q.trim().toLowerCase())) return false;
      }
      if (filters.vendor && row.vendorName !== filters.vendor) return false;
      if (filters.po && row.poNumber !== filters.po) return false;
      if (filters.project && row.projectCustomer !== filters.project) return false;
      if (filters.material && row.materialName !== filters.material) return false;
      if (filters.manufacturing && row.manufacturingStatus !== filters.manufacturing) return false;
      if (filters.status && row.status !== filters.status) return false;
      if (filters.poDate && dayKey(row.poAt) !== filters.poDate) return false;
      if (filters.required && dayKey(row.requiredAt) !== filters.required) return false;
      if (filters.delivery && dayKey(row.deliveryAt) !== filters.delivery) return false;
      if (filters.from || filters.to) {
        const dates = [dayKey(row.poAt), dayKey(row.requiredAt), dayKey(row.deliveryAt)];
        if (!dates.some((value) => inRange(value, filters.from, filters.to))) return false;
      }
      return true;
    });
    return [...rows].sort((left, right) => compareRows(left, right, sort));
  }, [items, filters, sort]);

  const filtersOn = Object.values(filters).some(Boolean);

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleSort(key) {
    setSort((current) => (
      current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    ));
  }

  function sortHeader(key, label) {
    const active = sort.key === key;
    return (
      <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button className="sort-btn" type="button" onClick={() => toggleSort(key)}>
          {label}
          {active && <i>{sort.dir === 'asc' ? '↑' : '↓'}</i>}
        </button>
      </th>
    );
  }

  function setSchedule(patch) {
    setForm((current) => {
      const next = { ...current, ...patch };
      if (!statusTouched) next.status = derivedStatus(next);
      return next;
    });
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setStatusTouched(false);
    setFormMode({ mode: 'create' });
  }

  function applyLine(procurementId) {
    const line = lines.find((item) => item.id === procurementId);
    setForm((current) => {
      const next = {
        ...current,
        procurementId,
        projectId: line?.projectId || '',
        poNumber: line?.poNumber || '',
        materialId: line?.materialId || (line?.materialName ? '__custom' : (procurementId === '__new' ? current.materialId : '')),
        materialName: line?.materialId ? '' : (line?.materialName || ''),
        quantity: line ? String(line.quantity) : '',
        poDate: line?.poDateInput || '',
        requiredDate: line?.requiredDateInput || '',
        vendorId: line?.vendorId || current.vendorId,
      };
      if (!statusTouched) next.status = derivedStatus(next);
      return next;
    });
  }

  async function openEdit(row) {
    setBusy('open');
    setNotice(null);
    try {
      const detail = await api.get(`/vendors/tracking/${row.id}`);
      setForm({
        vendorId: detail.vendorId || '',
        vendorName: '',
        procurementId: detail.procurementId,
        projectId: detail.projectId,
        poNumber: detail.poNumber || '',
        materialId: detail.materialId || '__custom',
        materialName: detail.materialId ? '' : (detail.materialName || ''),
        quantity: detail.quantity === 0 || detail.quantity ? String(detail.quantity) : '',
        poDate: detail.poDateInput || '',
        requiredDate: detail.requiredDateInput || '',
        manufacturingStatus: detail.manufacturingStatus || 'NOT_STARTED',
        dispatchDate: detail.dispatchDateInput || '',
        deliveryDate: detail.deliveryDateInput || '',
        status: detail.status || 'PENDING',
      });
      setStatusTouched(Boolean(detail.statusLocked));
      setFormMode({ mode: 'edit', row: detail });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to open this vendor record.', error: true });
    } finally {
      setBusy('');
    }
  }

  function payload() {
    return {
      vendorId: newVendor ? null : form.vendorId,
      vendorName: newVendor ? form.vendorName : '',
      procurementId: formMode?.mode === 'edit' ? form.procurementId : (newPo ? null : form.procurementId),
      projectId: form.projectId,
      poNumber: form.poNumber,
      materialId: form.materialId === '__custom' ? null : form.materialId,
      materialName: form.materialId === '__custom' ? form.materialName : '',
      quantity: form.quantity === '' ? '' : Number(form.quantity),
      poDate: form.poDate || null,
      requiredDate: form.requiredDate || null,
      manufacturingStatus: form.manufacturingStatus,
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
      if (formMode.mode === 'create') await api.post('/vendors/tracking', payload());
      else await api.patch(`/vendors/tracking/${formMode.row.id}`, payload());
      setNotice({
        text: formMode.mode === 'create'
          ? 'Vendor record created successfully.'
          : 'Vendor record updated successfully.',
        error: false,
      });
      setFormMode(null);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to save this vendor record.', error: true });
    } finally {
      setBusy('');
    }
  }

  async function confirmDelete() {
    if (!remove) return;
    setBusy('delete');
    setNotice(null);
    try {
      await api.delete(`/vendors/tracking/${remove.id}`);
      setNotice({ text: 'Vendor record deleted successfully.', error: false });
      setRemove(null);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to delete this vendor record.', error: true });
    } finally {
      setBusy('');
    }
  }

  async function openView(row) {
    setView(row);
    setHistory(null);
    try {
      const [detail, payloadHistory] = await Promise.all([
        api.get(`/vendors/tracking/${row.id}`),
        api.get(`/vendors/tracking/${row.id}/history`),
      ]);
      setView(detail);
      setHistory(payloadHistory.items || []);
    } catch (err) {
      setHistory({ error: err.message || 'Unable to open this vendor record.' });
    }
  }

  const suggested = derivedStatus(form);

  return (
    <div className="oc-page design-board production-board">
      <div className="page-head">
        <div>
          <p className="eyebrow">OTR</p>
          <h2>Vendor Management</h2>
          <p>Vendor progress for procurement lines. Lead time and delay days are calculated from the dates.</p>
        </div>
        {canEdit && <button className="btn" type="button" onClick={openCreate}>+ Add Vendor</button>}
      </div>

      <form className="filters oc-filters" onSubmit={(event) => event.preventDefault()}>
        <input placeholder="Search" aria-label="Search" value={filters.q} onChange={(event) => setFilter('q', event.target.value)} />
        <select aria-label="Vendor" value={filters.vendor} onChange={(event) => setFilter('vendor', event.target.value)}>
          <option value="">Vendor</option>
          {unique(items, 'vendorName').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="PO No." value={filters.po} onChange={(event) => setFilter('po', event.target.value)}>
          <option value="">PO No.</option>
          {unique(items, 'poNumber').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Customer / Project" value={filters.project} onChange={(event) => setFilter('project', event.target.value)}>
          <option value="">Customer / Project</option>
          {unique(items, 'projectCustomer').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Material" value={filters.material} onChange={(event) => setFilter('material', event.target.value)}>
          <option value="">Material</option>
          {unique(items, 'materialName').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Manufacturing Status" value={filters.manufacturing} onChange={(event) => setFilter('manufacturing', event.target.value)}>
          <option value="">Manufacturing Status</option>
          {manufacturing.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <select aria-label="Status" value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
          <option value="">Status</option>
          {statuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <input type="date" aria-label="PO Date" title="PO Date" value={filters.poDate} onChange={(event) => setFilter('poDate', event.target.value)} />
        <input type="date" aria-label="Required Date" title="Required Date" value={filters.required} onChange={(event) => setFilter('required', event.target.value)} />
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
          <strong>{filtersOn ? 'No vendor records match these filters.' : 'No vendor records available.'}</strong>
          {!filtersOn && canEdit && <button className="btn sm" type="button" onClick={openCreate}>+ Add Vendor</button>}
          {filtersOn && <button className="btn ghost sm" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Reset Filters</button>}
        </div>
      )}

      {!error && filtered.length > 0 && (
        <div className="table-wrap design-scroll">
          <table className="data vendor-sheet">
            <thead>
              <tr>
                <th>S.No</th>
                {sortHeader('vendor', 'Vendor')}
                <th>PO No.</th>
                <th>Customer / Project</th>
                <th>Material</th>
                <th>Qty</th>
                {sortHeader('po', 'PO Date')}
                {sortHeader('required', 'Required Date')}
                <th>Manufacturing Status</th>
                <th>Dispatch Date</th>
                {sortHeader('delivery', 'Delivery Date')}
                {sortHeader('lead', 'Lead Time')}
                {sortHeader('delay', 'Delay Days')}
                {sortHeader('status', 'Status')}
                <th className="is-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td><Clip value={row.vendorName} /></td>
                  <td>{blank(row.poNumber)}</td>
                  <td><Clip value={row.projectCustomer} width={200} /></td>
                  <td><Clip value={row.materialName} /></td>
                  <td className="num-cell">{row.quantityLabel}{row.unit ? ` ${row.unit}` : ''}</td>
                  <td>{fmtDate(row.poAt)}</td>
                  <td>{fmtDate(row.requiredAt)}</td>
                  <td><StatusBadge code={row.manufacturingStatus} label={row.manufacturingLabel} /></td>
                  <td>{fmtDate(row.dispatchAt)}</td>
                  <td>{fmtDate(row.deliveryAt)}</td>
                  <td>{row.leadTimeLabel === '—' ? '—' : <span className="sheet-delay ok">{row.leadTimeLabel}</span>}</td>
                  <td>{row.delayDays == null ? '—' : <span className={`sheet-delay ${row.delayDays > 0 ? 'late' : 'ok'}`}>{row.delayDays}</span>}</td>
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
        <Modal title={formMode.mode === 'create' ? 'Add Vendor' : `Edit ${formMode.row.vendorName || 'vendor'}`} onClose={() => !busy && setFormMode(null)} wide>
          <form className="form-grid" onSubmit={saveForm}>
            <h3 className="form-section">Vendor Details</h3>
            <label className="field">
              Vendor Name
              <select required={!newVendor} value={form.vendorId} onChange={(event) => setForm({ ...form, vendorId: event.target.value })}>
                <option value="">Select vendor</option>
                {vendors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                {form.vendorId && form.vendorId !== '__new' && !vendors.some((item) => item.id === form.vendorId) && formMode?.row && (
                  <option value={form.vendorId}>{formMode.row.vendorName}</option>
                )}
                {canCreateVendor && <option value="__new">Add a new vendor</option>}
              </select>
            </label>
            {newVendor && (
              <label className="field">
                New vendor name
                <input required value={form.vendorName} onChange={(event) => setForm({ ...form, vendorName: event.target.value })} />
              </label>
            )}

            <h3 className="form-section">PO / Project Details</h3>
            {formMode.mode === 'create' && (
              <label className="field">
                PO No.
                <select required value={form.procurementId} onChange={(event) => applyLine(event.target.value)}>
                  <option value="">Select PO</option>
                  {lines.map((line) => (
                    <option key={line.id} value={line.id}>{line.poNumber} · {line.materialName}</option>
                  ))}
                  <option value="__new">Enter a new PO</option>
                </select>
              </label>
            )}
            {(newPo || formMode.mode === 'edit') && (
              <label className="field">
                PO No.
                <input required value={form.poNumber} onChange={(event) => setForm({ ...form, poNumber: event.target.value })} />
              </label>
            )}
            {(newPo || formMode.mode === 'edit') && (
              <label className="field">
                Customer / Project
                <select required value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
                  <option value="">Select project</option>
                  {projectChoices.map((order) => (
                    <option key={order.id} value={order.id}>
                      {(order.orderNo || order.projectCode || 'Project')}{order.customer && order.customer !== '—' ? ` · ${order.customer}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {formMode.mode === 'create' && !newPo && (
              <label className="field">
                Customer / Project
                <input value={lines.find((line) => line.id === form.procurementId)?.projectCustomer || selectedOrder?.customer || ''} readOnly />
              </label>
            )}
            <label className="field">
              PO Date
              <input type="date" value={form.poDate} onChange={(event) => setSchedule({ poDate: event.target.value })} />
            </label>
            <label className="field">
              Required Date
              <input type="date" value={form.requiredDate} onChange={(event) => setSchedule({ requiredDate: event.target.value })} />
            </label>

            <h3 className="form-section">Material Details</h3>
            <label className="field">
              Material
              <select required value={form.materialId} onChange={(event) => setForm({ ...form, materialId: event.target.value })}>
                <option value="">Select material</option>
                {materials.map((item) => <option key={item.id} value={item.id}>{item.name}{item.unit ? ` (${item.unit})` : ''}</option>)}
                {form.materialId && form.materialId !== '__custom' && !materials.some((item) => item.id === form.materialId) && (
                  <option value={form.materialId}>{formMode?.row?.materialName || 'Material'}</option>
                )}
                <option value="__custom">Enter a material</option>
              </select>
            </label>
            {form.materialId === '__custom' && (
              <label className="field">
                Material name
                <input required value={form.materialName} onChange={(event) => setForm({ ...form, materialName: event.target.value })} />
              </label>
            )}
            <label className="field">
              Quantity{selectedMaterial?.unit ? ` (${selectedMaterial.unit})` : ''}
              <input
                required
                type="number"
                min="0.001"
                step={['NOS', 'NO', 'PCS', 'PC', 'SET', 'EACH', 'UNIT', 'PIECE', 'PIECES', 'QTY'].includes(String(selectedMaterial?.unit || '').toUpperCase()) ? '1' : '0.001'}
                value={form.quantity}
                onChange={(event) => setForm({ ...form, quantity: event.target.value })}
              />
            </label>

            <h3 className="form-section">Manufacturing & Delivery</h3>
            <label className="field">
              Manufacturing Status
              <select required value={form.manufacturingStatus} onChange={(event) => setSchedule({ manufacturingStatus: event.target.value })}>
                {manufacturing.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            <label className="field">
              Dispatch Date
              <input type="date" value={form.dispatchDate} onChange={(event) => setForm({ ...form, dispatchDate: event.target.value })} />
            </label>
            <label className="field">
              Delivery Date
              <input type="date" value={form.deliveryDate} onChange={(event) => setSchedule({ deliveryDate: event.target.value })} />
            </label>

            <h3 className="form-section">Status & Tracking</h3>
            <label className="field">
              Lead Time
              <input value={leadLabel(form)} readOnly />
            </label>
            <label className="field">
              Delay Days
              <input value={delayLabel(form)} readOnly />
            </label>
            <label className="field">
              Status
              <select required value={form.status} onChange={(event) => { setStatusTouched(true); setForm({ ...form, status: event.target.value }); }}>
                {statuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            {statusTouched && suggested !== form.status && (
              <p className="design-note">
                Calculated status is {statuses.find((item) => item.code === suggested)?.label || suggested}.
                {' '}
                <button className="btn sm ghost" type="button" onClick={() => { setStatusTouched(false); setForm((current) => ({ ...current, status: derivedStatus(current) })); }}>Use calculated status</button>
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
        <Modal title={view.vendorName || 'Vendor'} onClose={() => setView(null)} wide>
          <dl className="design-detail">
            <div><dt>Vendor Name</dt><dd>{blank(view.vendorName)}</dd></div>
            <div><dt>PO No.</dt><dd>{blank(view.poNumber)}</dd></div>
            <div><dt>Customer / Project</dt><dd>{blank(view.projectCustomer)}</dd></div>
            <div><dt>Material</dt><dd>{blank(view.materialName)}</dd></div>
            <div><dt>Quantity</dt><dd>{view.quantityLabel || '—'}{view.unit ? ` ${view.unit}` : ''}</dd></div>
            <div><dt>PO Date</dt><dd>{fmtDate(view.poAt)}</dd></div>
            <div><dt>Required Date</dt><dd>{fmtDate(view.requiredAt)}</dd></div>
            <div><dt>Manufacturing Status</dt><dd>{view.manufacturingLabel || '—'}</dd></div>
            <div><dt>Dispatch Date</dt><dd>{fmtDate(view.dispatchAt)}</dd></div>
            <div><dt>Delivery Date</dt><dd>{fmtDate(view.deliveryAt)}</dd></div>
            <div><dt>Lead Time</dt><dd>{view.leadTimeLabel || '—'}</dd></div>
            <div><dt>Delay Days</dt><dd>{view.delayDays == null ? '—' : view.delayDays}</dd></div>
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
        <Modal title="Delete vendor record" onClose={() => !busy && setRemove(null)}>
          <p>Are you sure you want to delete this vendor record?</p>
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
