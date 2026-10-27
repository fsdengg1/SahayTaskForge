export default function KpiCard({ label, value, tone, onClick, active }) {
  return (
    <button type="button" className={`kpi ${tone || ''} ${active ? 'on' : ''}`} onClick={onClick}>
      <span className="kpi-label"><i aria-hidden="true" />{label}</span>
      <strong>{value ?? 0}</strong>
    </button>
  );
}
