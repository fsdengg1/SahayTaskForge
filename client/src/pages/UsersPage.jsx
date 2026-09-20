import { useEffect, useState } from 'react';
import { api } from '../services/api';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';

export default function UsersPage() {
  const [users, setUsers] = useState({ items: [] });
  const [roles, setRoles] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ roleIds: [] });

  function load() {
    api.get('/users?active=all').then(setUsers).catch(() => {});
    api.get('/roles').then(setRoles).catch(() => {});
  }
  useEffect(load, []);

  return (
    <div>
      <div className="page-head">
        <div><p className="eyebrow">Administration</p><h2>Users & Roles</h2><p>Admin can create additional users and roles</p></div>
        <button className="btn copper" type="button" onClick={() => setOpen(true)}>+ User</button>
      </div>
      <DataTable
        rows={users.items}
        columns={[
          { key: 'fullName', label: 'Name' },
          { key: 'username', label: 'Username' },
          { key: 'email', label: 'Email' },
          { key: 'roles', label: 'Roles', render: (r) => r.roles?.map((x) => x.name).join(', ') },
          { key: 'dept', label: 'Department', render: (r) => r.department?.name || '—' },
        ]}
      />
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Roles</h3>
        {roles.map((r) => <p key={r.id}><strong>{r.name}</strong> · {r._count?.users || 0} users · {r.permissions?.length || 0} permissions</p>)}
      </div>
      {open && (
        <Modal title="Create user" onClose={() => setOpen(false)}>
          <form className="form-grid" onSubmit={async (e) => { e.preventDefault(); await api.post('/users', form); setOpen(false); load(); }}>
            <label className="field">Full name<input onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
            <label className="field">Username<input onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
            <label className="field">Email<input onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="field">Password<input type="password" onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            <label className="field full">Role
              <select onChange={(e) => setForm({ ...form, roleIds: [e.target.value] })}>
                <option value="">Select</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <button className="btn" type="submit">Save</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
