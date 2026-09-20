import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { fmtDate, money } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import KpiCard from '../components/KpiCard';

export default function FinancePage({ mode = 'finance' }) {
  const { has } = useAuth();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api.get('/finance').then(setRows).catch(() => setRows([]));
  }, []);

  const title = mode === 'invoices' ? 'Invoices' : mode === 'payments' ? 'Payments' : 'Finance';
  const totals = useMemo(() => {
    const invoiced = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const paid = rows.reduce((s, r) => s + (r.payments || []).reduce((p, x) => p + Number(x.amount || 0), 0), 0);
    return { invoiced, paid, outstanding: invoiced - paid };
  }, [rows]);

  if (!has('finance.view')) {
    return <div className="empty">Commercial figures are limited to authorized finance roles.</div>;
  }

  const payments = rows.flatMap((inv) => (inv.payments || []).map((p) => ({ ...p, invoice: inv })));

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Commercial</p>
          <h2>{title}</h2>
          <p>Order value, invoices and collections from the same project records.</p>
        </div>
      </div>
      <div className="kpi-grid">
        <KpiCard label="Invoiced" value={money(totals.invoiced)} />
        <KpiCard label="Collected" value={money(totals.paid)} tone="ok" />
        <KpiCard label="Outstanding" value={money(totals.outstanding)} tone={totals.outstanding > 0 ? 'warn' : 'ok'} />
      </div>
      {mode !== 'payments' && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>Invoices</h3>
          <DataTable
            rows={rows}
            empty="No invoices yet."
            columns={[
              { key: 'invoiceNumber', label: 'Invoice' },
              { key: 'project', label: 'Project', render: (r) => r.project ? <Link to={`/projects/${r.project.id}`}>{r.project.projectId}</Link> : '—' },
              { key: 'customer', label: 'Customer', render: (r) => r.project?.customer?.companyName || '—' },
              { key: 'date', label: 'Date', render: (r) => fmtDate(r.invoiceDate) },
              { key: 'amount', label: 'Value', render: (r) => money(r.amount, r.currency) },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge code={r.statusCode} /> },
            ]}
          />
        </div>
      )}
      {mode !== 'invoices' && (
        <div className="card">
          <h3>Payments</h3>
          <DataTable
            rows={payments}
            empty="No payments recorded."
            columns={[
              { key: 'invoice', label: 'Invoice', render: (r) => r.invoice?.invoiceNumber },
              { key: 'project', label: 'Project', render: (r) => r.invoice?.project?.projectId || '—' },
              { key: 'amount', label: 'Amount', render: (r) => money(r.amount, r.invoice?.currency) },
              { key: 'date', label: 'Date', render: (r) => fmtDate(r.paidAt) },
              { key: 'status', label: 'Invoice status', render: (r) => <StatusBadge code={r.invoice?.statusCode} /> },
            ]}
          />
        </div>
      )}
    </div>
  );
}
