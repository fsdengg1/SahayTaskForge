import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { fmtDate, labelOf } from '../utils/format';
import { useLookups } from '../hooks/useLookups';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';

export default function FollowUpsPage() {
  const lookups = useLookups();
  const [data, setData] = useState({ items: [] });
  useEffect(() => {
    api.get('/leads?pageSize=100&sort=nextFollowUpDate&dir=asc').then(setData).catch(() => {});
  }, []);
  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Follow-ups</h2>
          <p>Sales follow-up dates from live leads. Open a lead to add or update a follow-up.</p>
        </div>
      </div>
      <DataTable
        rows={data.items}
        empty="No open follow-ups."
        columns={[
          { key: 'customer', label: 'Customer', render: (r) => r.customer?.companyName },
          { key: 'lead', label: 'Lead', render: (r) => <Link to={`/leads/${r.id}`}>{r.leadId}</Link> },
          { key: 'sales', label: 'Sales Person', render: (r) => r.salesPerson?.fullName || '—' },
          { key: 'last', label: 'Last Follow-up', render: (r) => fmtDate(r.followUps?.[0]?.followUpDate) },
          { key: 'next', label: 'Next Follow-up', render: (r) => fmtDate(r.nextFollowUpDate) },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.statusCode} label={labelOf(lookups, 'LEAD_STATUS', r.statusCode)} /> },
        ]}
      />
    </div>
  );
}
