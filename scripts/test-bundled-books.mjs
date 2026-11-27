import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLibraryServer } from '../server/library-server.mjs';

const bundled = JSON.parse(readFileSync(new URL('../lib/bundled-books.json', import.meta.url), 'utf8'));
const publicFile = url => new URL('../public' + url, import.meta.url);

test('bundled public-domain books', async t => {
  await t.test('every listed book ships as a valid EPUB or PDF with a cover and a matching digest', () => {
    assert.ok(bundled.length >= 20);
    assert.equal(new Set(bundled.map(book => book.id)).size, bundled.length);
    for (const book of bundled) {
      assert.match(book.id, /^[a-z0-9-]+$/);
      assert.ok(['epub', 'pdf'].includes(book.format), `${book.id} format`);
      assert.equal(book.url, `/books/library/${book.id}.${book.format}`);
      for (const field of ['title', 'author', 'category', 'description', 'language']) assert.ok(book[field], `${book.id} has a ${field}`);
      const bytes = readFileSync(publicFile(book.url));
      // EPUB readers need an uncompressed "mimetype" entry first.
      if (book.format === 'epub') assert.equal(bytes.subarray(0, 58).toString('latin1').slice(30), 'mimetypeapplication/epub+zip', `${book.id} is an EPUB`);
      else assert.equal(bytes.subarray(0, 5).toString(), '%PDF-', `${book.id} is a PDF`);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), book.digest, `${book.id} digest`);
      const cover = readFileSync(publicFile(book.cover));
      assert.deepEqual([...cover.subarray(0, 3)], [0xff, 0xd8, 0xff], `${book.id} cover is a JPEG`);
    }
  });

  await t.test('the server adds them once, serves their files and keeps an administrator’s changes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'toyota-bundled-test-'));
    const config = { sqlitePath: join(directory, 'library.sqlite'), adminId: 'SHELF-ADMIN', adminPin: 'shelf-admin-passphrase', production: false, ebookConvert: false };
    let app = await createLibraryServer(config);
    const listen = async () => { await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); return 'http://127.0.0.1:' + app.server.address().port; };
    try {
      let base = await listen();
      const signIn = async () => (await fetch(base + '/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employeeId: 'SHELF-ADMIN', pin: 'shelf-admin-passphrase' }) })).headers.get('set-cookie').split(';')[0];
      let cookie = await signIn();
      const catalog = async () => (await (await fetch(base + '/api/catalog', { headers: { cookie } })).json()).books;
      const books = await catalog();
      for (const book of bundled) {
        const entry = books.find(item => item.id === book.id);
        assert.ok(entry, `${book.id} is in the catalogue`);
        assert.equal(entry.cover, book.cover);
        assert.equal(entry.format, book.format);
      }
      // Every bundled file is served to signed-in readers, PDFs and EPUBs alike.
      for (const book of bundled) {
        const response = await fetch(base + `/api/books/${book.id}/file`, { headers: { cookie } });
        assert.equal(response.status, 200, book.id);
        assert.equal(response.headers.get('content-type'), book.format === 'pdf' ? 'application/pdf' : 'application/epub+zip');
        await response.arrayBuffer();
      }
      const first = bundled.find(book => book.format === 'epub');
      const file = await fetch(base + `/api/books/${first.id}/file`, { headers: { cookie } });
      assert.equal(file.status, 200);
      assert.equal(file.headers.get('content-type'), 'application/epub+zip');
      assert.equal(createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'), first.digest);

      // Uploading the identical file is recognised as a book the library already has.
      const duplicate = await fetch(base + `/api/admin/books?filename=${first.id}.epub`, { method: 'POST', headers: { cookie }, body: readFileSync(publicFile(first.url)) });
      assert.equal(duplicate.status, 200);
      const repeat = await duplicate.json();
      assert.equal(repeat.duplicate, true);
      assert.equal(repeat.book.id, first.id);

      const archived = { ...books.find(item => item.id === first.id), title: 'Renamed by the administrator', active: false };
      assert.equal((await fetch(base + `/api/admin/books/${first.id}`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(archived) })).status, 200);
      await app.close();
      app = await createLibraryServer(config);
      base = await listen();
      cookie = await signIn();
      const after = await catalog();
      assert.equal(after.some(item => item.id === first.id), false, 'an archived book stays archived after a restart');
      assert.equal(after.filter(item => bundled.some(book => book.id === item.id)).length, bundled.length - 1);
    } finally {
      await app.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
