import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogCsv, filterCatalog, selectVisibleBooks} from '../lib/catalog-controls.mjs';

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
