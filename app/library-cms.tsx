"use client";
// Content management for library administrators: the home page, collections, reading insights and the activity log.
import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowDown,ArrowUp,BookOpen,LoaderCircle,Pencil,Plus,RefreshCw,Save,Search,Trash2,Undo2,X} from "lucide-react";
import {api,ApiError} from "@/lib/employee-library";
import type {BookEntry} from "@/lib/catalog";
import {CONTENT_LIMITS,orderCollections,type Announcement,type LibraryContent} from "@/lib/library-content.mjs";
import type {LibraryInsights} from "@/lib/library-insights.mjs";
import {localDate} from "@/lib/reading-activity.mjs";
import type {EmployeeLibrary} from "@/hooks/use-employee-library";

const message=(error:unknown,fallback:string)=>error instanceof Error?error.message:fallback;
const move=<T,>(list:T[],index:number,delta:number)=>{const target=index+delta;if(target<0||target>=list.length)return list;const next=[...list];[next[index],next[target]]=[next[target],next[index]];return next;};
const newId=()=>"a"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const number=(value:number)=>value.toLocaleString();

/** One shared draft of the home-page content, so switching tabs never loses unsaved edits. */
export function useContentEditor(library:EmployeeLibrary){
 const [saved,setSaved]=useState<LibraryContent|null>(null),[draft,setDraft]=useState<LibraryContent|null>(null),[version,setVersion]=useState(0);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const publish=library.setContent;
 const adopt=useCallback((content:LibraryContent,next:number)=>{setSaved(content);setDraft(content);setVersion(next);publish(content);},[publish]);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{const result=await api<{content:LibraryContent;version:number}>("/api/content");adopt(result.content,result.version);}
  catch(error){setError(message(error,"Could not load the home page."));}finally{setLoading(false);}
 },[adopt]);
 useEffect(()=>{const start=setTimeout(()=>void load(),0);return()=>clearTimeout(start);},[load]);
 const dirty=!!draft&&!!saved&&JSON.stringify(draft)!==JSON.stringify(saved);
 const save=useCallback(async()=>{
  if(!draft)return;setSaving(true);setError("");setNotice("");
  try{const result=await api<{content:LibraryContent;version:number}>("/api/admin/content",{method:"PUT",body:JSON.stringify({expectedVersion:version,content:draft})});adopt(result.content,result.version);setNotice("Saved. Employees see it the next time they open the library.");}
  catch(error){if(error instanceof ApiError&&error.status===409){const latest=error.data as {content:LibraryContent;version:number};adopt(latest.content,latest.version);}setError(message(error,"Could not save. Try again."));}
  finally{setSaving(false);}
 },[draft,version,adopt]);
 const discard=useCallback(()=>{setDraft(saved);setError("");setNotice("");},[saved]);
 return {draft,setDraft,version,loading,saving,error,setError,notice,setNotice,dirty,load,save,discard,adopt};
}
export type ContentEditor=ReturnType<typeof useContentEditor>;

function SaveBar({editor}:{editor:ContentEditor}){
 return <div className="cms-savebar">
  <div className="cms-savebar-status">{editor.error?<p className="library-alert" role="alert">{editor.error}</p>:editor.notice?<p role="status">{editor.notice}</p>:<p>{editor.dirty?"You have unsaved changes.":"Everything is saved."}</p>}</div>
  <button className="toolbar-button" disabled={!editor.dirty||editor.saving} onClick={editor.discard}><Undo2 size={16}/> Discard</button>
  <button className="primary-button" disabled={!editor.dirty||editor.saving} onClick={()=>void editor.save()}>{editor.saving?<LoaderCircle size={16} className="reader-spinner"/>:<Save size={16}/>} Save changes</button>
 </div>;
}

function BookPicker({books,exclude=[],label,onPick}:{books:BookEntry[];exclude?:string[];label:string;onPick:(book:BookEntry)=>void}){
 const [query,setQuery]=useState("");
 const needle=query.trim().toLocaleLowerCase();
 const matches=needle?books.filter(book=>book.active!==false&&!exclude.includes(book.id)&&(book.title.toLocaleLowerCase().includes(needle)||book.author.toLocaleLowerCase().includes(needle))).slice(0,8):[];
 return <div className="cms-picker">
  <label className="cms-search"><Search size={16}/><span className="sr-only">{label}</span><input value={query} placeholder={label+" — search by title or author"} onChange={event=>setQuery(event.target.value)}/></label>
  {needle&&<ul className="cms-picker-results" aria-label={label+" results"}>{matches.length?matches.map(book=><li key={book.id}><button type="button" onClick={()=>{onPick(book);setQuery("");}}>{book.cover?<img src={book.cover} alt=""/>:<span className="cms-thumb"><BookOpen size={15}/></span>}<span><strong>{book.title}</strong><small>{book.author}</small></span><Plus size={16} aria-hidden="true"/></button></li>):<li className="cms-empty">No available books match.</li>}</ul>}
 </div>;
}

function MoveButtons({label,index,count,onMove,onRemove,disabled}:{label:string;index:number;count:number;onMove:(delta:number)=>void;onRemove?:()=>void;disabled?:boolean}){
 return <div className="cms-actions">
  <button type="button" className="icon-button" aria-label={`Move ${label} up`} disabled={disabled||index===0} onClick={()=>onMove(-1)}><ArrowUp size={16}/></button>
  <button type="button" className="icon-button" aria-label={`Move ${label} down`} disabled={disabled||index===count-1} onClick={()=>onMove(1)}><ArrowDown size={16}/></button>
  {onRemove&&<button type="button" className="icon-button" aria-label={`Remove ${label}`} disabled={disabled} onClick={onRemove}><Trash2 size={16}/></button>}
 </div>;
}

const loadingPanel=(text:string)=><div className="manager-loading" role="status"><LoaderCircle className="reader-spinner"/> {text}</div>;

export function HomePanel({editor,books}:{editor:ContentEditor;books:BookEntry[]}){
 const byId=useMemo(()=>new Map(books.map(book=>[book.id,book])),[books]);
 const {draft,setDraft,saving}=editor;
 if(!draft)return editor.loading?loadingPanel("Loading the home page…"):<p className="library-alert" role="alert">{editor.error||"The home page could not be loaded."} <button className="link-button" onClick={()=>void editor.load()}>Try again</button></p>;
 const update=(change:Partial<LibraryContent>)=>setDraft({...draft,...change});
 const announce=(index:number,change:Partial<Announcement>)=>update({announcements:draft.announcements.map((item,i)=>i===index?{...item,...change}:item)});
 const today=localDate();
 const status=(item:Announcement)=>item.startsOn&&item.startsOn>today?"Scheduled":item.endsOn&&item.endsOn<today?"Ended":"Showing";
 return <div className="cms-panel">
  <section className="cms-section">
   <div className="cms-heading"><div><h3>Welcome line</h3><p>Shown under the greeting on the library page.</p></div></div>
   <input className="cms-input" aria-label="Welcome line" maxLength={200} disabled={saving} value={draft.welcome} placeholder="For example: New books arrive on the first Monday of each month." onChange={event=>update({welcome:event.target.value})}/>
  </section>
  <section className="cms-section">
   <div className="cms-heading"><div><h3>Announcements</h3><p>Add dates to schedule one. Employees can dismiss each announcement.</p></div><button className="toolbar-button" disabled={saving||draft.announcements.length>=CONTENT_LIMITS.announcements} onClick={()=>update({announcements:[...draft.announcements,{id:newId(),title:"",message:"",bookId:"",tone:"info",startsOn:"",endsOn:""}]})}><Plus size={16}/> Add announcement</button></div>
   {!draft.announcements.length&&<p className="cms-empty">No announcements.</p>}
   {draft.announcements.map((item,index)=>{const book=item.bookId?byId.get(item.bookId):undefined;const label=`announcement ${index+1}`;return <fieldset key={item.id} className={"cms-card"+(item.tone==="important"?" is-important":"")} disabled={saving}>
    <legend className="sr-only">Announcement {index+1}</legend>
    <div className="cms-card-top"><span className={"cms-status is-"+status(item).toLowerCase()}>{status(item)}</span><MoveButtons label={label} index={index} count={draft.announcements.length} onMove={delta=>update({announcements:move(draft.announcements,index,delta)})} onRemove={()=>update({announcements:draft.announcements.filter((_,i)=>i!==index)})}/></div>
    <label>Title<input value={item.title} maxLength={120} onChange={event=>announce(index,{title:event.target.value})}/></label>
    <label>Message<textarea value={item.message} maxLength={600} rows={3} onChange={event=>announce(index,{message:event.target.value})}/></label>
    <div className="cms-fields">
     <label>Style<select value={item.tone} onChange={event=>announce(index,{tone:event.target.value==="important"?"important":"info"})}><option value="info">Standard</option><option value="important">Important</option></select></label>
     <label>Show from<input type="date" value={item.startsOn} onChange={event=>announce(index,{startsOn:event.target.value})}/></label>
     <label>Until<input type="date" value={item.endsOn} min={item.startsOn||undefined} onChange={event=>announce(index,{endsOn:event.target.value})}/></label>
    </div>
    {book?<div className="cms-linked"><BookOpen size={16}/><span>Links to <strong>{book.title}</strong></span><button type="button" className="link-button" onClick={()=>announce(index,{bookId:""})}>Remove link</button></div>:item.bookId?<div className="cms-linked is-missing"><span>The linked book is no longer in the catalogue.</span><button type="button" className="link-button" onClick={()=>announce(index,{bookId:""})}>Remove link</button></div>:<BookPicker books={books} label="Link a book (optional)" onPick={choice=>announce(index,{bookId:choice.id})}/>}
   </fieldset>;})}
  </section>
  <section className="cms-section">
   <div className="cms-heading"><div><h3>Staff picks</h3><p>A row of recommended books at the top of the library.</p></div><span className="cms-count">{draft.picks.bookIds.length} of {CONTENT_LIMITS.picks}</span></div>
   <label className="cms-label">Row title<input className="cms-input" maxLength={60} disabled={saving} value={draft.picks.title} onChange={event=>update({picks:{...draft.picks,title:event.target.value}})}/></label>
   {draft.picks.bookIds.length>0&&<ol className="cms-picks">{draft.picks.bookIds.map((id,index)=>{const book=byId.get(id);const missing=!book||book.active===false;return <li key={id} className={missing?"is-missing":""}>
    {book?.cover?<img src={book.cover} alt=""/>:<span className="cms-thumb"><BookOpen size={15}/></span>}
    <span><strong>{book?.title||"Removed book"}</strong><small>{missing?"Not available. Remove it before saving.":book.author}</small></span>
    <MoveButtons label={book?.title||"removed book"} index={index} count={draft.picks.bookIds.length} disabled={saving} onMove={delta=>update({picks:{...draft.picks,bookIds:move(draft.picks.bookIds,index,delta)}})} onRemove={()=>update({picks:{...draft.picks,bookIds:draft.picks.bookIds.filter(other=>other!==id)}})}/>
   </li>;})}</ol>}
   {draft.picks.bookIds.length<CONTENT_LIMITS.picks&&<BookPicker books={books} exclude={draft.picks.bookIds} label="Add a staff pick" onPick={choice=>update({picks:{...draft.picks,bookIds:[...draft.picks.bookIds,choice.id]}})}/>}
  </section>
  <SaveBar editor={editor}/>
 </div>;
}

export function CollectionsPanel({editor,books,onRenamed}:{editor:ContentEditor;books:BookEntry[];onRenamed:()=>void}){
 const [renaming,setRenaming]=useState(""),[newName,setNewName]=useState(""),[working,setWorking]=useState(false);
 const counts=useMemo(()=>{const map=new Map<string,{active:number;archived:number}>();for(const book of books){const name=book.category||"General",entry=map.get(name)||{active:0,archived:0};if(book.active===false)entry.archived++;else entry.active++;map.set(name,entry);}return map;},[books]);
 const {draft,setDraft,saving}=editor;
 if(!draft)return editor.loading?loadingPanel("Loading collections…"):<p className="library-alert" role="alert">{editor.error||"Collections could not be loaded."}</p>;
 const names=orderCollections(new Set([...counts.keys(),...draft.collections.map(item=>item.name)]),draft);
 // Saving writes every collection in its shown order, so the order is explicit.
 const ordered=names.map(name=>({name,description:draft.collections.find(item=>item.name===name)?.description||""}));
 const update=(collections:typeof ordered)=>setDraft({...draft,collections});
 async function rename(from:string){
  const to=newName.trim();if(!to||to===from){setRenaming("");return;}
  if(names.includes(to)&&!window.confirm(`“${to}” already exists. Move every book from “${from}” into it?`))return;
  setWorking(true);editor.setError("");editor.setNotice("");
  try{const result=await api<{moved:number;content:LibraryContent;version:number}>("/api/admin/collections/rename",{method:"POST",body:JSON.stringify({from,to})});editor.adopt(result.content,result.version);editor.setNotice(`Moved ${result.moved} ${result.moved===1?"book":"books"} to “${to}”.`);setRenaming("");onRenamed();}
  catch(error){editor.setError(message(error,"Could not rename the collection."));}finally{setWorking(false);}
 }
 const busy=saving||working;
 return <div className="cms-panel">
  <section className="cms-section">
   <div className="cms-heading"><div><h3>Collections</h3><p>Set the order employees see and add a short description. Renaming onto an existing collection merges the two.</p></div><span className="cms-count">{names.length}</span></div>
   {editor.dirty&&<p className="cms-hint">Save or discard your changes before renaming a collection.</p>}
   <ol className="cms-collections">{ordered.map((item,index)=>{const count=counts.get(item.name)||{active:0,archived:0};return <li key={item.name}>
    <div className="cms-collection-top">
     {renaming===item.name?<form className="cms-rename" onSubmit={event=>{event.preventDefault();void rename(item.name);}}><label><span className="sr-only">New name for {item.name}</span><input autoFocus maxLength={80} value={newName} onChange={event=>setNewName(event.target.value)}/></label><button className="primary-button" disabled={busy||!newName.trim()}>{working?<LoaderCircle size={16} className="reader-spinner"/>:null}Rename</button><button type="button" className="icon-button" aria-label="Cancel renaming" onClick={()=>setRenaming("")}><X size={16}/></button></form>
      :<><strong>{item.name}</strong><span className="cms-meta">{count.active} {count.active===1?"book":"books"}{count.archived?` · ${count.archived} archived`:""}</span>{count.active+count.archived>0&&<button type="button" className="toolbar-button" disabled={busy||editor.dirty} onClick={()=>{setRenaming(item.name);setNewName(item.name);}}><Pencil size={15}/> Rename</button>}</>}
     <MoveButtons label={item.name} index={index} count={ordered.length} disabled={busy} onMove={delta=>update(move(ordered,index,delta))} onRemove={count.active+count.archived===0?()=>update(ordered.filter(other=>other.name!==item.name)):undefined}/>
    </div>
    <label><span className="sr-only">Description of {item.name}</span><textarea rows={2} maxLength={400} disabled={busy} placeholder="Optional description shown when employees choose this collection" value={item.description} onChange={event=>update(ordered.map(other=>other.name===item.name?{...other,description:event.target.value}:other))}/></label>
   </li>;})}</ol>
  </section>
  <SaveBar editor={editor}/>
 </div>;
}

export function InsightsPanel(){
 const [days,setDays]=useState(30),[report,setReport]=useState<LibraryInsights|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const load=useCallback(async(period:number)=>{setLoading(true);setError("");try{setReport(await api<LibraryInsights>(`/api/admin/insights?days=${period}&today=${localDate()}`));}catch(error){setError(message(error,"Could not load reading insights."));}finally{setLoading(false);}},[]);
 useEffect(()=>{const start=setTimeout(()=>void load(days),0);return()=>clearTimeout(start);},[load,days]);
 const peak=Math.max(1,...(report?.daily.map(day=>day.minutes)||[0]));
 const topCollection=Math.max(1,...(report?.collections.map(item=>item.minutes)||[0]));
 return <div className="cms-panel">
  <div className="cms-heading"><div><h3>Reading insights</h3><p>Library-wide totals. Individual employees’ reading is never shown.</p></div>
   <div className="cms-heading-tools"><div className="cms-segmented" role="group" aria-label="Report period">{[7,30,90].map(value=><button key={value} aria-pressed={days===value} disabled={loading} onClick={()=>setDays(value)}>{value} days</button>)}</div><button className="icon-button" aria-label="Refresh insights" disabled={loading} onClick={()=>void load(days)}><RefreshCw size={16}/></button></div></div>
  {error&&<p className="library-alert" role="alert">{error}</p>}
  {!report?(loading?loadingPanel("Counting reading activity…"):null):<>
   <div className="cms-stats">
    <div><strong>{number(report.totals.activeReaders)}</strong><span>Active readers<small>of {number(report.totals.employees)} {report.totals.employees===1?"account":"accounts"}</small></span></div>
    <div><strong>{number(Math.round(report.totals.minutes/6)/10)}</strong><span>Hours read<small>in {report.days} days</small></span></div>
    <div><strong>{number(report.totals.booksStarted)}</strong><span>Books started<small>all time</small></span></div>
    <div><strong>{number(report.totals.booksCompleted)}</strong><span>Books finished<small>all time</small></span></div>
    <div><strong>{number(report.totals.neverStarted)}</strong><span>Not started yet<small>active accounts</small></span></div>
   </div>
   <section className="cms-section">
    <h4>Minutes read each day</h4>
    <div className="cms-chart" role="img" aria-label={`${number(report.totals.minutes)} minutes read between ${report.since} and ${report.today}. Busiest day: ${report.daily.reduce((best,day)=>day.minutes>best.minutes?day:best,report.daily[0]).date}.`}>
     {report.daily.map(day=><span key={day.date} title={`${day.date}: ${day.minutes} min · ${day.readers} ${day.readers===1?"reader":"readers"}`} style={{height:`${Math.max(day.minutes?4:1,day.minutes/peak*100)}%`}}/>)}
    </div>
    <div className="cms-chart-axis"><span>{report.since}</span><span>{report.today}</span></div>
   </section>
   <div className="cms-two">
    <section className="cms-section"><h4>Most read books</h4>{report.topBooks.length?<table className="cms-table"><thead><tr><th>Book</th><th>Readers</th><th>Minutes</th><th>Finished</th></tr></thead><tbody>{report.topBooks.map(book=><tr key={book.id}><td><strong>{book.title}</strong><small>{book.author}</small></td><td>{number(book.readers)}</td><td>{number(book.minutes)}</td><td>{number(book.completed)}</td></tr>)}</tbody></table>:<p className="cms-empty">No reading in this period yet.</p>}</section>
    <section className="cms-section"><h4>Collections</h4>{report.collections.length?<ul className="cms-bars">{report.collections.map(item=><li key={item.name}><span>{item.name}<small>{number(item.minutes)} min · {number(item.readers)} {item.readers===1?"reader":"readers"}</small></span><span className="cms-bar"><span style={{width:`${item.minutes/topCollection*100}%`}}/></span></li>)}</ul>:<p className="cms-empty">No reading in this period yet.</p>}</section>
   </div>
  </>}
 </div>;
}

type ActivityEntry={id:string;at:string;actor:string;action:string;target:string;detail:string};
const actionNames:Record<string,string>={"book.add":"Added book","book.edit":"Edited book","book.archive":"Archived book","book.restore":"Restored book","book.cover":"Changed cover","employee.add":"Added account","employee.pause":"Paused access","employee.resume":"Restored access","employee.pin":"Reset PIN","content.update":"Updated home page","collection.rename":"Renamed collection"};
const actionGroups:Record<string,string>={books:"book.",employees:"employee.",content:"content.|collection."};

export function ActivityPanel(){
 const [entries,setEntries]=useState<ActivityEntry[]>([]),[more,setMore]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[group,setGroup]=useState("all");
 const load=useCallback(async(before?:string)=>{
  setLoading(true);setError("");
  try{const result=await api<{entries:ActivityEntry[];more:boolean}>("/api/admin/activity?limit=50"+(before?"&before="+encodeURIComponent(before):""));setEntries(list=>before?[...list,...result.entries]:result.entries);setMore(result.more);}
  catch(error){setError(message(error,"Could not load the activity log."));}finally{setLoading(false);}
 },[]);
 useEffect(()=>{const start=setTimeout(()=>void load(),0);return()=>clearTimeout(start);},[load]);
 const shown=group==="all"?entries:entries.filter(entry=>actionGroups[group].split("|").some(prefix=>entry.action.startsWith(prefix)));
 return <div className="cms-panel">
  <div className="cms-heading"><div><h3>Activity log</h3><p>Changes made by administrators, kept for a year.</p></div>
   <div className="cms-heading-tools"><label><span className="sr-only">Show</span><select aria-label="Filter activity" value={group} onChange={event=>setGroup(event.target.value)}><option value="all">All changes</option><option value="books">Books</option><option value="employees">Accounts</option><option value="content">Home page and collections</option></select></label><button className="icon-button" aria-label="Refresh activity" disabled={loading} onClick={()=>void load()}><RefreshCw size={16}/></button></div></div>
  {error&&<p className="library-alert" role="alert">{error}</p>}
  {shown.length?<div className="manager-table-wrap"><table className="cms-table cms-log"><thead><tr><th>When</th><th>Change</th><th>Item</th><th>By</th></tr></thead><tbody>{shown.map(entry=><tr key={entry.id}><td><time dateTime={entry.at}>{new Date(entry.at).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})}</time></td><td>{actionNames[entry.action]||entry.action}</td><td><strong>{entry.target}</strong>{entry.detail&&<small>{entry.detail}</small>}</td><td>{entry.actor}</td></tr>)}</tbody></table></div>:loading?loadingPanel("Loading the activity log…"):<p className="cms-empty">No changes recorded yet.</p>}
  {more&&<div className="catalog-more"><button className="toolbar-button" disabled={loading} onClick={()=>void load(entries.at(-1)?.at)}>{loading?<LoaderCircle size={16} className="reader-spinner"/>:null} Show older changes</button></div>}
 </div>;
}
