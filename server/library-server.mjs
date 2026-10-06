import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { existsSync, statSync, createReadStream, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { openDatabase } from './database.mjs';
import { clientAddress } from './client-address.mjs';

const derive = promisify(scrypt), now = () => new Date().toISOString();
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
function send(res, status, data, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(data)); }
async function body(req, limit = 256 * 1024, raw = false) {
  if (Number(req.headers['content-length']) > limit) { req.resume(); fail(413, `File exceeds the ${Math.round(limit / 1024 / 1024)} MB limit.`); }
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
  } else fail(400, 'Choose PDF or EPUB files.');
}
function cleanRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Invalid reading record.');
  const page = Number(input.page ?? 1), total = Number(input.total ?? 0), percent = Number(input.percent ?? 0);
  if (!Number.isInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(total) || total < 0 || total > 1000000 || !Number.isFinite(percent) || percent < 0 || percent > 100) fail(400, 'Invalid reading position.');
  const cfi = string(input.cfi ?? '', 'EPUB position', 2048, false);
  if (cfi && !/^epubcfi\([\s\S]+\)$/.test(cfi)) fail(400, 'Invalid EPUB position.');
  const bookmarks = input.bookmarks ?? [];
  if (!Array.isArray(bookmarks) || bookmarks.length > 100) fail(400, 'Use at most 100 bookmarks per book.');
  return { page, total, percent, cfi, started: !!input.started, completed: !!input.completed, favorite: !!input.favorite,
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
  await db.query(`INSERT INTO library_books(id,title,author,category,description,language,format,active,digest,byte_size,data,source_url,cover,pages,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,0,NULL,$9,$10,481,$11) ON CONFLICT(id) DO NOTHING`, ['toyota-way-continuous-improvement','The Toyota Way to Continuous Improvement','Jeffrey K. Liker & James K. Franz','Continuous improvement','Linking Strategy and Operational Excellence to Achieve Superior Performance','en','pdf','bundled-toyota-way','/books/toyota-way-continuous-improvement.pdf','/books/toyota-way-cover.jpg',now()]);
  const attempts = new Map();
  const cleanup = setInterval(() => { for (const [key, value] of attempts) if (Date.now() > value.until) attempts.delete(key); void db.query('DELETE FROM library_sessions WHERE expires_at<$1', [now()]).catch(() => {}); }, 60000); cleanup.unref();
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
    try {
      const url = new URL(req.url, 'http://localhost'), path = url.pathname, method = req.method;
      if (path === '/api/health' && method === 'GET') { await db.query('SELECT 1'); return send(res, 200, { ok: true, storage: db.kind }); }
      if (!path.startsWith('/api/')) {
        if(frontendUrl){
          if(!['GET','HEAD'].includes(method))return send(res,405,{error:'Method unavailable.'});
          const upstream=await fetch(frontendUrl+req.url,{method,headers:{accept:req.headers.accept||'*/*'}});
          res.statusCode=upstream.status;for(const [key,value] of upstream.headers)if(!['transfer-encoding','content-encoding','content-length','set-cookie'].includes(key))res.setHeader(key,value);
          if(upstream.body)Readable.fromWeb(upstream.body).pipe(res);else res.end();return;
        }
        return serveStatic(req, res, path, staticRoot);
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
      if (path === '/api/catalog' && method === 'GET') return send(res,200,{books:(await db.query(`SELECT ${bookColumns} FROM library_books WHERE active=1 ORDER BY created_at DESC,title`)).map(publicBook)});
      if (path === '/api/profile' && method === 'GET') {
        const rows = await db.query('SELECT book_id,record,version,mutation_id,updated_at FROM library_reading WHERE user_id=$1',[user.id]);
        return send(res,200,{records:Object.fromEntries(rows.map(row=>[row.book_id,readingRow(row)]))});
      }
      const reading = /^\/api\/reading\/([\w-]+)$/.exec(path);
      if (reading && method === 'PUT') {
        const input = await body(req), record = cleanRecord(input.record), mutation = string(input.mutationId,'save ID',80);
        if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) fail(400,'Invalid save version.');
        const result = await db.transaction(async q => {
          const [book] = await q('SELECT id FROM library_books WHERE id=$1 AND active=1',[reading[1]]); if (!book) fail(404,'This book is no longer in the active library.');
          await q(`INSERT INTO library_reading(user_id,book_id,record,version,mutation_id,updated_at) VALUES($1,$2,$3,0,'',$4) ON CONFLICT(user_id,book_id) DO NOTHING`,[user.id,reading[1],JSON.stringify(cleanRecord({})),now()]);
          const lock = db.kind === 'postgres' ? ' FOR UPDATE' : '';
          const [old] = await q('SELECT * FROM library_reading WHERE user_id=$1 AND book_id=$2' + lock,[user.id,reading[1]]);
          if (old.mutation_id === mutation) return { status:200, record:readingRow(old) };
          if (old.version !== input.expectedVersion) return {status:409,record:readingRow(old)};
          const updated = now(), version = old.version + 1;
          await q('UPDATE library_reading SET record=$1,version=$2,mutation_id=$3,updated_at=$4 WHERE user_id=$5 AND book_id=$6',[JSON.stringify(record),version,mutation,updated,user.id,reading[1]]);
          return {status:200,record:{...record,version,updatedAt:updated,lastMutationId:mutation}};
        });
        return send(res,result.status,{record:result.record,...(result.status===409?{error:'This book was updated on another device. Choose which copy to keep.'}:{})});
      }
      const file = /^\/api\/books\/([\w-]+)\/file$/.exec(path);
      if (file && (method === 'GET' || method === 'HEAD')) {
        const [book] = await db.query('SELECT data,source_url,format FROM library_books WHERE id=$1 AND active=1',[file[1]]); if (!book) fail(404,'Book unavailable.');
        if (book.source_url) return serveFile(req,res,resolve(booksRoot,'.'+book.source_url),book.format==='pdf'?'application/pdf':'application/epub+zip',true);
        return sendBytes(req,res,Buffer.from(book.data),book.format==='pdf'?'application/pdf':'application/epub+zip');
      }
      if (!path.startsWith('/api/admin/')) fail(404,'Page unavailable.');
      if (user.role !== 'admin') fail(403,'Library administrator access is required.');
      if (path === '/api/admin/books' && method === 'GET') {
        const books=(await db.query(`SELECT ${bookColumns} FROM library_books ORDER BY created_at DESC,title`)).map(publicBook);
        const started=db.kind==='postgres'?"(record::jsonb ->> 'started')='true'":"json_extract(record,'$.started')=1";
        const usage=await db.query('SELECT book_id,COUNT(*) AS readers FROM library_reading WHERE '+started+' GROUP BY book_id');
        return send(res,200,{books,usage:Object.fromEntries(usage.map(row=>[row.book_id,Number(row.readers)]))});
      }
      if (path === '/api/admin/books' && method === 'POST') {
        const filename=string(url.searchParams.get('filename'),'filename',250), format=filename.split('.').pop().toLowerCase();
        const bytes=await body(req,50*1024*1024,true); validateBook(bytes,format);
        const digest=hash(bytes), id=randomUUID(), title=filename.replace(/\.(pdf|epub)$/i,'').replaceAll('_',' ').trim();
        const category=string(url.searchParams.get('category')||'General','category',80), author=string(url.searchParams.get('author')||'Toyota library','author',200), language=string(url.searchParams.get('language')||'en','language',30);
        const result=await db.transaction(async q=>{
          if(db.kind==='postgres')await q('SELECT pg_advisory_xact_lock(518050)');
          const [old]=await q('SELECT '+bookColumns+' FROM library_books WHERE digest=$1',[digest]); if(old) return {book:publicBook(old),duplicate:true};
          const [used]=await q('SELECT COALESCE(SUM(byte_size),0) AS total FROM library_books');
          if(Number(used.total)+bytes.length>Number(process.env.LIBRARY_MAX_BYTES||1024*1024*1024)) fail(413,'The library storage limit is reached. Increase LIBRARY_MAX_BYTES after checking database capacity.');
          await q('INSERT INTO library_books(id,title,author,category,description,language,format,active,digest,byte_size,data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10,$11)',[id,title,author,category,'',language,format,digest,bytes.length,bytes,now()]);
          const [row]=await q('SELECT '+bookColumns+' FROM library_books WHERE id=$1',[id]); return {book:publicBook(row),duplicate:false};
        });return send(res,result.duplicate?200:201,result);
      }
      const edit=/^\/api\/admin\/books\/([\w-]+)$/.exec(path);
      if(edit&&method==='PUT') {
        const input=await body(req); const [old]=await db.query('SELECT id FROM library_books WHERE id=$1',[edit[1]]); if(!old)fail(404,'Book unavailable.');
        await db.query('UPDATE library_books SET title=$1,author=$2,category=$3,description=$4,language=$5,active=$6 WHERE id=$7',[string(input.title,'title'),string(input.author,'author'),string(input.category,'category',80),string(input.description??'','description',3000,false),string(input.language,'language',30),input.active===false?0:1,edit[1]]);
        return send(res,200,{ok:true});
      }
      if(path==='/api/admin/employees'&&method==='GET') return send(res,200,{employees:(await db.query('SELECT id,employee_id,name,role,active,created_at FROM library_users ORDER BY name')).map(publicUser)});
      if(path==='/api/admin/employees'&&method==='POST') {
        const input=await body(req), entries=input.employees;
        if(!Array.isArray(entries)||!entries.length||entries.length>200)fail(400,'Import 1–200 employees at a time.');
        const results=[];
        for(const entry of entries)try {
          const id=employeeId(entry.employeeId), name=string(entry.name,'name',100), role=entry.role==='admin'?'admin':'employee', password=await pinHash(pin(entry.pin));
          const [old]=await db.query('SELECT id FROM library_users WHERE employee_id=$1',[id]);if(old){results.push({employeeId:id,error:'ID already exists. Use Reset PIN to change access.'});continue;}
          await db.query('INSERT INTO library_users(id,employee_id,name,role,pin_hash,active,created_at) VALUES($1,$2,$3,$4,$5,1,$6)',[randomUUID(),id,name,role,password,now()]); results.push({employeeId:id,ok:true});
        }catch(error){results.push({employeeId:String(entry?.employeeId??''),error:error.status?error.message:'Could not create this account. Try again.'});}
        return send(res,200,{results});
      }
      const account=/^\/api\/admin\/employees\/([\w-]+)$/.exec(path);
      if(account&&method==='PUT') {
        const input=await body(req);if(account[1]===user.id)fail(400,'Use your profile to change your PIN. Your own administrator access cannot be changed here.');
        const password=input.pin?await pinHash(pin(input.pin)):null;
        await db.transaction(async q=>{
          const [old]=await q('SELECT id FROM library_users WHERE id=$1',[account[1]]);if(!old)fail(404,'Employee unavailable.');
          await q('UPDATE library_users SET active=$1 WHERE id=$2',[input.active===false?0:1,account[1]]);
          if(password)await q('UPDATE library_users SET pin_hash=$1 WHERE id=$2',[password,account[1]]);
          if(password||input.active===false)await q('DELETE FROM library_sessions WHERE user_id=$1',[account[1]]);
        });return send(res,200,{ok:true});
      }
      fail(404,'Page unavailable.');
    }catch(error){ if(!res.headersSent)send(res,error.status||500,{error:error.status?error.message:'The library could not complete this request. Please try again.'});else res.end();if(!error.status)console.error('Library request failed:',error.message); }
  });
  return { server, db, setup, close: async()=>{clearInterval(cleanup);await new Promise(resolve=>server.close(resolve));await db.close();} };
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2','.wasm':'application/wasm','.pdf':'application/pdf','.txt':'text/plain'};
function sendBytes(req,res,bytes,type) {
  res.setHeader('Content-Type',type);res.setHeader('Cache-Control','private, no-store');res.setHeader('Accept-Ranges','bytes');
  const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
  let start=0,end=bytes.length-1;
  if(range){start=Number(range[1]);end=range[2]?Math.min(end,Number(range[2])):end;if(start>end){res.writeHead(416,{'Content-Range':`bytes */${bytes.length}`});return res.end();}res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`);}
  res.setHeader('Content-Length',end-start+1);res.end(req.method==='HEAD'?undefined:bytes.subarray(start,end+1));
}
function serveFile(req,res,path,type,privateFile=false){
  if(!existsSync(path)||!statSync(path).isFile())return send(res,404,{error:'File unavailable.'});
  res.setHeader('Content-Type',type||types[extname(path)]||'application/octet-stream');res.setHeader('Cache-Control',privateFile?'private, no-store':/sw\.js|offline-assets\.json|\.html$/.test(path)?'no-cache':'public, max-age=3600');
  res.setHeader('Content-Length',statSync(path).size);if(req.method==='HEAD')return res.end();createReadStream(path).pipe(res);
}
function serveStatic(req,res,path,root){
  if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Method unavailable.'});
  let decoded;try{decoded=decodeURIComponent(path);}catch{return send(res,400,{error:'Invalid path.'});}
  const target=resolve(root,'.'+decoded);
  if(target!==root&&!target.startsWith(root+sep))return send(res,403,{error:'Invalid path.'});
  const file=path==='/'?resolve(root,'index.html'):target;
  return serveFile(req,res,file);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const app=await createLibraryServer();
  const port=Number(process.env.PORT||5180),host=process.env.RENDER?'0.0.0.0':process.env.LIBRARY_HOST||'127.0.0.1';
  app.server.listen(port,host,()=>{console.log(`Toyota employee library: http://${host}:${port}`);if(app.setup)console.log(`First local administrator: ${app.setup.employeeId} / ${app.setup.pin}`);});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
}
