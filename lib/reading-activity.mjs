// Reading time per calendar day. Each book record keeps {"YYYY-MM-DD": seconds} for the
// employee's local calendar date, so a day stays the same day on every device.
import {isGoalDate} from './reading-plans.mjs';

export const ACTIVITY_DAYS = 400;
export const STREAK_SECONDS = 60;
const DAY = 86400000, MAX_DAY_SECONDS = 86400;

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
// Calendar arithmetic in UTC so daylight-saving changes never skip or repeat a day.
const toTime = day => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const fromTime = time => new Date(time).toISOString().slice(0, 10);
export const addDays = (day, count) => fromTime(toTime(day) + count * DAY);
const weekday = day => (new Date(toTime(day)).getUTCDay() + 6) % 7; // Monday = 0

function prune(activity) {
  const days = Object.keys(activity).sort();
  if (days.length <= ACTIVITY_DAYS) return activity;
  return Object.fromEntries(days.slice(-ACTIVITY_DAYS).map(day => [day, activity[day]]));
}

/** Server and cache validation: real dates, whole seconds within a day, bounded history. */
export function cleanActivity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid reading activity.');
  const entries = Object.entries(value);
  if (entries.length > ACTIVITY_DAYS + 31) throw new Error('Invalid reading activity.');
  const clean = {};
  for (const [day, seconds] of entries) {
    if (!day || !isGoalDate(day) || !Number.isInteger(seconds) || seconds < 0 || seconds > MAX_DAY_SECONDS) throw new Error('Invalid reading activity.');
    if (seconds) clean[day] = seconds;
  }
  return prune(clean);
}

/** Add reading time to a record's day, returning the new activity map. */
export function addReadingTime(activity = {}, seconds, day = localDate()) {
  const add = Math.max(0, Math.round(seconds));
  if (!add) return {...activity};
  return prune({...activity, [day]: Math.min(MAX_DAY_SECONDS, (activity[day] || 0) + add)});
}

/**
 * Two devices each report their running total for a day; keeping the larger never
 * double-counts a retried save, and an older client that omits activity keeps it.
 */
export function mergeActivity(previous = {}, incoming = {}) {
  const merged = {...previous};
  for (const [day, seconds] of Object.entries(incoming)) merged[day] = Math.max(merged[day] || 0, seconds);
  return prune(merged);
}

/** Totals across books, streaks, this week against last week, and a weeks x 7 calendar. */
export function summarizeActivity(records, today = localDate(), weeks = 12) {
  const byDay = {};
  for (const record of records) for (const [day, seconds] of Object.entries(record?.activity || {})) byDay[day] = (byDay[day] || 0) + seconds;
  const counts = day => (byDay[day] || 0) >= STREAK_SECONDS;
  // A streak stays alive until the end of today, so it may end yesterday.
  let streak = 0;
  for (let day = counts(today) ? today : addDays(today, -1); counts(day); day = addDays(day, -1)) streak++;
  let longest = 0, run = 0, previous = '';
  for (const day of Object.keys(byDay).filter(counts).sort()) {
    run = previous && addDays(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run); previous = day;
  }
  const weekStart = addDays(today, -weekday(today));
  const sum = (from, to) => { let total = 0; for (let day = from; day <= to; day = addDays(day, 1)) total += byDay[day] || 0; return total; };
  const thisWeek = sum(weekStart, today), lastWeek = sum(addDays(weekStart, -7), addDays(weekStart, -1));
  const first = addDays(weekStart, -7 * (weeks - 1));
  const calendar = Array.from({length: weeks}, (_, week) => Array.from({length: 7}, (_, index) => {
    const day = addDays(first, week * 7 + index);
    return {day, seconds: byDay[day] || 0, future: day > today};
  }));
  const inWindow = calendar.flat().filter(cell => !cell.future);
  return {
    streak, longest, thisWeek, lastWeek, calendar,
    activeDays: inWindow.filter(cell => cell.seconds >= STREAK_SECONDS).length,
    windowSeconds: inWindow.reduce((total, cell) => total + cell.seconds, 0),
    days: Object.entries(byDay).filter(([, seconds]) => seconds > 0).sort(([a], [b]) => b.localeCompare(a)).map(([day, seconds]) => ({day, seconds})),
  };
}

/** Heatmap intensity: 0 = no reading, then four steps of minutes read. */
export const ACTIVITY_LEVELS = [{min: 1, label: 'Under 10 min'}, {min: 600, label: '10–19 min'}, {min: 1200, label: '20–39 min'}, {min: 2400, label: '40 min or more'}];
export function activityLevel(seconds) {
  let level = 0;
  ACTIVITY_LEVELS.forEach((step, index) => { if (seconds >= step.min) level = index + 1; });
  return level;
}

export function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (seconds > 0 && minutes < 1) return 'Under 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
