export default function KpiCard({ label, value, tone, onClick }) {
  return (
    <button type="button" className={`kpi ${tone || ''}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
    </button>
  );
}
