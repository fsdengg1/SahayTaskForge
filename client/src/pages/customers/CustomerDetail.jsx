import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { has } = useAuth();
  const canEdit = has('customers.edit');
  const [c, setC] = useState(null);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    api.get(`/customers/${id}`).then(setC).catch(() => setC(null));
  }
  useEffect(load, [id]);

  if (!c) return <div className="loading">Loading…</div>;

  function startEdit() {
    setForm({
      companyName: c.companyName || '',
      industry: c.industry || '',
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
    });
    setError('');
    setEditing(true);
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await api.put(`/customers/${id}`, form);
      setC({ ...c, ...updated });
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Unable to save the customer.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api.delete(`/customers/${id}`);
      navigate('/customers');
    } catch (err) {
      setError(err.message || 'Unable to delete the customer.');
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{c.companyName}</h2>
          <p>{c.customerId}{c.industry ? ` · ${c.industry}` : ''}</p>
          {c.address && <p>{c.address}</p>}
        </div>
        {canEdit && (
          <div className="btn-row">
            <button className="btn ghost" type="button" onClick={startEdit}>Edit</button>
            <button className="btn danger" type="button" onClick={() => { setError(''); setRemoving(true); }}>Delete</button>
          </div>
        )}
      </div>
      {editing && (
        <Modal title="Edit customer" onClose={() => !busy && setEditing(false)}>
          <form className="form-grid" onSubmit={save}>
            {error && <p className="field-error full">{error}</p>}
            <label className="field full">Company Name<input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required /></label>
            <label className="field">Industry<input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></label>
            <label className="field">Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="field full">Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="field full">Address<textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
            <div className="form-actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy}>Update</button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal title="Delete customer" onClose={() => !busy && setRemoving(false)}>
          <p>Delete {c.companyName}? This customer will leave the list. Existing leads and projects stay linked to this company.</p>
          {error && <p className="field-error">{error}</p>}
          <div className="form-actions">
            <button className="btn ghost" type="button" disabled={busy} onClick={() => setRemoving(false)}>Cancel</button>
            <button className="btn danger" type="button" disabled={busy} onClick={remove}>Delete</button>
          </div>
        </Modal>
      )}
      <div className="grid-2">
        <div className="card">
          <h3>Contacts</h3>
          {c.contacts.map((x) => <p key={x.id}>{x.name} · {x.mobile} · {x.email}</p>)}
        </div>
        <div className="card">
          <h3>Sites</h3>
          {c.sites.map((x) => <p key={x.id}>{x.name} · {x.address}</p>)}
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Leads</h3>
          {c.leads.map((l) => <p key={l.id}><Link to={`/leads/${l.id}`}>{l.leadId}</Link> · {l.statusCode}</p>)}
        </div>
        <div className="card">
          <h3>Projects</h3>
          {c.projects.map((p) => <p key={p.id}><Link to={`/projects/${p.id}`}>{p.projectId}</Link> {p.name}</p>)}
        </div>
      </div>
    </div>
  );
}
