import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useLookups } from '../hooks/useLookups';
import { useAuth } from '../context/AuthContext';
import { fmtDate, labelOf } from '../utils/format';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';

export default function DocumentsPage({ title = 'Documents', categories, subtitle }) {
  const lookups = useLookups();
  const { has } = useAuth();
  const [data, setData] = useState({ items: [] });
  const [category, setCategory] = useState('');
  const [revision, setRevision] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [projectId, setProjectId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState([]);
  const locked = Array.isArray(categories) && categories.length > 0;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ categoryCode: 'OTHER' });
  const [leads, setLeads] = useState([]);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    const q = new URLSearchParams();
    if (locked) q.set('categories', categories.join(','));
    else if (category) q.set('category', category);
    if (revision) q.set('revision', revision);
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (projectId) q.set('projectId', projectId);
    if (customerId) q.set('customerId', customerId);
    api.get(`/documents?${q.toString()}`).then(setData).catch(() => {});
  }

  useEffect(load, [category, revision, from, to, locked, projectId, customerId]);

  useEffect(() => {
    api.get('/leads?pageSize=100').then((d) => setLeads(d.items || [])).catch(() => {});
    api.get('/projects?pageSize=100').then((d) => setProjects(d.items || [])).catch(() => {});
    api.get('/customers?pageSize=100').then((d) => setCustomers(d.items || [])).catch(() => {});
  }, []);

  async function upload(e) {
    e.preventDefault();
    if (!form.file) {
      setError('Choose a file to upload.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', form.file);
      fd.append('categoryCode', form.categoryCode || 'OTHER');
      if (form.leadId) fd.append('leadId', form.leadId);
      if (form.projectId) fd.append('projectId', form.projectId);
      if (form.revision) fd.append('revision', form.revision);
      await api.post('/documents', fd);
      setOpen(false);
      setForm({ categoryCode: 'OTHER' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const empty = category
    ? `No ${labelOf(lookups, 'DOCUMENT_TYPE', category)} files yet. Upload one or clear the filter.`
    : 'No documents yet. Upload a file, or add one from a Lead or Project.';

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Information</p>
          <h2>{title}</h2>
          <p>{subtitle || 'Central library linked to the same lead or project record.'}</p>
        </div>
        {has('documents.upload') && (
          <button className="btn copper" type="button" onClick={() => { setError(''); setOpen(true); }}>
            Upload document
          </button>
        )}
      </div>
      <div className="filters">
        {!locked && (
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All document types</option>
            {(lookups.DOCUMENT_TYPE || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        )}
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.projectId}</option>)}
        </select>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">All customers</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
        </select>
        <input placeholder="Revision" value={revision} onChange={(e) => setRevision(e.target.value)} />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <DataTable
        rows={data.items}
        empty={empty}
        columns={[
          { key: 'documentId', label: 'Document ID' },
          { key: 'name', label: 'File', render: (r) => r.originalName },
          { key: 'cat', label: 'Type', render: (r) => labelOf(lookups, 'DOCUMENT_TYPE', r.categoryCode) },
          { key: 'link', label: 'Linked to', render: (r) => (
            r.project
              ? <Link to={`/projects/${r.project.id}`}>{r.project.projectId}</Link>
              : r.lead
                ? <Link to={`/leads/${r.lead.id}`}>{r.lead.leadId}</Link>
                : '—'
          ) },
          { key: 'rev', label: 'Revision', render: (r) => r.revision },
          { key: 'who', label: 'Uploaded by', render: (r) => r.uploadedBy?.fullName || '—' },
          { key: 'when', label: 'Date', render: (r) => fmtDate(r.uploadedAt) },
          { key: 'appr', label: 'Approval', render: (r) => <StatusBadge code={r.approvalStatus} /> },
          { key: 'act', label: '', render: (r) => <button className="btn ghost" type="button" onClick={() => api.post(`/documents/${r.id}/archive`).then(load)}>Archive</button> },
        ]}
      />
      {open && (
        <Modal title="Upload document" onClose={() => setOpen(false)}>
          <form className="form-grid" onSubmit={upload}>
            {error && <div className="notice err full">{error}</div>}
            <label className="field">
              Category
              <select value={form.categoryCode} onChange={(e) => setForm({ ...form, categoryCode: e.target.value })}>
                {(lookups.DOCUMENT_TYPE || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </label>
            <label className="field">
              Revision
              <input value={form.revision || 'R0'} onChange={(e) => setForm({ ...form, revision: e.target.value })} />
            </label>
            <label className="field">
              Lead
              <select value={form.leadId || ''} onChange={(e) => setForm({ ...form, leadId: e.target.value })}>
                <option value="">None</option>
                {leads.map((l) => <option key={l.id} value={l.id}>{l.leadId} — {l.customer?.companyName}</option>)}
              </select>
            </label>
            <label className="field">
              Project
              <select value={form.projectId || ''} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                <option value="">None</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.projectId} — {p.name}</option>)}
              </select>
            </label>
            <label className="field full">
              File
              <input type="file" onChange={(e) => setForm({ ...form, file: e.target.files[0] })} />
            </label>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
