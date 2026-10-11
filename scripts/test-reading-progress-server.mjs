import test from 'node:test';
import assert from 'node:assert/strict';
import {createLibraryServer} from '../server/library-server.mjs';
import {samplePdf} from './library-fixtures.mjs';

test('account coverage stays private, compatible and persistent through catalogue changes',async t=>{
 const app=await createLibraryServer({production:false,sqlitePath:':memory:',adminId:'PROGRESS-ADMIN',adminPin:'progress-test-passphrase'});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
 const request=async(path,{cookie,...init}={})=>{const response=await fetch(base+path,{...init,headers:{...(cookie?{cookie}:{}),...init.headers},body:init.body===undefined?undefined:Buffer.isBuffer(init.body)?init.body:JSON.stringify(init.body)});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 try{
  const admin=(await request('/api/session',{method:'POST',body:{employeeId:'PROGRESS-ADMIN',pin:'progress-test-passphrase'}})).cookie;
  await request('/api/admin/employees',{method:'POST',cookie:admin,body:{employees:[{employeeId:'PROGRESS-A',name:'Employee A',pin:'employee-a-passphrase'},{employeeId:'PROGRESS-B',name:'Employee B',pin:'employee-b-passphrase'}]}});
  let alice=(await request('/api/session',{method:'POST',body:{employeeId:'PROGRESS-A',pin:'employee-a-passphrase'}})).cookie;
  const bob=(await request('/api/session',{method:'POST',body:{employeeId:'PROGRESS-B',pin:'employee-b-passphrase'}})).cookie;
  const upload=await request('/api/admin/books?filename=Progress.pdf',{method:'POST',cookie:admin,headers:{'Content-Type':'application/octet-stream'},body:samplePdf()});assert.equal(upload.status,201);const book=upload.data.book;
  const record={page:70,total:100,percent:70,started:true,completed:false,favorite:true,notes:'Private idea',readRanges:[[1,3],[70,70]],furthestPage:70,furthestPercent:70};
  let saved;
  await t.test('saves ranges, validates input and keeps retry IDs idempotent',async()=>{
   const input={record,expectedVersion:0,mutationId:'coverage-first'};
   saved=await request('/api/reading/'+book.id,{method:'PUT',cookie:alice,body:input});assert.equal(saved.status,200);assert.deepEqual(saved.data.record.readRanges,record.readRanges);
   const repeat=await request('/api/reading/'+book.id,{method:'PUT',cookie:alice,body:input});assert.equal(repeat.data.record.version,1);
   for(const readRanges of [[[0,4]],[[1,101]],[[1.2,3]]])assert.equal((await request('/api/reading/'+book.id,{method:'PUT',cookie:alice,body:{...input,record:{...record,readRanges},mutationId:'invalid'}})).status,400);
  });
  await t.test('an older client may update resume/notes without deleting coverage',async()=>{
   const result=await request('/api/reading/'+book.id,{method:'PUT',cookie:alice,body:{expectedVersion:1,mutationId:'legacy-update',record:{page:2,total:100,percent:2,started:true,completed:false,notes:'Edited idea'}}});
   assert.equal(result.status,200);assert.equal(result.data.record.page,2);assert.deepEqual(result.data.record.readRanges,record.readRanges);assert.equal(result.data.record.furthestPercent,70);assert.equal(result.data.record.notes,'Edited idea');
   const conflict=await request('/api/reading/'+book.id,{method:'PUT',cookie:alice,body:{expectedVersion:1,mutationId:'old-version',record}});assert.equal(conflict.status,409);
  });
  await t.test('logout/login resumes saved progress and history metadata belongs only to that ID',async()=>{
   await request('/api/logout',{method:'POST',cookie:alice,body:{}});alice=(await request('/api/session',{method:'POST',body:{employeeId:'PROGRESS-A',pin:'employee-a-passphrase'}})).cookie;
   const profile=(await request('/api/profile',{cookie:alice})).data;assert.equal(profile.records[book.id].page,2);assert.equal(profile.books[0].title,'Progress');
   const other=(await request('/api/profile',{cookie:bob})).data;assert.deepEqual(other.records,{});assert.deepEqual(other.books,[]);
  });
  await t.test('archiving retains history metadata and records without granting file access',async()=>{
   const update=await request('/api/admin/books/'+book.id,{method:'PUT',cookie:admin,body:{...book,active:false}});assert.equal(update.status,200);
   const catalog=(await request('/api/catalog',{cookie:alice})).data;assert.ok(!catalog.books.some(entry=>entry.id===book.id));
   const history=(await request('/api/profile',{cookie:alice})).data;assert.equal(history.books[0].active,false);assert.equal(history.records[book.id].furthestPercent,70);
   assert.equal((await request('/api/books/'+book.id+'/file',{cookie:alice})).status,404);
   const adminCatalog=(await request('/api/admin/books',{cookie:admin})).data;assert.equal(adminCatalog.storage.usedBytes,samplePdf().length);assert.ok(adminCatalog.storage.limitBytes>adminCatalog.storage.usedBytes);
  });
  await t.test('queued archived-book saves succeed before another active book while access stays private',async()=>{
   const input={expectedVersion:2,mutationId:'queued-after-archive',record:{...record,page:4,percent:4,readRanges:[[4,4]],notes:'Queued while offline'}};
   const archived=await request('/api/reading/'+book.id,{method:'PUT',cookie:alice,body:input});
   assert.equal(archived.status,200);assert.equal(archived.data.record.version,3);assert.equal(archived.data.record.page,4);
   assert.deepEqual(archived.data.record.readRanges,[[1,4],[70,70]]);
   const repeat=await request('/api/reading/'+book.id,{method:'PUT',cookie:alice,body:input});assert.equal(repeat.status,200);assert.equal(repeat.data.record.version,3);
   const stale=await request('/api/reading/'+book.id,{method:'PUT',cookie:alice,body:{...input,mutationId:'stale-after-archive'}});assert.equal(stale.status,409);
   assert.equal((await request('/api/reading/'+book.id,{method:'PUT',body:input})).status,401);
   assert.equal((await request('/api/reading/not-a-book',{method:'PUT',cookie:alice,body:input})).status,404);
   const activeId='toyota-way-continuous-improvement';
   const active=await request('/api/reading/'+activeId,{method:'PUT',cookie:alice,body:{expectedVersion:0,mutationId:'active-after-archive',record:{page:2,total:481,percent:2/481*100,started:true,readRanges:[[1,2]],furthestPage:2,furthestPercent:2/481*100}}});
   assert.equal(active.status,200);assert.equal(active.data.record.version,1);
   const profile=(await request('/api/profile',{cookie:alice})).data;
   assert.equal(profile.records[book.id].notes,'Queued while offline');assert.equal(profile.records[activeId].page,2);
   assert.equal(profile.books.find(entry=>entry.id===book.id).active,false);
   const catalog=(await request('/api/catalog',{cookie:alice})).data;
   assert.ok(!catalog.books.some(entry=>entry.id===book.id));assert.ok(catalog.books.some(entry=>entry.id===activeId));
   assert.equal((await request('/api/books/'+book.id+'/file',{cookie:alice})).status,404);
   const other=(await request('/api/profile',{cookie:bob})).data;assert.deepEqual(other.records,{});assert.deepEqual(other.books,[]);
  });
 }finally{await app.close();}
});
