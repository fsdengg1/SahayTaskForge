import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function SettingsPage() {
  const [lookups, setLookups] = useState([]);
  const [weights, setWeights] = useState([]);
  const [ops, setOps] = useState([]);
  const [audit, setAudit] = useState([]);
  const [type, setType] = useState('LEAD_STATUS');
  const [form, setForm] = useState({ type: 'LEAD_STATUS', code: '', label: '' });
  const [importResult, setImportResult] = useState(null);

  function load() {
    api.get(`/settings/lookups?type=${type}`).then(setLookups).catch(() => {});
    api.get('/settings/stage-weights').then(setWeights).catch(() => {});
    api.get('/settings/production-ops').then(setOps).catch(() => {});
    api.get('/audit').then(setAudit).catch(() => {});
  }
  useEffect(load, [type]);

  return (
    <div>
      <div className="page-head"><div><p className="eyebrow">Administration</p><h2>Settings</h2><p>Configurable lists, stage weights, production operations, Excel import</p></div></div>
      <div className="grid-2">
        <div className="card">
          <h3>Lookups</h3>
          <select value={type} onChange={(e) => { setType(e.target.value); setForm({ ...form, type: e.target.value }); }}>
            {['LEAD_SOURCE', 'LEAD_STATUS', 'STORAGE_METHOD', 'PROJECT_STAGE', 'PROJECT_STATUS', 'DOCUMENT_TYPE', 'DELAY_CATEGORY'].map((t) => <option key={t}>{t}</option>)}
          </select>
          {lookups.map((l) => <p key={l.id}>{l.code} — {l.label}</p>)}
          <div className="form-grid">
            <label className="field">Code<input onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
            <label className="field">Label<input onChange={(e) => setForm({ ...form, label: e.target.value })} /></label>
          </div>
          <button className="btn" type="button" onClick={() => api.post('/settings/lookups', form).then(load)}>Add / update</button>
        </div>
        <div className="card">
          <h3>Stage weights</h3>
          {weights.map((w, i) => (
            <div className="check-row" key={w.id}>
              <span>{w.label}</span>
              <input style={{ width: 80 }} value={w.weight} onChange={(e) => setWeights(weights.map((x, idx) => idx === i ? { ...x, weight: e.target.value } : x))} />
            </div>
          ))}
          <button className="btn" type="button" onClick={() => api.put('/settings/stage-weights', { items: weights }).then(load)}>Save weights</button>
          <h3 style={{ marginTop: 18 }}>Production operations</h3>
          {ops.map((o) => <p key={o.id}>{o.name}</p>)}
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Excel import</h3>
        <p>Maps existing enquiry/order sheets into customers, leads and projects. Original files are not changed.</p>
        <input type="file" accept=".xlsx,.xls" onChange={async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const fd = new FormData();
          fd.append('file', file);
          setImportResult(await api.post('/import/excel', fd));
        }} />
        {importResult && <pre>{JSON.stringify(importResult, null, 2)}</pre>}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Audit log</h3>
        {audit.map((a) => (
          <p key={a.id}>{a.timestamp} · {a.user?.fullName} · {a.action} · {a.entity}</p>
        ))}
      </div>
    </div>
  );
}
