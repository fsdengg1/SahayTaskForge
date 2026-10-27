import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getToken, uploadFile } from '../../services/api';
import { fmtDateTime } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';

const DRAWING_STATUS = [
  ['IN_PROGRESS', 'In Progress'],
  ['SUBMITTED', 'Submitted'],
  ['APPROVED', 'Approved'],
  ['REVISION_REQUIRED', 'Revision Required'],
];
const BOM_STATUS = [
  ['UPLOADED', 'Uploaded'],
  ['UNDER_REVIEW', 'Under Review'],
  ['APPROVED', 'Approved'],
  ['REVISION_REQUIRED', 'Revision Required'],
];

const ACCEPT = {
  DRAWING: '.dwg,.dxf,.pdf,.png,.jpg,.jpeg,.tif,.tiff',
  LAYOUT: '.dwg,.dxf,.pdf,.png,.jpg,.jpeg,.tif,.tiff',
  BOM: '.xlsx,.xls,.csv,.pdf',
};

export default function DesignFilesPage({ kind }) {
  const isBom = kind === 'BOM';
  const isLayout = kind === 'LAYOUT';
  const filePath = isBom ? 'bom' : isLayout ? 'layout' : 'drawings';
  const fileTitle = isBom ? 'Final BOM' : isLayout ? 'Layout' : 'Detailed Drawings';
  const [params, setParams] = useSearchParams();
  const projectId = params.get('project') || '';
  const [board, setBoard] = useState(null);
  const [files, setFiles] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ drawingName: '', remarks: '', status: isBom ? 'UPLOADED' : 'IN_PROGRESS', file: null });

  const projects = board?.items || [];
  const project = useMemo(() => projects.find((item) => item.id === projectId) || null, [projects, projectId]);
  const statuses = isBom ? BOM_STATUS : DRAWING_STATUS;

  function loadBoard() {
    return api.get('/design').then(setBoard);
  }

  function loadFiles(id) {
    if (!id) {
      setFiles(null);
      return Promise.resolve();
    }
    return api.get(`/design/${id}/${filePath}`).then(setFiles);
  }

  useEffect(() => {
    setError('');
    loadBoard().catch((err) => setError(err.message || 'Unable to load projects.'));
  }, []);

  useEffect(() => {
    setError('');
    loadFiles(projectId).catch((err) => {
      setFiles(null);
      setError(err.message || 'Unable to load files.');
    });
  }, [projectId, kind]);

  function chooseProject(id) {
    const next = new URLSearchParams(params);
    if (id) next.set('project', id);
    else next.delete('project');
    setParams(next);
  }

  async function submit(event) {
    event.preventDefault();
    if (!project || !form.file) return;
    const body = new FormData();
    body.append('file', form.file);
    body.append('drawingName', form.drawingName || form.file.name);
    body.append('remarks', form.remarks);
    body.append('status', form.status);
    setUploading(true);
    setProgress(0);
    setNotice('');
    try {
      await uploadFile(`/design/${project.id}/${filePath}`, body, setProgress);
      setNotice('Upload complete.');
      setOpen(false);
      setForm({ drawingName: '', remarks: '', status: isBom ? 'UPLOADED' : 'IN_PROGRESS', file: null });
      await Promise.all([loadBoard(), loadFiles(project.id)]);
    } catch (err) {
      setNotice(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function download(file) {
    const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/design/files/${file.id}/download`, {
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

  async function remove(file) {
    setNotice('');
    try {
      await api.delete(`/design/files/${file.id}`);
      await Promise.all([loadBoard(), loadFiles(projectId)]);
    } catch (err) {
      setNotice(err.message || 'Unable to delete the file.');
    }
  }

  const canEdit = Boolean(board?.canEdit && project?.currentStageCode === 'DESIGN');
  const rows = files?.items || [];

  return (
    <div className="oc-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Design</p>
          <h2>{fileTitle}</h2>
          <p>Versions stay on this confirmed order. A new upload does not replace the previous file.</p>
        </div>
        {canEdit && (
          <button className="btn" type="button" onClick={() => { setNotice(''); setOpen(true); }}>
            {isBom ? '+ Upload BOM' : isLayout ? '+ Upload Layout' : '+ Upload Drawing'}
          </button>
        )}
      </div>
      {notice && <p className="form-error">{notice}</p>}
      {error && (
        <div className="oc-state">
          <strong>Unable to load projects.</strong>
          <button className="btn sm" type="button" onClick={() => loadBoard().catch((err) => setError(err.message))}>Retry</button>
        </div>
      )}
      {!error && (
        <div className="oc-filters">
          <label>
            Project
            <select value={projectId} onChange={(e) => chooseProject(e.target.value)}>
              <option value="">Select a project</option>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>{item.projectId} — {item.customer}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {!error && !projectId && (
        <div className="oc-state">
          <strong>Select a project.</strong>
          <p>Only orders that have entered OTR are listed.</p>
        </div>
      )}
      {project && (
        <div className="card design-meta">
          <span><strong>Project</strong> {project.projectId}</span>
          <span><strong>Name</strong> {project.name}</span>
          <span><strong>Customer</strong> {project.customer}</span>
          <span><strong>Stage</strong> {project.currentStage}</span>
        </div>
      )}
      {project && rows.length === 0 && (
        <div className="oc-state">
          <strong>{isBom ? 'No BOM files yet.' : 'No drawings yet.'}</strong>
          <p>Uploaded versions stay on this project and are never overwritten.</p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Project ID</th>
                <th>Project Name</th>
                <th>Customer</th>
                {!isBom && <th>Drawing Name</th>}
                <th>File Name</th>
                <th>File Type</th>
                <th>Version</th>
                <th>Uploaded By</th>
                <th>Uploaded Date</th>
                <th>Status</th>
                <th>Remarks</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((file) => (
                <tr key={file.id}>
                  <td>{project.projectId}</td>
                  <td>{project.name}</td>
                  <td>{project.customer}</td>
                  {!isBom && <td>{file.drawingName}</td>}
                  <td>{file.fileName}</td>
                  <td>{String(file.fileType || '').toUpperCase()}</td>
                  <td>{file.versionLabel}</td>
                  <td>{file.uploadedBy}</td>
                  <td>{fmtDateTime(file.uploadedAt)}</td>
                  <td><StatusBadge code={file.status} label={file.statusLabel} /></td>
                  <td>{file.remarks || '—'}</td>
                  <td className="oc-actions">
                    <button className="btn sm ghost" type="button" onClick={() => setDetail(file)}>Details</button>
                    <button className="btn sm ghost" type="button" onClick={() => download(file)}>Download</button>
                    {canEdit && (
                      <button className="btn sm ghost" type="button" onClick={() => remove(file)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <Modal title={isBom ? 'Upload BOM' : 'Upload Drawing'} onClose={() => !uploading && setOpen(false)}>
          <form className="form-grid" onSubmit={submit}>
            {!isBom && (
              <label>
                Drawing name
                <input value={form.drawingName} onChange={(e) => setForm({ ...form, drawingName: e.target.value })} required />
              </label>
            )}
            <label>
              File
              <input type="file" accept={ACCEPT[kind]} required onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })} />
            </label>
            <label>
              Status
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {statuses.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </label>
            <label>
              Remarks
              <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} rows={3} />
            </label>
            {uploading && <div className="upload-progress"><span style={{ width: `${progress}%` }} />{progress}%</div>}
            <div className="form-actions">
              <button className="btn ghost" type="button" disabled={uploading} onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" type="submit" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.versionLabel} onClose={() => setDetail(null)}>
          <dl className="detail-list">
            <div><dt>Project</dt><dd>{project?.projectId}</dd></div>
            <div><dt>Project name</dt><dd>{project?.name}</dd></div>
            <div><dt>Customer</dt><dd>{project?.customer}</dd></div>
            {!isBom && <div><dt>Drawing name</dt><dd>{detail.drawingName}</dd></div>}
            <div><dt>File name</dt><dd>{detail.fileName}</dd></div>
            <div><dt>File type</dt><dd>{String(detail.fileType || '').toUpperCase()}</dd></div>
            <div><dt>Version</dt><dd>{detail.versionLabel}</dd></div>
            <div><dt>Status</dt><dd>{detail.statusLabel}</dd></div>
            <div><dt>Uploaded by</dt><dd>{detail.uploadedBy}</dd></div>
            <div><dt>Uploaded date</dt><dd>{fmtDateTime(detail.uploadedAt)}</dd></div>
            <div><dt>Remarks</dt><dd>{detail.remarks || '—'}</dd></div>
          </dl>
        </Modal>
      )}
    </div>
  );
}
