import bundledList from "./bundled-books.json";
export type BookEntry = {
  id: string; title: string; subtitle?: string; author: string; format: "pdf" | "epub";
  url?: string; file?: File; cover?: string; pages?: number; language: string;
  category?: string; description?: string; active?: boolean; bytes?: number; addedAt?: string; personal?: boolean;
};
export const featuredBook: BookEntry = {
  id: "toyota-way-continuous-improvement",
  title: "The Toyota Way to Continuous Improvement",
  subtitle: "Linking Strategy and Operational Excellence to Achieve Superior Performance",
  author: "Jeffrey K. Liker & James K. Franz", format: "pdf",
  url: "/books/toyota-way-continuous-improvement.pdf",
  cover: "/books/toyota-way-cover.jpg", pages: 481, language: "en",
  addedAt: "2026-09-28T00:00:00.000Z", category: "Continuous improvement", description: "Linking Strategy and Operational Excellence to Achieve Superior Performance",
};
/** Public-domain books that ship with the library (files in public/books/library). The server adds them to the catalogue on startup. */
export const publicDomainBooks = bundledList as BookEntry[];
export const bundledBooks: BookEntry[] = [featuredBook, ...publicDomainBooks];
const bundledById = new Map(bundledBooks.map(book => [book.id, book]));
export const bundledBook = (id: string) => bundledById.get(id);
export type TocEntry = { title: string; target: string | number; depth: number };
/** One search result: a PDF page (with its match count) or an EPUB location. */
export type SearchHit = { key: string; target: string | number; label: string; count: number; before: string; match: string; after: string };
/** Streams results as the book is searched; resolves when finished or aborted. */
export type SearchRunner = (query: string, signal: AbortSignal, onProgress: (hits: SearchHit[], searched: number, total: number, matches: number) => void) => Promise<void>;
