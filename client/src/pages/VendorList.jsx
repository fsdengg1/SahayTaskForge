import { useEffect, useState } from 'react';
import { api } from '../services/api';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';

export default function VendorList() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  function load() { api.get('/vendors').then(setRows).catch(() => {}); }
  useEffect(load, []);
  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Procurement</p><h2>Vendors</h2><p>Suppliers linked to RFQs and purchase orders</p></div>
        <button className="btn copper" type="button" onClick={() => setOpen(true)}>+ Vendor</button>
      </div>
      <DataTable
        rows={rows}
        columns={[
          { key: 'vendorId', label: 'Vendor ID' },
          { key: 'companyName', label: 'Company' },
          { key: 'contactPerson', label: 'Contact' },
          { key: 'phone', label: 'Phone' },
          { key: 'categories', label: 'Categories' },
          { key: 'active', label: 'Status', render: (r) => <StatusBadge code={r.active ? 'ON_TRACK' : 'ON_HOLD'} label={r.active ? 'Active' : 'Inactive'} /> },
        ]}
      />
      {open && (
        <Modal title="New vendor" onClose={() => setOpen(false)}>
          <form className="form-grid" onSubmit={async (e) => { e.preventDefault(); await api.post('/vendors', form); setOpen(false); load(); }}>
            <label className="field full">Company Name<input onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></label>
            <label className="field">Contact<input onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></label>
            <label className="field">Phone<input onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="field">Email<input onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="field full">Categories<input onChange={(e) => setForm({ ...form, categories: e.target.value })} /></label>
            <button className="btn" type="submit">Save</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
