const oneLine = value => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();

export function notesFilename(title) {
  let name = String(title || 'Book').normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-').replace(/\s+/g, ' ').trim();
  name = Array.from(name).slice(0, 80).join('').replace(/[. ]+$/g, '') || 'Book';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = 'Book-' + name;
  return name + '-reading-notes.txt';
}

export function buildNotesExport(book, record, exportedAt = new Date().toISOString()) {
  const lines = [
    'PERSONAL READING NOTES',
    oneLine(book.title),
    oneLine(book.author),
    'Format: ' + String(book.format).toUpperCase(),
    'Exported: ' + oneLine(exportedAt),
    '',
    'PRIVATE NOTES',
    record.notes || '(No notes yet.)',
    '',
    'BOOKMARKS (' + record.bookmarks.length + ')',
  ];
  if (!record.bookmarks.length) lines.push('(No bookmarks yet.)');
  record.bookmarks.forEach((mark, index) => {
    lines.push('', (index + 1) + '. ' + oneLine(mark.label));
    lines.push(book.format === 'pdf' ? 'Page: ' + mark.page : 'EPUB location: ' + (mark.cfi || '(Unavailable)'));
  });
  return { filename: notesFilename(book.title), text: '\ufeff' + lines.join('\n') + '\n' };
}
