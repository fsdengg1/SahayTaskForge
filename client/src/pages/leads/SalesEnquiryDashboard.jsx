import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';

const EMPTY = {
  totalEnquiries: 0,
  totalCompleted: 0,
  totalRejected: 0,
  totalQuotationsSent: 0,
  totalLayoutSent: 0,
  monthlyData: [],
};

function todayLabel() {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
}

function shareLabel(part, total) {
  if (!total) return 'No enquiries in range';
  const percent = Math.round((Number(part) / Number(total)) * 1000) / 10;
  const text = Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
  return `${text}% of enquiries`;
}

function Metric({ label, value, hint, tone }) {
  return (
    <div className={`sed-metric ${tone || ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{hint}</em>
    </div>
  );
}

function MonthRow({ row, max }) {
  const open = Math.max(0, row.enquiries - row.completed - row.rejected);
  const width = row.enquiries && max ? (row.enquiries / max) * 100 : 0;
  return (
    <div className="sed-row">
      <strong>{row.label}</strong>
      <div className="sed-track" aria-hidden="true">
        <div className="sed-stack" style={{ width: `${width}%` }}>
          {row.completed > 0 && <i className="is-completed" style={{ flexGrow: row.completed }} />}
          {row.rejected > 0 && <i className="is-rejected" style={{ flexGrow: row.rejected }} />}
          {open > 0 && <i className="is-open" style={{ flexGrow: open }} />}
        </div>
      </div>
      <b>{row.enquiries}</b>
      <p>
        {row.completed} completed
        <span>·</span>
        {row.rejected} rejected
        <span>·</span>
        {row.quotationsSent} quotations
        <span>·</span>
        {row.layoutSent} layouts
      </p>
    </div>
  );
}

function MixBar({ label, value, total, tone }) {
  const width = total ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="sed-mix">
      <div>
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <i aria-hidden="true"><em className={tone} style={{ width: `${width}%` }} /></i>
    </div>
  );
}

export default function SalesEnquiryDashboard() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const from = params.get('from') || '';
  const to = params.get('to') || '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    api.get(`/leads/sales-enquiry-dashboard?${query.toString()}`)
      .then((payload) => {
        if (!cancelled) setData(payload || EMPTY);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Unable to load the sales enquiry dashboard.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  function setDate(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  const months = data.monthlyData || [];
  const shown = loading ? '—' : undefined;
  const monthMax = Math.max(1, ...months.map((row) => row.enquiries));
  const openEnquiries = Math.max(0, data.totalEnquiries - data.totalCompleted - data.totalRejected);
  const sendMax = Math.max(1, data.totalQuotationsSent, data.totalLayoutSent);

  return (
    <div className="sed-page">
      <div className="page-head sed-head">
        <div>
          <p className="eyebrow">Sales & Pre-Sales</p>
          <h2>Sales Enquiry</h2>
          <p>{todayLabel()}</p>
        </div>
      </div>

      <div className="sed-filters">
        <label>
          <span>From</span>
          <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setDate('from', e.target.value)} />
        </label>
        <label>
          <span>To</span>
          <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setDate('to', e.target.value)} />
        </label>
        <button className="btn ghost sm" type="button" onClick={() => setParams({})} disabled={!from && !to}>Reset Filters</button>
        <p>Lead date for enquiries, completed, and rejected. Sent date for quotations and layouts.</p>
      </div>

      {error && <div className="notice err">{error}</div>}

      <div className="sed-kpis">
        <Metric label="Enquiries received" value={shown ?? data.totalEnquiries} hint="In this range" />
        <Metric label="Completed" value={shown ?? data.totalCompleted} hint={loading ? '—' : shareLabel(data.totalCompleted, data.totalEnquiries)} tone="ok" />
        <Metric label="Rejected" value={shown ?? data.totalRejected} hint={loading ? '—' : shareLabel(data.totalRejected, data.totalEnquiries)} tone="danger" />
        <Metric label="Quotations sent" value={shown ?? data.totalQuotationsSent} hint="By sent date" tone="warn" />
        <Metric label="Layouts sent" value={shown ?? data.totalLayoutSent} hint="Drawings included" />
      </div>

      <div className="sed-split">
        <section className="card sed-card">
          <div className="sed-card-head">
            <div>
              <h3>Monthly movement</h3>
              <p>Each bar is that month’s enquiries, split into completed, rejected, and still open.</p>
            </div>
            <div className="sed-legend">
              <span><i className="is-completed" /> Completed</span>
              <span><i className="is-rejected" /> Rejected</span>
              <span><i className="is-open" /> Open</span>
            </div>
          </div>
          {loading && <div className="empty">Loading…</div>}
          {!loading && months.length === 0 && <div className="empty">No enquiries in this date range.</div>}
          {!loading && months.length > 0 && (
            <div className="sed-months" role="img" aria-label="Monthly enquiries split by outcome">
              {months.map((row) => <MonthRow key={row.month} row={row} max={monthMax} />)}
            </div>
          )}
        </section>

        <section className="card sed-card">
          <div className="sed-card-head">
            <div>
              <h3>Outcome</h3>
              <p>Completed, rejected, and still open in this range.</p>
            </div>
          </div>
          {loading ? <div className="empty">Loading…</div> : (
            <div className="sed-mixes">
              <MixBar label="Completed" value={data.totalCompleted} total={data.totalEnquiries} tone="is-completed" />
              <MixBar label="Rejected" value={data.totalRejected} total={data.totalEnquiries} tone="is-rejected" />
              <MixBar label="Still open" value={openEnquiries} total={data.totalEnquiries} tone="is-open" />
              <p className="sed-mix-note">Quotations and layouts use the date they were sent.</p>
              <MixBar label="Quotations sent" value={data.totalQuotationsSent} total={sendMax} tone="is-quote" />
              <MixBar label="Layouts sent" value={data.totalLayoutSent} total={sendMax} tone="is-layout" />
            </div>
          )}
        </section>
      </div>

      <section className="card sed-card">
        <div className="sed-card-head">
          <div>
            <h3>Monthly record</h3>
            <p>The same totals, month by month.</p>
          </div>
        </div>
        <div className="table-wrap sed-scroll">
          <table className="data sed-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Enquiries</th>
                <th>Completed</th>
                <th>Rejected</th>
                <th>Quotations</th>
                <th>Layouts</th>
              </tr>
            </thead>
            <tbody>
              {months.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty table-empty">{loading ? 'Loading…' : 'No enquiries in this date range.'}</td>
                </tr>
              )}
              {months.map((row) => (
                <tr key={row.month}>
                  <td>{row.label}</td>
                  <td>{row.enquiries}</td>
                  <td className="is-completed">{row.completed}</td>
                  <td className="is-rejected">{row.rejected}</td>
                  <td>{row.quotationsSent}</td>
                  <td>{row.layoutSent}</td>
                </tr>
              ))}
            </tbody>
            {months.length > 0 && (
              <tfoot>
                <tr>
                  <th>Total</th>
                  <th>{data.totalEnquiries}</th>
                  <th>{data.totalCompleted}</th>
                  <th>{data.totalRejected}</th>
                  <th>{data.totalQuotationsSent}</th>
                  <th>{data.totalLayoutSent}</th>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
