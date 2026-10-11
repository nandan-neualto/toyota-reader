import type {BookEntry} from './catalog';
export type CatalogFilters = {query?: string; status?: string; collection?: string; format?: string; language?: string; sort?: string};
export function filterCatalog(books: BookEntry[], filters?: CatalogFilters, usage?: Record<string, number>): BookEntry[];
export function selectVisibleBooks(selected: string[], visibleIds: string[], checked: boolean, cap?: number): string[];
export function catalogCsv(books: BookEntry[], usage?: Record<string, number>): string;
