function parsePagination(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function paginated(items, total, page, pageSize) {
  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize) || 1,
  };
}

function parseSort(query, allowed, fallback) {
  const field = allowed.includes(query.sort) ? query.sort : fallback;
  const dir = query.dir === 'asc' ? 'asc' : 'desc';
  return { [field]: dir };
}

module.exports = { parsePagination, paginated, parseSort };
