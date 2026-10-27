import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';

const emptyForm = { companyName: '', industry: '', phone: '', email: '', address: '' };

export default function CustomerList() {
  const { has } = useAuth();
  const canEdit = has('customers.edit');
  const [data, setData] = useState({ items: [] });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load() { api.get('/customers').then(setData).catch(() => {}); }
  useEffect(load, []);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setOpen(true);
  }

  function startEdit(row) {
    setEditing(row);
    setForm({
      companyName: row.companyName || '',
      industry: row.industry || '',
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
    });
    setError('');
    setOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing) await api.put(`/customers/${editing.id}`, form);
      else await api.post('/customers', form);
      setOpen(false);
      load();
    } catch (err) {
      setError(err.message || 'Unable to save the customer.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setError('');
    try {
      await api.delete(`/customers/${removing.id}`);
      setRemoving(null);
      load();
    } catch (err) {
      setError(err.message || 'Unable to delete the customer.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Sales & Pre-Sales</p><h2>Customers</h2><p>Companies, contacts, sites, leads and projects</p></div>
        {canEdit && <button className="btn copper" type="button" onClick={startCreate}>+ Customer</button>}
      </div>
      <DataTable
        rows={data.items}
        columns={[
          { key: 'customerId', label: 'Customer ID', render: (r) => <Link to={`/customers/${r.id}`}>{r.customerId}</Link> },
          { key: 'companyName', label: 'Company' },
          { key: 'industry', label: 'Industry' },
          { key: 'phone', label: 'Phone' },
          { key: 'address', label: 'Address', wrap: true },
          { key: 'leads', label: 'Leads', render: (r) => r._count?.leads ?? 0 },
          { key: 'projects', label: 'Projects', render: (r) => r._count?.projects ?? 0 },
          ...(canEdit ? [{
            key: 'action',
            label: 'Action',
            render: (r) => (
              <div className="oc-actions">
                <button className="btn sm ghost" type="button" onClick={() => startEdit(r)}>Edit</button>
                <button className="btn sm danger" type="button" onClick={() => { setError(''); setRemoving(r); }}>Delete</button>
              </div>
            ),
          }] : []),
        ]}
      />
      {open && (
        <Modal title={editing ? 'Edit customer' : 'New customer'} onClose={() => !busy && setOpen(false)}>
          <form className="form-grid" onSubmit={save}>
            {error && <p className="field-error full">{error}</p>}
            <label className="field full">Company Name<input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required /></label>
            <label className="field">Industry<input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></label>
            <label className="field">Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="field full">Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="field full">Address<textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
            <div className="form-actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy}>{editing ? 'Update' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal title="Delete customer" onClose={() => !busy && setRemoving(null)}>
          <p>Delete {removing.companyName}? This customer will leave the list. Existing leads and projects stay linked to this company.</p>
          {error && <p className="field-error">{error}</p>}
          <div className="form-actions">
            <button className="btn ghost" type="button" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button>
            <button className="btn danger" type="button" disabled={busy} onClick={remove}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
