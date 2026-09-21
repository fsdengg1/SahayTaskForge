export default function DataTable({ columns, rows, empty = 'No records found.', fit = false }) {
  if (!rows?.length) return <div className="empty">{empty}</div>;
  return (
    <div className={`table-wrap${fit ? ' is-fit' : ''}`}>
      <table className={`data${fit ? ' is-fit' : ''}`}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id || row.key}>
              {columns.map((c) => (
                <td key={c.key} className={c.wrap ? 'is-wrap' : undefined} title={typeof row[c.key] === 'string' ? row[c.key] : undefined}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
