import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { brotliCompress, gzip, constants as zlibConstants } from 'node:zlib';
import { openDatabase } from './database.mjs';
import { clientAddress } from './client-address.mjs';
import { BOOK_TYPES, createBookStore } from './book-storage.mjs';
import { CONVERTIBLE, createConverter, findConverter, isMobi } from './ebook-convert.mjs';
import {normalizeReadRanges,mergeReadingHistory} from '../lib/reading-progress.mjs';
import {cleanReadingPlan} from '../lib/reading-plans.mjs';
import {cleanActivity} from '../lib/reading-activity.mjs';
import {cleanContent,defaultContent,renameCollectionContent} from '../lib/library-content.mjs';
import {summarizeLibrary} from '../lib/library-insights.mjs';

// Public-domain books shipped in public/books/library; the reader uses the same list for guests.
const bundledBooks = JSON.parse(readFileSync(new URL('../lib/bundled-books.json', import.meta.url), 'utf8'));
const derive = promisify(scrypt), now = () => new Date().toISOString(), gzipAsync = promisify(gzip), brotliAsync = promisify(brotliCompress);
const hash = value => createHash('sha256').update(value).digest('hex');
const publicUser = row => ({ id: row.id, employeeId: row.employee_id, name: row.name, role: row.role, active: !!row.active });
const publicBook = row => ({ id: row.id, title: row.title, author: row.author, category: row.category, description: row.description, language: row.language, format: row.format, active: !!row.active, bytes: row.byte_size, pages: row.pages || undefined, cover: row.cover || undefined, url: `/api/books/${row.id}/file`, addedAt: row.created_at });
const bookColumns = 'id,title,author,category,description,language,format,active,byte_size,pages,cover,created_at';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function string(value, name, max = 200, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, `Enter a valid ${name}.`);
  return value.trim();
}
function employeeId(value) { const id = string(value, 'employee ID', 40).toUpperCase(); if (!/^[A-Z0-9._-]{2,40}$/.test(id)) fail(400, 'Employee IDs must be 2–40 letters, numbers, dots, hyphens or underscores.'); return id; }
function pin(value) { if (typeof value !== 'string' || value.length < 6 || value.length > 128) fail(400, 'Use a PIN or passphrase of at least 6 characters.'); return value; }
async function pinHash(value) { const salt = randomBytes(16).toString('hex'); return salt + ':' + (await derive(value, salt, 64)).toString('hex'); }
async function verifyPin(value, stored) { const [salt, expected] = stored.split(':'); const candidate = await derive(value, salt, 64); return timingSafeEqual(Buffer.from(expected, 'hex'), candidate); }
// Large replies (the catalogue of a big library) are compressed; with etag, an unchanged reply costs a 304.
async function send(res, status, data, headers = {}, { etag = false } = {}) {
  const text = JSON.stringify(data), req = res.req;
  const head = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers };
  if (etag && status === 200) {
    const tag = 'W/"' + createHash('sha1').update(text).digest('base64url') + '"';
    head.ETag = tag; head['Cache-Control'] = 'private, no-cache';
    if (String(req?.headers['if-none-match'] || '').split(',').map(value => value.trim()).includes(tag)) { res.writeHead(304, { ETag: tag, 'Cache-Control': head['Cache-Control'] }); return res.end(); }
  }
  const encoding = text.length > 16384 ? acceptedEncoding(req?.headers['accept-encoding']) : null;
  if (encoding) {
    const bytes = encoding === 'br' ? await brotliAsync(text, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } }) : await gzipAsync(text, { level: 6 });
    res.writeHead(status, { ...head, 'Content-Encoding': encoding, Vary: 'Accept-Encoding', 'Content-Length': bytes.length });
    return res.end(bytes);
  }
  res.writeHead(status, head); res.end(text);
}
async function body(req, limit = 256 * 1024, raw = false) {
  if (Number(req.headers['content-length']) > limit) { req.resume(); fail(413, raw ? `File exceeds the ${Math.round(limit / 1024 / 1024)} MB limit.` : 'Request is too large.'); }
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) fail(413, 'Request is too large.'); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  if (raw) return bytes;
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail(400, 'Invalid request body.'); }
}
function validateBook(bytes, format) {
  if (bytes.length < 10) fail(400, 'This file is empty or incomplete.');
  if (format === 'pdf') {
    if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-')) || !bytes.subarray(Math.max(0, bytes.length - 65536)).includes(Buffer.from('%%EOF'))) fail(400, 'This file is not a complete PDF.');
  } else if (format === 'epub') {
    // Check ZIP central-directory filenames; a ZIP renamed to EPUB is not accepted.
    const names = [];
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (bytes.readUInt32LE(i) !== 0x06054b50) continue;
      let p = bytes.readUInt32LE(i + 16); const count = bytes.readUInt16LE(i + 10);
      for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
        if (bytes.readUInt32LE(p) !== 0x02014b50) break;
        const length = bytes.readUInt16LE(p + 28);
        names.push(bytes.subarray(p + 46, p + 46 + length).toString());
        p += 46 + length + bytes.readUInt16LE(p + 30) + bytes.readUInt16LE(p + 32);
      }
      break;
    }
    if (!names.includes('mimetype') || !names.includes('META-INF/container.xml')) fail(400, 'This file is not a valid EPUB.');
  } else fail(400, 'Choose PDF, EPUB or MOBI files.');
}
function imageType(bytes) {
  if (bytes.length > 8 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length > 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
function cleanRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Invalid reading record.');
  const page = Number(input.page ?? 1), total = Number(input.total ?? 0), percent = Number(input.percent ?? 0);
  if (!Number.isInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(total) || total < 0 || total > 1000000 || !Number.isFinite(percent) || percent < 0 || percent > 100) fail(400, 'Invalid reading position.');
  const cfi = string(input.cfi ?? '', 'EPUB position', 2048, false);
  if (cfi && !/^epubcfi\([\s\S]+\)$/.test(cfi)) fail(400, 'Invalid EPUB position.');
  const bookmarks = input.bookmarks ?? [];
  if (!Array.isArray(bookmarks) || bookmarks.length > 100) fail(400, 'Use at most 100 bookmarks per book.');
  let plan;try{plan=cleanReadingPlan(input);}catch(error){fail(400,error.message);}
  const tracking={};
  if(input.readRanges!==undefined){try{tracking.readRanges=normalizeReadRanges(input.readRanges,total);}catch{fail(400,'Invalid page coverage.');}}
  if(input.furthestPage!==undefined){if(!Number.isInteger(input.furthestPage)||input.furthestPage<0||input.furthestPage>1000000)fail(400,'Invalid furthest page.');tracking.furthestPage=input.furthestPage;}
  if(input.activity!==undefined){try{tracking.activity=cleanActivity(input.activity);}catch{fail(400,'Invalid reading activity.');}}
  if(input.furthestPercent!==undefined){if(!Number.isFinite(input.furthestPercent)||input.furthestPercent<0||input.furthestPercent>100)fail(400,'Invalid furthest progress.');tracking.furthestPercent=input.furthestPercent;}
  return { ...tracking, ...plan, page, total, percent, cfi, started: !!input.started, completed: !!input.completed, favorite: !!input.favorite,
    notes: string(input.notes ?? '', 'notes', 20000, false), bookmarks: bookmarks.map(b => {if(!b||typeof b!=='object')fail(400,'Invalid bookmark.');const cfi=string(b.cfi??'', 'bookmark location',2048,false);if(cfi&&!/^epubcfi\([\s\S]+\)$/.test(cfi))fail(400,'Invalid bookmark location.');return { id: string(b.id, 'bookmark ID', 80), label: string(b.label, 'bookmark label', 160), page: Math.max(1, Math.min(1000000, Math.trunc(Number(b.page) || 1))), cfi };}),
    lastReadAt: typeof input.lastReadAt === 'string' && Number.isFinite(Date.parse(input.lastReadAt)) ? input.lastReadAt : null };
}
function readingRow(row) { return row ? { ...JSON.parse(row.record), version: row.version, updatedAt: row.updated_at, lastMutationId:row.mutation_id } : { page: 1, total: 0, percent: 0, cfi: '', favorite: false, started: false, completed: false, notes: '', bookmarks: [], version: 0 }; }

export async function createLibraryServer(options = {}) {
  const production = options.production ?? (process.env.NODE_ENV === 'production' || !!process.env.RENDER);
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (production && !databaseUrl) throw new Error('Set DATABASE_URL to persistent PostgreSQL before running the employee library in production. SQLite is only for local previews.');
  const db = await openDatabase({ databaseUrl, sqlitePath: options.sqlitePath ?? process.env.LIBRARY_SQLITE_PATH });
  const staticRoot = resolve(options.staticRoot ?? process.env.LIBRARY_STATIC_ROOT ?? '.next-render');
  const frontendUrl = options.frontendUrl ?? process.env.LIBRARY_FRONTEND_URL;
  const booksRoot = resolve('public');
  const store = createBookStore({ db, directory: options.booksDirectory ?? process.env.LIBRARY_BOOKS_DIR });
  const maxFileBytes = Math.round(Math.min(512, Math.max(1, Number(options.maxFileMb ?? process.env.LIBRARY_MAX_FILE_MB ?? 50) || 50)) * 1024 * 1024);
  const storageLimit = () => Number(process.env.LIBRARY_MAX_BYTES || 1024 * 1024 * 1024);
  // ebookConvert: false turns conversion off; a string names the converter; { command, args } is for tests.
  let convert = null;
  if (options.ebookConvert && typeof options.ebookConvert === 'object') convert = createConverter(options.ebookConvert.command, { args: options.ebookConvert.args });
  else if (options.ebookConvert !== false) { const command = await findConverter(typeof options.ebookConvert === 'string' ? options.ebookConvert : undefined); if (command) convert = createConverter(command); }
  const adminId = options.adminId ?? process.env.LIBRARY_ADMIN_ID;
  const adminPin = options.adminPin ?? process.env.LIBRARY_ADMIN_PIN;
  const [admin] = await db.query("SELECT id FROM library_users WHERE role='admin'");
  let setup = null;
  if (!admin) {
    if (production && (!adminId || !adminPin)) throw new Error('Set LIBRARY_ADMIN_ID and LIBRARY_ADMIN_PIN for the first library administrator.');
    const id = employeeId(adminId || 'LIBRARY-ADMIN'), password = pin(adminPin || randomBytes(9).toString('base64url'));
    await db.query('INSERT INTO library_users(id,employee_id,name,role,pin_hash,active,created_at) VALUES($1,$2,$3,$4,$5,1,$6)', [randomUUID(), id, options.adminName ?? process.env.LIBRARY_ADMIN_NAME ?? 'Library administrator', 'admin', await pinHash(password), now()]);
    if (!production) {
      setup = { employeeId: id, pin: password };
      if(!options.sqlitePath&&!process.env.LIBRARY_SQLITE_PATH&&!databaseUrl)writeFileSync('.library-data/local-admin.txt',`Toyota local library administrator\nEmployee ID: ${id}\nPIN: ${password}\n\nThis file is ignored by Git. Change the PIN from your account after signing in.\n`,{mode:0o600});
    }
  }
  await db.query(`INSERT INTO library_books(id,title,author,category,description,language,format,active,digest,byte_size,data,source_url,cover,pages,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,0,NULL,$9,$10,481,$11) ON CONFLICT DO NOTHING`, ['toyota-way-continuous-improvement','The Toyota Way to Continuous Improvement','Jeffrey K. Liker & James K. Franz','Continuous improvement','Linking Strategy and Operational Excellence to Achieve Superior Performance','en','pdf','bundled-toyota-way','/books/toyota-way-continuous-improvement.pdf','/books/toyota-way-cover.jpg',now()]);
  // Built-in books are added once; an administrator's later edits or archiving are kept. Dated 2000, they sort after uploads.
  for (const book of bundledBooks) await db.query(`INSERT INTO library_books(id,title,author,category,description,language,format,active,digest,byte_size,data,source_url,cover,pages,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,0,NULL,$9,$10,NULL,$11) ON CONFLICT DO NOTHING`, [book.id, book.title, book.author, book.category, book.description, book.language, book.format, book.digest, book.url, book.cover, book.addedAt]);
  const attempts = new Map();
  const lockRow = db.kind === 'postgres' ? ' FOR UPDATE' : '';
  const parseContent = value => { try { return { ...defaultContent(), ...JSON.parse(value) }; } catch { return defaultContent(); } };
  // The home-page content is one versioned document, so two administrators cannot overwrite each other unnoticed.
  async function lockContent(q) {
    await q(`INSERT INTO library_content(key,value,version,updated_at,updated_by) VALUES('home',$1,0,$2,NULL) ON CONFLICT DO NOTHING`, [JSON.stringify(defaultContent()), now()]);
    const [row] = await q(`SELECT value,version FROM library_content WHERE key='home'${lockRow}`);
    return { content: parseContent(row.value), version: row.version };
  }
  const saveContent = (q, content, version, user) => q(`UPDATE library_content SET value=$1,version=$2,updated_at=$3,updated_by=$4 WHERE key='home'`, [JSON.stringify(content), version, now(), user.id]);
  // Administrator changes are recorded for a year; a failed entry never undoes the change itself.
  // Each entry gets a later time than the one before, so the log order is exact even within a millisecond.
  let lastAudit = 0;
  async function audit(user, action, target, detail = '') {
    lastAudit = Math.max(Date.now(), lastAudit + 1);
    try { await db.query('INSERT INTO library_audit(id,at,actor_id,actor,action,target,detail) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), new Date(lastAudit).toISOString(), user.id, `${user.name} (${user.employee_id})`, action, String(target).slice(0, 200), String(detail).slice(0, 500)]); }
    catch (error) { console.error('Library activity log failed:', error.message); }
  }
  const cleanup = setInterval(() => { for (const [key, value] of attempts) if (Date.now() > value.until) attempts.delete(key); void db.query('DELETE FROM library_sessions WHERE expires_at<$1', [now()]).catch(() => {}); void db.query('DELETE FROM library_audit WHERE at<$1', [new Date(Date.now() - 400 * 86400000).toISOString()]).catch(() => {}); }, 60000); cleanup.unref();
  async function authenticate(req) {
    const token = /(?:^|;\s*)toyota_library=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
    if (!token) fail(401, 'Sign in to your employee library.');
    const [user] = await db.query('SELECT u.* FROM library_users u JOIN library_sessions s ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.active=1', [hash(token), now()]);
    if (!user) fail(401, 'Your session has ended. Sign in again.');
    if(req.headers['x-library-user']&&req.headers['x-library-user']!==user.id)fail(401,'Another employee account is active in this browser. Sign in again before saving.');
    return user;
  }
  const cookie = (token, age) => `toyota_library=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${production ? '; Secure' : ''}`;
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    try {
      const url = new URL(req.url, 'http://localhost'), path = url.pathname, method = req.method;
      if (path === '/api/health' && method === 'GET') { await db.query('SELECT 1'); return send(res, 200, { ok: true, storage: db.kind, files: store.mode, convertsMobi: !!convert }); }
      if (!path.startsWith('/api/')) {
        if(frontendUrl){
          if(!['GET','HEAD'].includes(method))return send(res,405,{error:'Method unavailable.'});
          const upstream=await fetch(frontendUrl+req.url,{method,headers:{accept:req.headers.accept||'*/*'}});
          res.statusCode=upstream.status;for(const [key,value] of upstream.headers)if(!['transfer-encoding','content-encoding','content-length','set-cookie'].includes(key))res.setHeader(key,value);
          if(upstream.body)Readable.fromWeb(upstream.body).pipe(res);else res.end();return;
        }
        return await serveStatic(req, res, path, staticRoot);
      }
      if (!['GET','HEAD'].includes(method)) {
        const origin = req.headers.origin;
        if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && new URL(origin).host !== req.headers.host && origin !== process.env.LIBRARY_ORIGIN)) fail(403, 'This request must come from the library.');
      }
      if (path === '/api/session' && method === 'POST') {
        const input = await body(req), id = employeeId(input.employeeId), value = String(input.pin ?? '');
        const keys = [`id:${id}`, `ip:${clientAddress(req)}`];
        for (const key of keys) if ((attempts.get(key)?.count ?? 0) >= (key.startsWith('id:') ? 8 : 40) && Date.now() < attempts.get(key).until) fail(429, 'Too many sign-in attempts. Try again in 15 minutes.');
        const [user] = await db.query('SELECT * FROM library_users WHERE employee_id=$1', [id]);
        // Hash even unknown IDs so error timing does not reveal the employee directory.
        const valid = await verifyPin(value.slice(0,128), user?.pin_hash ?? ('00000000000000000000000000000000:' + '0'.repeat(128)));
        if (!user?.active || !valid) {
          for (const key of keys) { if (attempts.size > 5000) attempts.clear(); const old = attempts.get(key); attempts.set(key, { count: Date.now() < (old?.until ?? 0) ? old.count + 1 : 1, until: old?.until > Date.now() ? old.until : Date.now() + 900000 }); }
          fail(401, 'Employee ID or PIN is incorrect. Contact the library administrator if you need access.');
        }
        attempts.delete(`id:${id}`);
        const token = randomBytes(32).toString('hex');
        await db.query('INSERT INTO library_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [hash(token),user.id,new Date(Date.now()+12*3600000).toISOString()]);
        return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': cookie(token,43200) });
      }
      if (path === '/api/logout' && method === 'POST') {
        const token = /(?:^|;\s*)toyota_library=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
        if(token&&req.headers['x-library-user']){const [session]=await db.query('SELECT user_id FROM library_sessions WHERE token_hash=$1',[hash(token)]);if(session&&session.user_id!==req.headers['x-library-user'])fail(401,'Another employee account is active in this browser. This screen has been signed out.');}
        if (token) await db.query('DELETE FROM library_sessions WHERE token_hash=$1', [hash(token)]);
        return send(res, 200, { ok:true }, { 'Set-Cookie': cookie('',0) });
      }
      const user = await authenticate(req);
      if (path === '/api/session' && method === 'GET') return send(res,200,{user:publicUser(user)});
      if (path === '/api/account/pin' && method === 'PUT') {
        const input = await body(req);
        if (!await verifyPin(String(input.currentPin ?? ''),user.pin_hash)) fail(400,'Your current PIN is incorrect.');
        const replacement = await pinHash(pin(input.newPin));
        await db.transaction(async q => { await q('UPDATE library_users SET pin_hash=$1 WHERE id=$2',[replacement,user.id]); await q('DELETE FROM library_sessions WHERE user_id=$1',[user.id]); });
        return send(res,200,{ok:true},{'Set-Cookie':cookie('',0)});
      }
      if (path === '/api/catalog' && method === 'GET') return send(res,200,{books:(await db.query(`SELECT ${bookColumns} FROM library_books WHERE active=1 ORDER BY created_at DESC,title`)).map(publicBook)},{},{etag:true});
      if (path === '/api/content' && method === 'GET') {
        const [row] = await db.query(`SELECT value,version,updated_at FROM library_content WHERE key='home'`);
        return send(res,200,{content:row?parseContent(row.value):defaultContent(),version:row?.version??0,updatedAt:row?.updated_at??null},{},{etag:true});
      }
      if (path === '/api/profile' && method === 'GET') {
        const rows = await db.query('SELECT book_id,record,version,mutation_id,updated_at FROM library_reading WHERE user_id=$1',[user.id]);
        const columns=bookColumns.split(',').map(column=>'b.'+column).join(',');
        const books=(await db.query('SELECT '+columns+' FROM library_books b JOIN library_reading r ON r.book_id=b.id WHERE r.user_id=$1 ORDER BY b.title',[user.id])).map(publicBook);
        return send(res,200,{records:Object.fromEntries(rows.map(row=>[row.book_id,readingRow(row)])),books});
      }
      const reading = /^\/api\/reading\/([\w-]+)$/.exec(path);
      if (reading && method === 'PUT') {
        const input = await body(req), record = cleanRecord(input.record), mutation = string(input.mutationId,'save ID',80);
        if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) fail(400,'Invalid save version.');
        const result = await db.transaction(async q => {
          // Archived books can still receive offline account saves; catalogue and file access remain restricted.
          const [book] = await q('SELECT id FROM library_books WHERE id=$1',[reading[1]]); if (!book) fail(404,'Book unavailable.');
          await q(`INSERT INTO library_reading(user_id,book_id,record,version,mutation_id,updated_at) VALUES($1,$2,$3,0,'',$4) ON CONFLICT(user_id,book_id) DO NOTHING`,[user.id,reading[1],JSON.stringify(cleanRecord({})),now()]);
          const lock = db.kind === 'postgres' ? ' FOR UPDATE' : '';
          const [old] = await q('SELECT * FROM library_reading WHERE user_id=$1 AND book_id=$2' + lock,[user.id,reading[1]]);
          if (old.mutation_id === mutation) return { status:200, record:readingRow(old) };
          if (old.version !== input.expectedVersion) return {status:409,record:readingRow(old)};
          const updated = now(), version = old.version + 1, saved=mergeReadingHistory(JSON.parse(old.record),record);
          await q('UPDATE library_reading SET record=$1,version=$2,mutation_id=$3,updated_at=$4 WHERE user_id=$5 AND book_id=$6',[JSON.stringify(saved),version,mutation,updated,user.id,reading[1]]);
          return {status:200,record:{...saved,version,updatedAt:updated,lastMutationId:mutation}};
        });
        return send(res,result.status,{record:result.record,...(result.status===409?{error:'This book was updated on another device. Choose which copy to keep.'}:{})});
      }
      const file = /^\/api\/books\/([\w-]+)\/file$/.exec(path);
      if (file && (method === 'GET' || method === 'HEAD')) {
        const [book] = await db.query('SELECT id,byte_size,file_key,source_url,format FROM library_books WHERE id=$1 AND active=1',[file[1]]); if (!book) fail(404,'Book unavailable.');
        if (book.source_url) return await serveFile(req,res,resolve(booksRoot,'.'+book.source_url),{type:BOOK_TYPES[book.format],privateFile:true});
        return await store.send(req,res,book);
      }
      const coverFile = /^\/api\/books\/([\w-]+)\/cover$/.exec(path);
      if (coverFile && (method === 'GET' || method === 'HEAD')) {
        const [book]=await db.query('SELECT cover_data,cover_type FROM library_books WHERE id=$1 AND (active=1 OR $2=1)',[coverFile[1],user.role==='admin'?1:0]);
        if (!book?.cover_data) fail(404,'Cover unavailable.');
        // Cover URLs carry a content hash, so a cached copy never goes stale.
        res.writeHead(200,{'Content-Type':book.cover_type,'Cache-Control':'private, max-age=2592000, immutable','Content-Length':Buffer.from(book.cover_data).length});
        return res.end(method==='HEAD'?undefined:Buffer.from(book.cover_data));
      }
      if (!path.startsWith('/api/admin/')) fail(404,'Page unavailable.');
      if (user.role !== 'admin') fail(403,'Library administrator access is required.');
      if (path === '/api/admin/books' && method === 'GET') {
        const books=(await db.query(`SELECT ${bookColumns} FROM library_books ORDER BY created_at DESC,title`)).map(publicBook);
        const started=db.kind==='postgres'?"(record::jsonb ->> 'started')='true'":"json_extract(record,'$.started')=1";
        const usage=await db.query('SELECT book_id,COUNT(*) AS readers FROM library_reading WHERE '+started+' GROUP BY book_id');
        return send(res,200,{books,usage:Object.fromEntries(usage.map(row=>[row.book_id,Number(row.readers)])),storage:{usedBytes:books.reduce((sum,book)=>sum+Number(book.bytes||0),0),limitBytes:storageLimit()},limits:{maxFileBytes,convertsMobi:!!convert,files:store.mode}});
      }
      if (path === '/api/admin/books' && method === 'POST') {
        const filename=string(url.searchParams.get('filename'),'filename',250), extension=(filename.split('.').pop()||'').toLowerCase();
        if(!['pdf','epub',...CONVERTIBLE].includes(extension))fail(400,'Choose PDF, EPUB or MOBI files.');
        if(CONVERTIBLE.includes(extension)&&!convert)fail(415,'MOBI and Kindle books need converting to EPUB first. Install Calibre on the library server to convert them automatically, or convert the book with Calibre and upload the EPUB.');
        let bytes=await body(req,maxFileBytes,true);
        const category=string(url.searchParams.get('category')||'General','category',80), author=string(url.searchParams.get('author')||'Toyota library','author',200), language=string(url.searchParams.get('language')||'en','language',30);
        // The digest of the uploaded file finds repeats before any conversion work.
        const digest=hash(bytes);
        const [existing]=await db.query('SELECT '+bookColumns+' FROM library_books WHERE digest=$1',[digest]);
        if(existing)return send(res,200,{book:publicBook(existing),duplicate:true});
        let format=extension,converted=false;
        if(CONVERTIBLE.includes(extension)){if(!isMobi(bytes))fail(400,'This file is not a valid MOBI or Kindle book.');bytes=await convert(bytes,extension);format='epub';converted=true;}
        validateBook(bytes,format);
        const id=randomUUID(), title=filename.replace(/\.(pdf|epub|mobi|azw3?)$/i,'').replaceAll('_',' ').trim();
        const stored=await store.save(bytes,digest,format);
        let result;
        try{
          result=await db.transaction(async q=>{
            if(db.kind==='postgres')await q('SELECT pg_advisory_xact_lock(518050)');
            const [old]=await q('SELECT '+bookColumns+' FROM library_books WHERE digest=$1',[digest]); if(old) return {book:publicBook(old),duplicate:true};
            const [used]=await q('SELECT COALESCE(SUM(byte_size),0) AS total FROM library_books');
            if(Number(used.total)+bytes.length>storageLimit()) fail(413,'The library storage limit is reached. Increase LIBRARY_MAX_BYTES after checking the free space on the server.');
            await q('INSERT INTO library_books(id,title,author,category,description,language,format,active,digest,byte_size,data,file_key,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10,$11,$12)',[id,title,author,category,'',language,format,digest,bytes.length,stored.data,stored.fileKey,now()]);
            const [row]=await q('SELECT '+bookColumns+' FROM library_books WHERE id=$1',[id]); return {book:publicBook(row),duplicate:false,converted};
          });
        }catch(error){await store.discard(stored.fileKey);throw error;}
        if(result.duplicate)await store.discard(stored.fileKey);
        else await audit(user,'book.add',result.book.title,format.toUpperCase()+(converted?', converted from '+extension.toUpperCase():''));
        return send(res,result.duplicate?200:201,result);
      }
      const edit=/^\/api\/admin\/books\/([\w-]+)$/.exec(path);
      if(edit&&method==='PUT') {
        const input=await body(req); const [old]=await db.query('SELECT id,title,author,category,description,language,active FROM library_books WHERE id=$1',[edit[1]]); if(!old)fail(404,'Book unavailable.');
        const next={title:string(input.title,'title'),author:string(input.author,'author'),category:string(input.category,'category',80),description:string(input.description??'','description',3000,false),language:string(input.language,'language',30),active:input.active===false?0:1};
        await db.query('UPDATE library_books SET title=$1,author=$2,category=$3,description=$4,language=$5,active=$6 WHERE id=$7',[next.title,next.author,next.category,next.description,next.language,next.active,edit[1]]);
        const changed=['title','author','category','description','language'].filter(key=>next[key]!==old[key]);
        if(next.active!==Number(old.active))await audit(user,next.active?'book.restore':'book.archive',next.title);
        if(changed.length)await audit(user,'book.edit',next.title,'Changed '+changed.join(', '));
        return send(res,200,{ok:true});
      }
      const cover=/^\/api\/admin\/books\/([\w-]+)\/cover$/.exec(path);
      if(cover&&method==='PUT') {
        const bytes=await body(req,2*1024*1024,true),type=imageType(bytes);
        if(!type)fail(400,'Choose a JPEG, PNG or WebP cover image.');
        const [old]=await db.query('SELECT id FROM library_books WHERE id=$1',[cover[1]]);if(!old)fail(404,'Book unavailable.');
        const url=`/api/books/${cover[1]}/cover?v=${hash(bytes).slice(0,12)}`;
        await db.query('UPDATE library_books SET cover_data=$1,cover_type=$2,cover=$3 WHERE id=$4',[bytes,type,url,cover[1]]);
        const [row]=await db.query(`SELECT ${bookColumns} FROM library_books WHERE id=$1`,[cover[1]]);
        await audit(user,'book.cover',row.title);
        return send(res,200,{book:publicBook(row)});
      }
      if(path==='/api/admin/employees'&&method==='GET') return send(res,200,{employees:(await db.query('SELECT id,employee_id,name,role,active,created_at FROM library_users ORDER BY name')).map(publicUser)});
      if(path==='/api/admin/employees'&&method==='POST') {
        const input=await body(req), entries=input.employees;
        if(!Array.isArray(entries)||!entries.length||entries.length>200)fail(400,'Import 1–200 employees at a time.');
        const results=[];
        for(const entry of entries)try {
          const id=employeeId(entry.employeeId), name=string(entry.name,'name',100), role=entry.role==='admin'?'admin':'employee', password=await pinHash(pin(entry.pin));
          const [old]=await db.query('SELECT id FROM library_users WHERE employee_id=$1',[id]);if(old){results.push({employeeId:id,error:'ID already exists. Use Reset PIN to change access.'});continue;}
          await db.query('INSERT INTO library_users(id,employee_id,name,role,pin_hash,active,created_at) VALUES($1,$2,$3,$4,$5,1,$6)',[randomUUID(),id,name,role,password,now()]); results.push({employeeId:id,ok:true});await audit(user,'employee.add',`${name} (${id})`,role==='admin'?'Administrator':'Employee');
        }catch(error){results.push({employeeId:String(entry?.employeeId??''),error:error.status?error.message:'Could not create this account. Try again.'});}
        return send(res,200,{results});
      }
      const account=/^\/api\/admin\/employees\/([\w-]+)$/.exec(path);
      if(account&&method==='PUT') {
        const input=await body(req);if(account[1]===user.id)fail(400,'Use your profile to change your PIN. Your own administrator access cannot be changed here.');
        const password=input.pin?await pinHash(pin(input.pin)):null;
        const before=await db.transaction(async q=>{
          const [old]=await q('SELECT id,name,employee_id,active FROM library_users WHERE id=$1',[account[1]]);if(!old)fail(404,'Employee unavailable.');
          await q('UPDATE library_users SET active=$1 WHERE id=$2',[input.active===false?0:1,account[1]]);
          if(password)await q('UPDATE library_users SET pin_hash=$1 WHERE id=$2',[password,account[1]]);
          if(password||input.active===false)await q('DELETE FROM library_sessions WHERE user_id=$1',[account[1]]);
          return old;
        });
        const who=`${before.name} (${before.employee_id})`,active=input.active!==false;
        if(active!==!!Number(before.active))await audit(user,active?'employee.resume':'employee.pause',who);
        if(password)await audit(user,'employee.pin',who,'PIN reset');
        return send(res,200,{ok:true});
      }
      if(path==='/api/admin/content'&&method==='PUT') {
        const input=await body(req,256*1024);let content;
        try{content=cleanContent(input.content);}catch(error){fail(400,error.message);}
        if(!Number.isInteger(input.expectedVersion)||input.expectedVersion<0)fail(400,'Invalid content version.');
        const chosen=[...new Set([...content.picks.bookIds,...content.announcements.map(item=>item.bookId).filter(Boolean)])];
        if(chosen.length){const found=new Set((await db.query(`SELECT id FROM library_books WHERE active=1 AND id IN (${chosen.map((_,index)=>'$'+(index+1)).join(',')})`,chosen)).map(row=>row.id));if(chosen.some(id=>!found.has(id)))fail(400,'A chosen book is archived or no longer in the catalogue. Choose another.');}
        const result=await db.transaction(async q=>{
          const current=await lockContent(q);
          if(current.version!==input.expectedVersion)return {status:409,content:current.content,version:current.version};
          await saveContent(q,content,current.version+1,user);return {status:200,content,version:current.version+1};
        });
        if(result.status===409)return send(res,409,{content:result.content,version:result.version,error:'Another administrator changed the home page. Their version is now loaded; make your changes again.'});
        await audit(user,'content.update','Home page',`${content.announcements.length} announcements · ${content.picks.bookIds.length} staff picks · ${content.collections.length} collection notes`);
        return send(res,200,{content:result.content,version:result.version});
      }
      if(path==='/api/admin/collections/rename'&&method==='POST') {
        const input=await body(req),from=string(input.from,'collection',80),to=string(input.to,'new collection name',80);
        if(from===to)fail(400,'Choose a different name.');
        const result=await db.transaction(async q=>{
          const [count]=await q('SELECT COUNT(*) AS total FROM library_books WHERE category=$1',[from]);
          await q('UPDATE library_books SET category=$1 WHERE category=$2',[to,from]);
          const current=await lockContent(q),content=renameCollectionContent(current.content,from,to);
          await saveContent(q,content,current.version+1,user);return {moved:Number(count.total),content,version:current.version+1};
        });
        await audit(user,'collection.rename',`${from} → ${to}`,`${result.moved} ${result.moved===1?'book':'books'}`);
        return send(res,200,result);
      }
      if(path==='/api/admin/insights'&&method==='GET') {
        const days=[7,30,90].includes(Number(url.searchParams.get('days')))?Number(url.searchParams.get('days')):30;
        // The administrator's own calendar day, within a day of the server's, so the report matches local dates.
        const asked=url.searchParams.get('today')||'',serverDay=now().slice(0,10);
        const today=/^\d{4}-\d{2}-\d{2}$/.test(asked)&&Math.abs(Date.parse(asked)-Date.parse(serverDay))<=86400000?asked:serverDay;
        const rows=await db.query('SELECT user_id,book_id,record FROM library_reading'),users=await db.query('SELECT id,active,role FROM library_users'),books=await db.query('SELECT id,title,author,category,active FROM library_books');
        const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
        return send(res,200,summarizeLibrary({rows:rows.map(row=>({userId:row.user_id,bookId:row.book_id,record:parse(row.record)})),users:users.map(row=>({...row,active:!!Number(row.active)})),books:books.map(row=>({...row,active:!!Number(row.active)})),today,days}));
      }
      if(path==='/api/admin/activity'&&method==='GET') {
        const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit'))||100)),before=url.searchParams.get('before');
        if(before&&(before.length>40||Number.isNaN(Date.parse(before))))fail(400,'Invalid date.');
        const entries=before?await db.query('SELECT id,at,actor,action,target,detail FROM library_audit WHERE at<$1 ORDER BY at DESC LIMIT $2',[before,limit]):await db.query('SELECT id,at,actor,action,target,detail FROM library_audit ORDER BY at DESC LIMIT $1',[limit]);
        return send(res,200,{entries,more:entries.length===limit});
      }
      fail(404,'Page unavailable.');
    }catch(error){ if(!res.headersSent)send(res,error.status||500,{error:error.status?error.message:'The library could not complete this request. Please try again.'});else res.end();if(!error.status)console.error('Library request failed:',error.message); }
  });
  return { server, db, setup, close: async()=>{clearInterval(cleanup);await new Promise(resolve=>server.close(resolve));await db.close();} };
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2','.wasm':'application/wasm','.pdf':'application/pdf','.txt':'text/plain; charset=utf-8','.webmanifest':'application/manifest+json','.ico':'image/x-icon','.webp':'image/webp','.gif':'image/gif','.jpeg':'image/jpeg'};
// The app shell may use inline Next.js bootstrap scripts; everything else must come from this origin.
// EPUB sections render in srcdoc frames that inherit this policy, so blob: images, styles and fonts stay allowed.
const contentSecurityPolicy=["default-src 'self'","script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'","style-src 'self' 'unsafe-inline' blob:","img-src 'self' data: blob:","font-src 'self' data: blob:","connect-src 'self'","worker-src 'self' blob:","frame-src 'self' blob:","media-src 'self' blob:","manifest-src 'self'","object-src 'none'","base-uri 'self'","form-action 'self'","frame-ancestors 'self'"].join('; ');
const compressible=/^(text\/|application\/(json|manifest\+json|xml)|image\/svg\+xml)/;
const compressedFiles=new Map();
const compressors={br:(bytes,done)=>brotliCompress(bytes,{params:{[zlibConstants.BROTLI_PARAM_QUALITY]:5}},done),gzip:(bytes,done)=>gzip(bytes,{level:6},done)};
function acceptedEncoding(header=''){
  const accepted=new Map(String(header).split(',').map(part=>{const [name,...params]=part.trim().toLowerCase().split(';');const q=params.map(p=>/^\s*q=([\d.]+)/.exec(p)?.[1]).find(Boolean);return [name,q===undefined?1:Number(q)];}));
  return ['br','gzip'].find(name=>(accepted.get(name)??accepted.get('*')??0)>0)||null;
}
// Each static file is compressed once per version and kept in memory; the bundle is a few megabytes.
function compressedFile(path,info,encoding){
  const key=encoding+':'+path+':'+info.size+':'+info.mtimeMs;
  let entry=compressedFiles.get(key);
  if(!entry){
    if(compressedFiles.size>=600)compressedFiles.clear();
    entry=readFile(path).then(bytes=>new Promise((done,reject)=>compressors[encoding](bytes,(error,result)=>error?reject(error):done(result))));
    compressedFiles.set(key,entry);entry.catch(()=>compressedFiles.delete(key));
  }
  return entry;
}
function cachePolicy(path){
  const url=path.split(sep).join('/');
  if(url.includes('/_next/static/'))return 'public, max-age=31536000, immutable';
  if(/\/sw\.js$|\/offline-assets\.json$|\.html$|\/__next\.[^/]*\.txt$|\/index\.txt$/.test(url))return 'no-cache';
  return 'public, max-age=3600';
}
function byteRange(header,size){
  const range=/^bytes=(\d+)-(\d*)$/.exec(header||'');if(!range)return null;
  const start=Number(range[1]),end=range[2]?Math.min(size-1,Number(range[2])):size-1;
  return start>end||start>=size?false:{start,end};
}
async function serveFile(req,res,path,{type,privateFile=false,status=200}={}){
  let info;try{info=await stat(path);}catch{info=null;}
  if(!info?.isFile())return send(res,404,{error:'File unavailable.'});
  const contentType=type||types[extname(path)]||'application/octet-stream';
  res.statusCode=status;res.setHeader('Content-Type',contentType);res.setHeader('Cache-Control',privateFile?'private, no-store':cachePolicy(path));
  if(contentType.startsWith('text/html'))res.setHeader('Content-Security-Policy',contentSecurityPolicy);
  const canCompress=!privateFile&&compressible.test(contentType);
  if(canCompress)res.setHeader('Vary','Accept-Encoding');
  if(!privateFile&&status===200){
    const etag='W/"'+info.size.toString(16)+'-'+Math.trunc(info.mtimeMs).toString(16)+'"';
    res.setHeader('ETag',etag);res.setHeader('Last-Modified',info.mtime.toUTCString());
    if(String(req.headers['if-none-match']||'').split(',').map(value=>value.trim()).includes(etag)){res.statusCode=304;return res.end();}
  }
  const encoding=canCompress&&info.size>1024?acceptedEncoding(req.headers['accept-encoding']):null;
  if(encoding){
    const bytes=await compressedFile(path,info,encoding);
    res.setHeader('Content-Encoding',encoding);res.setHeader('Content-Length',bytes.length);
    return res.end(req.method==='HEAD'?undefined:bytes);
  }
  res.setHeader('Accept-Ranges','bytes');
  const range=status===200?byteRange(req.headers.range,info.size):null;
  if(range===false){res.statusCode=416;res.setHeader('Content-Range','bytes */'+info.size);return res.end();}
  if(range){res.statusCode=206;res.setHeader('Content-Range','bytes '+range.start+'-'+range.end+'/'+info.size);}
  res.setHeader('Content-Length',range?range.end-range.start+1:info.size);
  if(req.method==='HEAD')return res.end();
  createReadStream(path,range||undefined).on('error',()=>res.destroy()).pipe(res);
}
async function serveStatic(req,res,path,root){
  if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Method unavailable.'});
  let decoded;try{decoded=decodeURIComponent(path);}catch{return send(res,400,{error:'Invalid path.'});}
  const target=resolve(root,'.'+decoded);
  if(target!==root&&!target.startsWith(root+sep))return send(res,403,{error:'Invalid path.'});
  const file=path==='/'?resolve(root,'index.html'):target;
  // Unknown pages get the app's own not-found page rather than a JSON error.
  const exists=await stat(file).then(info=>info.isFile(),()=>false);
  if(!exists&&String(req.headers.accept||'').includes('text/html'))return serveFile(req,res,resolve(root,'404.html'),{status:404});
  return serveFile(req,res,file);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const app=await createLibraryServer();
  const port=Number(process.env.PORT||5180),host=process.env.RENDER?'0.0.0.0':process.env.LIBRARY_HOST||'127.0.0.1';
  app.server.listen(port,host,()=>{console.log(`Toyota employee library: http://${host}:${port}`);if(app.setup)console.log(`First local administrator: ${app.setup.employeeId} / ${app.setup.pin}`);});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
}
