const COLORS = {
  ON_TRACK: '#2D7A4F',
  AT_RISK: '#B8860B',
  DELAYED: '#B42318',
  BLOCKED: '#B42318',
  ON_HOLD: '#B8860B',
  COMPLETED: '#2D7A4F',
};

export default function DonutChart({ items = [], onSelect, centerCaption = 'TOTAL PROJECTS' }) {
  const total = items.reduce((s, i) => s + (i.count || 0), 0) || 1;
  const r = 46;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const fill = '#12304A';
  const muted = '#667085';
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" width="140" height="140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#E8EBE8" strokeWidth="12" />
        {items.map((item) => {
          const len = ((item.count || 0) / total) * c;
          const dash = `${len} ${c - len}`;
          const el = (
            <circle
              key={item.code}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={COLORS[item.code] || '#9aa3ad'}
              strokeWidth="12"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
            />
          );
          offset += len;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" fontSize="22" fontWeight="700" fill={fill}>{items.reduce((s, i) => s + (i.count || 0), 0)}</text>
        <text x="70" y="82" textAnchor="middle" fontSize="7.5" letterSpacing="0.6" fill={muted}>{centerCaption}</text>
      </svg>
      <ul className="donut-legend">
        {items.map((item) => (
          <li key={item.code}>
            <button type="button" onClick={() => onSelect?.(item)}>
              <i style={{ background: COLORS[item.code] || '#9aa3ad' }} />
              <span>{item.label}</span>
              <strong>{item.count}</strong>
              <em>{item.percent}%</em>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
