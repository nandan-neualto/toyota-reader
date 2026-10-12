import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNotesExport, notesFilename} from '../lib/personal-notes.mjs';

test('a UTF-8 export preserves multilingual notes and exact PDF bookmark locations', () => {
  const book = {title: '改善 / ಸುಧಾರಣೆ', author: 'Toyota', format: 'pdf'};
  const record = {notes: '改善を続ける。\nಮುಂದುವರಿಸಿ 📖', bookmarks: [{id: 'a', label: 'Review this', page: 39, cfi: ''}]};
  const result = buildNotesExport(book, record, '2026-10-12T12:00:00.000Z');
  const decoded = Buffer.from(result.text, 'utf8').toString('utf8');
  assert.ok(decoded.startsWith('\ufeff'));
  assert.ok(decoded.includes(record.notes));
  assert.ok(decoded.includes('1. Review this\nPage: 39'));
  assert.ok(decoded.includes('改善 / ಸುಧಾರಣೆ'));
  assert.equal(record.bookmarks[0].id, 'a');
});

test('EPUB export includes its saved CFI and does not invent PDF page numbers', () => {
  const location = 'epubcfi(/6/2!/4/2:17)';
  const result = buildNotesExport({title: 'Book', author: 'Author', format: 'epub'}, {notes: '', bookmarks: [{id: 'x', label: 'A section', page: 1, cfi: location}]});
  assert.ok(result.text.includes('EPUB location: ' + location));
  assert.ok(!result.text.includes('Page:'));
  assert.ok(result.text.includes('(No notes yet.)'));
});

test('export filenames are safe on Windows and preserve Unicode titles', () => {
  assert.equal(notesFilename('CON'), 'Book-CON-reading-notes.txt');
  assert.equal(notesFilename('../../private\\book:*?'), '..-..-private-book----reading-notes.txt');
  assert.equal(notesFilename('改善と安全'), '改善と安全-reading-notes.txt');
  assert.ok(!/[<>:"/\\|?*\u0000-\u001f]/.test(notesFilename('bad\nname\u0000')));
  assert.ok(notesFilename('A'.repeat(500)).length < 110);
  assert.ok(buildNotesExport({title: 'Empty', author: '', format: 'pdf'}, {notes: '', bookmarks: []}).text.includes('(No bookmarks yet.)'));
});
