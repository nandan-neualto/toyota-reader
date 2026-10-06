"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {featuredBook,type BookEntry} from "@/lib/catalog";
import {api,ApiError,bindEmployee,emptyRecord,readProfile,writeProfile,catalogCache,cachedFile,storeFile,type Employee,type ProfileStore,type ReadingRecord} from "@/lib/employee-library";

export function useEmployeeLibrary(){
 const [user,setUser]=useState<Employee|null>(null),[checking,setChecking]=useState(true),[guest,setGuest]=useState(false);
 const [books,setBooks]=useState<BookEntry[]>([featuredBook]),[records,setRecords]=useState<ProfileStore["records"]>({});
 const [pendingCount,setPendingCount]=useState(0),[syncing,setSyncing]=useState(false),[message,setMessage]=useState("");
 const [deviceSaved,setDeviceSaved]=useState(true),storageWorks=useRef(true);
 const [closing,setClosing]=useState(false),completion=useRef<Promise<void>>(Promise.resolve());
 const [conflicts,setConflicts]=useState<Record<string,ReadingRecord>>({});
 const person=useRef<Employee|null>(null),store=useRef<ProfileStore>({records:{},pending:{}}),running=useRef(false),generation=useRef(0),conflictRef=useRef<Record<string,ReadingRecord>>({});
 const volatileProfiles=useRef<Record<string,ProfileStore>>({});
 const channelRef=useRef<BroadcastChannel|null>(null),closingNow=useRef(false);
 const publish=useCallback(()=>{setRecords({...store.current.records});setPendingCount(Object.keys(store.current.pending).length);},[]);
 const persist=useCallback(()=>{if(!person.current)return;try{writeProfile(person.current.id,store.current);storageWorks.current=true;setDeviceSaved(true);}catch{storageWorks.current=false;setDeviceSaved(false);setMessage("Device storage is unavailable. Keep this page open until your changes reach the server.");}publish();},[publish]);
 const flush=useCallback(async()=>{
  const employee=person.current;if(!employee)return;if(running.current){await completion.current;return;}
  let finishWait!:()=>void;completion.current=new Promise<void>(resolve=>{finishWait=resolve;});
  const epoch=generation.current;running.current=true;setSyncing(true);
  try{
   for(const id of Object.keys(store.current.pending)){
    if(epoch!==generation.current)break;
    if(conflictRef.current[id])continue;
    const pending=store.current.pending[id];if(!pending)continue;
    try{
     const result=await api<{record:ReadingRecord}>("/api/reading/"+id,{method:"PUT",body:JSON.stringify(pending),signal:AbortSignal.timeout(8000)});
     if(epoch!==generation.current)break;
     const current=store.current.pending[id];
     if(current?.mutationId===pending.mutationId){store.current.records[id]=result.record;delete store.current.pending[id];}
     else if(current){current.expectedVersion=result.record.version;current.record.version=result.record.version;store.current.records[id]={...store.current.records[id],version:result.record.version};}
     persist();
    }catch(error){
     if(epoch!==generation.current)break;
     if(error instanceof ApiError&&error.status===409){const cloud=(error.data as {record:ReadingRecord}).record;conflictRef.current={...conflictRef.current,[id]:cloud};setConflicts({...conflictRef.current});continue;}
     setMessage(error instanceof ApiError?error.message:storageWorks.current?"Offline — your saved changes will sync when this connection returns.":"Offline and device storage is unavailable. Keep this tab open until your changes reach the server.");break;
    }
   }
  }finally{running.current=false;finishWait();if(epoch===generation.current){setSyncing(false);if(!Object.keys(store.current.pending).length)setMessage("");}}
 },[persist]);
 const adopt=useCallback(async(employee:Employee)=>{
  const epoch=++generation.current;person.current=employee;bindEmployee(employee.id);setUser(employee);setGuest(false);setMessage("");
  channelRef.current?.postMessage({type:"sign-in",id:employee.id});
  conflictRef.current={};setConflicts({});
  try{store.current=volatileProfiles.current[employee.id]||readProfile(employee.id);}catch{store.current={records:{},pending:{}};setMessage("Local cache could not be read. Loading your server progress.");}publish();
  try{
   const [catalog,profile]=await Promise.all([api<{books:BookEntry[]}>("/api/catalog"),api<{records:ProfileStore["records"]}>("/api/profile")]);
   if(epoch!==generation.current)return;
   setBooks(catalog.books);try{catalogCache(employee.id,catalog.books);}catch{}
   const merged={...profile.records};
   for(const [id,pending] of Object.entries(store.current.pending)){
    const cloud=profile.records[id]||emptyRecord();
    if(cloud.lastMutationId===pending.mutationId){delete store.current.pending[id];continue;}
    merged[id]=pending.record;
    if(cloud.version!==pending.expectedVersion)conflictRef.current[id]=cloud;
   }
   store.current.records=merged;setConflicts({...conflictRef.current});persist();void flush();
  }catch(error){
   if(epoch!==generation.current)return;
   try{setBooks(catalogCache(employee.id));}catch{setBooks([featuredBook]);}
   setMessage(error instanceof ApiError?error.message:"The library is offline. Downloaded books and local progress remain available.");
  }
 },[publish,persist,flush]);
 useEffect(()=>{let cancelled=false;void (async()=>{try{
   const signedOut=localStorage.getItem("toyota-library-signed-out");if(signedOut){try{await api("/api/logout",{method:"POST",body:"{}",headers:signedOut!=="1"?{"X-Library-User":signedOut}:{}});}catch(error){if(!(error instanceof ApiError&&error.status===401))throw error;}localStorage.removeItem("toyota-library-signed-out");return;}
   const response=await api<{user:Employee}>("/api/session");if(!cancelled)await adopt(response.user);
  }catch(error){if(!cancelled&&!(error instanceof ApiError&&error.status===401))setMessage("Connect to the library server to sign in. Guest reading is available.");}finally{if(!cancelled)setChecking(false);}})();return()=>{cancelled=true;};},[adopt]);
 useEffect(()=>{const online=()=>{void flush();if(!person.current)try{const signedOut=localStorage.getItem("toyota-library-signed-out");if(signedOut)void api("/api/logout",{method:"POST",body:"{}",headers:signedOut!=="1"?{"X-Library-User":signedOut}:{}}).then(()=>{localStorage.removeItem("toyota-library-signed-out");setMessage("");}).catch(error=>{if(error instanceof ApiError&&error.status===401)localStorage.removeItem("toyota-library-signed-out");});}catch{}};window.addEventListener("online",online);const interval=setInterval(online,5000);return()=>{window.removeEventListener("online",online);clearInterval(interval);};},[flush]);
 const login=useCallback(async(employeeId:string,pin:string)=>{const result=await api<{user:Employee}>("/api/session",{method:"POST",body:JSON.stringify({employeeId,pin})});try{localStorage.removeItem("toyota-library-signed-out");}catch{}setChecking(true);try{await adopt(result.user);}finally{setChecking(false);}},[adopt]);
 const logout=useCallback(async()=>{
  if(closingNow.current)return;closingNow.current=true;
  // Hide the account while the last save completes; revoke the session afterward.
  setClosing(true);setChecking(true);
  const signoutId=person.current?.id;
  const before=Object.values(store.current.pending).map(p=>p.mutationId).join(',');await flush();
  if(Object.keys(store.current.pending).length&&before!==Object.values(store.current.pending).map(p=>p.mutationId).join(','))await flush();
  const memoryOnly=!!person.current&&!storageWorks.current&&!!Object.keys(store.current.pending).length;
  if(memoryOnly)volatileProfiles.current[person.current!.id]=store.current;
  generation.current++;person.current=null;setUser(null);setGuest(false);store.current={records:{},pending:{}};setRecords({});setPendingCount(0);setSyncing(false);conflictRef.current={};setConflicts({});setBooks([featuredBook]);setMessage("");
  if(signoutId)channelRef.current?.postMessage({type:"sign-out",id:signoutId});
  try{localStorage.setItem("toyota-library-signed-out",signoutId||"1");}catch{}
  try{await api("/api/logout",{method:"POST",body:"{}",signal:AbortSignal.timeout(8000),headers:signoutId?{"X-Library-User":signoutId}:{}});localStorage.removeItem("toyota-library-signed-out");if(memoryOnly)setMessage("Some changes are only in this tab. Keep it open and sign in again when online to sync them.");}catch{setMessage(memoryOnly?"Some changes are only in this tab. Keep it open and sign in again when online to sync them.":"You are signed out on this screen. Reconnect so the server can finish ending your session.");}finally{bindEmployee(null);closingNow.current=false;setClosing(false);setChecking(false);}
 },[flush]);
 useEffect(()=>{if(typeof BroadcastChannel==="undefined")return;const channel=new BroadcastChannel("toyota-library-accounts");channelRef.current=channel;channel.onmessage=event=>{const active=person.current,data=event.data;if(active&&((data?.type==="sign-in"&&data.id!==active.id)||(data?.type==="sign-out"&&data.id===active.id)))void logout();};return()=>{channel.close();channelRef.current=null;};},[logout]);
 const update=useCallback((bookId:string,change:Partial<ReadingRecord>)=>{
  if(!person.current)return;
  const old=store.current.records[bookId]||emptyRecord();const record={...old,...change};
  const previous=store.current.pending[bookId];
  store.current.records[bookId]=record;store.current.pending[bookId]={record,expectedVersion:previous?.expectedVersion??old.version,mutationId:crypto.randomUUID()};persist();
 },[persist]);
 const resolveConflict=useCallback((bookId:string,useLocal:boolean)=>{
  const cloud=conflictRef.current[bookId];if(!cloud)return;
  if(useLocal&&store.current.pending[bookId]){store.current.pending[bookId].expectedVersion=cloud.version;store.current.pending[bookId].mutationId=crypto.randomUUID();}
  else{store.current.records[bookId]=cloud;delete store.current.pending[bookId];}
  delete conflictRef.current[bookId];setConflicts({...conflictRef.current});persist();void flush();
 },[persist,flush]);
 const refresh=useCallback(async()=>{const result=await api<{books:BookEntry[]}>("/api/catalog");setBooks(result.books);if(person.current)try{catalogCache(person.current.id,result.books);}catch{}},[]);
 const loadBook=useCallback(async(book:BookEntry)=>{
  if(!person.current||book.file)return book;
  const id=person.current.id;
  // Bundled files already have a service-worker copy and can stream directly.
  if(book.id===featuredBook.id)return {...book,url:featuredBook.url};
  let file:File|undefined;try{file=await cachedFile(id,book.id);}catch{}
  if(!file){const response=await fetch(book.url!,{credentials:"same-origin",cache:"no-store",headers:{"X-Library-User":id}});if(!response.ok)throw new Error("This book is unavailable. Reconnect or ask the library administrator.");file=new File([await response.blob()],book.title+"."+book.format,{type:book.format==="pdf"?"application/pdf":"application/epub+zip"});}
  return {...book,file};
 },[]);
 const download=useCallback(async(book:BookEntry)=>{if(!person.current)return;const id=person.current.id,entry=await loadBook(book);let file=entry.file;if(!file){const response=await fetch(entry.url!);if(!response.ok)throw new Error("The book could not be downloaded.");file=new File([await response.blob()],book.title+"."+book.format);}if(person.current?.id!==id)throw new Error("Your account changed before the download finished. Try again after signing in.");await storeFile(id,book.id,file);},[loadBook]);
 return {user,checking,closing,guest,setGuest,books,records,pendingCount,syncing,deviceSaved,message,conflicts,login,logout,update,flush,refresh,resolveConflict,loadBook,download};
}
export type EmployeeLibrary=ReturnType<typeof useEmployeeLibrary>;
