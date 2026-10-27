import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api, getToken, uploadFile } from '../../services/api';
import { fmtDate, fmtDateTime } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';

const EMPTY_FILTERS = {
  q: '',
  orderNo: '',
  customer: '',
  location: '',
  product: '',
  activity: '',
  responsible: '',
  status: '',
  targetDate: '',
  from: '',
  to: '',
};

const ACTIVITY_RANK = {
  SHOP: 0,
  BOM: 1,
  MANUFACTURING_DRAWING: 2,
  INSTALLATION_DRAWING: 3,
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

function blank(value) {
  return value && value !== '—' ? value : '—';
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
    const menuHeight = 230;
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

function compareRows(left, right, sort) {
  const missing = (value) => value == null || value === '';
  const a = left[sort.key];
  const b = right[sort.key];
  if (missing(a) && missing(b)) return 0;
  if (missing(a)) return 1;
  if (missing(b)) return -1;
  let result = 0;
  if (sort.key === 'delayDays') result = Number(a) - Number(b);
  else if (sort.key === 'status') result = String(left.statusLabel).localeCompare(String(right.statusLabel));
  else result = new Date(a) - new Date(b);
  if (result) return sort.dir === 'asc' ? result : -result;
  const order = String(left.orderNo || left.projectCode || '').localeCompare(String(right.orderNo || right.projectCode || ''));
  if (order) return order;
  return (ACTIVITY_RANK[left.activity] ?? 9) - (ACTIVITY_RANK[right.activity] ?? 9);
}

export default function DesignActivityLog() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState({ key: 'orderDate', dir: 'desc' });
  const [view, setView] = useState(null);
  const [edit, setEdit] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [statusRow, setStatusRow] = useState(null);
  const [statusForm, setStatusForm] = useState({ status: '', pendingReason: '', remarks: '' });
  const [history, setHistory] = useState(null);
  const [files, setFiles] = useState(null);
  const [fileForm, setFileForm] = useState({ remarks: '', file: null });
  const [progressValue, setProgressValue] = useState(0);
  const [uploading, setUploading] = useState(false);
  const loaded = useRef(false);

  const load = useCallback((options = {}) => {
    if (!options.silent) setError('');
    return api.get('/design/activity-log')
      .then((payload) => {
        loaded.current = true;
        setData(payload);
        setError('');
      })
      .catch(() => {
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
  const assignees = data?.assignees || [];
  const canEdit = Boolean(data?.canEdit);

  const filtered = useMemo(() => {
    const rows = items.filter((row) => {
      if (filters.q) {
        const hay = [
          row.orderNo, row.customer, row.location, row.product,
          row.responsibleName, row.activityLabel, row.activity,
        ].join(' ').toLowerCase();
        if (!hay.includes(filters.q.trim().toLowerCase())) return false;
      }
      if (filters.orderNo && row.orderNo !== filters.orderNo) return false;
      if (filters.customer && row.customer !== filters.customer) return false;
      if (filters.location && row.location !== filters.location) return false;
      if (filters.product && row.product !== filters.product) return false;
      if (filters.activity && row.activity !== filters.activity) return false;
      if (filters.responsible && row.responsibleName !== filters.responsible) return false;
      if (filters.status && row.status !== filters.status) return false;
      if (filters.targetDate && dayKey(row.targetDate) !== filters.targetDate) return false;
      const orderDay = dayKey(row.orderDate);
      if (filters.from && (!orderDay || orderDay < filters.from)) return false;
      if (filters.to && (!orderDay || orderDay > filters.to)) return false;
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
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
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

  function saved(result, row) {
    if (result?.advanced) {
      setNotice({
        text: `${row.orderNo || row.projectCode} design is complete and is now eligible for Procurement.`,
        error: false,
      });
    } else {
      setNotice({ text: `${row.activityLabel} updated.`, error: false });
    }
  }

  function openEdit(row) {
    setEdit(row);
    setEditForm({
      responsibleId: row.responsibleId || '',
      assignedDate: row.assignedDateInput || '',
      targetDate: row.targetDateInput || '',
      status: row.status || 'PENDING',
      completedDate: row.completedDateInput || '',
      pendingReason: row.pendingReason || '',
      remarks: row.remarks || '',
      file: null,
    });
  }

  function activityBody(form, row) {
    const body = {
      responsibleId: form.responsibleId || null,
      status: form.status,
      pendingReason: form.pendingReason,
      remarks: form.remarks,
    };
    if (form.assignedDate) body.assignedDate = form.assignedDate;
    else if (row.assignedDateInput) body.assignedDate = null;
    if (form.targetDate) body.targetDate = form.targetDate;
    else if (row.targetDateInput) body.targetDate = null;
    if (form.completedDate) body.completedDate = form.completedDate;
    else if (row.completedDateInput) body.completedDate = null;
    return body;
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!edit || !editForm) return;
    setBusy('edit');
    setNotice(null);
    try {
      const result = await api.patch(
        `/design/${edit.projectId}/activities/${edit.activity}`,
        activityBody(editForm, edit),
      );
      if (editForm.file && edit.currentStageCode === 'DESIGN') {
        const body = new FormData();
        body.append('file', editForm.file);
        body.append('drawingName', editForm.file.name);
        body.append('remarks', editForm.remarks || '');
        body.append('status', editForm.status || 'IN_PROGRESS');
        await uploadFile(`/design/${edit.projectId}/activities/${edit.activity}/files`, body, setProgressValue);
      }
      saved(result, edit);
      setEdit(null);
      setEditForm(null);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to update this activity.', error: true });
    } finally {
      setBusy('');
      setProgressValue(0);
    }
  }

  async function saveStatus(event) {
    event.preventDefault();
    if (!statusRow) return;
    setBusy('status');
    setNotice(null);
    try {
      const result = await api.patch(`/design/${statusRow.projectId}/activities/${statusRow.activity}`, {
        status: statusForm.status,
        pendingReason: statusForm.pendingReason,
        remarks: statusForm.remarks,
      });
      saved(result, statusRow);
      setStatusRow(null);
      await load({ silent: true });
    } catch (err) {
      setNotice({ text: err.message || 'Unable to update this activity.', error: true });
    } finally {
      setBusy('');
    }
  }

  async function openHistory(row) {
    setHistory({ row, items: null, error: '' });
    try {
      const payload = await api.get(`/design/${row.projectId}/history?activity=${encodeURIComponent(row.activity)}`);
      setHistory({ row, items: payload.items || [], error: '' });
    } catch (err) {
      setHistory({ row, items: [], error: err.message || 'Unable to load activity history.' });
    }
  }

  async function openFiles(row) {
    setFileForm({ remarks: row.remarks || '', file: null });
    setFiles({ row, items: null, error: '' });
    try {
      const payload = await api.get(`/design/${row.projectId}/activity-files`);
      setFiles({ row, items: (payload.items || []).filter((file) => file.kind === row.activity), error: '' });
    } catch (err) {
      setFiles({ row, items: [], error: err.message || 'Unable to load files.' });
    }
  }

  async function submitFile(event) {
    event.preventDefault();
    if (!files?.row || !fileForm.file) return;
    const body = new FormData();
    body.append('file', fileForm.file);
    body.append('drawingName', fileForm.file.name);
    body.append('remarks', fileForm.remarks || '');
    body.append('status', files.row.status || 'IN_PROGRESS');
    setUploading(true);
    setProgressValue(0);
    try {
      await uploadFile(`/design/${files.row.projectId}/activities/${files.row.activity}/files`, body, setProgressValue);
      setNotice({ text: 'File uploaded. Previous versions are kept.', error: false });
      setFileForm((current) => ({ ...current, file: null }));
      const payload = await api.get(`/design/${files.row.projectId}/activity-files`);
      setFiles({
        row: files.row,
        items: (payload.items || []).filter((file) => file.kind === files.row.activity),
        error: '',
      });
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

  const accept = files?.row?.activity === 'BOM' ? data?.fileAccept?.BOM : data?.fileAccept?.DRAWING;

  return (
    <div className="oc-page design-board activity-log">
      <div className="page-head">
        <div>
          <p className="eyebrow">OTR</p>
          <h2>Design Activity Log</h2>
          <p>One row for each SHOP, BOM, manufacturing drawing, and installation drawing activity recorded on an OTR order.</p>
        </div>
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
        <select aria-label="Activity" value={filters.activity} onChange={(event) => setFilter('activity', event.target.value)}>
          <option value="">Activity</option>
          {activityOrder.map((key) => <option key={key} value={key}>{activityLabels[key] || key}</option>)}
        </select>
        <select aria-label="Responsible Person" value={filters.responsible} onChange={(event) => setFilter('responsible', event.target.value)}>
          <option value="">Responsible Person</option>
          {unique(items, 'responsibleName').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Status" value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
          <option value="">Status</option>
          {activityStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <input type="date" aria-label="Target Date" title="Target Date" value={filters.targetDate} onChange={(event) => setFilter('targetDate', event.target.value)} />
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
          <strong>{filtersOn ? 'No design activities match these filters.' : 'No Design activities available.'}</strong>
          {filtersOn && <button className="btn ghost sm" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>Reset Filters</button>}
        </div>
      )}

      {!error && filtered.length > 0 && (
        <div className="table-wrap design-scroll">
          <table className="data activity-sheet">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Order No.</th>
                {sortHeader('orderDate', 'Order Date')}
                <th>Customer</th>
                <th>Location</th>
                <th>Product</th>
                <th className="col-activity">Activity</th>
                <th>Responsible Person</th>
                {sortHeader('assignedDate', 'Assigned Date')}
                {sortHeader('targetDate', 'Target Date')}
                {sortHeader('completedDate', 'Completed Date')}
                {sortHeader('status', 'Status')}
                {sortHeader('delayDays', 'Delay Days')}
                <th>Pending Reason</th>
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
                  <td><Clip value={row.product} width={140} /></td>
                  <td className="col-activity">{row.activityLabel}</td>
                  <td><Clip value={row.responsibleName || '—'} width={150} /></td>
                  <td>{fmtDate(row.assignedDate)}</td>
                  <td>{fmtDate(row.targetDate)}</td>
                  <td>{fmtDate(row.completedDate)}</td>
                  <td><StatusBadge code={row.status} label={row.statusLabel} /></td>
                  <td><DelayDays days={row.delayDays} /></td>
                  <td><Clip value={row.pendingReason || '—'} width={160} /></td>
                  <td><Clip value={row.remarks || '—'} width={180} /></td>
                  <td className="is-actions">
                    <ActionMenu>
                      {(close) => (
                        <>
                          <button type="button" role="menuitem" onClick={() => { close(); setView(row); }}>View</button>
                          {canEdit && <button type="button" role="menuitem" onClick={() => { close(); openEdit(row); }}>Edit</button>}
                          {canEdit && (
                            <button type="button" role="menuitem" onClick={() => {
                              close();
                              setStatusRow(row);
                              setStatusForm({
                                status: row.status,
                                pendingReason: row.pendingReason || '',
                                remarks: row.remarks || '',
                              });
                            }}
                            >
                              Update Status
                            </button>
                          )}
                          <button type="button" role="menuitem" onClick={() => { close(); openHistory(row); }}>Activity History</button>
                          <button type="button" role="menuitem" onClick={() => { close(); openFiles(row); }}>View Files</button>
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

      {view && (
        <Modal title={`${view.activityLabel} · ${view.orderNo || view.projectCode}`} onClose={() => setView(null)} wide>
          <dl className="design-detail">
            <div><dt>Order No.</dt><dd>{blank(view.orderNo)}</dd></div>
            <div><dt>Order Date</dt><dd>{fmtDate(view.orderDate)}</dd></div>
            <div><dt>Customer</dt><dd>{blank(view.customer)}</dd></div>
            <div><dt>Location</dt><dd>{blank(view.location)}</dd></div>
            <div><dt>Product</dt><dd>{blank(view.product)}</dd></div>
            <div><dt>Activity</dt><dd>{view.activityLabel}</dd></div>
            <div><dt>Responsible Person</dt><dd>{blank(view.responsibleName)}</dd></div>
            <div><dt>Assigned Date</dt><dd>{fmtDate(view.assignedDate)}</dd></div>
            <div><dt>Target Date</dt><dd>{fmtDate(view.targetDate)}</dd></div>
            <div><dt>Completed Date</dt><dd>{fmtDate(view.completedDate)}</dd></div>
            <div><dt>Status</dt><dd>{view.statusLabel}</dd></div>
            <div><dt>Delay Days</dt><dd>{view.delayDays == null ? '—' : view.delayDays}</dd></div>
            <div><dt>Pending Reason</dt><dd>{blank(view.pendingReason)}</dd></div>
            <div><dt>Remarks</dt><dd>{blank(view.remarks)}</dd></div>
          </dl>
          <div className="form-actions">
            <Link className="btn ghost sm" to={`/projects/${view.projectId}`}>Open project</Link>
            <button className="btn sm" type="button" onClick={() => { setView(null); openFiles(view); }}>View Files</button>
          </div>
        </Modal>
      )}

      {edit && editForm && (
        <Modal title={`Edit ${edit.activityLabel}`} onClose={() => !busy && setEdit(null)} wide>
          <form className="form-grid" onSubmit={saveEdit}>
            <label className="field">
              Responsible Person
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
              Assigned Date
              <input type="date" value={editForm.assignedDate} onChange={(event) => setEditForm({ ...editForm, assignedDate: event.target.value })} />
            </label>
            <label className="field">
              Target Date
              <input type="date" value={editForm.targetDate} onChange={(event) => setEditForm({ ...editForm, targetDate: event.target.value })} />
            </label>
            <label className="field">
              Status
              <select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                {activityStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            <label className="field">
              Completed Date
              <input type="date" value={editForm.completedDate} onChange={(event) => setEditForm({ ...editForm, completedDate: event.target.value })} />
            </label>
            <label className="field full">
              Pending Reason
              <input value={editForm.pendingReason} onChange={(event) => setEditForm({ ...editForm, pendingReason: event.target.value })} />
            </label>
            <label className="field full">
              Remarks
              <textarea rows={3} value={editForm.remarks} onChange={(event) => setEditForm({ ...editForm, remarks: event.target.value })} />
            </label>
            {edit.currentStageCode === 'DESIGN' && (
              <label className="field full">
                Design file
                <input type="file" accept={edit.activity === 'BOM' ? data?.fileAccept?.BOM : data?.fileAccept?.DRAWING} onChange={(event) => setEditForm({ ...editForm, file: event.target.files?.[0] || null })} />
              </label>
            )}
            <div className="form-actions">
              <button className="btn ghost" type="button" disabled={busy === 'edit'} onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy === 'edit'}>{busy === 'edit' ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {statusRow && (
        <Modal title={`Status · ${statusRow.activityLabel}`} onClose={() => !busy && setStatusRow(null)}>
          <form className="form-grid" onSubmit={saveStatus}>
            <label className="field full">
              Status
              <select value={statusForm.status} onChange={(event) => setStatusForm({ ...statusForm, status: event.target.value })}>
                {activityStatuses.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            <label className="field full">
              Pending Reason
              <input value={statusForm.pendingReason} onChange={(event) => setStatusForm({ ...statusForm, pendingReason: event.target.value })} />
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
        <Modal title={`History · ${history.row.activityLabel}`} onClose={() => setHistory(null)} wide>
          {history.error && <p className="form-error">{history.error}</p>}
          {!history.error && !history.items && <p>Loading…</p>}
          {history.items && history.items.length === 0 && <p className="design-note">No history has been recorded for this activity yet.</p>}
          {history.items && history.items.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>Previous Status</th>
                    <th>New Status</th>
                    <th>Changed By</th>
                    <th>Changed Date/Time</th>
                    <th>Previous Target Date</th>
                    <th>New Target Date</th>
                    <th>Previous Responsible Person</th>
                    <th>New Responsible Person</th>
                    <th>Pending Reason</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {history.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.activityLabel}</td>
                      <td>{item.previousLabel}</td>
                      <td>{item.newLabel}</td>
                      <td>{item.userName}</td>
                      <td>{fmtDateTime(item.createdAt)}</td>
                      <td>{fmtDate(item.previousTargetDate)}</td>
                      <td>{fmtDate(item.newTargetDate)}</td>
                      <td>{blank(item.previousResponsible)}</td>
                      <td>{blank(item.newResponsible)}</td>
                      <td>{blank(item.newPendingReason)}</td>
                      <td>{blank(item.remarks)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {files && (
        <Modal title={`Files · ${files.row.activityLabel}`} onClose={() => !uploading && setFiles(null)} wide>
          <div className="design-files">
            <p className="design-note">Each upload adds a new version. Earlier files stay on the activity.</p>
            {files.error && <p className="form-error">{files.error}</p>}
            {!files.error && !files.items && <p>Loading…</p>}
            {files.items && files.items.length === 0 && <p className="design-note">No files for this activity yet.</p>}
            {files.items && files.items.length > 0 && (
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
                    {files.items.map((file) => (
                      <tr key={file.id}>
                        <td>{file.versionLabel}</td>
                        <td>{file.fileName}</td>
                        <td><StatusBadge code={file.status} label={file.statusLabel || file.status} /></td>
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
                <label className="field full">
                  New version
                  <input type="file" accept={accept} onChange={(event) => setFileForm({ ...fileForm, file: event.target.files?.[0] || null })} />
                </label>
                <label className="field full">
                  Remarks
                  <input value={fileForm.remarks} onChange={(event) => setFileForm({ ...fileForm, remarks: event.target.value })} />
                </label>
                {uploading && <div className="upload-progress" aria-hidden="true"><span style={{ width: `${progressValue}%` }} /></div>}
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
