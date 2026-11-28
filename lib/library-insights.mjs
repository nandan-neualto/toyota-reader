// Library-wide reading figures for administrators. Everything is aggregated: the report
// counts readers and minutes, and never lists what an individual employee reads.
import { addDays } from './reading-activity.mjs';

/**
 * rows: [{ userId, bookId, record }] with parsed reading records; users: [{ id, active, role }];
 * books: [{ id, title, author, category, active }]; today: YYYY-MM-DD; days: report length.
 */
export function summarizeLibrary({ rows, users, books, today, days = 30 }) {
  const since = addDays(today, -(days - 1));
  const daily = new Map();
  for (let index = 0; index < days; index++) daily.set(addDays(since, index), { seconds: 0, readers: new Set() });
  const byBook = new Map(), byCollection = new Map(), activeReaders = new Set(), everStarted = new Set();
  const bookInfo = new Map(books.map(book => [book.id, book]));
  let seconds = 0, started = 0, completed = 0;
  for (const { userId, bookId, record } of rows) {
    if (!record) continue;
    const book = bookInfo.get(bookId);
    const entry = byBook.get(bookId) ?? { readers: new Set(), seconds: 0, started: 0, completed: 0 };
    if (record.started) { started++; entry.started++; everStarted.add(userId); }
    if (record.completed) { completed++; entry.completed++; }
    for (const [date, value] of Object.entries(record.activity ?? {})) {
      const bucket = daily.get(date);
      if (!bucket || !(value > 0)) continue;
      bucket.seconds += value; bucket.readers.add(userId);
      entry.seconds += value; entry.readers.add(userId);
      seconds += value; activeReaders.add(userId);
      const name = book?.category || 'General';
      const collection = byCollection.get(name) ?? { seconds: 0, readers: new Set() };
      collection.seconds += value; collection.readers.add(userId);
      byCollection.set(name, collection);
    }
    byBook.set(bookId, entry);
  }
  const minutes = value => Math.round(value / 60);
  const activeUsers = users.filter(user => user.active);
  const topBooks = [...byBook].filter(([id, entry]) => bookInfo.has(id) && (entry.readers.size || entry.started))
    .sort(([, a], [, b]) => b.readers.size - a.readers.size || b.seconds - a.seconds || b.started - a.started)
    .slice(0, 10)
    .map(([id, entry]) => ({ id, title: bookInfo.get(id).title, author: bookInfo.get(id).author, readers: entry.readers.size, minutes: minutes(entry.seconds), started: entry.started, completed: entry.completed }));
  return {
    days, since, today,
    totals: {
      employees: activeUsers.length,
      activeReaders: activeReaders.size,
      minutes: minutes(seconds),
      booksStarted: started,
      booksCompleted: completed,
      neverStarted: activeUsers.filter(user => !everStarted.has(user.id)).length,
      availableBooks: books.filter(book => book.active).length,
    },
    daily: [...daily].map(([date, bucket]) => ({ date, minutes: minutes(bucket.seconds), readers: bucket.readers.size })),
    topBooks,
    collections: [...byCollection].map(([name, entry]) => ({ name, minutes: minutes(entry.seconds), readers: entry.readers.size })).sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name)),
  };
}
