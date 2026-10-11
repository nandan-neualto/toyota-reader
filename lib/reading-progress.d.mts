export type PageRange=[number,number];
export type ProgressRecord={page?:number;total?:number;percent?:number;started?:boolean;completed?:boolean;readRanges?:PageRange[];furthestPercent?:number;furthestPage?:number};
export type ReadingLocation={format:'pdf'|'epub';page:number;total:number;cfi?:string;percent:number;at?:string};
export function normalizeReadRanges(value:unknown,total?:number):PageRange[];
export function getReadingProgress(record?:ProgressRecord,format?:'pdf'|'epub',fallbackTotal?:number):{percent:number;pagesRead:number|null;total:number;positionPercent:number;tracked:boolean};
export function trackReadingLocation<T extends ProgressRecord>(record:T,location:ReadingLocation):T&{page:number;total:number;percent:number;cfi:string;started:true;lastReadAt:string;furthestPercent:number;readRanges?:PageRange[];furthestPage?:number};
export function mergeReadingHistory<T extends ProgressRecord>(previous:ProgressRecord,incoming:T):T;
export function formatProgress(percent:number):string;
