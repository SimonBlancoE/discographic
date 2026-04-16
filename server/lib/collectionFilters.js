// Shared SQL WHERE builder for the releases table.
// All routes that filter the user's collection must use this so the
// supported filter shape stays in sync (collection list, export, tapete).

export function buildCollectionWhere(query, userId, extraClauses = []) {
  const { search = '', genre = '', style = '', decade = '', format = '', label = '' } = query;
  const clauses = ['user_id = ?', ...extraClauses];
  const params = [userId];

  if (search) {
    clauses.push('(artist LIKE ? OR title LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (genre) {
    clauses.push('genres LIKE ?');
    params.push(`%${genre}%`);
  }

  if (style) {
    clauses.push('styles LIKE ?');
    params.push(`%${style}%`);
  }

  if (decade) {
    const start = Number(decade);
    if (Number.isFinite(start)) {
      clauses.push('year >= ? AND year < ?');
      params.push(start, start + 10);
    }
  }

  if (format) {
    clauses.push('formats LIKE ?');
    params.push(`%${format}%`);
  }

  if (label) {
    clauses.push('labels LIKE ?');
    params.push(`%${label}%`);
  }

  return {
    clause: `WHERE ${clauses.join(' AND ')}`,
    params
  };
}
