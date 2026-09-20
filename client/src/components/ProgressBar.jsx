export default function ProgressBar({ value = 0 }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div style={{ minWidth: 90 }}>
      <div className="progress"><span style={{ width: `${pct}%` }} /></div>
      <small>{pct}%</small>
    </div>
  );
}
