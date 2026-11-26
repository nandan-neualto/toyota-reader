import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLibraryServer } from '../server/library-server.mjs';
import { samplePdf } from './library-fixtures.mjs';

test('static app files are cached, compressed and protected', async t => {
  const root = mkdtempSync(join(tmpdir(), 'toyota-static-test-'));
  const script = 'console.log("Toyota library");\n'.repeat(200);
  mkdirSync(join(root, '_next', 'static', 'chunks'), { recursive: true });
  mkdirSync(join(root, 'books'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Library</title>' + '<p>Welcome</p>'.repeat(200));
  writeFileSync(join(root, '404.html'), '<!doctype html><title>Not found</title><h1>This page is not on the shelf.</h1>');
  writeFileSync(join(root, 'sw.js'), script);
  writeFileSync(join(root, '_next', 'static', 'chunks', 'app-1234.js'), script);
  writeFileSync(join(root, 'books', 'sample.pdf'), samplePdf());
  const app = await createLibraryServer({ sqlitePath: ':memory:', staticRoot: root, production: false, adminId: 'STATIC-ADMIN', adminPin: 'static-test-passphrase' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  try {
    await t.test('the app shell revalidates and carries a content security policy', async () => {
      const response = await fetch(base + '/');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-cache');
      assert.match(response.headers.get('content-security-policy'), /object-src 'none'/);
      assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self'/);
      assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
      assert.match(response.headers.get('permissions-policy'), /camera=\(\)/);
      const etag = response.headers.get('etag');
      assert.ok(etag);
      await response.arrayBuffer();
      const cached = await fetch(base + '/', { headers: { 'if-none-match': etag } });
      assert.equal(cached.status, 304);
    });

    await t.test('hashed bundles are immutable and compressed with Brotli or gzip', async () => {
      for (const encoding of ['br', 'gzip']) {
        const response = await fetch(base + '/_next/static/chunks/app-1234.js', { headers: { 'accept-encoding': encoding } });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-encoding'), encoding);
        assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
        assert.equal(response.headers.get('vary'), 'Accept-Encoding');
        assert.equal(await response.text(), script);
      }
      const plain = await fetch(base + '/_next/static/chunks/app-1234.js', { headers: { 'accept-encoding': 'identity' } });
      assert.equal(plain.headers.get('content-encoding'), null);
      assert.equal(await plain.text(), script);
      const refused = await fetch(base + '/sw.js', { headers: { 'accept-encoding': 'br;q=0, gzip' } });
      assert.equal(refused.headers.get('content-encoding'), 'gzip');
      assert.equal(refused.headers.get('cache-control'), 'no-cache');
      await refused.arrayBuffer();
    });

    await t.test('book files support byte ranges for progressive loading', async () => {
      const response = await fetch(base + '/books/sample.pdf', { headers: { range: 'bytes=0-4' } });
      assert.equal(response.status, 206);
      assert.equal(await response.text(), '%PDF-');
      assert.match(response.headers.get('content-range'), /^bytes 0-4\/\d+$/);
      const invalid = await fetch(base + '/books/sample.pdf', { headers: { range: 'bytes=999999-' } });
      assert.equal(invalid.status, 416);
      await invalid.arrayBuffer();
    });

    await t.test('unknown pages use the not-found page; traversal is refused', async () => {
      const page = await fetch(base + '/missing-shelf', { headers: { accept: 'text/html' } });
      assert.equal(page.status, 404);
      assert.match(await page.text(), /not on the shelf/);
      const file = await fetch(base + '/missing.js');
      assert.equal(file.status, 404);
      assert.equal((await file.json()).error, 'File unavailable.');
      const traversal = await fetch(base + '/%2e%2e%2fpackage.json');
      assert.equal(traversal.status, 403);
      await traversal.arrayBuffer();
    });

    await t.test('oversized JSON requests report a clear limit', async () => {
      const response = await fetch(base + '/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employeeId: 'X'.repeat(300 * 1024), pin: 'x' }) });
      assert.equal(response.status, 413);
      assert.equal((await response.json()).error, 'Request is too large.');
    });
  } finally {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});
