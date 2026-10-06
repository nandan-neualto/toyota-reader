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
  category: "Continuous improvement", description: "Linking Strategy and Operational Excellence to Achieve Superior Performance",
};
export type TocEntry = { title: string; target: string | number; depth: number };
