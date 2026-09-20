import { statusTone } from '../utils/format';

export default function StatusBadge({ code, label }) {
  return <span className={`badge ${statusTone(code)}`}>{label || String(code || '—').replaceAll('_', ' ')}</span>;
}
