function cellTitle(column, row) {
  if (typeof column.title === 'function') {
    const value = column.title(row);
    return value ? String(value) : undefined;
  }
  return typeof row[column.key] === 'string' ? row[column.key] : undefined;
}

export default function DataTable({ columns, rows, empty = 'No records found.', fit = false, rowClass }) {
  if (!rows?.length) return <div className="empty table-empty">{empty}</div>;
  return (
    <div className={`table-wrap${fit ? ' is-fit' : ''}`}>
      <table className={`data${fit ? ' is-fit' : ''}`}>
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === 'right' ? 'is-right' : undefined} style={c.width ? { width: c.width } : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id || row.key} className={rowClass ? rowClass(row) : undefined}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={[c.wrap ? 'is-wrap' : '', c.align === 'right' ? 'is-right' : '', c.cellClass || ''].filter(Boolean).join(' ') || undefined}
                  title={cellTitle(c, row)}
                >
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
