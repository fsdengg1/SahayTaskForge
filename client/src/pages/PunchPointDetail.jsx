import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLookups } from '../hooks/useLookups';
import { fmtDate, fmtDateTime, labelOf } from '../utils/format';
import StatusBadge from '../components/StatusBadge';

export default function PunchPointDetail() {
  const { id } = useParams();
  const { has } = useAuth();
  const lookups = useLookups();
  const [punch, setPunch] = useState(null);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState('');
  const [remarks, setRemarks] = useState('');

  function load() {
    api.get(`/punch-points/${id}`).then((row) => {
      setPunch(row);
      setStatus(row.statusCode);
      setRemarks(row.remarks || '');
    }).catch((e) => setError(e.message));
  }

  useEffect(load, [id]);

  async function save(e) {
    e.preventDefault();
    await api.patch(`/punch-points/${id}`, { statusCode: status, remarks });
    load();
  }

  async function addComment(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    await api.post(`/punch-points/${id}/comments`, { body: comment });
    setComment('');
    load();
  }

  if (error) return <div className="error-state">{error}</div>;
  if (!punch) return <div className="loading">Loading punch point…</div>;

  return (
    <div className="iss">
      <header className="iss-head">
        <div>
          <p className="eyebrow">{punch.punchId}</p>
          <h2>{punch.description}</h2>
          <p>
            <Link to={`/projects/${punch.project?.id}`}>{punch.project?.projectId}</Link>
            {punch.project?.customer?.companyName ? ` · ${punch.project.customer.companyName}` : ''}
          </p>
        </div>
        <div className="iss-head-meta">
          <StatusBadge code={punch.statusCode} label={labelOf(lookups, 'PUNCH_STATUS', punch.statusCode)} />
          <Link className="btn secondary" to="/issues">Back to Issues</Link>
        </div>
      </header>

      <section className="card iss-card">
        <dl className="iss-dl">
          <div><dt>Project</dt><dd><Link to={`/projects/${punch.project?.id}`}>{punch.project?.projectId}</Link></dd></div>
          <div><dt>Customer</dt><dd>{punch.project?.customer?.companyName || '—'}</dd></div>
          <div><dt>Site</dt><dd>{punch.project?.site?.name || punch.project?.site?.address || '—'}</dd></div>
          <div><dt>Location</dt><dd>{punch.location || '—'}</dd></div>
          <div><dt>Description</dt><dd>{punch.description}</dd></div>
          <div><dt>Assigned Person</dt><dd>{punch.assignedTo?.fullName || '—'}</dd></div>
          <div><dt>Due Date</dt><dd>{fmtDate(punch.dueDate)}</dd></div>
          <div><dt>Status</dt><dd><StatusBadge code={punch.statusCode} label={labelOf(lookups, 'PUNCH_STATUS', punch.statusCode)} /></dd></div>
          <div><dt>Age</dt><dd>{punch.ageLabel}</dd></div>
        </dl>
      </section>

      <section className="card iss-card">
        <h3>Resolution</h3>
        <dl className="iss-dl">
          <div><dt>Resolved Date</dt><dd>{fmtDate(punch.completedAt)}</dd></div>
          <div><dt>Remarks</dt><dd>{punch.remarks || '—'}</dd></div>
        </dl>
        {has('installation.edit') && (
          <form className="form-grid" onSubmit={save} style={{ marginTop: 12 }}>
            <label className="field">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {(lookups.PUNCH_STATUS || []).map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </label>
            <label className="field full">
              Resolution notes
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </label>
            <div className="full"><button className="btn" type="submit">Update punch point</button></div>
          </form>
        )}
      </section>

      <div className="iss-detail-grid">
        <section className="card iss-card">
          <h3>Comments</h3>
          {(punch.comments || []).map((c) => (
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
        <section className="card iss-card">
          <h3>Activity History</h3>
          <div className="timeline">
            {(punch.activity || []).map((a) => (
              <div className="tl-item" key={a.id}>
                <strong>{fmtDateTime(a.timestamp)}</strong>
                <p>{a.description || a.action.replaceAll('_', ' ')}</p>
                <small>{a.user?.fullName || '—'}</small>
              </div>
            ))}
            {!(punch.activity || []).length && <p className="iss-quiet">No activity recorded yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
