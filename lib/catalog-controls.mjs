const text = value => String(value ?? '');

export function filterCatalog(books, filters = {}, usage = {}) {
  const query = text(filters.query).trim().toLocaleLowerCase();
  const result = books.filter(book =>
    (!query || [book.title, book.author, book.category, book.description, book.language].some(value => text(value).toLocaleLowerCase().includes(query))) &&
    (!filters.status || filters.status === 'all' || (filters.status === 'active' ? book.active !== false : book.active === false)) &&
    (!filters.collection || book.category === filters.collection) &&
    (!filters.format || filters.format === 'all' || book.format === filters.format) &&
    (!filters.language || book.language === filters.language) &&
    matchesMetadataQuality(book, filters.quality)
  );
  return result.sort((a, b) => {
    let order = 0;
    if (filters.sort === 'newest') order = (Date.parse(b.addedAt || '') || 0) - (Date.parse(a.addedAt || '') || 0);
    else if (filters.sort === 'readers') order = (usage[b.id] || 0) - (usage[a.id] || 0);
    else if (filters.sort === 'collection') order = text(a.category).localeCompare(text(b.category));
    return order || text(a.title).localeCompare(text(b.title), undefined, {numeric: true}) || text(a.id).localeCompare(text(b.id));
  });
}

function matchesMetadataQuality(book, quality) {
  const missingDescription = !text(book.description).trim();
  const unclassified = !text(book.category).trim() || text(book.category).trim().toLocaleLowerCase() === 'general';
  if (quality === 'missing-description') return missingDescription;
  if (quality === 'unclassified') return unclassified;
  if (quality === 'needs-review') return missingDescription || unclassified;
  return true;
}

export function filterEmployees(employees, filters = {}) {
  const query = text(filters.query).trim().toLocaleLowerCase();
  return employees.filter(employee =>
    (!query || [employee.name, employee.employeeId].some(value => text(value).toLocaleLowerCase().includes(query))) &&
    (!filters.role || filters.role === 'all' || employee.role === filters.role) &&
    (!filters.status || filters.status === 'all' || (filters.status === 'active' ? employee.active === true : employee.active === false))
  ).sort((a, b) => text(a.name).localeCompare(text(b.name), undefined, {numeric:true}) || text(a.employeeId).localeCompare(text(b.employeeId), undefined, {numeric:true}) || text(a.id).localeCompare(text(b.id)));
}

export function paginateRecords(records, requestedPage = 1, requestedSize = 25) {
  const size = [25, 50, 100].includes(requestedSize) ? requestedSize : 25;
  const total = records.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.max(1, Math.min(pages, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1));
  const start = (page - 1) * size;
  return {items:records.slice(start, start + size), total, page, pages, size, from:total ? start + 1 : 0, to:Math.min(start + size, total)};
}

export function selectVisibleBooks(selected, visibleIds, checked, cap = 100) {
  const visible = new Set(visibleIds);
  if (!checked) return selected.filter(id => !visible.has(id));
  const result = [...new Set(selected)].slice(0, cap);
  const present = new Set(result);
  for (const id of visibleIds) {
    if (result.length >= cap) break;
    if (!present.has(id)) { result.push(id); present.add(id); }
  }
  return result;
}

function csvCell(value) {
  let cell = text(value);
  // Spreadsheet applications can interpret formulas even after leading whitespace.
  if (/^\s*[=+\-@]/.test(cell) || /^[\t\r\n]/.test(cell)) cell = "'" + cell;
  return '"' + cell.replaceAll('"', '""') + '"';
}

export function catalogCsv(books, usage = {}) {
  const rows = [['Book ID', 'Title', 'Author', 'Collection', 'Language', 'Format', 'Status', 'Readers', 'File bytes', 'Added at', 'Description']];
  for (const book of books) rows.push([book.id, book.title, book.author, book.category, book.language, text(book.format).toUpperCase(), book.active === false ? 'Archived' : 'Available', Math.max(0, Math.trunc(usage[book.id] || 0)), Math.max(0, Math.trunc(book.bytes || 0)), book.addedAt, book.description]);
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
