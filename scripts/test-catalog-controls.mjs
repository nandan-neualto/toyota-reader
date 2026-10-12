import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogCsv, filterCatalog, filterEmployees, paginateRecords, selectVisibleBooks} from '../lib/catalog-controls.mjs';

const books = [
  {id:'a', title:'Toyota 10', author:'日本語', category:'Lean', language:'ja', format:'pdf', active:true, addedAt:'2026-01-01'},
  {id:'b', title:'Toyota 2', author:'ಸುಧಾ', category:'People', language:'kn', format:'epub', active:false, addedAt:'2026-03-01'},
  {id:'c', title:'Daily learning', author:'Team', category:'Lean', language:'en', format:'epub', active:true, addedAt:'2026-02-01'},
];

test('catalog filters combine Unicode search, availability, collection, format and language', () => {
  assert.deepEqual(filterCatalog(books, {query:' 日本語 ', status:'active', collection:'Lean', format:'pdf', language:'ja'}).map(b=>b.id), ['a']);
  assert.deepEqual(filterCatalog(books, {query:'ಸುಧಾ', status:'archived'}).map(b=>b.id), ['b']);
  assert.deepEqual(filterCatalog(books, {collection:'missing'}), []);
  const literalAll = [{...books[0], category:'all', language:'all'}, books[1]];
  assert.deepEqual(filterCatalog(literalAll, {collection:'all', language:'all'}).map(b=>b.id), ['a']);
});
test('catalog sorts naturally, by date or reader usage without changing the source', () => {
  assert.deepEqual(filterCatalog(books, {sort:'title'}).map(b=>b.id), ['c','b','a']);
  assert.deepEqual(filterCatalog(books, {sort:'newest'}).map(b=>b.id), ['b','c','a']);
  assert.deepEqual(filterCatalog(books, {sort:'readers'}, {a:10,b:1,c:4}).map(b=>b.id), ['a','c','b']);
  assert.deepEqual(books.map(b=>b.id), ['a','b','c']);
});
test('metadata review filters identify blank descriptions and unclassified collections independently', () => {
  const catalog = [
    {...books[0], description:'  ', category:'Lean'},
    {...books[1], description:'A useful book', category:' General '},
    {...books[2], description:'A useful book', category:'People'},
    {...books[0], id:'d', description:'', category:''},
  ];
  assert.deepEqual(filterCatalog(catalog, {quality:'missing-description'}).map(book=>book.id).sort(), ['a','d']);
  assert.deepEqual(filterCatalog(catalog, {quality:'unclassified'}).map(book=>book.id).sort(), ['b','d']);
  assert.deepEqual(filterCatalog(catalog, {quality:'needs-review',status:'active'}).map(book=>book.id).sort(), ['a','d']);
  assert.deepEqual(filterCatalog(catalog, {quality:'needs-review'}).map(book=>book.id).sort(), ['a','b','d']);
});
test('employee search combines ID or Unicode name with role and active filters without mutating the directory', () => {
  const employees = [
    {id:'one',employeeId:'T-002',name:'日本語 Employee',role:'employee',active:true},
    {id:'two',employeeId:'T-010',name:'ಸುಧಾ',role:'admin',active:false},
    {id:'three',employeeId:'T-001',name:'日本語 Employee',role:'employee',active:true},
  ];
  assert.deepEqual(filterEmployees(employees,{query:' 日本語 ',role:'employee',status:'active'}).map(employee=>employee.id), ['three','one']);
  assert.deepEqual(filterEmployees(employees,{query:'t-010',role:'admin',status:'paused'}).map(employee=>employee.id), ['two']);
  assert.deepEqual(filterEmployees(employees,{query:'ಸುಧಾ',status:'active'}), []);
  assert.deepEqual(employees.map(employee=>employee.id), ['one','two','three']);
});
test('pagination bounds stale pages and exposes accurate empty and partial-page counts', () => {
  const records = Array.from({length:61},(_,index)=>index+1);
  assert.deepEqual(paginateRecords(records,3,25), {items:records.slice(50),total:61,page:3,pages:3,size:25,from:51,to:61});
  assert.deepEqual(paginateRecords(records,99,50), {items:records.slice(50),total:61,page:2,pages:2,size:50,from:51,to:61});
  assert.deepEqual(paginateRecords([],10,100), {items:[],total:0,page:1,pages:1,size:100,from:0,to:0});
  assert.equal(paginateRecords(records,-1,25).page,1);
  assert.equal(paginateRecords(records,Infinity,17).size,25);
  assert.equal(paginateRecords(records,Infinity,17).page,1);
  assert.deepEqual(records, Array.from({length:61},(_,index)=>index+1));
});
test('page-only selection preserves other pages and filters while all-result CSV stays complete', () => {
  const catalog = Array.from({length:63},(_,index)=>({...books[0],id:String(index),title:`Book ${index}`}));
  const filtered = filterCatalog(catalog,{status:'active'});
  const page = paginateRecords(filtered,2,25);
  const selected = selectVisibleBooks(['hidden',filtered[0].id], page.items.map(book=>book.id),true);
  assert.equal(selected.length,27);
  assert.deepEqual(selectVisibleBooks(selected,page.items.map(book=>book.id),false),['hidden',filtered[0].id]);
  assert.equal(catalogCsv(filtered).split('\r\n').filter(Boolean).length,64);
});
test('visible selection preserves hidden books, respects its cap and deselects only visible IDs', () => {
  assert.deepEqual(selectVisibleBooks(['hidden','a'], ['a','b','c'], true, 3), ['hidden','a','b']);
  assert.deepEqual(selectVisibleBooks(['hidden','a','b'], ['a','b','c'], false), ['hidden']);
  assert.deepEqual(selectVisibleBooks(['a'], Array.from({length:200},(_,i)=>String(i)), true).length, 100);
});
test('catalog CSV has a UTF-8 BOM, preserves Unicode and quotes multiline metadata', () => {
  const csv = catalogCsv([{...books[0], title:'Toyota, "Team"', description:'Line one\n日本語 · ಕನ್ನಡ'}], {a:2});
  assert.ok(csv.startsWith('\uFEFF"Book ID"'));
  assert.ok(csv.includes('"Toyota, ""Team"""'));
  assert.ok(csv.includes('"Line one\n日本語 · ಕನ್ನಡ"'));
  assert.ok(csv.includes('"Available","2","0"'));
  assert.ok(csv.endsWith('\r\n'));
});
test('catalog CSV escapes formula starters including leading whitespace and control characters', () => {
  const csv = catalogCsv([{...books[0], title:'=HYPERLINK("bad")', author:'  +SUM(1)', category:'@cmd', description:'\tunsafe', language:'-1'}]);
  for (const expected of ["' =", "'  +SUM(1)", "'@cmd", "'\tunsafe", "'-1"]) {
    if (expected === "' =") assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
    else assert.ok(csv.includes(expected));
  }
});
