import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { fmtDate, labelOf } from '../utils/format';
import { useLookups } from '../hooks/useLookups';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';

export default function ApprovalsPage() {
  const lookups = useLookups();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api.get('/approvals').then(setRows).catch(() => setRows([]));
  }, []);
  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Work</p>
          <h2>Approvals</h2>
          <p>Drawing and document approvals across projects.</p>
        </div>
      </div>
      <DataTable
        rows={rows}
        empty="No approvals recorded."
        columns={[
          { key: 'project', label: 'Project', render: (r) => r.project ? <Link to={`/projects/${r.project.id}`}>{r.project.projectId}</Link> : '—' },
          { key: 'doc', label: 'Document', render: (r) => r.document?.originalName || '—' },
          { key: 'type', label: 'Type', render: (r) => labelOf(lookups, 'DOCUMENT_TYPE', r.document?.categoryCode) },
          { key: 'rev', label: 'Revision', render: (r) => r.revision || r.document?.revision || '—' },
          { key: 'who', label: 'Submitted by', render: (r) => r.submittedBy?.fullName || '—' },
          { key: 'when', label: 'Date', render: (r) => fmtDate(r.submittedAt) },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.statusCode} /> },
        ]}
      />
    </div>
  );
}
