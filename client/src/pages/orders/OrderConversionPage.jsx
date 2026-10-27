import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { fmtDate } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';

const PAGE_SIZE = 8;
const EMPTY_FILTERS = {
  q: '',
  customer: '',
  salesPerson: '',
  productGroup: '',
  status: '',
  date: '',
};

function monthKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).format(date);
}

function dayKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function unique(items, key) {
  return [...new Set(items.map((item) => item[key]).filter((value) => value && value !== '—'))].sort((a, b) => a.localeCompare(b));
}

function Clamp({ value }) {
  const text = value && value !== '—' ? value : '—';
  return <span className="oc-clamp" title={text === '—' ? undefined : text}>{text}</span>;
}

function matches(row, filters) {
  if (filters.q) {
    const hay = [
      row.projectId, row.orderId, row.name, row.customer, row.customerName, row.companyName,
      row.location, row.productGroup, row.salesPerson,
    ].join(' ').toLowerCase();
    if (!hay.includes(filters.q.trim().toLowerCase())) return false;
  }
  if (filters.customer && row.customer !== filters.customer && row.companyName !== filters.customer && row.customerName !== filters.customer) return false;
  if (filters.salesPerson && row.salesPerson !== filters.salesPerson) return false;
  if (filters.productGroup && row.productGroup !== filters.productGroup) return false;
  if (filters.date) {
    const dates = [dayKey(row.approvalDate), dayKey(row.orderConfirmedAt)];
    if (!dates.includes(filters.date)) return false;
  }
  return true;
}

function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return (
    <div className="oc-pager">
      <button className="btn ghost sm" type="button" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span>{page} / {pages}</span>
      <button className="btn ghost sm" type="button" disabled={page === pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

export default function OrderConversionPage() {
  const [items, setItems] = useState([]);
  const [confirmed, setConfirmed] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [awaitingPage, setAwaitingPage] = useState(1);
  const [confirmedPage, setConfirmedPage] = useState(1);

  function load(initial = false) {
    if (initial) setLoading(true);
    setError('');
    api.get('/projects/order-conversion')
      .then((payload) => {
        setItems(payload.items || []);
        setConfirmed(payload.confirmed || []);
        setStats(payload.kpis || null);
      })
      .catch(() => setError('Unable to load projects.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(true);
    function refresh() {
      if (document.visibilityState !== 'hidden') load(false);
    }
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const thisMonth = monthKey(new Date());
  const kpis = stats || {
    awaiting: items.length,
    confirmed: confirmed.length,
    month: confirmed.filter((item) => monthKey(item.orderConfirmedAt) === thisMonth).length,
  };
  const catalog = useMemo(() => [...items, ...confirmed], [items, confirmed]);
  const awaitingFiltered = useMemo(
    () => items.filter((row) => matches(row, filters)),
    [items, filters],
  );
  const confirmedFiltered = useMemo(
    () => confirmed.filter((row) => matches(row, filters)),
    [confirmed, filters],
  );
  const showAwaiting = filters.status !== 'CONFIRMED';
  const showConfirmed = filters.status !== 'AWAITING';
  const awaitingPages = Math.max(1, Math.ceil(awaitingFiltered.length / PAGE_SIZE));
  const confirmedPages = Math.max(1, Math.ceil(confirmedFiltered.length / PAGE_SIZE));
  const awaitingCurrent = Math.min(awaitingPage, awaitingPages);
  const confirmedCurrent = Math.min(confirmedPage, confirmedPages);
  const awaitingRows = awaitingFiltered.slice((awaitingCurrent - 1) * PAGE_SIZE, awaitingCurrent * PAGE_SIZE);
  const confirmedRows = confirmedFiltered.slice((confirmedCurrent - 1) * PAGE_SIZE, confirmedCurrent * PAGE_SIZE);
  const filtersOn = Object.values(filters).some(Boolean);

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setAwaitingPage(1);
    setConfirmedPage(1);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setAwaitingPage(1);
    setConfirmedPage(1);
  }

  async function confirmOrder() {
    if (!selected || saving) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/projects/${selected.id}/confirm-order`, {});
      setSelected(null);
      setNotice('Order confirmed successfully.');
      load(false);
    } catch (err) {
      setError(err.message || 'Unable to confirm this order.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="oc-page">
      <div className="page-head">
        <div>
          <h2>Project to Order Conversion</h2>
          <p>Customer-approved projects awaiting confirmation, and orders already confirmed.</p>
        </div>
      </div>

      <div className="oc-kpis">
        <div className="kpi"><span className="kpi-label"><i aria-hidden="true" />Awaiting Confirmation</span><strong>{loading ? '—' : kpis.awaiting}</strong></div>
        <div className="kpi ok"><span className="kpi-label"><i aria-hidden="true" />Orders Confirmed</span><strong>{loading ? '—' : kpis.confirmed}</strong></div>
        <div className="kpi"><span className="kpi-label"><i aria-hidden="true" />Converted This Month</span><strong>{loading ? '—' : kpis.month}</strong></div>
      </div>

      <form className="filters oc-filters" onSubmit={(event) => event.preventDefault()}>
        <input placeholder="Search" value={filters.q} onChange={(event) => setFilter('q', event.target.value)} />
        <select value={filters.customer} onChange={(event) => setFilter('customer', event.target.value)}>
          <option value="">Customer</option>
          {unique(catalog, 'customer').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={filters.salesPerson} onChange={(event) => setFilter('salesPerson', event.target.value)}>
          <option value="">Sales Person</option>
          {unique(catalog, 'salesPerson').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={filters.productGroup} onChange={(event) => setFilter('productGroup', event.target.value)}>
          <option value="">Product Group</option>
          {unique(catalog, 'productGroup').map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
          <option value="">Status</option>
          <option value="AWAITING">Awaiting confirmation</option>
          <option value="CONFIRMED">Order confirmed</option>
        </select>
        <input type="date" aria-label="Approval or confirmation date" value={filters.date} onChange={(event) => setFilter('date', event.target.value)} />
        <button className="btn ghost sm" type="button" onClick={resetFilters}>Reset Filters</button>
      </form>

      {notice && <div className="notice">{notice}</div>}

      {error && !selected && (
        <div className="oc-state">
          <strong>Unable to load projects.</strong>
          <button className="btn secondary" type="button" onClick={() => load(true)}>Retry</button>
        </div>
      )}

      {!error && loading && <div className="oc-state">Loading…</div>}

      {!error && !loading && showAwaiting && (
        <section>
          <div className="oc-section">
            <h3>Awaiting confirmation</h3>
            <p>Projects in customer review, negotiation, or approved and waiting for an order.</p>
          </div>
          {awaitingFiltered.length === 0 ? (
            <div className={`oc-state ${showConfirmed && confirmedFiltered.length ? 'compact' : ''}`}>
              <strong>{filtersOn ? 'No projects match these filters.' : 'No projects awaiting order confirmation'}</strong>
              <p>{filtersOn ? 'Reset the filters to see every eligible project.' : 'A project appears here after the pre-sales package is with the customer or approved.'}</p>
              {filtersOn && <button className="btn ghost" type="button" onClick={resetFilters}>Reset Filters</button>}
            </div>
          ) : (
            <>
              <div className="table-wrap oc-table">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Project ID</th>
                      <th>Order ID</th>
                      <th>Customer Name</th>
                      <th>Company Name</th>
                      <th>Location</th>
                      <th>Sales Person</th>
                      <th>Product Group</th>
                      <th>Project Status</th>
                      <th>Customer Approval</th>
                      <th>Confirmation Date</th>
                      <th className="is-actions">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {awaitingRows.map((row) => (
                      <tr key={row.id}>
                        <td><Link to={`/projects/${row.id}`}>{row.projectId}</Link></td>
                        <td>{row.orderId || '—'}</td>
                        <td><Clamp value={row.customerName || row.customer} /></td>
                        <td><Clamp value={row.companyName || row.customer} /></td>
                        <td><Clamp value={row.location} /></td>
                        <td>{row.salesPerson || '—'}</td>
                        <td>{row.productGroup || '—'}</td>
                        <td><StatusBadge code={row.projectStatusCode} label={row.projectStatus} /></td>
                        <td><StatusBadge code={row.workflowStatus || 'PENDING'} label={row.workflowStatusLabel || 'Pending'} /></td>
                        <td>{fmtDate(row.orderConfirmedAt)}</td>
                        <td className="is-actions">
                          <div className="oc-actions">
                            {row.eligible && <button className="btn copper sm" type="button" onClick={() => { setError(''); setSelected(row); }}>Confirm Order</button>}
                            <Link className="btn ghost sm" to={`/projects/${row.id}`}>View</Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={awaitingCurrent} pages={awaitingPages} onPage={setAwaitingPage} />
            </>
          )}
        </section>
      )}

      {!error && !loading && showConfirmed && (
        <section>
          <div className="oc-section">
            <h3>Orders confirmed</h3>
            <p>Projects converted into an order. Converted this month uses the confirmation date.</p>
          </div>
          {confirmedFiltered.length === 0 ? (
            <div className="oc-state compact">
              <strong>{filtersOn ? 'No confirmed orders match these filters.' : 'No confirmed orders yet'}</strong>
              <p>{filtersOn ? 'Reset the filters to see every confirmed order.' : 'A confirmed order appears here after Confirm Order.'}</p>
              {filtersOn && <button className="btn ghost" type="button" onClick={resetFilters}>Reset Filters</button>}
            </div>
          ) : (
            <>
              <div className="table-wrap oc-table">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Project ID</th>
                      <th>Customer Name</th>
                      <th>Company Name</th>
                      <th>Location</th>
                      <th>Sales Person</th>
                      <th>Product Group</th>
                      <th>Project Status</th>
                      <th>Order Status</th>
                      <th>Confirmation Date</th>
                      <th className="is-actions">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmedRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.orderId || '—'}</td>
                        <td>{row.projectId ? <Link to={`/projects/${row.id}`}>{row.projectId}</Link> : '—'}</td>
                        <td><Clamp value={row.customerName || row.customer} /></td>
                        <td><Clamp value={row.companyName || row.customer} /></td>
                        <td><Clamp value={row.location} /></td>
                        <td>{row.salesPerson || '—'}</td>
                        <td>{row.productGroup || '—'}</td>
                        <td><StatusBadge code={row.projectStatusCode} label={row.projectStatus} /></td>
                        <td><StatusBadge code="ORDER_CONFIRMED" label="ORDER CONFIRMED" /></td>
                        <td>{fmtDate(row.orderConfirmedAt)}</td>
                        <td className="is-actions">
                          <div className="oc-actions">
                            <Link className="btn ghost sm" to={`/projects/${row.id}`}>View</Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={confirmedCurrent} pages={confirmedPages} onPage={setConfirmedPage} />
            </>
          )}
        </section>
      )}

      {selected && (
        <Modal title="Confirm Order" onClose={() => { if (!saving) setSelected(null); }}>
          <dl className="oc-confirm">
            <div><dt>Project</dt><dd>{selected.name}</dd></div>
            <div><dt>Customer</dt><dd>{selected.customer}</dd></div>
            <div><dt>Location</dt><dd>{selected.location}</dd></div>
          </dl>
          <p>Are you sure you want to convert this project into an order?</p>
          {error && <div className="notice err">{error}</div>}
          <div className="btn-row">
            <button className="btn ghost" type="button" disabled={saving} onClick={() => setSelected(null)}>Cancel</button>
            <button className="btn copper" type="button" disabled={saving} onClick={confirmOrder}>{saving ? 'Confirming…' : 'Confirm Order'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
