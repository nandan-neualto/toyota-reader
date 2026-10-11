"use client";

import {useMemo, useState} from "react";
import {ArrowUpRight, BookOpen, CheckCircle2, CloudCheck, CloudUpload, Heart, History, LoaderCircle, ShieldCheck, TriangleAlert, UserRound} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogTitle} from "@/components/ui/dialog";
import type {EmployeeLibrary} from "@/hooks/use-employee-library";
import type {BookEntry} from "@/lib/catalog";
import type {ReadingRecord} from "@/lib/employee-library";
import {formatProgress, getReadingProgress} from "@/lib/reading-progress.mjs";

type Props = {library:EmployeeLibrary; onOpenBook:(book:BookEntry)=>void; onClose:()=>void};
type Shelf = "reading" | "completed" | "all";
type Sort = "recent" | "progress" | "title";
type HistoryEntry = {id:string; book?:BookEntry; record:ReadingRecord};

function lastReadLabel(value?:string|null){
 if(!value)return "Not opened yet";
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return "Last read date unavailable";
 return new Intl.DateTimeFormat(undefined,{day:"numeric",month:"short",year:"numeric"}).format(date);
}

function ProgressDetail({entry}:{entry:HistoryEntry}){
 const {book,record}=entry;
 const format=book?.format||(record.total>0?"pdf":"epub");
 const progress=getReadingProgress(record,format,book?.pages);
 const trackedPages=format==="pdf"&&progress.tracked&&progress.pagesRead!==null;
 const label=trackedPages?"Pages opened":format==="pdf"?"Saved reading position":"Reading position";
 const summary=trackedPages?`${progress.pagesRead} of ${progress.total} pages opened`:`${formatProgress(progress.percent)} ${format==="pdf"||!progress.tracked?"saved position":"furthest position"}`;
 const page=Math.max(1,Math.floor(record.page||1));
 return <div className="reading-history-progress">
  <div className="reading-history-progress-heading"><span>{label}</span><strong>{formatProgress(progress.percent)}</strong></div>
  <div className="reading-history-meter" role="progressbar" aria-label={`${book?.title||"Unavailable book"}: ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.percent*10)/10} aria-valuetext={summary}><span style={{width:`${progress.percent}%`}}/></div>
  <p>{trackedPages?`${progress.pagesRead} of ${progress.total} pages`:format==="pdf"?"Page coverage has not been tracked yet.":progress.tracked?"Based on your furthest EPUB location.":"Your saved EPUB location."}</p>
  {record.started&&<small>{format==="pdf"?`Resume on page ${page}${progress.total?` of ${progress.total}`:""}`:`Resume at ${formatProgress(progress.positionPercent)} of the book`}</small>}
 </div>;
}

export default function ReadingDashboard({library,onOpenBook,onClose}:Props){
 const [shelf,setShelf]=useState<Shelf>("all"),[sort,setSort]=useState<Sort>("recent"),[visible,setVisible]=useState(24);
 const books=useMemo(()=>new Map([...library.historyBooks,...library.books].map(book=>[book.id,book])),[library.books,library.historyBooks]);
 const availableIds=useMemo(()=>new Set(library.books.filter(book=>book.active!==false).map(book=>book.id)),[library.books]);
 const entries=useMemo(()=>Object.entries(library.records).filter(([,record])=>record.started||record.completed||record.favorite||!!record.notes||!!record.bookmarks?.length).map(([id,record]):HistoryEntry=>({id,record,book:books.get(id)})),[library.records,books]);
 const counts=useMemo(()=>entries.reduce((result,{record})=>{
  if(record.started||record.completed)result.started++;
  if(record.started&&!record.completed)result.reading++;
  if(record.completed)result.completed++;
  if(record.favorite)result.favorites++;
  return result;
 },{started:0,reading:0,completed:0,favorites:0}),[entries]);
 const filtered=useMemo(()=>entries.filter(({record})=>shelf==="all"||(shelf==="completed"?record.completed:record.started&&!record.completed)).sort((a,b)=>{
  if(sort==="progress"){
   const aProgress=getReadingProgress(a.record,a.book?.format||(a.record.total>0?"pdf":"epub"),a.book?.pages);
   const bProgress=getReadingProgress(b.record,b.book?.format||(b.record.total>0?"pdf":"epub"),b.book?.pages);
   if(bProgress.percent!==aProgress.percent)return bProgress.percent-aProgress.percent;
  }
  if(sort==="recent"){
   const difference=(b.record.lastReadAt||"").localeCompare(a.record.lastReadAt||"");
   if(difference)return difference;
  }
  return (a.book?.title||a.id).localeCompare(b.book?.title||b.id);
 }),[entries,shelf,sort]);
 const hasConflicts=Object.keys(library.conflicts).length>0;
 const status=hasConflicts?"Reading records need your attention":library.syncing?"Saving to your account…":library.pendingCount?library.deviceSaved?"Saved on this device":"Waiting to save your changes":"Saved to your account";
 const statusDetail=hasConflicts?"Resolve the newer records in your library before they can sync.":library.pendingCount?library.deviceSaved?`${library.pendingCount} ${library.pendingCount===1?"book has":"books have"} changes waiting for server confirmation.`:"Device storage is unavailable. Keep this tab open until the server confirms your changes.":library.syncing?"Keep this page open while your reading records reach the server.":"Your saved positions will be here the next time you sign in.";
 const StatusIcon=hasConflicts||library.pendingCount&&!library.deviceSaved?TriangleAlert:library.syncing?LoaderCircle:library.pendingCount?CloudUpload:CloudCheck;
 const warning=hasConflicts||!!library.pendingCount;
 if(!library.user)return null;
 function changeRecord(id:string,change:Partial<ReadingRecord>){library.update(id,change);void library.flush();}
 function openBook(book:BookEntry){onClose();onOpenBook(book);}
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="reading-dashboard">
  <header className="reading-dashboard-heading"><span className="reading-dashboard-kicker"><History size={15}/> YOUR EMPLOYEE ACCOUNT</span><DialogTitle>My reading progress</DialogTitle><DialogDescription>Your place in every book, ready for your next visit.</DialogDescription></header>
  <div className="reading-dashboard-body">
   <div className="reading-profile"><div className="reading-profile-avatar"><UserRound size={23}/></div><div><strong>{library.user.name}</strong><span>Employee ID · {library.user.employeeId}</span></div><span className="reading-profile-private"><ShieldCheck size={16}/> Personal reading record</span></div>
   <div className="reading-dashboard-stats" aria-label="Your reading summary"><div><BookOpen size={20}/><strong>{counts.started}</strong><span>Books started</span></div><div><CheckCircle2 size={20}/><strong>{counts.completed}</strong><span>Marked completed</span></div><div><Heart size={20}/><strong>{counts.favorites}</strong><span>Favorites</span></div></div>
   <div className={"reading-save-status "+(warning?"has-pending":"")} role="status"><StatusIcon size={21} className={library.syncing?"reader-spinner":""}/><div><strong>{status}</strong><p>{statusDetail}</p>{library.message&&<p>{library.message}</p>}</div>{!!library.pendingCount&&!hasConflicts&&<button type="button" className="toolbar-button" disabled={library.syncing} onClick={()=>void library.flush()}>Sync now</button>}</div>
   <div className="reading-history-tools"><div className="reading-history-filters" role="group" aria-label="Filter reading history">{([{value:"all",label:"All my books",count:entries.length},{value:"reading",label:"In progress",count:counts.reading},{value:"completed",label:"Completed",count:counts.completed}] as const).map(item=><button type="button" key={item.value} aria-pressed={shelf===item.value} onClick={()=>{setShelf(item.value);setVisible(24);}}>{item.label}<span>{item.count}</span></button>)}</div><label className="reading-history-sort"><span>Sort by</span><select aria-label="Sort reading history" value={sort} onChange={event=>{setSort(event.target.value as Sort);setVisible(24);}}><option value="recent">Last read</option><option value="progress">Progress</option><option value="title">Title A–Z</option></select></label></div>
   <p className="reading-history-result" role="status">{filtered.length} {filtered.length===1?"book":"books"}{shelf==="all"?" in your reading record":shelf==="reading"?" in progress":" marked completed"}</p>
   <div className="reading-history-list">{filtered.slice(0,visible).map(entry=>{
    const {id,book,record}=entry,available=!!book&&availableIds.has(id);
    return <article className="reading-history-book" key={id}><div className={"reading-history-book-icon "+(record.completed?"is-completed":"")} aria-hidden="true">{record.completed?<CheckCircle2 size={27}/>:<BookOpen size={27}/>}</div><div className="reading-history-book-copy"><div className="reading-history-tags">{book&&<span>{book.format.toUpperCase()}</span>}{record.completed&&<span className="reading-history-completed">Marked completed</span>}{!available&&<span className="reading-history-unavailable">{book?.active===false?"Archived":"Unavailable"}</span>}</div><h3>{book?.title||"Unavailable book"}</h3><p>{book?.author||"The saved reading record is retained for your account."}</p><small className="reading-history-last-read">{record.lastReadAt?"Last read · ":""}{lastReadLabel(record.lastReadAt)}</small>{!!record.bookmarks?.length&&<small>{record.bookmarks.length} saved {record.bookmarks.length===1?"bookmark":"bookmarks"}</small>}</div><ProgressDetail entry={entry}/><div className="reading-history-book-actions">{available&&book?<><button type="button" className="primary-button" onClick={()=>openBook(book)}>{record.started?"Resume reading":"Open book"}<ArrowUpRight size={17}/></button><div className="reading-history-secondary-actions"><button type="button" className="reading-history-favorite" aria-label={`${record.favorite?"Remove from":"Add to"} favorites: ${book.title}`} aria-pressed={record.favorite} onClick={()=>changeRecord(id,{favorite:!record.favorite})}><Heart size={19} fill={record.favorite?"currentColor":"none"}/></button><button type="button" className="reading-history-complete-button" aria-label={`${record.completed?"Mark in progress":"Mark completed"}: ${book.title}`} onClick={()=>changeRecord(id,{completed:!record.completed,started:true})}><CheckCircle2 size={16}/>{record.completed?"Mark in progress":"Mark completed"}</button></div></>:<p>This book is currently unavailable. Your progress is kept.</p>}</div></article>;
   })}</div>
   {!filtered.length&&<div className="reading-history-empty"><BookOpen size={35}/><h3>{shelf==="completed"?"Your finished books will appear here.":shelf==="reading"?"A new chapter is waiting.":"Make your first book part of your record."}</h3><p>{shelf==="completed"?"Use Mark completed when you finish a book. Your page progress remains available.":"Open a book from the library. Your saved position and progress will appear here."}</p><button type="button" className="toolbar-button" onClick={onClose}>Back to the library</button></div>}
   {filtered.length>visible&&<div className="reading-history-more"><button type="button" className="toolbar-button" onClick={()=>setVisible(value=>value+24)}>Show more ({filtered.length-visible} remaining)</button></div>}
   <p className="reading-dashboard-explanation">PDF progress counts unique pages opened since page tracking began. EPUB progress shows the furthest reading position. You decide when to mark a book completed.</p>
  </div>
  <footer className="reading-dashboard-footer"><span><ShieldCheck size={16}/> Saved separately for employee ID {library.user.employeeId}</span><button type="button" className="toolbar-button" onClick={onClose}>Back to reading</button></footer>
 </DialogContent></Dialog>;
}
