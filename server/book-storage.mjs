// Book files live in the database (default) or, when LIBRARY_BOOKS_DIR is set, on the server's disk.
// Either way a reader's request sends only the bytes asked for, so large books never load whole into memory.
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';

const CHUNK = 1024 * 1024;
export const BOOK_TYPES = { pdf: 'application/pdf', epub: 'application/epub+zip' };

/** Files are named by their SHA-256 digest and spread over 256 folders. */
export function bookFileKey(digest, format) {
  if (!/^[a-f0-9]{64}$/.test(digest) || !BOOK_TYPES[format]) throw new Error('Invalid book file key.');
  return `${digest.slice(0, 2)}/${digest}.${format}`;
}

/** Parses a single "bytes=start-end" or "bytes=-suffix" range. null = whole file, false = unsatisfiable. */
export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!suffix || !size) return false;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]), end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return start > end || start >= size ? false : { start, end };
}

export function createBookStore({ db, directory } = {}) {
  const root = directory ? resolve(directory) : null;
  const pathFor = key => {
    const target = resolve(root, key);
    if (!target.startsWith(root + sep)) throw new Error('Invalid book path.');
    return target;
  };

  async function save(bytes, digest, format) {
    if (!root) return { fileKey: null, data: bytes };
    const key = bookFileKey(digest, format), target = pathFor(key), temporary = `${target}.${randomUUID()}.part`;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, target);
    return { fileKey: key, data: null };
  }

  /** Removes a stored file that no book row points at, after a failed or duplicate upload. */
  async function discard(fileKey) {
    if (!root || !fileKey) return;
    const [used] = await db.query('SELECT id FROM library_books WHERE file_key=$1', [fileKey]);
    if (!used) await unlink(pathFor(fileKey)).catch(() => {});
  }

  async function readDatabaseChunk(id, start, length) {
    const [row] = await db.query('SELECT substr(data,$2,$3) AS chunk FROM library_books WHERE id=$1', [id, start + 1, length]);
    return row?.chunk ? Buffer.from(row.chunk) : Buffer.alloc(0);
  }

  /** Sends a book with byte-range support. `book` needs id, format, byte_size and file_key. */
  async function send(req, res, book) {
    const type = BOOK_TYPES[book.format] || 'application/octet-stream';
    let size = Number(book.byte_size) || 0, path = null;
    if (book.file_key) {
      if (!root) throw Object.assign(new Error('This book is stored on disk, but LIBRARY_BOOKS_DIR is not set on the server.'), { status: 503 });
      path = pathFor(book.file_key);
      const info = await stat(path).catch(() => null);
      if (!info?.isFile()) throw Object.assign(new Error('This book file is missing on the server. Ask the library administrator to upload it again.'), { status: 404 });
      size = info.size;
    }
    res.setHeader('Content-Type', type); res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Accept-Ranges', 'bytes');
    const range = parseRange(req.headers.range, size);
    if (range === false) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    const start = range ? range.start : 0, end = range ? range.end : size - 1;
    if (range) { res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`); }
    res.setHeader('Content-Length', Math.max(0, end - start + 1));
    if (req.method === 'HEAD' || size === 0) return res.end();
    if (path) {
      await new Promise((done, failed) => {
        const stream = createReadStream(path, { start, end });
        stream.on('error', error => { res.destroy(); failed(error); });
        res.on('close', () => { stream.destroy(); done(); });
        stream.pipe(res);
      });
      return;
    }
    // Database books are read one megabyte at a time, waiting for the network when the client is slow.
    for (let offset = start; offset <= end && !res.destroyed; offset += CHUNK) {
      const chunk = await readDatabaseChunk(book.id, offset, Math.min(CHUNK, end - offset + 1));
      if (!chunk.length) break;
      if (!res.write(chunk)) await new Promise(done => { res.once('drain', done); res.once('close', done); });
    }
    res.end();
  }

  return { mode: root ? 'disk' : 'database', root, save, discard, send, pathFor };
}
