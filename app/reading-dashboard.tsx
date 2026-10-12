"use client";

import {useId, useMemo, useState} from "react";
import {ArrowUpRight, BookOpen, BookmarkPlus, CalendarDays, CheckCircle2, CloudCheck, CloudUpload, Heart, History, LoaderCircle, ShieldCheck, TriangleAlert, UserRound} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogTitle} from "@/components/ui/dialog";
import type {EmployeeLibrary} from "@/hooks/use-employee-library";
import type {BookEntry} from "@/lib/catalog";
import type {ReadingRecord} from "@/lib/employee-library";
import {formatProgress, getReadingProgress} from "@/lib/reading-progress.mjs";
import {isGoalDate} from "@/lib/reading-plans.mjs";

type Props = {library:EmployeeLibrary; onOpenBook:(book:BookEntry)=>void; onClose:()=>void};
type Shelf = "reading" | "later" | "completed" | "goals" | "overdue" | "all";
type Sort = "recent" | "progress" | "title" | "goal";
type HistoryEntry = {id:string; book?:BookEntry; record:ReadingRecord};

function lastReadLabel(value?:string|null){
 if(!value)return "Not opened yet";
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return "Last read date unavailable";
 return new Intl.DateTimeFormat(undefined,{day:"numeric",month:"short",year:"numeric"}).format(date);
}
function todayDate(){
 const date=new Date();
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function goalDateLabel(value:string){
 return new Intl.DateTimeFormat(undefined,{day:"numeric",month:"short",year:"numeric"}).format(new Date(`${value}T12:00:00`));
}

function ReadingPlan({entry,today,onChange}:{entry:HistoryEntry;today:string;onChange:(change:Partial<ReadingRecord>)=>void}){
 const inputId=useId(),[editing,setEditing]=useState(false),[draft,setDraft]=useState("");
 const {record,book}=entry,goal=record.goalDate||"",overdue=!!goal&&!record.completed&&goal<today;
 const label=goal?`${record.completed?"Completed · target":overdue?"Target passed":goal===today?"Your target is today":"Finish by"} ${goalDateLabel(goal)}`:"Set your own finish-by date";
 return <div className="reading-plan">
  <div className="reading-plan-summary"><CalendarDays size={16}/><span className={overdue?"is-overdue":""}>{label}</span>{book&&!editing&&<button type="button" className="reading-plan-edit" aria-label={`${goal?"Change":"Set"} personal target: ${book.title}`} onClick={()=>{setDraft(goal);setEditing(true);}}>{goal?"Change target":"Set target"}</button>}</div>
  {editing&&<form className="reading-plan-form" onSubmit={event=>{event.preventDefault();if(!draft||!isGoalDate(draft))return;onChange({goalDate:draft});setEditing(false);}}>
   <label htmlFor={inputId}>Your finish-by date</label><input id={inputId} type="date" value={draft} required min="0001-01-01" max="9999-12-31" onChange={event=>setDraft(event.target.value)} aria-describedby={`${inputId}-help`}/>
   <p id={`${inputId}-help`}>A personal target you can change at any time. It never marks a book completed.</p>
   <div className="reading-plan-form-actions"><button type="submit" className="toolbar-button" disabled={!draft}>Save target</button><button type="button" className="toolbar-button" onClick={()=>setEditing(false)}>Cancel</button>{goal&&<button type="button" className="reading-plan-remove" onClick={()=>{onChange({goalDate:""});setEditing(false);}}>Remove target</button>}</div>
  </form>}
 </div>;
}

function ProgressDetail({entry}:{entry:HistoryEntry}){
 const {book,record}=entry;
 if(!record.started&&!record.completed)return <div className="reading-history-progress reading-history-not-started"><BookOpen size={19}/><strong>Ready when you are</strong><p>Open this book to begin tracking your reading progress.</p></div>;
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
 const today=todayDate();
 const books=useMemo(()=>new Map([...library.historyBooks,...library.books].map(book=>[book.id,book])),[library.books,library.historyBooks]);
 const availableIds=useMemo(()=>new Set(library.books.filter(book=>book.active!==false).map(book=>book.id)),[library.books]);
 const entries=useMemo(()=>Object.entries(library.records).filter(([,record])=>record.started||record.completed||record.favorite||record.readLater||!!record.goalDate||!!record.notes||!!record.bookmarks?.length).map(([id,record]):HistoryEntry=>({id,record,book:books.get(id)})),[library.records,books]);
 const counts=useMemo(()=>entries.reduce((result,{record})=>{
  if(record.started||record.completed)result.started++;
  if(record.started&&!record.completed)result.reading++;
  if(record.completed)result.completed++;
  if(record.favorite)result.favorites++;
  if(record.readLater)result.later++;
  if(record.goalDate&&!record.completed){result.goals++;if(record.goalDate<today)result.overdue++;else result.upcoming++;}
  return result;
 },{started:0,reading:0,completed:0,favorites:0,later:0,goals:0,overdue:0,upcoming:0}),[entries,today]);
 const filtered=useMemo(()=>entries.filter(({record})=>{
  if(shelf==="all")return true;
  if(shelf==="completed")return record.completed;
  if(shelf==="later")return record.readLater;
  if(shelf==="goals")return !!record.goalDate&&!record.completed;
  if(shelf==="overdue")return !!record.goalDate&&!record.completed&&record.goalDate<today;
  return record.started&&!record.completed;
 }).sort((a,b)=>{
  if(sort==="goal"){
   const difference=(a.record.goalDate||"9999-99-99").localeCompare(b.record.goalDate||"9999-99-99");
   if(difference)return difference;
  }
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
 }),[entries,shelf,sort,today]);
 const hasConflicts=Object.keys(library.conflicts).length>0;
 const status=hasConflicts?"Reading records need your attention":library.syncing?"Saving to your account…":library.pendingCount?library.deviceSaved?"Saved on this device":"Waiting to save your changes":"Saved to your account";
 const statusDetail=hasConflicts?"Resolve the newer records in your library before they can sync.":library.pendingCount?library.deviceSaved?`${library.pendingCount} ${library.pendingCount===1?"book has":"books have"} changes waiting for server confirmation.`:"Device storage is unavailable. Keep this tab open until the server confirms your changes.":library.syncing?"Keep this page open while your reading records reach the server.":"Your progress, read-later list and personal targets will be here next time you sign in.";
 const StatusIcon=hasConflicts||library.pendingCount&&!library.deviceSaved?TriangleAlert:library.syncing?LoaderCircle:library.pendingCount?CloudUpload:CloudCheck;
 const warning=hasConflicts||!!library.pendingCount;
 if(!library.user)return null;
 function changeRecord(id:string,change:Partial<ReadingRecord>){library.update(id,change);void library.flush();}
 function openBook(book:BookEntry){onClose();onOpenBook(book);}
 function showShelf(value:Shelf){setShelf(value);setVisible(24);}
 const shelfLabels:Record<Shelf,string>={all:"in your reading record",reading:"in progress",later:"saved for later",completed:"marked completed",goals:"with a personal target",overdue:"past your personal target"};
 const emptyTitles:Record<Shelf,string>={all:"Make your first book part of your record.",reading:"A new chapter is waiting.",later:"Make room for your next read.",completed:"Your finished books will appear here.",goals:"Read at your own pace.",overdue:"No personal targets have passed."};
 const emptyDescriptions:Record<Shelf,string>={all:"Open a book or save one for later from the library to start your reading record.",reading:"Open a book from the library. Your saved position and progress will appear here.",later:"Use Read later on a book to build your personal reading list without opening it.",completed:"Use Mark completed when you finish a book. Your page progress remains available.",goals:"Set a finish-by date on any book in All my books. Targets are yours to change or remove.",overdue:"Your unfinished books with a target before today will appear here. You can adjust a target whenever you need."};
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="reading-dashboard">
  <header className="reading-dashboard-heading"><span className="reading-dashboard-kicker"><History size={15}/> YOUR EMPLOYEE ACCOUNT</span><DialogTitle>My reading progress</DialogTitle><DialogDescription>Your place in every book, and a little space to plan your next read.</DialogDescription></header>
  <div className="reading-dashboard-body">
   <div className="reading-profile"><div className="reading-profile-avatar"><UserRound size={23}/></div><div><strong>{library.user.name}</strong><span>Employee ID · {library.user.employeeId}</span></div><span className="reading-profile-private"><ShieldCheck size={16}/> Personal reading record</span></div>
   <div className="reading-dashboard-stats" aria-label="Your reading summary"><div><BookOpen size={20}/><strong>{counts.started}</strong><span>Books started</span></div><div><CheckCircle2 size={20}/><strong>{counts.completed}</strong><span>Marked completed</span></div><div><BookmarkPlus size={20}/><strong>{counts.later}</strong><span>Read later</span></div><div><Heart size={20}/><strong>{counts.favorites}</strong><span>Favorites</span></div></div>
   {!!counts.goals&&<div className="reading-goal-overview"><CalendarDays size={20}/><div><strong>Your personal reading targets</strong><p>{counts.upcoming} upcoming or today · {counts.overdue} past target{counts.overdue?" — adjust these whenever you need":""}</p></div><button type="button" className="toolbar-button" onClick={()=>{showShelf("goals");setSort("goal");}}>View targets</button></div>}
   <div className={"reading-save-status "+(warning?"has-pending":"")} role="status"><StatusIcon size={21} className={library.syncing?"reader-spinner":""}/><div><strong>{status}</strong><p>{statusDetail}</p>{library.message&&<p>{library.message}</p>}</div>{!!library.pendingCount&&!hasConflicts&&<button type="button" className="toolbar-button" disabled={library.syncing} onClick={()=>void library.flush()}>Sync now</button>}</div>
   <div className="reading-history-tools"><div className="reading-history-filters" role="group" aria-label="Filter reading history">{([{value:"all",label:"All my books",count:entries.length},{value:"reading",label:"In progress",count:counts.reading},{value:"later",label:"Read later",count:counts.later},{value:"completed",label:"Completed",count:counts.completed},{value:"goals",label:"With targets",count:counts.goals},{value:"overdue",label:"Past target",count:counts.overdue}] as const).map(item=><button type="button" key={item.value} aria-pressed={shelf===item.value} onClick={()=>showShelf(item.value)}>{item.label}<span>{item.count}</span></button>)}</div><label className="reading-history-sort"><span>Sort by</span><select aria-label="Sort reading history" value={sort} onChange={event=>{setSort(event.target.value as Sort);setVisible(24);}}><option value="recent">Last read</option><option value="progress">Progress</option><option value="goal">Target date</option><option value="title">Title A–Z</option></select></label></div>
   <p className="reading-history-result" role="status">{filtered.length} {filtered.length===1?"book":"books"} {shelfLabels[shelf]}</p>
   <div className="reading-history-list">{filtered.slice(0,visible).map(entry=>{
    const {id,book,record}=entry,available=!!book&&availableIds.has(id);
    return <article className="reading-history-book" key={id}>
     <div className={"reading-history-book-icon "+(record.completed?"is-completed":"")} aria-hidden="true">{record.completed?<CheckCircle2 size={27}/>:<BookOpen size={27}/>}</div>
     <div className="reading-history-book-copy"><div className="reading-history-tags">{book&&<span>{book.format.toUpperCase()}</span>}{record.readLater&&<span className="reading-history-later">Read later</span>}{record.completed&&<span className="reading-history-completed">Marked completed</span>}{!available&&<span className="reading-history-unavailable">{book?.active===false?"Archived":"Unavailable"}</span>}</div><h3>{book?.title||"Unavailable book"}</h3><p>{book?.author||"The saved reading record is retained for your account."}</p><small className="reading-history-last-read">{record.lastReadAt?"Last read · ":""}{lastReadLabel(record.lastReadAt)}</small>{!!record.bookmarks?.length&&<small>{record.bookmarks.length} saved {record.bookmarks.length===1?"bookmark":"bookmarks"}</small>}</div>
     <ProgressDetail entry={entry}/>
     <div className="reading-history-book-actions">{available&&book?<><button type="button" className="primary-button" onClick={()=>openBook(book)}>{record.started?"Resume reading":"Open book"}<ArrowUpRight size={17}/></button><div className="reading-history-secondary-actions"><button type="button" className="reading-history-favorite" aria-label={`${record.favorite?"Remove from":"Add to"} favorites: ${book.title}`} aria-pressed={record.favorite} onClick={()=>changeRecord(id,{favorite:!record.favorite})}><Heart size={19} fill={record.favorite?"currentColor":"none"}/></button><button type="button" className="reading-history-complete-button" aria-label={`${record.completed?"Mark in progress":"Mark completed"}: ${book.title}`} onClick={()=>changeRecord(id,{completed:!record.completed,started:true})}><CheckCircle2 size={16}/>{record.completed?"Mark in progress":"Mark completed"}</button></div></>:<p>This book is currently unavailable. Your progress is kept.</p>}{book&&<button type="button" className="reading-later-button" aria-label={`${record.readLater?"Remove from":"Save to"} read later: ${book.title}`} aria-pressed={!!record.readLater} onClick={()=>changeRecord(id,{readLater:!record.readLater})}><BookmarkPlus size={17}/>{record.readLater?"Saved for later":"Read later"}</button>}</div>
     <ReadingPlan entry={entry} today={today} onChange={change=>changeRecord(id,change)}/>
    </article>;
   })}</div>
   {!filtered.length&&<div className="reading-history-empty"><BookOpen size={35}/><h3>{emptyTitles[shelf]}</h3><p>{emptyDescriptions[shelf]}</p><button type="button" className="toolbar-button" onClick={onClose}>Back to the library</button></div>}
   {filtered.length>visible&&<div className="reading-history-more"><button type="button" className="toolbar-button" onClick={()=>setVisible(value=>value+24)}>Show more ({filtered.length-visible} remaining)</button></div>}
   <p className="reading-dashboard-explanation">PDF progress counts unique pages opened since page tracking began. EPUB progress shows the furthest reading position. Finish-by dates are personal goals. You decide when to mark a book completed.</p>
  </div>
  <footer className="reading-dashboard-footer"><span><ShieldCheck size={16}/> Saved separately for employee ID {library.user.employeeId}</span><button type="button" className="toolbar-button" onClick={onClose}>Back to reading</button></footer>
 </DialogContent></Dialog>;
}
