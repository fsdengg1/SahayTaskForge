import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useLookups } from '../hooks/useLookups';
import { labelOf } from '../utils/format';
import StatusBadge from '../components/StatusBadge';

export default function QualityPage({ focus } = {}) {
  const lookups = useLookups();
  const [items, setItems] = useState([]);
  useEffect(() => { api.get('/quality').then(setItems).catch(() => {}); }, []);
  const rows = focus === 'rework'
    ? items.filter((i) => ['FAILED', 'REWORK', 'NCR', 'CONDITIONAL'].includes(String(i.resultCode || '').toUpperCase()))
    : items;
  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Quality</p>
          <h2>{focus === 'rework' ? 'Rework / NCR' : 'Quality / QC'}</h2>
          <p>{focus === 'rework' ? 'Failed inspections and rework from project QC records.' : 'Incoming, in-process, final and installation inspections.'}</p>
        </div>
      </div>
      <div className="card">
        {rows.map((i) => (
          <div className="check-row" key={i.id}>
            <div>
              <strong>{i.inspectionId}</strong>
              <p>{i.project?.projectId} · {labelOf(lookups, 'INSPECTION_TYPE', i.typeCode)} · {i.inspector?.fullName || '—'} · {i.defect || i.remarks || '—'}</p>
            </div>
            <StatusBadge code={i.resultCode} />
          </div>
        ))}
        {!rows.length && <div className="empty">{focus === 'rework' ? 'No failed inspections or NCR records.' : 'No inspections recorded.'}</div>}
      </div>
    </div>
  );
}
