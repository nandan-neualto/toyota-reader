import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIVITY_DAYS, activityLevel, addDays, addReadingTime, cleanActivity, formatDuration, localDate, mergeActivity, summarizeActivity} from '../lib/reading-activity.mjs';
import {mergeReadingHistory} from '../lib/reading-progress.mjs';

test('reading time accumulates per local calendar day and is capped at a full day', () => {
  let activity = addReadingTime({}, 90, '2026-11-24');
  activity = addReadingTime(activity, 30.4, '2026-11-24');
  activity = addReadingTime(activity, 0, '2026-11-25');
  assert.deepEqual(activity, {'2026-11-24': 120});
  assert.equal(addReadingTime({'2026-11-24': 86000}, 1000, '2026-11-24')['2026-11-24'], 86400);
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('calendar arithmetic crosses months, leap days and daylight-saving changes', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('validation accepts real dates only and keeps a bounded history', () => {
  assert.deepEqual(cleanActivity({'2026-11-24': 60, '2026-11-25': 0}), {'2026-11-24': 60});
  for (const bad of [null, [], {'2026-02-30': 10}, {'2026-11-24': -1}, {'2026-11-24': 1.5}, {'2026-11-24': 90000}, {'': 5}, {'yesterday': 5}]) assert.throws(() => cleanActivity(bad));
  const long = Object.fromEntries(Array.from({length: ACTIVITY_DAYS + 20}, (_, index) => [addDays('2025-01-01', index), 60]));
  const kept = cleanActivity(long);
  assert.equal(Object.keys(kept).length, ACTIVITY_DAYS);
  assert.ok(!('2025-01-01' in kept));
});

test('merging keeps the larger daily total so retries and two devices never double-count', () => {
  assert.deepEqual(mergeActivity({'2026-11-24': 300, '2026-11-23': 60}, {'2026-11-24': 240, '2026-11-25': 30}), {'2026-11-23': 60, '2026-11-24': 300, '2026-11-25': 30});
  const saved = mergeReadingHistory({page: 3, activity: {'2026-11-24': 300}}, {page: 4});
  assert.deepEqual(saved.activity, {'2026-11-24': 300});
  assert.deepEqual(mergeReadingHistory({activity: {'2026-11-24': 300}}, {activity: {'2026-11-24': 420}}).activity, {'2026-11-24': 420});
});

test('streaks count days with at least a minute across all books and may end yesterday', () => {
  const records = [{activity: {'2026-11-23': 60, '2026-11-24': 30}}, {activity: {'2026-11-24': 40, '2026-11-25': 600, '2026-11-20': 900}}];
  const today = summarizeActivity(records, '2026-11-26');
  assert.equal(today.streak, 3);
  assert.equal(today.longest, 3);
  assert.equal(summarizeActivity(records, '2026-11-27').streak, 0);
  assert.equal(summarizeActivity([{activity: {'2026-11-25': 59}}], '2026-11-26').streak, 0);
  assert.deepEqual(today.days[0], {day: '2026-11-25', seconds: 600});
});

test('weekly totals start on Monday and the calendar ends with the current week', () => {
  // 26 November 2026 is a Thursday.
  const summary = summarizeActivity([{activity: {'2026-11-23': 600, '2026-11-26': 300, '2026-11-22': 1200, '2026-11-16': 60}}], '2026-11-26', 12);
  assert.equal(summary.thisWeek, 900);
  assert.equal(summary.lastWeek, 1260);
  assert.equal(summary.calendar.length, 12);
  assert.ok(summary.calendar.every(week => week.length === 7));
  const lastWeek = summary.calendar.at(-1);
  assert.equal(lastWeek[0].day, '2026-11-23');
  assert.equal(lastWeek[3].seconds, 300);
  assert.equal(lastWeek[4].future, true);
  assert.equal(summary.activeDays, 4);
  assert.equal(summary.windowSeconds, 2160);
});

test('heatmap levels and durations read naturally', () => {
  assert.deepEqual([0, 30, 599, 600, 1199, 1200, 2399, 2400, 9000].map(activityLevel), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(formatDuration(20), 'Under 1 min');
  assert.equal(formatDuration(0), '0 min');
  assert.equal(formatDuration(1500), '25 min');
  assert.equal(formatDuration(3600), '1 h');
  assert.equal(formatDuration(5100), '1 h 25 min');
});
