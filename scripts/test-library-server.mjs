import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLibraryServer } from '../server/library-server.mjs';
import { openDatabase } from '../server/database.mjs';
import { clientAddress } from '../server/client-address.mjs';
import { samplePdf, sampleEpub } from './library-fixtures.mjs';

test('employee library accounts, files and saved progress',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'toyota-library-test-'));
 const config={sqlitePath:join(directory,'library.sqlite'),adminId:'LIB-ADMIN',adminPin:'test-admin-passphrase',production:false};
 let app=await createLibraryServer(config);let base;
 const listen=async()=>{await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;};await listen();
 async function request(path,{cookie,raw,...init}={}){const response=await fetch(base+path,{...init,headers:{...(cookie?{cookie}:{}),...init.headers},body:init.body===undefined?undefined:raw?init.body:JSON.stringify(init.body)});const data=await response.json().catch(()=>null);return{status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
 let admin,alice,bob,book,epub;
 try{
  await t.test('requires valid employee credentials and blocks cross-origin writes',async()=>{
   assert.equal((await request('/api/profile')).status,401);
   assert.equal((await request('/api/session',{method:'POST',body:{employeeId:'LIB-ADMIN',pin:'wrong'}})).status,401);
   assert.equal((await request('/api/session',{method:'POST',body:{employeeId:'LIB-ADMIN',pin:'test-admin-passphrase'},headers:{origin:'https://other.example'}})).status,403);
   const response=await request('/api/session',{method:'POST',body:{employeeId:'lib-admin',pin:'test-admin-passphrase'}});assert.equal(response.status,200);admin=response.cookie;
   assert.equal(response.data.user.role,'admin');assert.equal(response.data.user.pin_hash,undefined);
  });
  await t.test('bulk employee import preserves existing accounts and reports invalid rows',async()=>{
   const response=await request('/api/admin/employees',{method:'POST',cookie:admin,body:{employees:[{employeeId:'EMP-01',name:'Alice',pin:'alice-passphrase'},{employeeId:'EMP-02',name:'ಬಾಬ್ 日本語',pin:'bob-passphrase'},{employeeId:'EMP-01',name:'Duplicate',pin:'different'},{employeeId:'invalid id!',name:'Invalid',pin:'123456'}]}});
   assert.equal(response.status,200);assert.deepEqual(response.data.results.map(r=>!!r.ok),[true,true,false,false]);
   alice=(await request('/api/session',{method:'POST',body:{employeeId:'EMP-01',pin:'alice-passphrase'}})).cookie;
   bob=(await request('/api/session',{method:'POST',body:{employeeId:'EMP-02',pin:'bob-passphrase'}})).cookie;
   assert.equal((await request('/api/admin/books',{cookie:alice})).status,403);
   const [row]=await app.db.query('SELECT pin_hash FROM library_users WHERE employee_id=$1',['EMP-01']);assert.notEqual(row.pin_hash,'alice-passphrase');assert.match(row.pin_hash,/^[a-f0-9]{32}:[a-f0-9]{128}$/);
  });
  await t.test('uploads PDF and EPUB, deduplicates retries, rejects invalid files and protects downloads',async()=>{
   const response=await request('/api/admin/books?filename=Learning.pdf&category=Leadership',{method:'POST',cookie:admin,raw:true,body:samplePdf()});assert.equal(response.status,201);book=response.data.book;
   const duplicate=await request('/api/admin/books?filename=Learning.pdf',{method:'POST',cookie:admin,raw:true,body:samplePdf()});assert.equal(duplicate.data.duplicate,true);assert.equal(duplicate.data.book.id,book.id);
   const response2=await request('/api/admin/books?filename=Kaizen.epub',{method:'POST',cookie:admin,raw:true,body:sampleEpub()});assert.equal(response2.status,201);epub=response2.data.book;
   assert.equal((await request('/api/admin/books?filename=Bad.epub',{method:'POST',cookie:admin,raw:true,body:Buffer.from('PK0000000000')})).status,400);
   assert.equal((await request('/api/admin/books?filename=Bad.pdf',{method:'POST',cookie:admin,raw:true,body:Buffer.from('%PDF-1.4 fake')})).status,400);
   assert.equal((await request('/api/books/'+book.id+'/file')).status,401);
   const download=await fetch(base+'/api/books/'+book.id+'/file',{headers:{cookie:alice,range:'bytes=0-9'}});assert.equal(download.status,206);assert.equal((await download.arrayBuffer()).byteLength,10);assert.equal(download.headers.get('cache-control'),'private, no-store');
  });
  await t.test('keeps progress, notes, favorites and bookmarks isolated per employee; retries are idempotent',async()=>{
   const record={page:2,total:3,percent:66.6,started:true,favorite:true,notes:'改善 / ಸುಧಾರಣೆ',bookmarks:[{id:'bookmark1',label:'Page 2',page:2,cfi:''}]};
   const body={expectedVersion:0,mutationId:'save1',record};const result=await request('/api/reading/'+book.id,{method:'PUT',cookie:alice,body});assert.equal(result.status,200);assert.equal(result.data.record.version,1);
   assert.equal((await request('/api/reading/'+book.id,{method:'PUT',cookie:alice,body})).data.record.version,1);
   const profile=(await request('/api/profile',{cookie:alice})).data;assert.equal(profile.records[book.id].page,2);assert.equal(profile.records[book.id].notes,record.notes);assert.equal(profile.records[book.id].bookmarks.length,1);
   assert.deepEqual((await request('/api/profile',{cookie:bob})).data.records,{});
   const [aliceUser]=await app.db.query('SELECT id FROM library_users WHERE employee_id=$1',['EMP-01']);
   assert.equal((await request('/api/reading/'+book.id,{method:'PUT',cookie:bob,body,headers:{'X-Library-User':aliceUser.id}})).status,401);
   assert.equal((await request('/api/logout',{method:'POST',cookie:bob,body:{},headers:{'X-Library-User':aliceUser.id}})).status,401);
   assert.equal((await request('/api/profile',{cookie:bob})).status,200);
   const conflict=await request('/api/reading/'+book.id,{method:'PUT',cookie:alice,body:{...body,mutationId:'another-device',record:{...record,page:1}}});assert.equal(conflict.status,409);assert.equal(conflict.data.record.page,2);
   const invalid=await request('/api/reading/'+book.id,{method:'PUT',cookie:alice,body:{expectedVersion:1,mutationId:'bad',record:{page:-1}}});assert.equal(invalid.status,400);
   assert.equal((await request('/api/reading/'+epub.id,{method:'PUT',cookie:alice,body:{expectedVersion:0,mutationId:'epubsave',record:{cfi:'epubcfi(/6/2!/4/2/1:10)',percent:20,started:true}}})).status,200);
  });
  await t.test('archiving hides a book and its file without removing employee records; restore works',async()=>{
   assert.equal((await request('/api/admin/books/'+book.id,{method:'PUT',cookie:admin,body:{...book,active:false}})).status,200);
   assert.equal((await request('/api/catalog',{cookie:alice})).data.books.some(b=>b.id===book.id),false);
   assert.equal((await request('/api/books/'+book.id+'/file',{cookie:alice})).status,404);
   assert.equal((await request('/api/profile',{cookie:alice})).data.records[book.id].page,2);
   await request('/api/admin/books/'+book.id,{method:'PUT',cookie:admin,body:{...book,active:true}});
  });
  await t.test('saved accounts, books and reading positions survive server restart',async()=>{
   await app.close();app=await createLibraryServer(config);await listen();
   const profile=await request('/api/profile',{cookie:alice});assert.equal(profile.status,200);assert.equal(profile.data.records[book.id].page,2);assert.equal(profile.data.records[epub.id].cfi,'epubcfi(/6/2!/4/2/1:10)');
   assert.equal((await request('/api/catalog',{cookie:bob})).data.books.length,3);
  });
  await t.test('PIN changes, paused access and sign-out revoke sessions',async()=>{
   const directory=(await request('/api/admin/employees',{cookie:admin})).data.employees;const bobUser=directory.find(u=>u.employeeId==='EMP-02');
   assert.equal((await request('/api/admin/employees/'+bobUser.id,{method:'PUT',cookie:admin,body:{active:false}})).status,200);
   assert.equal((await request('/api/profile',{cookie:bob})).status,401);
   assert.equal((await request('/api/account/pin',{method:'PUT',cookie:alice,body:{currentPin:'alice-passphrase',newPin:'alice-new-passphrase'}})).status,200);
   assert.equal((await request('/api/profile',{cookie:alice})).status,401);
   alice=(await request('/api/session',{method:'POST',body:{employeeId:'EMP-01',pin:'alice-new-passphrase'}})).cookie;
   assert.equal((await request('/api/profile',{cookie:alice})).data.records[book.id].page,2);
   await request('/api/logout',{method:'POST',cookie:alice,body:{}});assert.equal((await request('/api/profile',{cookie:alice})).status,401);
   const self=directory.find(u=>u.role==='admin');assert.equal((await request('/api/admin/employees/'+self.id,{method:'PUT',cookie:admin,body:{active:false}})).status,400);
  });
  await t.test('limits repeated incorrect PIN attempts',async()=>{
   for(let i=0;i<8;i++)assert.equal((await request('/api/session',{method:'POST',body:{employeeId:'EMP-01',pin:'incorrect'}})).status,401);
   assert.equal((await request('/api/session',{method:'POST',body:{employeeId:'EMP-01',pin:'incorrect'}})).status,429);
  });
 }finally{await app.close();rmSync(directory,{recursive:true,force:true});}
});
test('production refuses ephemeral SQLite storage',async()=>{await assert.rejects(()=>createLibraryServer({production:true,databaseUrl:''}),/persistent PostgreSQL/);});

test('a failed SQLite transaction cannot roll back a different request',async()=>{
 const db=await openDatabase({sqlitePath:':memory:'});
 try{
  await db.query('CREATE TABLE transaction_checks (value TEXT)');
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const transaction=db.transaction(async q=>{await q('INSERT INTO transaction_checks VALUES($1)',['rolled back']);entered();await gate;throw new Error('intentional rollback');});
  await started;const other=db.query('INSERT INTO transaction_checks VALUES($1)',['independent request']);release();
  await assert.rejects(transaction,/intentional rollback/);await other;
  assert.deepEqual((await db.query('SELECT value FROM transaction_checks')).map(row=>row.value),['independent request']);
 }finally{await db.close();}
});

test('only Render trusts a valid edge client address for sign-in throttling',()=>{
 const request={headers:{'cf-connecting-ip':'203.0.113.2','x-forwarded-for':'198.51.100.1'},socket:{remoteAddress:'127.0.0.1'}};
 assert.equal(clientAddress(request,false),'127.0.0.1');
 assert.equal(clientAddress(request,true),'203.0.113.2');
 for(const address of ['','spoofed','203.0.113.2, 198.51.100.1'])assert.equal(clientAddress({...request,headers:{'cf-connecting-ip':address}},true),'127.0.0.1');
 assert.equal(clientAddress({...request,headers:{'cf-connecting-ip':'2001:db8::1'}},true),'2001:db8::1');
 assert.equal(clientAddress({...request,headers:{}},true),'127.0.0.1');
});
