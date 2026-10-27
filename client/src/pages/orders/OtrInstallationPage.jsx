import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, uploadFile } from '../../services/api';
import { fmtDate } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';

const EMPTY_FILTERS = {
  q: '',
  orderNo: '',
  customer: '',
  location: '',
  product: '',
  stage: '',
  readiness: '',
  status: '',
  handover: '',
  responsible: '',
  from: '',
  to: '',
};

const EMPTY_FORM = {
  projectId: '',
  plannedDate: '',
  startedDate: '',
  completedDate: '',
  progress: '',
  readiness: '',
  readinessReason: '',
  status: '',
  delayReason: '',
  handoverStatus: '',
  responsibleId: '',
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

function stageFor(progress, status) {
  if (status === 'COMPLETED') return 'COMPLETED';
  const number = Number(progress);
  if (!Number.isFinite(number) || number <= 0) return 'NOT_STARTED';
  if (number >= 100) return 'COMPLETED';
  return 'INSTALLATION';
}

function stageLabel(code, stages) {
  return stages.find((item) => item.code === code)?.label || code || '—';
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

function previewDelay(planned, completed, status) {
  if (!planned) return null;
  const end = status === 'COMPLETED' ? completed : dayKey(new Date());
  if (!end) return null;
  const diff = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${planned}T00:00:00Z`)) / 86400000);
  return diff > 0 ? diff : 0;
}

export default function OtrInstallationPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [photos, setPhotos] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [view, setView] = useState(null);
  const [previews, setPreviews] = useState([]);
  const [remove, setRemove] = useState(null);
  const loaded = useRef(false);

  const load = useCallback((options = {}) => {
    if (!options.silent) setError('');
    return api.get('/installation/tracking')
      .then((payload) => {
        loaded.current = true;
        setData(payload);
        setError('');
      })
      .catch(() => {
        if (!options.silent || !loaded.current) {
          setData(null);
          setError('Unable to load Installation records. Please try again.');
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

  useEffect(() => () => {
    previews.forEach((photo) => {
      if (photo.url) URL.revokeObjectURL(photo.url);
    });
  }, [previews]);

  const items = data?.items || [];
  const orders = data?.orders || [];
  const stages = data?.stages || [];
  const readinessOptions = data?.readiness || [];
  const statuses = data?.statuses || [];
  const handoverStatuses = data?.handoverStatuses || [];
  const assignees = data?.assignees || [];
  const canEdit = Boolean(data?.canEdit);
  const selectedOrder = orders.find((order) => order.id === form.projectId) || formMode?.row || null;
  const derivedStage = stageFor(form.progress, form.status);

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
    if (filters.readiness && row.readiness !== filters.readiness) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.handover && row.handoverStatus !== filters.handover) return false;
    if (filters.responsible && row.responsibleName !== filters.responsible) return false;
    const planned = dayKey(row.plannedAt);
    if (filters.from && (!planned || planned < filters.from)) return false;
    if (filters.to && (!planned || planned > filters.to)) return false;
    return true;
  }), [items, filters]);

  const filtersOn = Object.values(filters).some(Boolean);

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setPhotos([]);
    setNewFiles([]);
    setFormMode({ mode: 'create' });
  }

  async function openEdit(row) {
    setBusy('open');
    setNotice(null);
    try {
      const detail = await api.get(`/installation/tracking/${row.id}`);
      setForm({
        projectId: detail.projectId,
        plannedDate: detail.plannedDateInput || '',
        startedDate: detail.startedDateInput || '',
        completedDate: detail.completedDateInput || '',
        progress: detail.progress === 0 || detail.progress ? String(detail.progress) : '',
        readiness: detail.readiness || '',
        readinessReason: detail.readinessReason || '',
        status: detail.status || '',
        delayReason: detail.delayReason || '',
        handoverStatus: detail.handoverStatus || '',
        responsibleId: detail.responsibleId || '',
        remarks: detail.remarks || '',
      });
      setPhotos(detail.photos || []);
      setNewFiles([]);
      setFormMode({ mode: 'edit', row: detail });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to open this installation record.', error: true });
    } finally {
      setBusy('');
    }
  }

  function onStatus(status) {
    setForm((current) => ({
      ...current,
      status,
      progress: status === 'COMPLETED' ? '100' : current.progress,
    }));
  }

  function onStage(stage) {
    setForm((current) => {
      if (stage === 'NOT_STARTED') {
        return { ...current, progress: '0', status: current.status === 'COMPLETED' ? 'NOT_STARTED' : current.status };
      }
      if (stage === 'COMPLETED') return { ...current, progress: '100', status: 'COMPLETED' };
      const progressValue = current.progress === '0' || current.progress === '100' ? '' : current.progress;
      return {
        ...current,
        progress: progressValue,
        status: current.status === 'COMPLETED' ? 'IN_PROGRESS' : current.status,
      };
    });
  }

  function payload() {
    return {
      ...(formMode?.mode === 'create' ? { projectId: form.projectId } : {}),
      plannedDate: form.plannedDate || null,
      startedDate: form.startedDate || null,
      ...(form.status === 'COMPLETED' && form.completedDate ? { completedDate: form.completedDate } : {}),
      progress: form.status === 'COMPLETED' ? 100 : (form.progress === '' ? '' : Number(form.progress)),
      readiness: form.readiness,
      readinessReason: form.readinessReason,
      status: form.status,
      delayReason: form.delayReason,
      handoverStatus: form.handoverStatus,
      responsibleId: form.responsibleId || null,
      remarks: form.remarks,
    };
  }

  async function uploadPhotos(recordId, files) {
    for (const file of files) {
      const body = new FormData();
      body.append('file', file);
      await uploadFile(`/installation/tracking/${recordId}/photos`, body);
    }
  }

  async function saveForm(event) {
    event.preventDefault();
    if (!formMode) return;
    setBusy('save');
    setNotice(null);
    try {
      const created = formMode.mode === 'create'
        ? await api.post('/installation/tracking', payload())
        : null;
      if (formMode.mode === 'edit') await api.patch(`/installation/tracking/${formMode.row.id}`, payload());
      const recordId = created?.id || formMode.row.id;
      let photoError = '';
      if (newFiles.length) {
        try {
          await uploadPhotos(recordId, newFiles);
        } catch (err) {
          photoError = err.message || 'A site photo could not be uploaded.';
        }
      }
      const success = formMode.mode === 'create'
        ? 'Installation record created successfully.'
        : 'Installation record updated successfully.';
      setNotice({ text: photoError ? `${success} ${photoError}` : success, error: Boolean(photoError) });
      setFormMode(null);
      setNewFiles([]);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to save this installation record.', error: true });
    } finally {
      setBusy('');
    }
  }

  async function confirmDelete() {
    if (!remove) return;
    setBusy('delete');
    setNotice(null);
    try {
      await api.delete(`/installation/tracking/${remove.id}`);
      setNotice({ text: 'Installation record deleted successfully.', error: false });
      setRemove(null);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to delete this installation record.', error: true });
    } finally {
      setBusy('');
    }
  }

  async function openView(row) {
    setView(row);
    setPreviews([]);
    try {
      const detail = await api.get(`/installation/tracking/${row.id}`);
      setView(detail);
      const next = [];
      for (const photo of detail.photos || []) {
        const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/installation/tracking/photos/${photo.id}/download`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) continue;
        const blob = await res.blob();
        next.push({ ...photo, url: URL.createObjectURL(blob) });
      }
      setPreviews(next);
    } catch (err) {
      setNotice({ text: err.message || 'Unable to open this installation record.', error: true });
    }
  }

  async function downloadPhoto(photo) {
    const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/installation/tracking/photos/${photo.id}/download`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      setNotice({ text: 'Unable to download the photo.', error: true });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = photo.fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function deletePhoto(photo) {
    setBusy(`photo-${photo.id}`);
    try {
      await api.delete(`/installation/tracking/photos/${photo.id}`);
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
      if (formMode?.row) {
        setFormMode((current) => ({
          ...current,
          row: { ...current.row, photoCount: Math.max(0, (current.row.photoCount || 1) - 1) },
        }));
      }
    } catch (err) {
      setNotice({ text: err.message || 'Unable to delete the photo.', error: true });
    } finally {
      setBusy('');
    }
  }

  const delayPreview = previewDelay(form.plannedDate, form.completedDate, form.status);

  return (
    <div className="oc-page design-board production-board">
      <div className="page-head">
        <div>
          <p className="eyebrow">OTR</p>
          <h2>Installation</h2>
          <p>Installation records for orders released from dispatch. Completing installation closes the order.</p>
        </div>
        {canEdit && <button className="btn" type="button" onClick={openCreate}>+ Create Installation</button>}
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
        <select aria-label="Current Stage" value={filters.stage} onChange={(event) => setFilter('stage', event.target.value)}>
          <option value="">Current Stage</option>
          {stages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <select aria-label="Site Readiness" value={filters.readiness} onChange={(event) => setFilter('readiness', event.target.value)}>
          <option value="">Site Readiness</option>
          {readinessOptions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <select aria-label="Installation Status" value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
          <option value="">Installation Status</option>
          {statuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <select aria-label="Handover Status" value={filters.handover} onChange={(event) => setFilter('handover', event.target.value)}>
          <option value="">Handover Status</option>
          {handoverStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <select aria-label="Responsible Person" value={filters.responsible} onChange={(event) => setFilter('responsible', event.target.value)}>
          <option value="">Responsible Person</option>
          {unique(items, 'responsibleName').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <input type="date" aria-label="Planned from" title="Planned from" value={filters.from} onChange={(event) => setFilter('from', event.target.value)} />
        <input type="date" aria-label="Planned to" title="Planned to" value={filters.to} onChange={(event) => setFilter('to', event.target.value)} />
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
          <strong>{filtersOn ? 'No installation records match these filters.' : 'No installation records available.'}</strong>
          {!filtersOn && canEdit && <button className="btn sm" type="button" onClick={openCreate}>+ Create Installation</button>}
          {filtersOn && <button className="btn ghost sm" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Reset Filters</button>}
        </div>
      )}

      {!error && filtered.length > 0 && (
        <div className="table-wrap design-scroll">
          <table className="data installation-sheet">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Order No.</th>
                <th>Order Date</th>
                <th>Customer</th>
                <th>Location</th>
                <th>Product</th>
                <th>Installation Planned Date</th>
                <th>Installation Start Date</th>
                <th>Installation Completion Date</th>
                <th>Site Installation Photos</th>
                <th>Installation %</th>
                <th>Current Stage</th>
                <th>Site Readiness</th>
                <th>Installation Status</th>
                <th>Delay Days</th>
                <th>Delay Reason</th>
                <th>Handover Status</th>
                <th>Responsible Person</th>
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
                  <td><Clip value={row.customer} width={170} /></td>
                  <td><Clip value={row.location} width={140} /></td>
                  <td><Clip value={row.product} width={130} /></td>
                  <td>{fmtDate(row.plannedAt)}</td>
                  <td>{fmtDate(row.startedAt)}</td>
                  <td>{fmtDate(row.completedAt)}</td>
                  <td>
                    {row.photoCount > 0
                      ? <button className="btn sm ghost" type="button" onClick={() => openView(row)}>{row.photoCount} photo{row.photoCount === 1 ? '' : 's'}</button>
                      : '—'}
                  </td>
                  <td><Percent value={row.progress} label={row.progressLabel} /></td>
                  <td><StatusBadge code={row.stage} label={row.stageLabel} /></td>
                  <td><StatusBadge code={row.readiness} label={row.readinessLabel} /></td>
                  <td><StatusBadge code={row.status} label={row.statusLabel} /></td>
                  <td><DelayDays days={row.delayDays} /></td>
                  <td><Clip value={row.delayReason || '—'} width={150} /></td>
                  <td><StatusBadge code={row.handoverStatus} label={row.handoverLabel} /></td>
                  <td><Clip value={row.responsibleName || '—'} width={140} /></td>
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
        <Modal title={formMode.mode === 'create' ? 'Create Installation' : `Edit ${formMode.row.orderNo || 'installation'}`} onClose={() => !busy && setFormMode(null)} wide>
          <form className="form-grid" onSubmit={saveForm}>
            {formMode.mode === 'create' && orders.length === 0 && (
              <p className="design-note">No orders are ready for installation. An order appears here after dispatch is completed.</p>
            )}
            <h3 className="form-section">Order Details</h3>
            <label className="field">
              Order No.
              <select required value={form.projectId} disabled={formMode.mode === 'edit'} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
                <option value="">Select order</option>
                {formMode.mode === 'edit' && formMode.row && (
                  <option value={formMode.row.projectId}>{formMode.row.orderNo || formMode.row.projectCode}</option>
                )}
                {orders.map((order) => <option key={order.id} value={order.id}>{order.orderNo || order.projectCode}</option>)}
              </select>
            </label>
            <label className="field">
              Order Date
              <input value={selectedOrder?.orderDate ? fmtDate(selectedOrder.orderDate) : ''} readOnly />
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

            <h3 className="form-section">Installation Schedule</h3>
            <label className="field">
              Installation Planned Date
              <input required type="date" value={form.plannedDate} onChange={(event) => setForm({ ...form, plannedDate: event.target.value })} />
            </label>
            <label className="field">
              Installation Start Date
              <input type="date" value={form.startedDate} onChange={(event) => setForm({ ...form, startedDate: event.target.value })} />
            </label>
            {form.status === 'COMPLETED' && (
              <label className="field">
                Installation Completion Date
                <input type="date" value={form.completedDate} onChange={(event) => setForm({ ...form, completedDate: event.target.value })} />
              </label>
            )}
            <label className="field">
              Delay Days
              <input value={delayPreview == null ? '—' : String(delayPreview)} readOnly />
            </label>

            <h3 className="form-section">Installation Progress</h3>
            <label className="field">
              Installation %
              <input required={form.status !== 'COMPLETED'} type="number" min="0" max="100" step="1" value={form.progress} onChange={(event) => setForm({ ...form, progress: event.target.value })} />
            </label>
            <label className="field">
              Current Stage
              <select value={derivedStage} onChange={(event) => onStage(event.target.value)}>
                {stages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                {!stages.some((item) => item.code === derivedStage) && <option value={derivedStage}>{derivedStage}</option>}
              </select>
            </label>
            <label className="field">
              Installation Status
              <select required value={form.status} onChange={(event) => onStatus(event.target.value)}>
                <option value="">Select status</option>
                {statuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            <label className="field">
              Delay Reason
              <input value={form.delayReason} onChange={(event) => setForm({ ...form, delayReason: event.target.value })} />
            </label>

            <h3 className="form-section">Site Readiness</h3>
            <label className="field">
              Site Readiness
              <select required value={form.readiness} onChange={(event) => setForm({ ...form, readiness: event.target.value })}>
                <option value="">Select readiness</option>
                {readinessOptions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            {form.readiness === 'NOT_READY' && (
              <label className="field">
                Readiness Reason
                <input value={form.readinessReason} onChange={(event) => setForm({ ...form, readinessReason: event.target.value })} />
              </label>
            )}

            <h3 className="form-section">Handover</h3>
            <label className="field">
              Handover Status
              <select required value={form.handoverStatus} onChange={(event) => setForm({ ...form, handoverStatus: event.target.value })}>
                <option value="">Select handover status</option>
                {handoverStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>

            <h3 className="form-section">Responsibility & Remarks</h3>
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
            <label className="field full">
              Remarks
              <textarea rows={3} value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} />
            </label>

            <h3 className="form-section">Site Photos</h3>
            {photos.length > 0 && (
              <div className="photo-grid full">
                {photos.map((photo) => (
                  <figure key={photo.id}>
                    <figcaption title={photo.fileName}>{photo.fileName}</figcaption>
                    <div className="row-actions">
                      <button className="btn sm ghost" type="button" onClick={() => downloadPhoto(photo)}>Download</button>
                      {canEdit && <button className="btn sm danger" type="button" disabled={busy === `photo-${photo.id}`} onClick={() => deletePhoto(photo)}>Delete</button>}
                    </div>
                  </figure>
                ))}
              </div>
            )}
            <label className="field full">
              Upload photos
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => setNewFiles(Array.from(event.target.files || []))} />
            </label>
            {newFiles.length > 0 && <p className="design-note">{newFiles.length} photo{newFiles.length === 1 ? '' : 's'} ready to upload.</p>}

            <div className="form-actions">
              <button className="btn ghost" type="button" disabled={busy === 'save'} onClick={() => setFormMode(null)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {view && (
        <Modal title={view.orderNo || 'Installation'} onClose={() => setView(null)} wide>
          <dl className="design-detail">
            <div><dt>Order No.</dt><dd>{blank(view.orderNo)}</dd></div>
            <div><dt>Order Date</dt><dd>{fmtDate(view.orderDate)}</dd></div>
            <div><dt>Customer</dt><dd>{blank(view.customer)}</dd></div>
            <div><dt>Location</dt><dd>{blank(view.location)}</dd></div>
            <div><dt>Product</dt><dd>{blank(view.product)}</dd></div>
            <div><dt>Planned Date</dt><dd>{fmtDate(view.plannedAt)}</dd></div>
            <div><dt>Start Date</dt><dd>{fmtDate(view.startedAt)}</dd></div>
            <div><dt>Completion Date</dt><dd>{fmtDate(view.completedAt)}</dd></div>
            <div><dt>Installation %</dt><dd>{view.progressLabel || '—'}</dd></div>
            <div><dt>Current Stage</dt><dd>{view.stageLabel || stageLabel(view.stage, stages)}</dd></div>
            <div><dt>Site Readiness</dt><dd>{view.readinessLabel || '—'}</dd></div>
            <div><dt>Readiness Reason</dt><dd>{blank(view.readinessReason)}</dd></div>
            <div><dt>Installation Status</dt><dd>{view.statusLabel || '—'}</dd></div>
            <div><dt>Delay Days</dt><dd>{view.delayDays == null ? '—' : view.delayDays}</dd></div>
            <div><dt>Delay Reason</dt><dd>{blank(view.delayReason)}</dd></div>
            <div><dt>Handover Status</dt><dd>{view.handoverLabel || '—'}</dd></div>
            <div><dt>Responsible Person</dt><dd>{blank(view.responsibleName)}</dd></div>
            <div><dt>Remarks</dt><dd>{blank(view.remarks)}</dd></div>
          </dl>
          <h3>Site photos</h3>
          {previews.length === 0 && <p className="design-note">No site photos uploaded.</p>}
          {previews.length > 0 && (
            <div className="photo-grid">
              {previews.map((photo) => (
                <figure key={photo.id}>
                  <img src={photo.url} alt={photo.fileName} />
                  <figcaption title={photo.fileName}>{photo.fileName}</figcaption>
                  <button className="btn sm ghost" type="button" onClick={() => downloadPhoto(photo)}>Download</button>
                </figure>
              ))}
            </div>
          )}
        </Modal>
      )}

      {remove && (
        <Modal title="Delete installation record" onClose={() => !busy && setRemove(null)}>
          <p>Are you sure you want to delete this installation record?</p>
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
