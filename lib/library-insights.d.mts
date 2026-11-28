export type LibraryInsights = {
  days: number; since: string; today: string;
  totals: { employees: number; activeReaders: number; minutes: number; booksStarted: number; booksCompleted: number; neverStarted: number; availableBooks: number };
  daily: { date: string; minutes: number; readers: number }[];
  topBooks: { id: string; title: string; author: string; readers: number; minutes: number; started: number; completed: number }[];
  collections: { name: string; minutes: number; readers: number }[];
};
export function summarizeLibrary(input: { rows: { userId: string; bookId: string; record: unknown }[]; users: { id: string; active: boolean }[]; books: { id: string; title: string; author: string; category: string; active: boolean }[]; today: string; days?: number }): LibraryInsights;
