import { useEffect, useState } from 'react';
import { api } from '../services/api';
import KpiCard from '../components/KpiCard';
import StatusBadge from '../components/StatusBadge';

export default function ProcurementPage({ focus, title } = {}) {
  const [dash, setDash] = useState(null);
  const [data, setData] = useState({ rfqs: [], purchaseOrders: [], receipts: [] });
  useEffect(() => {
    api.get('/dashboard/procurement').then(setDash).catch(() => {});
    api.get('/procurement').then(setData).catch(() => {});
  }, []);
  const heading = title || (focus === 'po' ? 'Purchase Orders' : focus === 'grn' ? 'GRN / Material Receipt' : 'Procurement');
  return (
    <div>
      <div className="page-head"><div><p className="eyebrow">Procurement</p><h2>{heading}</h2><p>RFQ, vendor quotes, purchase orders and GRN on the same project.</p></div></div>
      {dash && (
        <div className="kpi-grid">
          <KpiCard label="RFQs Pending" value={dash.kpis.rfqs} />
          <KpiCard label="POs Pending" value={dash.kpis.poPending} tone="warn" />
          <KpiCard label="Material / GRN" value={dash.kpis.incoming} />
          <KpiCard label="Delayed Vendors" value={dash.kpis.delayedVendors} tone="danger" />
        </div>
      )}
      {focus !== 'po' && focus !== 'grn' && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>RFQs</h3>
          {data.rfqs.map((r) => (
            <div className="check-row" key={r.id}>
              <div><strong>{r.rfqId}</strong><p>{r.title} · {r.project?.projectId}</p></div>
              <StatusBadge code={r.statusCode} />
            </div>
          ))}
          {!data.rfqs.length && <div className="empty">No RFQs.</div>}
        </div>
      )}
      {focus !== 'grn' && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>Purchase orders</h3>
          {data.purchaseOrders.map((p) => (
            <div className="check-row" key={p.id}>
              <div><strong>{p.poNumber}</strong><p>{p.vendor?.companyName} · {p.project?.projectId}</p></div>
              <StatusBadge code={p.statusCode} />
            </div>
          ))}
          {!data.purchaseOrders.length && <div className="empty">No purchase orders.</div>}
        </div>
      )}
      {focus !== 'po' && (
        <div className="card">
          <h3>GRN / material receipt</h3>
          {data.receipts.map((g) => (
            <div className="check-row" key={g.id}>
              <div><strong>{g.grnNumber || g.id}</strong><p>PO {g.po?.poNumber || '—'} · {g.po?.vendor?.companyName || ''}</p></div>
              <StatusBadge code="RECEIVED" />
            </div>
          ))}
          {!data.receipts.length && <div className="empty">No material receipts yet.</div>}
        </div>
      )}
    </div>
  );
}
