import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReadRanges,getReadingProgress,trackReadingLocation,mergeReadingHistory} from '../lib/reading-progress.mjs';

const location=(page,total=100)=>({format:'pdf',page,total,percent:page/total*100});
test('a last-page jump records one opened page and does not imply completion',()=>{
 const record=trackReadingLocation({completed:false},location(100));
 assert.equal(record.completed,false);assert.deepEqual(record.readRanges,[[100,100]]);assert.equal(getReadingProgress(record,'pdf').percent,1);
});
test('going back and repeated zoom do not lower or duplicate opened coverage',()=>{
 let record=trackReadingLocation({},location(10));record=trackReadingLocation(record,location(11));record=trackReadingLocation(record,location(10));
 assert.deepEqual(record.readRanges,[[10,11]]);assert.equal(record.page,10);assert.equal(record.furthestPage,11);assert.equal(getReadingProgress(record,'pdf').pagesRead,2);
});
test('page ranges merge adjacency and reject unsafe or impossible data',()=>{
 assert.deepEqual(normalizeReadRanges([[5,7],[1,3],[3,5]],100),[[1,7]]);
 for(const bad of [[[0,1]],[[4,2]],[[1,101]],[[1.5,2]],'pages'])assert.throws(()=>normalizeReadRanges(bad,100));
});
test('legacy resume position remains available without inventing pages opened',()=>{
 const old={page:40,total:100,percent:40,started:true,completed:true};
 assert.deepEqual(getReadingProgress(old,'pdf'),{percent:40,pagesRead:null,total:100,positionPercent:40,tracked:false});
 const next=trackReadingLocation(old,location(20));assert.equal(next.page,20);assert.equal(next.furthestPercent,40);assert.equal(next.completed,true);assert.equal(getReadingProgress(next,'pdf').pagesRead,1);
});
test('EPUB furthest progress survives revisiting earlier sections',()=>{
 const initial=trackReadingLocation({completed:false},{format:'epub',page:1,total:0,cfi:'epubcfi(/6/4)',percent:65});
 const back=trackReadingLocation(initial,{format:'epub',page:1,total:0,cfi:'epubcfi(/6/2)',percent:10});
 assert.equal(back.percent,10);assert.equal(back.furthestPercent,65);assert.equal(getReadingProgress(back,'epub').percent,65);assert.equal(back.completed,false);
});
test('server merges accumulated coverage when a compatible old client omits new fields',()=>{
 const previous=trackReadingLocation({},location(30));
 const incoming={page:10,total:100,percent:10,completed:false,notes:'new note'};
 const merged=mergeReadingHistory(previous,incoming);assert.deepEqual(merged.readRanges,[[30,30]]);assert.equal(merged.furthestPercent,30);assert.equal(merged.page,10);assert.equal(merged.notes,'new note');
 const joined=mergeReadingHistory(previous,trackReadingLocation({},location(50)));assert.deepEqual(joined.readRanges,[[30,30],[50,50]]);
});

test('internal coverage unions can compact large valid histories',()=>{
 const ranges=Array.from({length:10000},(_,index)=>[index*2+1,index*2+1]);
 const record=trackReadingLocation({readRanges:ranges},location(1,20000));assert.equal(record.readRanges.length,10000);
 const merged=mergeReadingHistory({total:20000,readRanges:ranges.slice(0,6000)},{total:20000,readRanges:ranges.slice(4000)});assert.equal(merged.readRanges.length,10000);
});
