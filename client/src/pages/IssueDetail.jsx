import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getToken } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLookups } from '../hooks/useLookups';
import { fmtDate, fmtDateTime, labelOf } from '../utils/format';
import StatusBadge from '../components/StatusBadge';

export default function IssueDetail() {
  const { id } = useParams();
  const { has } = useAuth();
  const lookups = useLookups();
  const [issue, setIssue] = useState(null);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [file, setFile] = useState(null);
  const [category, setCategory] = useState('OTHER');

  function load() {
    api.get(`/issues/${id}`).then((row) => {
      setIssue(row);
      setNotes(row.resolutionNotes || '');
      setStatus(row.statusCode);
    }).catch((e) => setError(e.message));
  }

  useEffect(load, [id]);

  async function previewDocument(doc) {
    setError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/documents/${doc.id}/file`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        setError('Unable to open the document.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setError('Unable to open the document.');
    }
  }

  async function saveStatus(e) {
    e.preventDefault();
    await api.patch(`/issues/${id}`, { statusCode: status, resolutionNotes: notes });
    load();
  }

  async function addComment(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    await api.post(`/issues/${id}/comments`, { body: comment });
    setComment('');
    load();
  }

  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('categoryCode', category);
    await api.post(`/issues/${id}/documents`, fd);
    setFile(null);
    load();
  }

  if (error) return <div className="error-state">{error}</div>;
  if (!issue) return <div className="loading">Loading issue…</div>;

  const canEdit = has('projects.edit') || has('dashboard.management');
  const stage = labelOf(lookups, 'PROJECT_STAGE', issue.project?.currentStageCode);

  return (
    <div className="iss">
      <header className="iss-head">
        <div>
          <p className="eyebrow">{issue.issueNumber}</p>
          <h2>{issue.title}</h2>
          <p>
            <Link to={`/projects/${issue.project?.id}`}>{issue.projectCode}</Link>
            {issue.customerName ? ` · ${issue.customerName}` : ''}
            {issue.departmentName ? ` · ${issue.departmentName}` : ''}
          </p>
        </div>
        <div className="iss-head-meta">
          <StatusBadge code={issue.statusCode} />
          <StatusBadge code={issue.priorityCode} />
          <Link className="btn secondary" to="/issues">Back to Issues</Link>
        </div>
      </header>

      <div className="iss-detail-grid">
        <section className="card iss-card">
          <h3>Issue Description</h3>
          <p>{issue.description || 'No description recorded.'}</p>
          <dl className="iss-dl">
            <div><dt>Project</dt><dd><Link to={`/projects/${issue.project?.id}`}>{issue.projectCode}</Link></dd></div>
            <div><dt>Department</dt><dd>{issue.departmentName}</dd></div>
            <div><dt>Issue Type</dt><dd>{labelOf(lookups, 'ISSUE_TYPE', issue.issueType)}</dd></div>
            <div><dt>Priority</dt><dd><StatusBadge code={issue.priorityCode} /></dd></div>
            <div><dt>Responsible Person</dt><dd>{issue.owner}</dd></div>
            <div><dt>Created Date</dt><dd>{fmtDate(issue.createdAt)}</dd></div>
            <div><dt>Due Date</dt><dd>{fmtDate(issue.dueDate)}</dd></div>
            <div><dt>Current Status</dt><dd>
              <StatusBadge code={issue.statusCode} />
              {issue.overdue && <small className="overdue">OVERDUE · {issue.overdueDays} {issue.overdueDays === 1 ? 'DAY' : 'DAYS'}</small>}
            </dd></div>
            <div><dt>Age</dt><dd className={issue.age >= 7 ? 'danger' : ''}>{issue.ageLabel}</dd></div>
            <div><dt>Created By</dt><dd>{issue.createdBy?.fullName || '—'}</dd></div>
          </dl>
        </section>

        <section className="card iss-card">
          <h3>Impact on Project</h3>
          <dl className="iss-dl">
            <div><dt>Project</dt><dd>{issue.projectCode}</dd></div>
            <div><dt>Current Stage</dt><dd>{stage}</dd></div>
            <div><dt>Impact</dt><dd>{issue.impactNotes || issue.requiredAction || 'No impact note recorded.'}</dd></div>
            <div><dt>Blocked Department</dt><dd>{issue.blockedDepartment?.name || (issue.isBlocking ? 'Project progress' : '—')}</dd></div>
            <div><dt>Estimated Delay</dt><dd>{issue.estimatedDelayDays != null ? `${issue.estimatedDelayDays} days` : '—'}</dd></div>
          </dl>
          {(issue.isBlocking || issue.statusCode === 'BLOCKED') && (
            <div className="iss-block-banner">BLOCKING PROJECT{issue.blockedDepartment ? ` · ${issue.blockedDepartment.name}` : ''}</div>
          )}
        </section>
      </div>

      <section className="card iss-card">
        <h3>Required Action</h3>
        <dl className="iss-dl three">
          <div><dt>Required Action</dt><dd>{issue.requiredAction || '—'}</dd></div>
          <div><dt>Action Owner</dt><dd>{issue.actionOwner?.fullName || issue.owner}</dd></div>
          <div><dt>Target Date</dt><dd>{fmtDate(issue.targetDate || issue.dueDate)}</dd></div>
        </dl>
        {canEdit && (
          <form className="form-grid" onSubmit={saveStatus} style={{ marginTop: 12 }}>
            <label className="field">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {(lookups.ISSUE_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </label>
            <label className="field full">
              Resolution Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <div className="full"><button className="btn" type="submit">Update issue</button></div>
          </form>
        )}
      </section>

      <div className="iss-detail-grid">
        <section className="card iss-card">
          <h3>Activity History</h3>
          <div className="timeline">
            {(issue.activity || []).map((a) => (
              <div className="tl-item" key={a.id}>
                <strong>{fmtDateTime(a.timestamp)}</strong>
                <p>{a.description || a.action.replaceAll('_', ' ')}</p>
                <small>{a.user?.fullName || '—'}</small>
              </div>
            ))}
            {!(issue.activity || []).length && <p className="iss-quiet">No activity recorded yet.</p>}
          </div>
        </section>

        <section className="card iss-card">
          <h3>Comments</h3>
          {(issue.comments || []).map((c) => (
            <div className="iss-comment" key={c.id}>
              <strong>{c.user?.fullName || '—'}</strong>
              <small>{fmtDateTime(c.createdAt)}</small>
              <p>{c.body}</p>
            </div>
          ))}
          <form onSubmit={addComment} className="iss-comment-form">
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" />
            <button className="btn" type="submit">Add comment</button>
          </form>
        </section>
      </div>

      <section className="card iss-card">
        <h3>Documents</h3>
        <div className="iss-scroll">
          <table className="iss-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Type</th>
                <th>Uploaded By</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(issue.documents || []).map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.originalName}</td>
                  <td>{labelOf(lookups, 'DOCUMENT_TYPE', doc.categoryCode)}</td>
                  <td>{doc.uploadedBy?.fullName || '—'}</td>
                  <td>{fmtDate(doc.uploadedAt)}</td>
                  <td><button type="button" className="linkish" onClick={() => previewDocument(doc)}>Preview</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!(issue.documents || []).length && <p className="iss-quiet">No documents attached.</p>}
        {has('documents.upload') && (
          <form className="btn-row" style={{ marginTop: 12 }} onSubmit={upload}>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {(lookups.DOCUMENT_TYPE || []).map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
            </select>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button className="btn secondary" type="submit">Upload</button>
          </form>
        )}
      </section>
    </div>
  );
}
