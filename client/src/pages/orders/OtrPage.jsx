import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { fmtDateTime } from '../../utils/format';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';

const STAGES = [
  'ORDER CONFIRMED',
  'DESIGN',
  'PROCUREMENT',
  'PRODUCTION',
  'QUALITY',
  'DISPATCH',
  'INSTALLATION',
  'COMPLETED',
];

export default function OtrPage() {
  const [items, setItems] = useState([]);
  const [stages, setStages] = useState(STAGES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params] = useSearchParams();
  const completedOnly = params.get('stage') === 'COMPLETED';
  const visible = completedOnly
    ? items.filter((row) => row.currentStage === 'COMPLETED' || row.currentStageCode === 'COMPLETED')
    : items;

  useEffect(() => {
    api.get('/projects/otr')
      .then((data) => {
        setItems(data.items || []);
        if (data.stages?.length) setStages(data.stages);
      })
      .catch((err) => setError(err.message || 'Unable to load OTR.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">OTR</p>
          <h2>{completedOnly ? 'Completed' : 'OTR'}</h2>
          <p>Order tracking for projects that have been order confirmed. Later stages stay open until the project workflow updates them.</p>
        </div>
      </div>
      <div className="otr-stages" aria-label="OTR stages">
        {stages.map((stage) => (
          <span key={stage} className={items.some((row) => row.currentStage === stage) ? 'is-current' : ''}>{stage}</span>
        ))}
      </div>
      {error && <div className="notice err">{error}</div>}
      {!error && <DataTable
        rows={loading ? [] : visible}
        empty={loading ? 'Loading…' : 'No order-confirmed projects.'}
        columns={[
          { key: 'orderId', label: 'Order ID', render: (row) => row.orderId || '—' },
          { key: 'projectId', label: 'Project ID', render: (row) => <Link to={`/projects/${row.id}`}>{row.projectId}</Link> },
          { key: 'name', label: 'Project Name' },
          { key: 'customer', label: 'Customer' },
          { key: 'location', label: 'Location' },
          { key: 'productGroup', label: 'Product Group' },
          { key: 'salesPerson', label: 'Sales Person' },
          { key: 'confirmed', label: 'Order Confirmed Date', render: (row) => fmtDateTime(row.orderConfirmedAt) },
          { key: 'stage', label: 'Current Stage', render: (row) => row.currentStage },
          { key: 'overall', label: 'Overall Status', render: (row) => <StatusBadge code="APPROVED" label={row.overallStatus || 'ORDER CONFIRMED'} /> },
          { key: 'action', label: 'Action', render: (row) => <Link to={`/projects/${row.id}`}>View Project</Link> },
        ]}
      />}
    </div>
  );
}
