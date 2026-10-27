import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api, getToken, uploadFile } from '../../services/api';
import { fmtDate, fmtDateTime, money } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';

const EMPTY_FILTERS = {
  q: '',
  orderNo: '',
  customer: '',
  location: '',
  product: '',
  poStatus: '',
  designStatus: '',
  stage: '',
  responsible: '',
  date: '',
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

function DesignPercent({ value, label }) {
  const width = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="design-pct" title={label}>
      <div className="progress" aria-hidden="true"><span style={{ width: `${width}%` }} /></div>
      <strong>{label}</strong>
    </div>
  );
}

function ActionMenu({ children }) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(event) {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle() {
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = 214;
    const openUp = window.innerHeight - rect.bottom < menuHeight && rect.top > menuHeight;
    setBox({
      top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
      left: Math.max(8, rect.right - 196),
    });
    setOpen((value) => !value);
  }

  return (
    <>
      <button ref={buttonRef} className="btn sm ghost" type="button" aria-expanded={open} aria-haspopup="menu" onClick={toggle}>
        Actions
      </button>
      {open && box && createPortal(
        <div ref={menuRef} className="design-menu" style={{ top: box.top, left: box.left }} role="menu">
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </>
  );
}

function blank(value) {
  return value && value !== '—' ? value : '—';
}

export default function DesignBoard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [view, setView] = useState(null);
  const [edit, setEdit] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [statusRow, setStatusRow] = useState(null);
  const [statusForm, setStatusForm] = useState({ status: '', remarks: '' });
  const [history, setHistory] = useState(null);
  const [files, setFiles] = useState(null);
  const [fileActivity, setFileActivity] = useState('');
  const [fileForm, setFileForm] = useState({ remarks: '', status: 'IN_PROGRESS', file: null });
  const [progressValue, setProgressValue] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [createForm, setCreateForm] = useState(null);
  const loaded = useRef(false);

  const load = useCallback((options = {}) => {
    if (!options.silent) setError('');
    return api.get('/design')
      .then((payload) => {
        loaded.current = true;
        setData(payload);
        setError('');
      })
      .catch((err) => {
        if (!options.silent || !loaded.current) {
          setData(null);
          setError('Unable to load OTR data. Please try again.');
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
  const activityOrder = data?.activityOrder || [];
  const activityLabels = data?.activityLabels || {};
  const activityStatuses = data?.activityStatuses || [];
  const overallStatuses = data?.overallStatuses || [];
  const stageOptions = data?.stageOptions || [];
  const assignees = data?.assignees || [];
  const canEdit = Boolean(data?.canEdit);

  const filtered = useMemo(() => items.filter((row) => {
    if (filters.q) {
      const hay = [
        row.orderNo, row.projectId, row.customer, row.location, row.productGroup,
        row.poStatus, row.responsibleName, row.remarks, row.designStatus, row.designStage,
      ].join(' ').toLowerCase();
      if (!hay.includes(filters.q.trim().toLowerCase())) return false;
    }
    if (filters.orderNo && row.orderNo !== filters.orderNo) return false;
    if (filters.customer && row.customer !== filters.customer) return false;
    if (filters.location && row.location !== filters.location) return false;
    if (filters.product && row.productGroup !== filters.product) return false;
    if (filters.poStatus && row.poStatus !== filters.poStatus) return false;
    if (filters.designStatus && row.designStatusCode !== filters.designStatus) return false;
    if (filters.stage && row.designStageCode !== filters.stage) return false;
    if (filters.responsible && row.responsibleName !== filters.responsible) return false;
    if (filters.date && dayKey(row.orderDate) !== filters.date) return false;
    return true;
  }), [items, filters]);

  const filtersOn = Object.values(filters).some(Boolean);

  function designForm(order) {
    const activities = {};
    for (const key of activityOrder) activities[key] = order?.activities?.[key]?.code || 'PENDING';
    return {
      projectId: order?.id || '',
      customer: order?.customer && order.customer !== '—' ? order.customer : '',
      location: order?.location && order.location !== '—' ? order.location : '',
      productGroup: order?.productGroup && order.productGroup !== '—' ? order.productGroup : '',
      poStatus: order?.poStatusCode || '',
      projectValue: order?.projectValue ?? '',
      responsibleId: order?.responsibleId || '',
      targetDate: order?.targetDateInput || '',
      remarks: order?.remarks && order.remarks !== '—' ? order.remarks : '',
      activities,
    };
  }

  function openCreate(order) {
    setCreateForm(designForm(order || items[0]));
  }

  async function saveCreate(event) {
    event.preventDefault();
    if (!createForm?.projectId) return;
    setBusy('create');
    setNotice(null);
    try {
      await api.post('/design/entry', {
        ...createForm,
        projectValue: createForm.projectValue === '' ? null : Number(createForm.projectValue),
      });
      setNotice({ text: 'Design record saved successfully.', error: false });
      setCreateForm(null);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to save this design record.', error: true });
    } finally {
      setBusy('');
    }
  }

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function saved(result, row) {
    if (result?.advanced) {
      setNotice({
        text: `${row.orderNo || row.projectId} design is complete. The order is now eligible for Procurement.`,
        error: false,
      });
    } else {
      setNotice({ text: 'Design updated.', error: false });
    }
  }

  async function changeActivity(row, activity, status) {
    if (status === row.activities?.[activity]?.code) return;
    setBusy(`${row.id}:${activity}`);
    setNotice(null);
    try {
      const result = await api.patch(`/design/${row.id}/activities/${activity}`, { status });
      saved(result, row);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to update the activity.', error: true });
      await load({ silent: true });
    } finally {
      setBusy('');
    }
  }

  function openEdit(row) {
    setEdit(row);
    setEditForm({
      responsibleId: row.responsibleId || '',
      targetDate: row.targetDateInput || '',
      remarks: row.remarks || '',
      status: row.designStatusCode || 'PENDING',
      activities: Object.fromEntries(activityOrder.map((key) => [key, row.activities?.[key]?.code || 'PENDING'])),
    });
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!edit || !editForm) return;
    setBusy('edit');
    setNotice(null);
    const payload = {
      responsibleId: editForm.responsibleId || null,
      targetDate: editForm.targetDate || null,
      remarks: editForm.remarks,
      activities: editForm.activities,
    };
    if (editForm.status !== edit.designStatusCode) payload.status = editForm.status;
    try {
      const result = await api.patch(`/design/${edit.id}/tracking`, payload);
      saved(result, edit);
      setEdit(null);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to update design.', error: true });
    } finally {
      setBusy('');
    }
  }

  function openStatus(row) {
    setStatusRow(row);
    setStatusForm({ status: row.designStatusCode || 'PENDING', remarks: row.remarks || '' });
  }

  async function saveStatus(event) {
    event.preventDefault();
    if (!statusRow) return;
    setBusy('status');
    setNotice(null);
    try {
      const result = await api.patch(`/design/${statusRow.id}/tracking`, {
        status: statusForm.status,
        remarks: statusForm.remarks,
      });
      saved(result, statusRow);
      setStatusRow(null);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to update the status.', error: true });
    } finally {
      setBusy('');
    }
  }

  async function openHistory(row) {
    setHistory({ row, items: null, error: '' });
    try {
      const payload = await api.get(`/design/${row.id}/history`);
      setHistory({ row, items: payload.items || [], error: '' });
    } catch (err) {
      setHistory({ row, items: [], error: err.message || 'Unable to load activity details.' });
    }
  }

  async function openFiles(row, activity = activityOrder[0] || '') {
    setFileActivity(activity);
    setFileForm({
      remarks: '',
      status: row.activities?.[activity]?.code && row.activities[activity].code !== 'PENDING'
        ? row.activities[activity].code
        : 'IN_PROGRESS',
      file: null,
    });
    setFiles({ row, items: null, error: '' });
    try {
      const payload = await api.get(`/design/${row.id}/activity-files`);
      setFiles({ row, items: payload.items || [], error: '' });
    } catch (err) {
      setFiles({ row, items: [], error: err.message || 'Unable to load files.' });
    }
  }

  async function submitFile(event) {
    event.preventDefault();
    if (!files?.row || !fileForm.file || !fileActivity) return;
    const body = new FormData();
    body.append('file', fileForm.file);
    body.append('drawingName', fileForm.file.name);
    body.append('remarks', fileForm.remarks);
    body.append('status', fileForm.status);
    setUploading(true);
    setProgressValue(0);
    setNotice(null);
    try {
      await uploadFile(`/design/${files.row.id}/activities/${fileActivity}/files`, body, setProgressValue);
      setNotice({ text: 'File uploaded. Previous versions are kept.', error: false });
      setFileForm((current) => ({ ...current, file: null, remarks: '' }));
      const payload = await api.get(`/design/${files.row.id}/activity-files`);
      setFiles({ row: files.row, items: payload.items || [], error: '' });
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to upload the file.', error: true });
    } finally {
      setUploading(false);
    }
  }

  async function download(file) {
    const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/design/files/${file.id}/download`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      setNotice({ text: 'Unable to download the file.', error: true });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  const fileRows = (files?.items || []).filter((file) => file.kind === fileActivity);
  const accept = fileActivity === 'BOM' ? data?.fileAccept?.BOM : data?.fileAccept?.DRAWING;

  return (
    <div className="oc-page design-board">
      <div className="page-head">
        <div>
          <p className="eyebrow">OTR</p>
          <h2>Design</h2>
          <p>Orders confirmed into OTR and currently in Design. SHOP, BOM, and drawing status drive the design percent, stage, and procurement handoff.</p>
        </div>
        {canEdit && <button className="btn" type="button" onClick={() => openCreate()}>+ Create Design</button>}
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
          {unique(items, 'productGroup').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="PO Status" value={filters.poStatus} onChange={(event) => setFilter('poStatus', event.target.value)}>
          <option value="">PO Status</option>
          {unique(items, 'poStatus').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Design Status" value={filters.designStatus} onChange={(event) => setFilter('designStatus', event.target.value)}>
          <option value="">Design Status</option>
          {overallStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <select aria-label="Current Stage" value={filters.stage} onChange={(event) => setFilter('stage', event.target.value)}>
          <option value="">Current Stage</option>
          {stageOptions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <select aria-label="Responsible Name" value={filters.responsible} onChange={(event) => setFilter('responsible', event.target.value)}>
          <option value="">Responsible Name</option>
          {unique(items, 'responsibleName').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <input type="date" aria-label="Order date" value={filters.date} onChange={(event) => setFilter('date', event.target.value)} />
        <button className="btn ghost sm" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Reset Filters</button>
      </form>

      {notice && <div className={`notice${notice.error ? ' err' : ''}`}>{notice.text}</div>}
      {error && (
        <div className="oc-state">
          <strong>Unable to load OTR data. Please try again.</strong>
          <button className="btn sm" type="button" onClick={() => load()}>Retry</button>
        </div>
      )}
      {!error && !data && <div className="oc-state">Loading…</div>}
      {!error && data && filtered.length === 0 && (
        <div className="oc-state">
          <strong>{filtersOn ? 'No orders match these filters.' : 'No OTR orders are currently in Design.'}</strong>
          {!filtersOn && canEdit && <button className="btn sm" type="button" onClick={() => openCreate()}>+ Create Design</button>}
          {filtersOn && <button className="btn ghost sm" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Reset Filters</button>}
        </div>
      )}

      {!error && filtered.length > 0 && (
        <div className="table-wrap design-scroll">
          <table className="data design-sheet">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Order No.</th>
                <th>Order Date</th>
                <th>Customer</th>
                <th>Location</th>
                <th>Product</th>
                <th>PO Status</th>
                <th>Project Value</th>
                {activityOrder.map((key) => <th key={key}>{activityLabels[key] || key}</th>)}
                <th>Design %</th>
                <th>Current Stage</th>
                <th>Status</th>
                <th>Responsible Name</th>
                <th>Delay Days</th>
                <th>Target Date</th>
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
                  <td><Clip value={row.location} width={160} /></td>
                  <td><Clip value={row.productGroup} width={140} /></td>
                  <td>{row.poStatus && row.poStatus !== '—' ? <StatusBadge code={row.poStatusCode} label={row.poStatus} /> : '—'}</td>
                  <td>{money(row.projectValue, row.currency)}</td>
                  {activityOrder.map((key) => {
                    const activity = row.activities?.[key];
                    if (!activity) return <td key={key}>—</td>;
                    if (!canEdit) return <td key={key}><StatusBadge code={activity.code} label={activity.label} /></td>;
                    return (
                      <td key={key}>
                        <select
                          className="design-activity"
                          aria-label={`${activityLabels[key] || key} status`}
                          value={activity.code}
                          disabled={Boolean(busy)}
                          onChange={(event) => changeActivity(row, key, event.target.value)}
                        >
                          {activityStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                          {!activityStatuses.some((item) => item.code === activity.code) && (
                            <option value={activity.code}>{activity.label}</option>
                          )}
                        </select>
                      </td>
                    );
                  })}
                  <td><DesignPercent value={row.designPercent} label={row.designPercentLabel} /></td>
                  <td><StatusBadge code={row.designStageCode} label={row.designStage} /></td>
                  <td><StatusBadge code={row.designStatusCode} label={row.designStatus} /></td>
                  <td><Clip value={row.responsibleName || '—'} width={150} /></td>
                  <td><DelayDays days={row.delayDays} /></td>
                  <td>{fmtDate(row.targetDate)}</td>
                  <td><Clip value={row.remarks || '—'} width={180} /></td>
                  <td className="is-actions">
                    <ActionMenu>
                      {(close) => (
                        <>
                          <button type="button" role="menuitem" onClick={() => { close(); setView(row); }}>View</button>
                          {canEdit && <button type="button" role="menuitem" onClick={() => { close(); openEdit(row); }}>Edit / Update</button>}
                          <button type="button" role="menuitem" onClick={() => { close(); openHistory(row); }}>Activity Details</button>
                          <button type="button" role="menuitem" onClick={() => { close(); openFiles(row); }}>View Files</button>
                          {canEdit && <button type="button" role="menuitem" onClick={() => { close(); openStatus(row); }}>Update Status</button>}
                        </>
                      )}
                    </ActionMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createForm && (
        <Modal title="Create Design" onClose={() => !busy && setCreateForm(null)} wide>
          <form className="form-grid" onSubmit={saveCreate}>
            <label className="field">
              Order No.
              <select required value={createForm.projectId} onChange={(event) => {
                const order = items.find((item) => item.id === event.target.value);
                setCreateForm(designForm(order));
              }}>
                <option value="">Select order</option>
                {items.map((item) => <option key={item.id} value={item.id}>{item.orderNo || item.projectId || 'Order'}</option>)}
              </select>
            </label>
            <label className="field">
              Customer
              <input value={createForm.customer} onChange={(event) => setCreateForm({ ...createForm, customer: event.target.value })} />
            </label>
            <label className="field">
              Location
              <input value={createForm.location} onChange={(event) => setCreateForm({ ...createForm, location: event.target.value })} />
            </label>
            <label className="field">
              Product
              <input value={createForm.productGroup} onChange={(event) => setCreateForm({ ...createForm, productGroup: event.target.value })} />
            </label>
            <label className="field">
              PO Status
              <select value={createForm.poStatus} onChange={(event) => setCreateForm({ ...createForm, poStatus: event.target.value })}>
                <option value="">Select</option>
                <option value="PENDING">Pending</option>
                <option value="ISSUED">Issued</option>
                <option value="RECEIVED">Received</option>
                <option value="NOT_ISSUED">Not issued</option>
                {createForm.poStatus && !['PENDING', 'ISSUED', 'RECEIVED', 'NOT_ISSUED'].includes(createForm.poStatus) && (
                  <option value={createForm.poStatus}>{createForm.poStatus}</option>
                )}
              </select>
            </label>
            <label className="field">
              Project Value
              <input type="number" min="0" step="0.01" value={createForm.projectValue} onChange={(event) => setCreateForm({ ...createForm, projectValue: event.target.value })} />
            </label>
            <label className="field">
              Responsible Person
              <select value={createForm.responsibleId} onChange={(event) => setCreateForm({ ...createForm, responsibleId: event.target.value })}>
                <option value="">Unassigned</option>
                {assignees.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
              </select>
            </label>
            <label className="field">
              Target Date
              <input type="date" value={createForm.targetDate} onChange={(event) => setCreateForm({ ...createForm, targetDate: event.target.value })} />
            </label>
            {activityOrder.map((key) => (
              <label className="field" key={key}>
                {activityLabels[key] || key} Status
                <select
                  value={createForm.activities[key] || 'PENDING'}
                  onChange={(event) => setCreateForm({
                    ...createForm,
                    activities: { ...createForm.activities, [key]: event.target.value },
                  })}
                >
                  {activityStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                </select>
              </label>
            ))}
            <label className="field full">
              Remarks
              <textarea rows={3} value={createForm.remarks} onChange={(event) => setCreateForm({ ...createForm, remarks: event.target.value })} />
            </label>
            <p className="design-note">Design % is calculated from the four activity statuses.</p>
            <div className="form-actions">
              <button className="btn ghost" type="button" disabled={busy === 'create'} onClick={() => setCreateForm(null)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy === 'create' || !items.length}>{busy === 'create' ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {view && (
        <Modal title={view.orderNo || view.projectId} onClose={() => setView(null)} wide>
          <dl className="design-detail">
            <div><dt>Order No.</dt><dd>{blank(view.orderNo)}</dd></div>
            <div><dt>Order Date</dt><dd>{fmtDate(view.orderDate)}</dd></div>
            <div><dt>Customer</dt><dd>{blank(view.customer)}</dd></div>
            <div><dt>Location</dt><dd>{blank(view.location)}</dd></div>
            <div><dt>Product</dt><dd>{blank(view.productGroup)}</dd></div>
            <div><dt>PO Status</dt><dd>{blank(view.poStatus)}</dd></div>
            <div><dt>Project Value</dt><dd>{money(view.projectValue, view.currency)}</dd></div>
            {activityOrder.map((key) => (
              <div key={key}><dt>{activityLabels[key] || key}</dt><dd>{view.activities?.[key]?.label || '—'}</dd></div>
            ))}
            <div><dt>Design %</dt><dd>{view.designPercentLabel}</dd></div>
            <div><dt>Current Stage</dt><dd>{view.designStage}</dd></div>
            <div><dt>Status</dt><dd>{view.designStatus}</dd></div>
            <div><dt>Responsible Name</dt><dd>{blank(view.responsibleName)}</dd></div>
            <div><dt>Delay Days</dt><dd>{view.delayDays == null ? '—' : view.delayDays}</dd></div>
            <div><dt>Target Date</dt><dd>{fmtDate(view.targetDate)}</dd></div>
            <div><dt>Remarks</dt><dd>{blank(view.remarks)}</dd></div>
          </dl>
          <div className="form-actions">
            <Link className="btn ghost sm" to={`/projects/${view.id}`}>Open project</Link>
            <button className="btn sm" type="button" onClick={() => { setView(null); openFiles(view); }}>View Files</button>
          </div>
        </Modal>
      )}

      {edit && editForm && (
        <Modal title={`Update ${edit.orderNo || edit.projectId}`} onClose={() => !busy && setEdit(null)} wide>
          <form className="form-grid" onSubmit={saveEdit}>
            <label className="field">
              Responsible Name
              <select value={editForm.responsibleId} onChange={(event) => setEditForm({ ...editForm, responsibleId: event.target.value })}>
                <option value="">Unassigned</option>
                {edit.responsibleName && !assignees.some((person) => person.id === edit.responsibleId) && edit.responsibleId && (
                  <option value={edit.responsibleId}>{edit.responsibleName}</option>
                )}
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>{person.fullName}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Target Date
              <input type="date" value={editForm.targetDate} onChange={(event) => setEditForm({ ...editForm, targetDate: event.target.value })} />
            </label>
            <label className="field">
              Status
              <select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                {overallStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            {activityOrder.map((key) => (
              <label className="field" key={key}>
                {activityLabels[key] || key}
                <select
                  value={editForm.activities[key] || 'PENDING'}
                  onChange={(event) => setEditForm({
                    ...editForm,
                    activities: { ...editForm.activities, [key]: event.target.value },
                  })}
                >
                  {activityStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                </select>
              </label>
            ))}
            <label className="field full">
              Remarks
              <textarea rows={3} value={editForm.remarks} onChange={(event) => setEditForm({ ...editForm, remarks: event.target.value })} />
            </label>
            <div className="form-actions">
              <button className="btn ghost" type="button" disabled={busy === 'edit'} onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy === 'edit'}>{busy === 'edit' ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {statusRow && (
        <Modal title={`Status · ${statusRow.orderNo || statusRow.projectId}`} onClose={() => !busy && setStatusRow(null)}>
          <form className="form-grid" onSubmit={saveStatus}>
            <label className="field full">
              Status
              <select value={statusForm.status} onChange={(event) => setStatusForm({ ...statusForm, status: event.target.value })}>
                {overallStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            <label className="field full">
              Remarks
              <textarea rows={3} value={statusForm.remarks} onChange={(event) => setStatusForm({ ...statusForm, remarks: event.target.value })} />
            </label>
            <div className="form-actions">
              <button className="btn ghost" type="button" disabled={busy === 'status'} onClick={() => setStatusRow(null)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy === 'status'}>{busy === 'status' ? 'Saving…' : 'Update Status'}</button>
            </div>
          </form>
        </Modal>
      )}

      {history && (
        <Modal title={`Activity · ${history.row.orderNo || history.row.projectId}`} onClose={() => setHistory(null)} wide>
          {history.error && <p className="form-error">{history.error}</p>}
          {!history.error && !history.items && <p>Loading…</p>}
          {history.items && history.items.length === 0 && <p className="design-note">No design activity has been recorded for this order yet.</p>}
          {history.items && history.items.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Activity</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Previous Target</th>
                    <th>New Target</th>
                    <th>Previous Responsible</th>
                    <th>New Responsible</th>
                    <th>Remarks</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {history.items.map((item) => (
                    <tr key={item.id}>
                      <td>{fmtDateTime(item.createdAt)}</td>
                      <td>{item.activityLabel}</td>
                      <td>{item.previousLabel}</td>
                      <td>{item.newLabel}</td>
                      <td>{fmtDate(item.previousTargetDate)}</td>
                      <td>{fmtDate(item.newTargetDate)}</td>
                      <td>{item.previousResponsible || '—'}</td>
                      <td>{item.newResponsible || '—'}</td>
                      <td>{item.remarks || '—'}</td>
                      <td>{item.userName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {files && (
        <Modal title={`Files · ${files.row.orderNo || files.row.projectId}`} onClose={() => !uploading && setFiles(null)} wide>
          <div className="design-files">
            <div className="oc-filters">
              <select aria-label="Design activity" value={fileActivity} onChange={(event) => {
                const next = event.target.value;
                setFileActivity(next);
                setFileForm((current) => ({
                  ...current,
                  status: files.row.activities?.[next]?.code && files.row.activities[next].code !== 'PENDING'
                    ? files.row.activities[next].code
                    : 'IN_PROGRESS',
                }));
              }}
              >
                {activityOrder.map((key) => <option key={key} value={key}>{activityLabels[key] || key}</option>)}
              </select>
            </div>
            <p className="design-note">Each upload adds a new version. Earlier files stay on the order.</p>
            {files.error && <p className="form-error">{files.error}</p>}
            {!files.error && !files.items && <p>Loading…</p>}
            {files.items && fileRows.length === 0 && <p className="design-note">No files for this activity yet.</p>}
            {fileRows.length > 0 && (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>File</th>
                      <th>Status</th>
                      <th>Uploaded By</th>
                      <th>Uploaded</th>
                      <th>Remarks</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fileRows.map((file) => (
                      <tr key={file.id}>
                        <td>{file.versionLabel}</td>
                        <td>{file.fileName}</td>
                        <td><StatusBadge code={file.status} label={file.statusLabel} /></td>
                        <td>{file.uploadedBy}</td>
                        <td>{fmtDateTime(file.uploadedAt)}</td>
                        <td>{file.remarks || '—'}</td>
                        <td><button className="btn sm ghost" type="button" onClick={() => download(file)}>Download</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {canEdit && files.row.currentStageCode === 'DESIGN' && (
              <form className="form-grid" onSubmit={submitFile}>
                <label className="field">
                  File
                  <input type="file" accept={accept || undefined} required={!fileForm.file} onChange={(event) => setFileForm({ ...fileForm, file: event.target.files?.[0] || null })} />
                </label>
                <label className="field">
                  Status
                  <select value={fileForm.status} onChange={(event) => setFileForm({ ...fileForm, status: event.target.value })}>
                    {activityStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                  </select>
                </label>
                <label className="field full">
                  Remarks
                  <textarea rows={2} value={fileForm.remarks} onChange={(event) => setFileForm({ ...fileForm, remarks: event.target.value })} />
                </label>
                {uploading && <div className="upload-progress"><span style={{ width: `${progressValue}%` }} />{progressValue}%</div>}
                <div className="form-actions">
                  <button className="btn" type="submit" disabled={uploading || !fileForm.file}>{uploading ? 'Uploading…' : 'Upload version'}</button>
                </div>
              </form>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
