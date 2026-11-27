// Moves book files stored in the database to LIBRARY_BOOKS_DIR, one book at a time, then clears them from the database.
// Run it once after setting LIBRARY_BOOKS_DIR; it is safe to stop and run again. With PostgreSQL, run VACUUM FULL
// on library_books afterwards to give the freed space back to the disk.
import { openDatabase } from '../server/database.mjs';
import { createBookStore } from '../server/book-storage.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function moveBooksToDisk({ databaseUrl = process.env.DATABASE_URL, sqlitePath = process.env.LIBRARY_SQLITE_PATH, directory = process.env.LIBRARY_BOOKS_DIR, log = console.log } = {}) {
  if (!directory) throw new Error('Set LIBRARY_BOOKS_DIR to the folder that should hold the book files.');
  const db = await openDatabase({ databaseUrl, sqlitePath });
  const store = createBookStore({ db, directory });
  let moved = 0, bytes = 0;
  try {
    const pending = await db.query('SELECT id,title,digest,format FROM library_books WHERE data IS NOT NULL AND file_key IS NULL ORDER BY created_at');
    for (const book of pending) {
      const [row] = await db.query('SELECT data FROM library_books WHERE id=$1 AND file_key IS NULL', [book.id]);
      if (!row?.data) continue;
      const data = Buffer.from(row.data);
      const { fileKey } = await store.save(data, book.digest, book.format);
      await db.query('UPDATE library_books SET file_key=$1,data=NULL WHERE id=$2 AND file_key IS NULL', [fileKey, book.id]);
      moved++; bytes += data.length;
      log(`Moved ${moved}/${pending.length}: ${book.title}`);
    }
  } finally { await db.close(); }
  log(moved ? `Moved ${moved} books (${(bytes / 1024 / 1024).toFixed(1)} MB) to ${store.root}.` : 'No books needed moving.');
  return { moved, bytes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  moveBooksToDisk().catch(error => { console.error(error.message); process.exit(1); });
}
