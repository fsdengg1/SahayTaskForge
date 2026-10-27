import { Link } from 'react-router-dom';
import { labelOf } from '../../utils/format';
import { LocationValue, enquiryTypeLabel, leadStatusLabel, productGroupLabel } from './leadFields';

function sheetDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('day')}-${get('month')}-${get('year')}`;
}

function kolkataDay(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function enquiryDelayDays(value) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  const start = Date.parse(`${kolkataDay(date)}T00:00:00Z`);
  const end = Date.parse(`${kolkataDay(new Date())}T00:00:00Z`);
  return Math.max(0, Math.round((end - start) / 86400000));
}

function DrawingStatus({ row }) {
  if (row.outputStatus === 'ON_HOLD' || row.statusCode === 'ON_HOLD') {
    return <span className="sheet-delay hold">On Hold</span>;
  }
  const days = enquiryDelayDays(row.leadDate || row.createdAt);
  const label = days === 1 ? '1 Delay Day' : `${days} Delay Days`;
  return <span className={`sheet-delay ${days > 5 ? 'late' : 'ok'}`}>{label}</span>;
}

function finalStatus(row, lookups) {
  if (row.outputStatus === 'ON_HOLD' || row.statusCode === 'ON_HOLD') return 'On Hold';
  if (row.outputStatus === 'COMPLETED' || row.statusCode === 'COMPLETED') return 'Completed';
  if (['NEW', 'WAITING', 'PENDING', 'FOLLOW_UP', 'SUBMITTED', 'APPROVED'].includes(row.statusCode)) return 'In Progress';
  return leadStatusLabel(row.statusCode, lookups);
}

export default function PendingList({ rows, lookups, page = 1, pageSize = 20 }) {
  if (!rows?.length) return <div className="empty">No pending enquiries.</div>;
  const start = (page - 1) * pageSize;
  return (
    <div className="table-wrap">
      <table className="data pending-sheet">
        <thead>
          <tr>
            <th>S.no</th>
            <th>Enquiry Received Date</th>
            <th>Enquiry No.</th>
            <th>Customer Type</th>
            <th>Customer Name</th>
            <th>Location</th>
            <th>Product Group</th>
            <th>Sales Person</th>
            <th>Priority</th>
            <th>Final Status</th>
            <th>Drawing and Layout Status</th>
            <th>Short Remarks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const priority = labelOf(lookups, 'PRIORITY', row.priorityCode);
            const hot = ['VERY_HIGH', 'CRITICAL', 'HIGH'].includes(row.priorityCode);
            const status = finalStatus(row, lookups);
            const held = status === 'On Hold';
            return (
              <tr key={row.id}>
                <td>{start + index + 1}</td>
                <td>{sheetDate(row.leadDate)}</td>
                <td><Link to={`/leads/${row.id}`}>{row.leadId}</Link></td>
                <td>{enquiryTypeLabel(row.customerType)}</td>
                <td className="is-wrap">{row.customer?.companyName || '—'}</td>
                <td className="is-wrap"><LocationValue pending={row.locationPending} label={row.location} /></td>
                <td className="is-wrap">{productGroupLabel(row.productGroup, lookups)}</td>
                <td>{row.salesPerson?.fullName || '—'}</td>
                <td><span className={hot ? 'sheet-priority hot' : 'sheet-priority'}>{priority}</span></td>
                <td><span className={held ? 'sheet-final hold' : 'sheet-final'}>{status}</span></td>
                <td><DrawingStatus row={row} /></td>
                <td className="is-wrap">{row.remarks || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
