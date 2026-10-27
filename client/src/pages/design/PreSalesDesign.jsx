import { useEffect, useMemo, useState } from 'react';
import { api, getToken, uploadFile } from '../../services/api';
import { fmtDate, fmtDateTime } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';

export default function PreSalesDesign() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState('');
  const [upload, setUpload] = useState(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [remarks, setRemarks] = useState('');

  function load() {
    setError('');
    return api.get('/lifecycle/presales')
      .then((next) => {
        setData(next);
        setSelected((current) => current || next.items?.[0]?.id || '');
      })
      .catch((err) => setError(err.message || 'Unable to load pre-sales design.'));
  }

  useEffect(() => { load(); }, []);

  const lead = useMemo(
    () => (data?.items || []).find((item) => item.id === selected) || null,
    [data, selected],
  );
  const withDesign = ['NEW', 'DESIGN', 'DESIGN_REVISION'].includes(lead?.status);
  const drawings = (lead?.files || []).filter((file) => file.kind === 'PRE_DRAWING');
  const boms = (lead?.files || []).filter((file) => file.kind === 'PRE_BOM');

  async function run(path, body) {
    setBusy(true);
    setNotice('');
    try {
      await api.post(path, body || {});
      setRemarks('');
      await load();
      setNotice('Saved.');
    } catch (err) {
      setNotice(err.message || 'Unable to update the lead.');
    } finally {
      setBusy(false);
    }
  }

  async function sendFile(event) {
    event.preventDefault();
    if (!upload?.file || !lead) return;
    const body = new FormData();
    body.append('file', upload.file);
    body.append('drawingName', upload.name || upload.file.name);
    body.append('remarks', upload.remarks || '');
    setBusy(true);
    setProgress(0);
    try {
      const kind = upload.kind === 'PRE_BOM' ? 'bom' : 'drawing';
      await uploadFile(`/lifecycle/presales/${lead.id}/${kind}`, body, setProgress);
      setUpload(null);
      setNotice('Upload complete.');
      await load();
    } catch (err) {
      setNotice(err.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function download(file) {
    const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/lifecycle/presales/files/${file.id}/download`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      setNotice('Unable to download the file.');
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

  return (
    <div className="oc-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Design</p>
          <h2>Pre-Sales Design</h2>
          <p>Basic drawing and initial BOM for the lead. This package goes to Sales, then to the customer.</p>
        </div>
      </div>
      {notice && <p className="form-error">{notice}</p>}
      {error && (
        <div className="oc-state">
          <strong>Unable to load leads.</strong>
          <button className="btn sm" type="button" onClick={load}>Retry</button>
        </div>
      )}
      {!error && data && (
        <div className="oc-filters">
          <label>
            Lead
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {(data.items || []).map((item) => (
                <option key={item.id} value={item.id}>{item.leadId} — {item.customer}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {lead && (
        <>
          <div className="card design-meta">
            <span><strong>Lead</strong> {lead.leadId}</span>
            <span><strong>Customer</strong> {lead.customer}</span>
            <span><strong>Location</strong> {lead.location}</span>
            <span><strong>Product</strong> {lead.productGroup}</span>
            <span><strong>Sales</strong> {lead.salesPerson}</span>
            <span><strong>Output</strong> {lead.outputRequired}</span>
            <span><strong>Deadline</strong> {fmtDate(lead.deadline)}</span>
            <span><strong>Status</strong> <StatusBadge code={lead.status} label={lead.statusLabel} /></span>
          </div>
          <div className="btn-row" style={{ marginBottom: 14 }}>
            {data.canDesign && withDesign && <button className="btn" type="button" onClick={() => setUpload({ kind: 'PRE_DRAWING', file: null, name: '', remarks: '' })}>+ Upload Drawing</button>}
            {data.canDesign && withDesign && <button className="btn" type="button" onClick={() => setUpload({ kind: 'PRE_BOM', file: null, name: '', remarks: '' })}>+ Upload BOM</button>}
            {data.canDesign && withDesign && <button className="btn copper" type="button" disabled={busy} onClick={() => run(`/lifecycle/presales/${lead.id}/submit`)}>Submit to Sales</button>}
            {data.canSales && lead.status === 'DESIGN_SUBMITTED' && <button className="btn copper" type="button" disabled={busy} onClick={() => run(`/lifecycle/presales/${lead.id}/send`)}>Send to Customer</button>}
            {data.canSales && lead.status === 'CUSTOMER_REVIEW' && <button className="btn" type="button" disabled={busy} onClick={() => run(`/lifecycle/presales/${lead.id}/approve`, { remarks })}>Customer Approved</button>}
            {data.canSales && lead.status === 'CUSTOMER_REVIEW' && <button className="btn ghost" type="button" disabled={busy} onClick={() => run(`/lifecycle/presales/${lead.id}/negotiate`, { remarks })}>Negotiation / Revision</button>}
            {data.canSales && (lead.status === 'NEGOTIATION' || lead.status === 'CUSTOMER_REVIEW') && <button className="btn ghost" type="button" disabled={busy} onClick={() => run(`/lifecycle/presales/${lead.id}/revision`, { remarks })}>Send back to Design</button>}
          </div>
          {data.canSales && (lead.status === 'CUSTOMER_REVIEW' || lead.status === 'NEGOTIATION') && (
            <label className="field" style={{ marginBottom: 14 }}>
              Remarks
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
            </label>
          )}
          <FileTable title="Basic Drawing" rows={drawings} onDownload={download} />
          <FileTable title="Initial BOM" rows={boms} onDownload={download} />
        </>
      )}
      {upload && (
        <Modal title={upload.kind === 'PRE_BOM' ? 'Upload BOM' : 'Upload Drawing'} onClose={() => !busy && setUpload(null)}>
          <form className="form-grid" onSubmit={sendFile}>
            {upload.kind !== 'PRE_BOM' && (
              <label className="field full">Drawing name<input value={upload.name} onChange={(e) => setUpload({ ...upload, name: e.target.value })} required /></label>
            )}
            <label className="field full">File<input type="file" required accept={upload.kind === 'PRE_BOM' ? '.xlsx,.xls,.csv,.pdf' : '.dwg,.dxf,.pdf,.png,.jpg,.jpeg'} onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] || null })} /></label>
            <label className="field full">Remarks<textarea value={upload.remarks} onChange={(e) => setUpload({ ...upload, remarks: e.target.value })} rows={2} /></label>
            {busy && <div className="upload-progress"><span style={{ width: `${progress}%` }} />{progress}%</div>}
            <div className="form-actions">
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setUpload(null)}>Cancel</button>
              <button className="btn" type="submit" disabled={busy}>Upload</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function FileTable({ title, rows, onDownload }) {
  return (
    <section className="card" style={{ marginBottom: 14 }}>
      <h3>{title}</h3>
      {rows.length === 0 ? <p>No versions yet.</p> : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Version</th><th>File</th><th>Uploaded by</th><th>Date</th><th>Remarks</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((file) => (
                <tr key={file.id}>
                  <td>{file.versionLabel}</td>
                  <td>{file.fileName}</td>
                  <td>{file.uploadedBy}</td>
                  <td>{fmtDateTime(file.uploadedAt)}</td>
                  <td>{file.remarks || '—'}</td>
                  <td><button className="btn sm ghost" type="button" onClick={() => onDownload(file)}>Download</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
