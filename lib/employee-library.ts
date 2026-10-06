import type {BookEntry} from "./catalog";

export type Employee = {id:string; employeeId:string; name:string; role:"admin"|"employee"; active:boolean};
export type Bookmark = {id:string;label:string;page:number;cfi:string};
export type ReadingRecord = {page:number;total:number;percent:number;cfi:string;started:boolean;completed:boolean;favorite:boolean;notes:string;bookmarks:Bookmark[];version:number;updatedAt?:string;lastReadAt?:string|null;lastMutationId?:string};
export type PendingSave = {record:ReadingRecord;expectedVersion:number;mutationId:string};
export type ProfileStore = {records:Record<string,ReadingRecord>;pending:Record<string,PendingSave>};
export const emptyRecord = ():ReadingRecord => ({page:1,total:0,percent:0,cfi:"",started:false,completed:false,favorite:false,notes:"",bookmarks:[],version:0});
export class ApiError extends Error { constructor(public status:number,message:string,public data:unknown){super(message);} }
let requestEmployee:string|null=null;
export function bindEmployee(id:string|null){requestEmployee=id;}
export async function api<T>(path:string,init:RequestInit={}):Promise<T>{
 const headers=new Headers(init.headers);
 if(requestEmployee&&!(path==="/api/session"&&init.method==="POST")&&!headers.has("X-Library-User"))headers.set("X-Library-User",requestEmployee);
 if(init.body&&typeof init.body==="string"&&!headers.has("Content-Type"))headers.set("Content-Type","application/json");
 const response=await fetch(path,{...init,credentials:"same-origin",cache:"no-store",headers});
 const data=await response.json().catch(()=>({error:"The library returned an unreadable response."})) as {error?:string};
 if(!response.ok)throw new ApiError(response.status,data.error||"The request could not be completed.",data);
 return data as T;
}
export function readProfile(id:string):ProfileStore {
 const raw=localStorage.getItem("toyota-library-profile:"+id);if(!raw)return {records:{},pending:{}};
 const parsed=JSON.parse(raw) as ProfileStore;
 if(!parsed.records||!parsed.pending||typeof parsed.records!=="object"||typeof parsed.pending!=="object")throw new Error("Your local reading cache is unreadable. Server progress is still available.");
 return parsed;
}
export function writeProfile(id:string,store:ProfileStore){localStorage.setItem("toyota-library-profile:"+id,JSON.stringify(store));}
export function catalogCache(id:string,books?:BookEntry[]):BookEntry[]{const key="toyota-library-catalog:"+id;if(books){localStorage.setItem(key,JSON.stringify(books));return books;}const data=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(data)?data:[];}

// Files are kept separately from small profile records so large books do not fill localStorage.
async function filesDb(){return await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open("toyota-library-files",1);request.onupgradeneeded=()=>request.result.createObjectStore("books");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error("Offline storage is unavailable in this browser."));});}
async function fileOperation<T>(id:string,bookId:string,mode:IDBTransactionMode,operation:(store:IDBObjectStore,key:string)=>IDBRequest):Promise<T>{
 const db=await filesDb();try{return await new Promise<T>((resolve,reject)=>{const transaction=db.transaction("books",mode),request=operation(transaction.objectStore("books"),id+":"+bookId);let value:T;request.onsuccess=()=>{value=request.result;};transaction.oncomplete=()=>resolve(value);transaction.onerror=()=>reject(new Error("Could not save this book offline. Check available device storage."));transaction.onabort=()=>reject(new Error("Offline book storage was interrupted."));});}finally{db.close();}
}
export const cachedFile=(id:string,bookId:string)=>fileOperation<File|undefined>(id,bookId,"readonly",(s,k)=>s.get(k));
export const storeFile=(id:string,bookId:string,file:File)=>fileOperation<unknown>(id,bookId,"readwrite",(s,k)=>s.put(file,k));
export const removeFile=(id:string,bookId:string)=>fileOperation<unknown>(id,bookId,"readwrite",(s,k)=>s.delete(k));
export async function clearFiles(id:string){const db=await filesDb();try{await new Promise<void>((resolve,reject)=>{const transaction=db.transaction("books","readwrite"),request=transaction.objectStore("books").openCursor(IDBKeyRange.bound(id+":",id+":\uffff"));request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(new Error("Could not clear downloaded copies."));});}finally{db.close();}}
