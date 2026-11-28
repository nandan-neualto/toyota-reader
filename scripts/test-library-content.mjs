import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLibraryServer } from '../server/library-server.mjs';
import { activeAnnouncements, cleanContent, collectionDescription, defaultContent, orderCollections, renameCollectionContent } from '../lib/library-content.mjs';
import { summarizeLibrary } from '../lib/library-insights.mjs';
import { samplePdf } from './library-fixtures.mjs';

const announcement = (id, extra = {}) => ({ id, title: 'Reading week', message: 'Join us.', ...extra });

test('library content rules', async t => {
  await t.test('content is trimmed and validated, with clear messages', () => {
    const content = cleanContent({ welcome: '  Read  something  new  ', announcements: [announcement('a1', { tone: 'important', startsOn: '2026-12-01', endsOn: '2026-12-07' })], picks: { title: '', bookIds: ['b1', 'b1', 'b2'] }, collections: [{ name: ' Japan ', description: 'Culture\n\n\n\nand ideas' }] });
    assert.equal(content.welcome, 'Read something new');
    assert.equal(content.announcements[0].tone, 'important');
    assert.deepEqual(content.picks, { title: 'Staff picks', bookIds: ['b1', 'b2'] });
    assert.deepEqual(content.collections, [{ name: 'Japan', description: 'Culture\n\nand ideas' }]);
    assert.throws(() => cleanContent({ announcements: [announcement('a1', { title: ' ' })] }), /Add an announcement title/);
    assert.throws(() => cleanContent({ announcements: [announcement('a1', { startsOn: '2026-12-08', endsOn: '2026-12-01' })] }), /cannot end before it starts/);
    assert.throws(() => cleanContent({ announcements: [announcement('a1', { startsOn: '2026-02-30' })] }), /valid start date/);
    assert.throws(() => cleanContent({ announcements: [announcement('a1'), announcement('a1')] }), /Invalid announcement/);
    assert.throws(() => cleanContent({ collections: [{ name: 'Japan' }, { name: 'japan' }] }), /listed twice/);
    assert.throws(() => cleanContent({ picks: { bookIds: ['../etc'] } }), /Choose a book/);
    assert.throws(() => cleanContent({ announcements: Array.from({ length: 11 }, (_, i) => announcement('a' + i)) }), /at most 10/);
  });
  await t.test('announcements show only between their start and end days', () => {
    const content = cleanContent({ announcements: [announcement('now'), announcement('later', { startsOn: '2026-12-10' }), announcement('over', { endsOn: '2026-11-30' }), announcement('today', { startsOn: '2026-12-01', endsOn: '2026-12-01' })] });
    assert.deepEqual(activeAnnouncements(content, '2026-12-01').map(item => item.id), ['now', 'today']);
  });
  await t.test('collections follow the chosen order, and renaming merges notes', () => {
    const content = { ...defaultContent(), collections: [{ name: 'Japan', description: '' }, { name: 'Engines', description: 'How engines work' }] };
    assert.deepEqual(orderCollections(['Character', 'Engines', 'Art', 'Japan'], content), ['Japan', 'Engines', 'Art', 'Character']);
    assert.equal(collectionDescription('Engines', content), 'How engines work');
    assert.deepEqual(renameCollectionContent(content, 'Engines', 'Machines').collections.map(item => item.name), ['Japan', 'Machines']);
    assert.deepEqual(renameCollectionContent(content, 'Engines', 'Japan').collections, [{ name: 'Japan', description: 'How engines work' }]);
  });
  await t.test('insights count readers and minutes in the period without naming anyone', () => {
    const books = [{ id: 'b1', title: 'One', author: 'A', category: 'Japan', active: true }, { id: 'b2', title: 'Two', author: 'B', category: 'Engines', active: true }];
    const users = [{ id: 'u1', active: true }, { id: 'u2', active: true }, { id: 'u3', active: true }, { id: 'u4', active: false }];
    const rows = [
      { userId: 'u1', bookId: 'b1', record: { started: true, completed: true, activity: { '2026-12-01': 600, '2026-10-01': 6000 } } },
      { userId: 'u2', bookId: 'b1', record: { started: true, activity: { '2026-11-30': 300 } } },
      { userId: 'u2', bookId: 'b2', record: { started: true, activity: { '2026-12-01': 120 } } },
    ];
    const report = summarizeLibrary({ rows, users, books, today: '2026-12-01', days: 7 });
    assert.equal(report.since, '2026-11-25');
    assert.equal(report.daily.length, 7);
    assert.deepEqual(report.daily.at(-1), { date: '2026-12-01', minutes: 12, readers: 2 });
    assert.deepEqual(report.totals, { employees: 3, activeReaders: 2, minutes: 17, booksStarted: 3, booksCompleted: 1, neverStarted: 1, availableBooks: 2 });
    assert.deepEqual(report.topBooks.map(book => [book.id, book.readers, book.minutes]), [['b1', 2, 15], ['b2', 1, 2]]);
    assert.deepEqual(report.collections, [{ name: 'Japan', minutes: 15, readers: 2 }, { name: 'Engines', minutes: 2, readers: 1 }]);
    assert.ok(!JSON.stringify(report).includes('u1'));
  });
});

test('library content, collections, insights and the activity log on the server', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'toyota-content-test-'));
  const app = await createLibraryServer({ sqlitePath: join(directory, 'library.sqlite'), adminId: 'CMS-ADMIN', adminPin: 'cms-admin-passphrase', adminName: 'Asha Admin', production: false, ebookConvert: false });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const request = async (path, { cookie, body, raw, ...init } = {}) => {
    const response = await fetch(base + path, { ...init, headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined && !raw ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data: await response.json() };
  };
  const signIn = async (employeeId, pin) => (await request('/api/session', { method: 'POST', body: { employeeId, pin } })).cookie;
  try {
    const admin = await signIn('CMS-ADMIN', 'cms-admin-passphrase');
    await request('/api/admin/employees', { method: 'POST', cookie: admin, body: { employees: [{ employeeId: 'READER-7', name: 'Ravi Reader', pin: 'reader-passphrase' }] } });
    const reader = await signIn('READER-7', 'reader-passphrase');
    const uploaded = (await request('/api/admin/books?filename=Kaizen%20Notes.pdf&category=Lean', { method: 'POST', cookie: admin, raw: true, body: samplePdf() })).data.book;

    await t.test('readers get default content until an administrator saves some', async () => {
      const response = await request('/api/content', { cookie: reader });
      assert.equal(response.status, 200);
      assert.equal(response.data.version, 0);
      assert.deepEqual(response.data.content, defaultContent());
      assert.equal((await request('/api/content')).status, 401);
    });

    await t.test('only administrators save content, and stale versions are refused', async () => {
      const content = { welcome: 'New books every month.', announcements: [announcement('week', { bookId: uploaded.id })], picks: { title: 'This month', bookIds: [uploaded.id, 'the-book-of-tea'] }, collections: [{ name: 'Lean', description: 'Toyota Production System ideas' }] };
      assert.equal((await request('/api/admin/content', { method: 'PUT', cookie: reader, body: { expectedVersion: 0, content } })).status, 403);
      const saved = await request('/api/admin/content', { method: 'PUT', cookie: admin, body: { expectedVersion: 0, content } });
      assert.equal(saved.status, 200);
      assert.equal(saved.data.version, 1);
      assert.equal((await request('/api/content', { cookie: reader })).data.content.picks.title, 'This month');
      const stale = await request('/api/admin/content', { method: 'PUT', cookie: admin, body: { expectedVersion: 0, content: { ...content, welcome: 'Overwritten' } } });
      assert.equal(stale.status, 409);
      assert.equal(stale.data.version, 1);
      assert.equal(stale.data.content.welcome, 'New books every month.');
      const invalid = await request('/api/admin/content', { method: 'PUT', cookie: admin, body: { expectedVersion: 1, content: { announcements: [announcement('x', { title: '' })] } } });
      assert.equal(invalid.status, 400);
      assert.match(invalid.data.error, /announcement title/);
    });

    await t.test('archived or unknown books cannot be featured', async () => {
      await request('/api/admin/books/' + uploaded.id, { method: 'PUT', cookie: admin, body: { ...uploaded, active: false } });
      const response = await request('/api/admin/content', { method: 'PUT', cookie: admin, body: { expectedVersion: 1, content: { picks: { bookIds: [uploaded.id] } } } });
      assert.equal(response.status, 400);
      assert.match(response.data.error, /archived or no longer in the catalogue/);
      assert.equal((await request('/api/admin/content', { method: 'PUT', cookie: admin, body: { expectedVersion: 1, content: { picks: { bookIds: ['no-such-book'] } } } })).status, 400);
      await request('/api/admin/books/' + uploaded.id, { method: 'PUT', cookie: admin, body: { ...uploaded, active: true } });
    });

    await t.test('renaming a collection moves its books and keeps its note', async () => {
      const renamed = await request('/api/admin/collections/rename', { method: 'POST', cookie: admin, body: { from: 'Lean', to: 'Lean thinking' } });
      assert.equal(renamed.status, 200);
      assert.equal(renamed.data.moved, 1);
      assert.deepEqual(renamed.data.content.collections, [{ name: 'Lean thinking', description: 'Toyota Production System ideas' }]);
      const catalog = (await request('/api/catalog', { cookie: reader })).data.books;
      assert.equal(catalog.find(book => book.id === uploaded.id).category, 'Lean thinking');
      assert.equal((await request('/api/content', { cookie: reader })).data.version, 2);
      assert.equal((await request('/api/admin/collections/rename', { method: 'POST', cookie: reader, body: { from: 'Lean thinking', to: 'X' } })).status, 403);
    });

    await t.test('insights report reading in the chosen period', async () => {
      const today = new Date().toISOString().slice(0, 10);
      await request('/api/reading/' + uploaded.id, { method: 'PUT', cookie: reader, body: { expectedVersion: 0, mutationId: 'cms-read-1', record: { page: 2, total: 3, started: true, activity: { [today]: 900 } } } });
      const report = await request(`/api/admin/insights?days=7&today=${today}`, { cookie: admin });
      assert.equal(report.status, 200);
      assert.equal(report.data.days, 7);
      assert.equal(report.data.totals.activeReaders, 1);
      assert.equal(report.data.totals.minutes, 15);
      assert.equal(report.data.topBooks[0].id, uploaded.id);
      assert.equal((await request('/api/admin/insights', { cookie: reader })).status, 403);
      assert.equal((await request('/api/admin/insights?days=365', { cookie: admin })).data.days, 30);
    });

    await t.test('the activity log records who changed what, newest first', async () => {
      const readerUser = (await request('/api/admin/employees', { cookie: admin })).data.employees.find(user => user.employeeId === 'READER-7');
      await request('/api/admin/employees/' + readerUser.id, { method: 'PUT', cookie: admin, body: { active: false } });
      const log = await request('/api/admin/activity?limit=50', { cookie: admin });
      assert.equal(log.status, 200);
      const actions = log.data.entries.map(entry => entry.action);
      assert.deepEqual(actions, ['employee.pause', 'collection.rename', 'book.restore', 'book.archive', 'content.update', 'book.add', 'employee.add']);
      assert.equal(log.data.entries[0].actor, 'Asha Admin (CMS-ADMIN)');
      assert.equal(log.data.entries[0].target, 'Ravi Reader (READER-7)');
      assert.equal(log.data.entries[1].target, 'Lean → Lean thinking');
      const older = await request('/api/admin/activity?limit=2&before=' + encodeURIComponent(log.data.entries[1].at), { cookie: admin });
      assert.equal(older.data.entries.length, 2);
      assert.equal(older.data.more, true);
      assert.equal((await request('/api/admin/activity?before=yesterday', { cookie: admin })).status, 400);
    });
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
