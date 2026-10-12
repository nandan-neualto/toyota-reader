import type {BookEntry} from './catalog';
import type {ReadingRecord} from './employee-library';
export function notesFilename(title: string): string;
export function buildNotesExport(book: Pick<BookEntry, 'title' | 'author' | 'format'>, record: Pick<ReadingRecord, 'notes' | 'bookmarks'>, exportedAt?: string): {filename: string; text: string};
