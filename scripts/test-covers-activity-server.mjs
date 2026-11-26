import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createLibraryServer } from '../server/library-server.mjs';
import { samplePdf } from './library-fixtures.mjs';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 7), Buffer.from([0xff, 0xd9])]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);

test('book covers and reading activity on a library created before they existed', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'toyota-covers-test-'));
  const sqlitePath = join(directory, 'library.sqlite');
  // The first release's book table had no cover image columns.
  const legacy = new DatabaseSync(sqlitePath);
  legacy.exec(`CREATE TABLE library_books (id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL, language TEXT NOT NULL, format TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, digest TEXT UNIQUE NOT NULL, byte_size INTEGER NOT NULL, data BLOB, source_url TEXT, cover TEXT, pages INTEGER, created_at TEXT NOT NULL)`);
  legacy.close();
  const app = await createLibraryServer({ sqlitePath, adminId: 'COVER-ADMIN', adminPin: 'cover-admin-passphrase', production: false });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const request = async (path, { cookie, body, raw, ...init } = {}) => {
    const response = await fetch(base + path, { ...init, headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined && !raw ? { 'content-type': 'application/json' } : {}), ...init.headers }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
    const type = response.headers.get('content-type') || '';
    return { status: response.status, headers: response.headers, cookie: response.headers.get('set-cookie')?.split(';')[0], data: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
  };
  const signIn = async (employeeId, pin) => (await request('/api/session', { method: 'POST', body: { employeeId, pin } })).cookie;
  try {
    const admin = await signIn('COVER-ADMIN', 'cover-admin-passphrase');
    await request('/api/admin/employees', { method: 'POST', cookie: admin, body: { employees: [{ employeeId: 'READER-1', name: 'Reader', pin: 'reader-passphrase' }] } });
    const reader = await signIn('READER-1', 'reader-passphrase');
    const book = (await request('/api/admin/books?filename=Covered.pdf', { method: 'POST', cookie: admin, raw: true, body: samplePdf() })).data.book;

    await t.test('existing databases gain the cover columns on startup', async () => {
      const columns = (await app.db.query("SELECT name FROM pragma_table_info('library_books')")).map(row => row.name);
      assert.ok(columns.includes('cover_data') && columns.includes('cover_type'));
      assert.equal(book.cover, undefined);
    });

    await t.test('administrators upload a JPEG, PNG or WebP cover; others cannot', async () => {
      assert.equal((await request(`/api/admin/books/${book.id}/cover`, { method: 'PUT', cookie: reader, raw: true, body: jpeg })).status, 403);
      const invalid = await request(`/api/admin/books/${book.id}/cover`, { method: 'PUT', cookie: admin, raw: true, body: Buffer.from('<svg onload="alert(1)"></svg>') });
      assert.equal(invalid.status, 400);
      assert.equal((await request('/api/admin/books/missing-book/cover', { method: 'PUT', cookie: admin, raw: true, body: jpeg })).status, 404);
      const saved = await request(`/api/admin/books/${book.id}/cover`, { method: 'PUT', cookie: admin, raw: true, body: png });
      assert.equal(saved.status, 200);
      assert.match(saved.data.book.cover, new RegExp(`^/api/books/${book.id}/cover\\?v=[a-f0-9]{12}$`));
      const replaced = await request(`/api/admin/books/${book.id}/cover`, { method: 'PUT', cookie: admin, raw: true, body: jpeg });
      assert.notEqual(replaced.data.book.cover, saved.data.book.cover);
      const catalog = await request('/api/catalog', { cookie: reader });
      assert.equal(catalog.data.books.find(entry => entry.id === book.id).cover, replaced.data.book.cover);
    });

    await t.test('signed-in readers receive a long-cached cover; archived covers stay private', async () => {
      const cover = await request(`/api/books/${book.id}/cover`, { cookie: reader });
      assert.equal(cover.status, 200);
      assert.equal(cover.headers.get('content-type'), 'image/jpeg');
      assert.match(cover.headers.get('cache-control'), /immutable/);
      assert.deepEqual(cover.data, jpeg);
      assert.equal((await request(`/api/books/${book.id}/cover`)).status, 401);
      await request(`/api/admin/books/${book.id}`, { method: 'PUT', cookie: admin, body: { ...book, active: false } });
      assert.equal((await request(`/api/books/${book.id}/cover`, { cookie: reader })).status, 404);
      assert.equal((await request(`/api/books/${book.id}/cover`, { cookie: admin })).status, 200);
      await request(`/api/admin/books/${book.id}`, { method: 'PUT', cookie: admin, body: { ...book, active: true } });
    });

    await t.test('reading activity is validated, merged by day and kept by older clients', async () => {
      const save = (version, mutationId, record) => request('/api/reading/' + book.id, { method: 'PUT', cookie: reader, body: { expectedVersion: version, mutationId, record } });
      const first = await save(0, 'activity-1', { page: 1, total: 3, started: true, activity: { '2026-11-24': 600, '2026-11-25': 120 } });
      assert.equal(first.status, 200);
      assert.deepEqual(first.data.record.activity, { '2026-11-24': 600, '2026-11-25': 120 });
      assert.equal((await save(1, 'bad-date', { activity: { '2026-02-30': 60 } })).status, 400);
      assert.equal((await save(1, 'bad-seconds', { activity: { '2026-11-24': -5 } })).status, 400);
      // Another device reports a smaller total for one day and a new day.
      const second = await save(1, 'activity-2', { page: 2, total: 3, started: true, activity: { '2026-11-24': 300, '2026-11-26': 900 } });
      assert.deepEqual(second.data.record.activity, { '2026-11-24': 600, '2026-11-25': 120, '2026-11-26': 900 });
      const legacy = await save(2, 'legacy-client', { page: 3, total: 3, started: true });
      assert.deepEqual(legacy.data.record.activity, { '2026-11-24': 600, '2026-11-25': 120, '2026-11-26': 900 });
      const profile = await request('/api/profile', { cookie: reader });
      assert.deepEqual(profile.data.records[book.id].activity, legacy.data.record.activity);
      assert.equal((await request('/api/profile', { cookie: admin })).data.records[book.id], undefined);
    });
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
