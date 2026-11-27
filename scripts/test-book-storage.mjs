import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createLibraryServer } from '../server/library-server.mjs';
import { bookFileKey, parseRange } from '../server/book-storage.mjs';
import { isMobi } from '../server/ebook-convert.mjs';
import { moveBooksToDisk } from './move-books-to-disk.mjs';
import { samplePdf, sampleEpub } from './library-fixtures.mjs';

const ADMIN = { adminId: 'LIB-ADMIN', adminPin: 'test-admin-passphrase', production: false };

/** A minimal MOBI header: a Palm database whose type/creator at byte 60 reads BOOKMOBI. */
function sampleMobi(seed = 'one') {
  const bytes = Buffer.alloc(256, 0);
  bytes.write('Kaizen test book', 0, 'latin1');
  bytes.write('BOOKMOBI', 60, 'latin1');
  bytes.write(seed, 120, 'latin1');
  return bytes;
}

async function start(config) {
  const app = await createLibraryServer({ ...ADMIN, ...config });
  await new Promise(done => app.server.listen(0, '127.0.0.1', done));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const signIn = await fetch(base + '/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employeeId: ADMIN.adminId, pin: ADMIN.adminPin }) });
  const cookie = signIn.headers.get('set-cookie').split(';')[0];
  const call = (path, init = {}) => fetch(base + path, { ...init, headers: { cookie, ...init.headers } });
  const upload = async (name, bytes) => { const response = await call('/api/admin/books?filename=' + encodeURIComponent(name), { method: 'POST', body: bytes }); return { status: response.status, data: await response.json() }; };
  return { app, base, cookie, call, upload };
}

/** Raw HTTP, so compressed replies arrive exactly as the server sent them. */
function raw(base, path, headers) {
  return new Promise((done, failed) => {
    const req = httpRequest(base + path, { headers }, res => { const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => done({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })); });
    req.on('error', failed); req.end();
  });
}

test('byte ranges, file keys and MOBI detection', () => {
  assert.equal(parseRange(undefined, 100), null);
  assert.deepEqual(parseRange('bytes=0-9', 100), { start: 0, end: 9 });
  assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=95-500', 100), { start: 95, end: 99 });
  assert.equal(parseRange('bytes=100-', 100), false);
  assert.equal(parseRange('bytes=5-2', 100), false);
  assert.equal(parseRange('items=0-9', 100), null);
  const digest = 'a'.repeat(64);
  assert.equal(bookFileKey(digest, 'pdf'), 'aa/' + digest + '.pdf');
  assert.throws(() => bookFileKey('../etc', 'pdf'));
  assert.throws(() => bookFileKey(digest, 'exe'));
  assert.equal(isMobi(sampleMobi()), true);
  assert.equal(isMobi(samplePdf()), false);
});

test('database storage sends exact byte ranges without loading whole books', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'library-storage-db-'));
  const { app, call, upload } = await start({ sqlitePath: join(folder, 'library.sqlite'), ebookConvert: false });
  try {
    const pdf = samplePdf(), { status, data } = await upload('Ranges.pdf', pdf);
    assert.equal(status, 201);
    const url = '/api/books/' + data.book.id + '/file';
    const whole = await call(url);
    assert.equal(whole.status, 200); assert.equal(whole.headers.get('accept-ranges'), 'bytes');
    assert.deepEqual(Buffer.from(await whole.arrayBuffer()), pdf);
    const first = await call(url, { headers: { range: 'bytes=0-9' } });
    assert.equal(first.status, 206); assert.equal(first.headers.get('content-range'), `bytes 0-9/${pdf.length}`);
    assert.deepEqual(Buffer.from(await first.arrayBuffer()), pdf.subarray(0, 10));
    const tail = await call(url, { headers: { range: 'bytes=-20' } });
    assert.deepEqual(Buffer.from(await tail.arrayBuffer()), pdf.subarray(pdf.length - 20));
    assert.equal((await call(url, { headers: { range: `bytes=${pdf.length}-` } })).status, 416);
    const head = await call(url, { method: 'HEAD' });
    assert.equal(Number(head.headers.get('content-length')), pdf.length);
    const health = await (await call('/api/health')).json();
    assert.equal(health.files, 'database'); assert.equal(health.convertsMobi, false);
    const mobi = await upload('Kaizen.mobi', sampleMobi());
    assert.equal(mobi.status, 415); assert.match(mobi.data.error, /Calibre/);
  } finally { await app.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('disk storage keeps books out of the database and cleans up after duplicates', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'library-storage-disk-'));
  const books = join(folder, 'books');
  const { app, call, upload } = await start({ sqlitePath: join(folder, 'library.sqlite'), booksDirectory: books, ebookConvert: false });
  try {
    const pdf = samplePdf(), first = await upload('On disk.pdf', pdf);
    assert.equal(first.status, 201);
    const [row] = await app.db.query('SELECT data,file_key,byte_size FROM library_books WHERE id=$1', [first.data.book.id]);
    assert.equal(row.data, null); assert.match(row.file_key, /^[a-f0-9]{2}\/[a-f0-9]{64}\.pdf$/); assert.equal(Number(row.byte_size), pdf.length);
    assert.ok(existsSync(join(books, row.file_key)));
    const range = await call('/api/books/' + first.data.book.id + '/file', { headers: { range: 'bytes=5-14' } });
    assert.equal(range.status, 206); assert.deepEqual(Buffer.from(await range.arrayBuffer()), pdf.subarray(5, 15));
    const again = await upload('On disk again.pdf', pdf);
    assert.equal(again.data.duplicate, true); assert.equal(again.data.book.id, first.data.book.id);
    assert.ok(existsSync(join(books, row.file_key)), 'a duplicate upload keeps the stored file');
    assert.equal((await (await call('/api/health')).json()).files, 'disk');
    rmSync(join(books, row.file_key));
    const missing = await call('/api/books/' + first.data.book.id + '/file');
    assert.equal(missing.status, 404); assert.match((await missing.json()).error, /missing on the server/);
  } finally { await app.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('MOBI books are converted to EPUB once, and repeats are skipped before converting', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'library-storage-mobi-'));
  const converter = join(folder, 'fake-ebook-convert.mjs');
  // Stands in for Calibre: writes the fixture EPUB to the output path and counts its runs.
  writeFileSync(converter, `import { appendFileSync, writeFileSync } from 'node:fs';\nimport { sampleEpub } from ${JSON.stringify(pathToFileURL(join(process.cwd(), 'scripts/library-fixtures.mjs')).href)};\nconst [input, output] = process.argv.slice(2);\nappendFileSync(${JSON.stringify(join(folder, 'runs.txt'))}, input + '\\n');\nwriteFileSync(output, sampleEpub());\n`);
  const { app, call, upload } = await start({ sqlitePath: join(folder, 'library.sqlite'), ebookConvert: { command: process.execPath, args: [converter] } });
  try {
    const created = await upload('Kaizen_Basics.azw3', sampleMobi());
    assert.equal(created.status, 201);
    assert.equal(created.data.book.format, 'epub'); assert.equal(created.data.converted, true); assert.equal(created.data.book.title, 'Kaizen Basics');
    const file = Buffer.from(await (await call('/api/books/' + created.data.book.id + '/file')).arrayBuffer());
    assert.deepEqual(file, sampleEpub());
    const repeat = await upload('Kaizen copy.mobi', sampleMobi());
    assert.equal(repeat.data.duplicate, true); assert.equal(repeat.data.book.id, created.data.book.id);
    const { readFileSync } = await import('node:fs');
    assert.equal(readFileSync(join(folder, 'runs.txt'), 'utf8').trim().split('\n').length, 1, 'the repeat was not converted again');
    const invalid = await upload('Not a book.mobi', Buffer.from('plain text pretending to be a MOBI file, long enough to pass the size check of the header'));
    assert.equal(invalid.status, 400); assert.match(invalid.data.error, /not a valid MOBI/);
    const limits = (await (await call('/api/admin/books')).json()).limits;
    assert.equal(limits.convertsMobi, true); assert.equal(limits.maxFileBytes, 50 * 1024 * 1024);
  } finally { await app.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('large catalogues are compressed, unchanged ones cost a 304, and the file limit is configurable', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'library-storage-catalog-'));
  const { app, base, cookie, upload } = await start({ sqlitePath: join(folder, 'library.sqlite'), ebookConvert: false, maxFileMb: 1 });
  try {
    for (let n = 0; n < 40; n++) {
      await app.db.query("INSERT INTO library_books(id,title,author,category,description,language,format,active,digest,byte_size,data,created_at) VALUES($1,$2,'Author','Leadership',$3,'en','pdf',1,$4,10,NULL,$5)",
        ['bulk-' + n, 'Bulk book ' + n, 'A long description. '.repeat(40), String(n).padStart(64, '0'), new Date(Date.now() - n * 1000).toISOString()]);
    }
    const compressed = await raw(base, '/api/catalog', { cookie, 'accept-encoding': 'gzip' });
    assert.equal(compressed.status, 200); assert.equal(compressed.headers['content-encoding'], 'gzip');
    const books = JSON.parse(gunzipSync(compressed.body).toString()).books;
    assert.ok(books.length >= 40);
    const etag = compressed.headers.etag;
    assert.match(etag, /^W\/"/); assert.equal(compressed.headers['cache-control'], 'private, no-cache');
    const unchanged = await raw(base, '/api/catalog', { cookie, 'if-none-match': etag });
    assert.equal(unchanged.status, 304); assert.equal(unchanged.body.length, 0);
    const plain = await raw(base, '/api/catalog', { cookie });
    assert.equal(plain.headers['content-encoding'], undefined);
    const tooLarge = await upload('Huge.pdf', Buffer.concat([samplePdf(), Buffer.alloc(1024 * 1024 + 10)]));
    assert.equal(tooLarge.status, 413); assert.match(tooLarge.data.error, /1 MB/);
  } finally { await app.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('existing database books move to disk and still open', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'library-storage-move-'));
  const sqlitePath = join(folder, 'library.sqlite'), books = join(folder, 'books');
  let session = await start({ sqlitePath, ebookConvert: false });
  const pdf = samplePdf(), epub = sampleEpub();
  const ids = [(await session.upload('Move me.pdf', pdf)).data.book.id, (await session.upload('Move me.epub', epub)).data.book.id];
  await session.app.close();
  try {
    const result = await moveBooksToDisk({ sqlitePath, directory: books, log: () => {} });
    assert.equal(result.moved, 2); assert.equal(result.bytes, pdf.length + epub.length);
    assert.equal((await moveBooksToDisk({ sqlitePath, directory: books, log: () => {} })).moved, 0, 'running it again changes nothing');
    session = await start({ sqlitePath, booksDirectory: books, ebookConvert: false });
    const rows = await session.app.db.query('SELECT id,data,file_key FROM library_books WHERE id IN ($1,$2)', ids);
    assert.ok(rows.every(row => row.data === null && row.file_key));
    assert.deepEqual(Buffer.from(await (await session.call('/api/books/' + ids[0] + '/file')).arrayBuffer()), pdf);
    assert.deepEqual(Buffer.from(await (await session.call('/api/books/' + ids[1] + '/file')).arrayBuffer()), epub);
    await session.app.close();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
