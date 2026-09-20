import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';

export default function CustomerList() {
  const [data, setData] = useState({ items: [] });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  function load() { api.get('/customers').then(setData).catch(() => {}); }
  useEffect(load, []);
  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Sales & Pre-Sales</p><h2>Customers</h2><p>Companies, contacts, sites, leads and projects</p></div>
        <button className="btn copper" type="button" onClick={() => setOpen(true)}>+ Customer</button>
      </div>
      <DataTable
        rows={data.items}
        columns={[
          { key: 'customerId', label: 'Customer ID', render: (r) => <Link to={`/customers/${r.id}`}>{r.customerId}</Link> },
          { key: 'companyName', label: 'Company' },
          { key: 'industry', label: 'Industry' },
          { key: 'phone', label: 'Phone' },
          { key: 'leads', label: 'Leads', render: (r) => r._count?.leads ?? 0 },
          { key: 'projects', label: 'Projects', render: (r) => r._count?.projects ?? 0 },
        ]}
      />
      {open && (
        <Modal title="New customer" onClose={() => setOpen(false)}>
          <form className="form-grid" onSubmit={async (e) => { e.preventDefault(); await api.post('/customers', form); setOpen(false); load(); }}>
            <label className="field full">Company Name<input onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></label>
            <label className="field">Industry<input onChange={(e) => setForm({ ...form, industry: e.target.value })} /></label>
            <label className="field">Phone<input onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="field full">Email<input onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="field full">Address<textarea onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
            <button className="btn" type="submit">Save</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
