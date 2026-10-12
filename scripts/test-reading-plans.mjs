import test from 'node:test';
import assert from 'node:assert/strict';
import {isGoalDate,cleanReadingPlan} from '../lib/reading-plans.mjs';
import {mergeReadingHistory} from '../lib/reading-progress.mjs';
import {createLibraryServer} from '../server/library-server.mjs';

test('personal target dates validate real calendar days without timezone conversion',()=>{
 for(const date of ['', '2028-02-29','2026-10-12','0001-01-01','9999-12-31'])assert.equal(isGoalDate(date),true,date);
 for(const date of ['2026-02-29','2100-02-29','2026-04-31','0000-01-01','2026-1-01','2026-10-12T00:00:00Z',null,0])assert.equal(isGoalDate(date),false,String(date));
 assert.deepEqual(cleanReadingPlan({readLater:false,goalDate:''}),{readLater:false,goalDate:''});
 assert.throws(()=>cleanReadingPlan({readLater:'false'}));
 assert.throws(()=>cleanReadingPlan({goalDate:'2026-02-30'}));
});
test('older progress clients preserve planning fields, while explicit clearing is respected',()=>{
 const old={readLater:true,goalDate:'2027-01-20',notes:'Private',percent:10};
 assert.deepEqual(mergeReadingHistory(old,{page:3,percent:20}),{page:3,percent:20,readLater:true,goalDate:'2027-01-20'});
 assert.deepEqual(mergeReadingHistory(old,{readLater:false,goalDate:''}),{readLater:false,goalDate:''});
});
test('reading plans persist for only their employee account and survive legacy updates',async()=>{
 const app=await createLibraryServer({production:false,sqlitePath:':memory:',adminId:'PLAN-ADMIN',adminPin:'plan-admin-password'});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 const call=async(path,cookie,body,method=body?'POST':'GET')=>{
  const response=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 };
 try{
  const admin=(await call('/api/session',null,{employeeId:'PLAN-ADMIN',pin:'plan-admin-password'})).cookie;
  assert.equal((await call('/api/admin/employees',admin,{employees:[{employeeId:'PLAN-A',name:'Reader A',pin:'reader-a-password'},{employeeId:'PLAN-B',name:'Reader B',pin:'reader-b-password'}]})).status,200);
  let alice=(await call('/api/session',null,{employeeId:'PLAN-A',pin:'reader-a-password'})).cookie;
  const bob=(await call('/api/session',null,{employeeId:'PLAN-B',pin:'reader-b-password'})).cookie;
  const id='toyota-way-continuous-improvement',endpoint='/api/reading/'+id;
  const save=(record,expectedVersion,mutationId)=>call(endpoint,alice,{record,expectedVersion,mutationId},'PUT');
  const saved=await save({readLater:true,goalDate:'2027-01-15'},0,'plan-first');
  assert.equal(saved.status,200);assert.equal(saved.data.record.readLater,true);assert.equal(saved.data.record.goalDate,'2027-01-15');assert.equal(saved.data.record.started,false);
  const repeat=await save({readLater:true,goalDate:'2027-01-15'},0,'plan-first');assert.equal(repeat.data.record.version,1);
  for(const change of [{goalDate:'2026-02-29'},{goalDate:[]},{goalDate:null},{readLater:'yes'},{readLater:1}])assert.equal((await save(change,1,'invalid')).status,400);
  const legacy=await save({page:5,total:481,percent:5/481*100,started:true,notes:'改善 / ಸುಧಾರಣೆ'},1,'legacy-update');
  assert.equal(legacy.status,200);assert.equal(legacy.data.record.goalDate,'2027-01-15');assert.equal(legacy.data.record.readLater,true);
  assert.equal((await save({readLater:false},1,'stale')).status,409);
  await call('/api/logout',alice,{});
  alice=(await call('/api/session',null,{employeeId:'PLAN-A',pin:'reader-a-password'})).cookie;
  const profile=(await call('/api/profile',alice)).data;assert.equal(profile.records[id].readLater,true);assert.equal(profile.records[id].goalDate,'2027-01-15');assert.equal(profile.records[id].notes,'改善 / ಸುಧಾರಣೆ');
  assert.deepEqual((await call('/api/profile',bob)).data.records,{});
  const cleared=await save({...profile.records[id],readLater:false,goalDate:''},2,'plan-clear');
  assert.equal(cleared.status,200);assert.equal(cleared.data.record.readLater,false);assert.equal(cleared.data.record.goalDate,'');assert.equal(cleared.data.record.page,5);
 }finally{await app.close();}
});
