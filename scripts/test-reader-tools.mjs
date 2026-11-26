import test from 'node:test';
import assert from 'node:assert/strict';
import {highlightParts, normalizeSearchQuery, pageScale, searchText, swipeDirection} from '../lib/reader-tools.mjs';

test('whole-page fit keeps a portrait page inside a short landscape frame', () => {
  const page = {pageWidth: 612, pageHeight: 792, availableWidth: 1200, availableHeight: 500};
  const whole = pageScale({...page, fit: 'page'}), width = pageScale({...page, fit: 'width'});
  assert.ok(792 * whole <= 500 + 1e-9);
  assert.ok(width > whole);
  assert.equal(pageScale({...page, fit: 'page', zoom: 2}), whole * 2);
  // Width fitting keeps the existing upper limit for very wide screens.
  assert.equal(pageScale({...page, availableWidth: 5000, fit: 'width'}), 1.65);
  assert.equal(pageScale({pageWidth: 0, pageHeight: 0, availableWidth: 0, availableHeight: 0, zoom: 1.5}), 1.5);
});

test('quick horizontal swipes turn pages; taps, scrolls and slow drags do not', () => {
  const start = {x: 400, y: 300, time: 1000};
  assert.equal(swipeDirection(start, {x: 250, y: 310, time: 1200}), 1);
  assert.equal(swipeDirection(start, {x: 560, y: 290, time: 1200}), -1);
  assert.equal(swipeDirection(start, {x: 405, y: 302, time: 1100}), 0);
  assert.equal(swipeDirection(start, {x: 320, y: 500, time: 1200}), 0);
  assert.equal(swipeDirection(start, {x: 200, y: 300, time: 2500}), 0);
  assert.equal(swipeDirection(start, {x: 200, y: 300, time: 900}), 0);
  assert.equal(swipeDirection(null, {x: 200, y: 300, time: 1200}), 0);
});

test('search ignores case and line breaks and reports exact source offsets', () => {
  const text = 'Continuous\nimprovement starts small. Continuous   IMPROVEMENT never ends.';
  const result = searchText(text, '  continuous improvement ');
  assert.equal(result.total, 2);
  assert.equal(text.slice(result.matches[0].start, result.matches[0].end), 'Continuous\nimprovement');
  assert.equal(result.matches[0].match, 'Continuous improvement');
  assert.equal(text.slice(result.matches[1].start, result.matches[1].end), 'Continuous   IMPROVEMENT');
  assert.equal(normalizeSearchQuery('  Kaizen\tAt  WORK '), 'kaizen at work');
});

test('search excerpts are short, single-line and marked when trimmed', () => {
  const text = 'a'.repeat(200) + ' gemba walk ' + 'b'.repeat(200);
  const [match] = searchText(text, 'gemba', {context: 20}).matches;
  assert.ok(match.before.startsWith('…'));
  assert.ok(match.after.endsWith('…'));
  assert.ok(match.before.length <= 21 && match.after.length <= 21);
  assert.equal(match.match, 'gemba');
});

test('search limits stored matches but still counts every match', () => {
  const result = searchText('the '.repeat(500), 'the', {limit: 10});
  assert.equal(result.total, 500);
  assert.equal(result.matches.length, 10);
  assert.deepEqual(searchText('anything', '   '), {total: 0, matches: []});
  assert.deepEqual(searchText('', 'kaizen'), {total: 0, matches: []});
});

test('search works for Japanese and Kannada text', () => {
  assert.equal(searchText('改善を続ける。改善は習慣です。', '改善').total, 2);
  assert.equal(searchText('ನಿರಂತರ ಸುಧಾರಣೆ', 'ಸುಧಾರಣೆ').total, 1);
});

test('highlight parts rebuild the original text exactly', () => {
  const text = 'Kaizen means change for the better. kaizen is daily.';
  const parts = highlightParts(text, 'KAIZEN');
  assert.equal(parts.map(part => part.text).join(''), text);
  assert.deepEqual(parts.filter(part => part.hit).map(part => part.text), ['Kaizen', 'kaizen']);
  assert.deepEqual(highlightParts('no match here', 'gemba'), [{text: 'no match here', hit: false}]);
});
