import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { fmtDate } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';

const COPY = {
  PROCUREMENT: {
    title: 'Procurement',
    text: 'Orders whose detailed design is complete. Completing procurement moves the order to production.',
  },
  INSTALLATION: {
    title: 'Installation',
    text: 'Orders that have finished production, quality, and dispatch. Completing installation closes the project.',
  },
};

export default function ExecutionStagePage({ stage }) {
  const meta = COPY[stage];
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  function load() {
    setError('');
    api.get(`/lifecycle/execution/${stage}`)
      .then(setData)
      .catch((err) => setError(err.message || 'Unable to load this stage.'));
  }

  useEffect(() => { load(); }, [stage]);

  async function act(row, action) {
    setBusy(row.id + action);
    setNotice('');
    try {
      await api.post(`/lifecycle/execution/${stage}/${row.id}/${action}`, { remarks: row.remarks || '' });
      setNotice('Saved.');
      load();
    } catch (err) {
      setNotice(err.message || 'Unable to update the stage.');
    } finally {
      setBusy('');
    }
  }

  const items = data?.items || [];

  return (
    <div className="oc-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">OTR</p>
          <h2>{meta.title}</h2>
          <p>{meta.text}</p>
        </div>
      </div>
      {notice && <p className="form-error">{notice}</p>}
      {error && (
        <div className="oc-state">
          <strong>Unable to load projects.</strong>
          <button className="btn sm" type="button" onClick={load}>Retry</button>
        </div>
      )}
      {!error && data && items.length === 0 && (
        <div className="oc-state">
          <strong>No orders have reached {meta.title}.</strong>
          <p>An order appears here only after the previous stage is completed.</p>
        </div>
      )}
      {items.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Project ID</th>
                <th>Project Name</th>
                <th>Customer</th>
                {stage === 'PROCUREMENT' && <th>Location</th>}
                {stage === 'PROCUREMENT' && <th>Product Group</th>}
                {stage === 'PROCUREMENT' && <th>Final BOM</th>}
                {stage === 'INSTALLATION' && <th>Location</th>}
                <th>Status</th>
                <th>Start Date</th>
                <th>Target Date</th>
                <th>Pending Days</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{row.orderId || '—'}</td>
                  <td>{row.projectId}</td>
                  <td>{row.name}</td>
                  <td>{row.customer}</td>
                  {(stage === 'PROCUREMENT' || stage === 'INSTALLATION') && <td>{row.location}</td>}
                  {stage === 'PROCUREMENT' && <td>{row.productGroup}</td>}
                  {stage === 'PROCUREMENT' && <td>{row.finalBom || '—'}</td>}
                  <td><StatusBadge code={row.workStatus} label={String(row.workStatus || '').replaceAll('_', ' ')} /></td>
                  <td>{fmtDate(row.startedAt)}</td>
                  <td>{fmtDate(row.targetAt)}</td>
                  <td>{row.pendingDays ?? 0}</td>
                  <td className="oc-actions">
                    {data.canEdit && row.workStatus === 'PENDING' && (
                      <button className="btn sm" type="button" disabled={busy === `${row.id}start`} onClick={() => act(row, 'start')}>In Progress</button>
                    )}
                    {data.canEdit && !['PENDING', 'COMPLETED', 'ON_HOLD'].includes(row.workStatus) && (
                      <button className="btn sm" type="button" disabled={busy === `${row.id}complete`} onClick={() => act(row, 'complete')}>
                        {stage === 'INSTALLATION' ? 'Complete Installation' : 'Complete'}
                      </button>
                    )}
                    {data.canEdit && row.workStatus !== 'ON_HOLD' && row.workStatus !== 'COMPLETED' && (
                      <button className="btn sm ghost" type="button" disabled={busy === `${row.id}hold`} onClick={() => act(row, 'hold')}>On Hold</button>
                    )}
                    {data.canEdit && row.workStatus === 'ON_HOLD' && (
                      <button className="btn sm" type="button" disabled={busy === `${row.id}start`} onClick={() => act(row, 'start')}>Resume</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
