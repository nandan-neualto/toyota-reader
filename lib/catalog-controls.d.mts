import type {BookEntry} from './catalog';
import type {Employee} from './employee-library';
export type CatalogFilters = {query?: string; status?: string; collection?: string; format?: string; language?: string; sort?: string; quality?: string};
export function filterCatalog(books: BookEntry[], filters?: CatalogFilters, usage?: Record<string, number>): BookEntry[];
export function filterEmployees(employees: Employee[], filters?: {query?: string; role?: string; status?: string}): Employee[];
export function paginateRecords<T>(records: T[], requestedPage?: number, requestedSize?: number): {items:T[]; total:number; page:number; pages:number; size:number; from:number; to:number};
export function selectVisibleBooks(selected: string[], visibleIds: string[], checked: boolean, cap?: number): string[];
export function catalogCsv(books: BookEntry[], usage?: Record<string, number>): string;
