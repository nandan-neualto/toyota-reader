"use client";

import {useId,useState} from "react";
import {AlertCircle,Bookmark as BookmarkIcon,Check,CheckCircle2,CloudUpload,Download,LoaderCircle,Pencil,Plus,Search,ShieldCheck,Trash2,Undo2,X} from "lucide-react";
import type {BookEntry} from "@/lib/catalog";
import type {EmployeeLibrary} from "@/hooks/use-employee-library";
import {emptyRecord,type Bookmark} from "@/lib/employee-library";
import {buildNotesExport} from "@/lib/personal-notes.mjs";

type Props = {
 book:BookEntry; library:EmployeeLibrary; page:number; epubCfi:string; epubLabel:string;
 locationReady:boolean; onJump:(mark:Bookmark)=>void;
};

export default function PersonalReadingSpace({book,library,page,epubCfi,epubLabel,locationReady,onJump}:Props){
 const ids=useId(),record=library.records[book.id]||emptyRecord();
 const [query,setQuery]=useState(""),[scope,setScope]=useState("all"),[order,setOrder]=useState("saved");
 const [editing,setEditing]=useState<string|null>(null),[draft,setDraft]=useState("");
 const [removed,setRemoved]=useState<{mark:Bookmark;index:number}|null>(null),[notice,setNotice]=useState("");
 const marks=record.bookmarks,hasConflict=!!library.conflicts[book.id];
 const current=(mark:Bookmark)=>book.format==="pdf"?mark.page===page:!!epubCfi&&mark.cfi===epubCfi;
 const alreadySaved=marks.some(current),limit=marks.length>=100;
 const normalizedQuery=query.trim().toLocaleLowerCase();
 const filtered=marks.filter(mark=>(scope!=="current"||current(mark))&&(!normalizedQuery||`${mark.label} ${book.format==="pdf"?`page ${mark.page}`:""}`.toLocaleLowerCase().includes(normalizedQuery)));
 if(order==="title")filtered.sort((a,b)=>a.label.localeCompare(b.label));
 if(order==="page"&&book.format==="pdf")filtered.sort((a,b)=>a.page-b.page);
 const status=hasConflict?"Changes from another device need review. Return to the library to resolve them."
  :library.pendingCount?library.deviceSaved?(library.syncing?"Saved on this device. Syncing reading changes…":"Saved on this device. Waiting to sync with your account."):"Changes are only in this tab. Keep it open until they reach your account."
  :library.deviceSaved?"All reading changes are saved to your account.":"Saved to your account. Offline storage is unavailable on this device.";
 const update=(patch:Parameters<EmployeeLibrary["update"]>[1])=>library.update(book.id,patch);
 function addBookmark(){
  if(!locationReady||limit||alreadySaved)return;
  const label=(book.format==="pdf"?`Page ${page}`:epubLabel.trim()||"Saved section").slice(0,160);
  update({bookmarks:[...marks,{id:crypto.randomUUID(),label,page,cfi:book.format==="epub"?epubCfi:""}]});
  setNotice("Bookmark added.");
 }
 function renameBookmark(event:React.FormEvent,id:string){
  event.preventDefault();const label=draft.trim();if(!label)return;
  update({bookmarks:marks.map(mark=>mark.id===id?{...mark,label}:mark)});
  setEditing(null);setNotice("Bookmark renamed.");
 }
 function removeBookmark(mark:Bookmark){
  setRemoved({mark,index:marks.findIndex(item=>item.id===mark.id)});
  update({bookmarks:marks.filter(item=>item.id!==mark.id)});
  if(editing===mark.id)setEditing(null);
  setNotice("Bookmark removed. You can undo this below.");
 }
 function undoRemove(){
  if(!removed||limit)return;
  if(!marks.some(mark=>mark.id===removed.mark.id)){
   const restored=[...marks];restored.splice(Math.min(removed.index,restored.length),0,removed.mark);update({bookmarks:restored});
  }
  setRemoved(null);setNotice("Bookmark restored.");
 }
 function exportNotes(){
  try{
   const result=buildNotesExport(book,record),url=URL.createObjectURL(new Blob([result.text],{type:"text/plain;charset=utf-8"}));
   const anchor=document.createElement("a");anchor.href=url;anchor.download=result.filename;document.body.appendChild(anchor);anchor.click();anchor.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice("Your notes and bookmarks are ready in your browser’s downloads.");
  }catch{setNotice("The download could not start. Please try again.");}
 }
 return <div className="personal-space">
  <div className="personal-save-status" data-warning={hasConflict||(!library.deviceSaved&&library.pendingCount>0)||undefined} role="status">
   {hasConflict||(!library.deviceSaved&&library.pendingCount>0)?<AlertCircle size={19}/>:library.syncing?<LoaderCircle className="reader-spinner" size={19}/>:library.pendingCount?<CloudUpload size={19}/>:<ShieldCheck size={19}/>}
   <span>{status}</span>
  </div>
  {library.pendingCount>0&&<button type="button" className="toolbar-button personal-sync" onClick={()=>void library.flush()} disabled={library.syncing||hasConflict}>{library.syncing?<LoaderCircle className="reader-spinner" size={16}/>:<CloudUpload size={16}/>}Sync now</button>}
  {library.pendingCount>0&&library.message&&<p className="personal-save-detail">{library.message}</p>}
  <div className="personal-book-actions"><button type="button" className="toolbar-button" aria-pressed={record.completed} onClick={()=>update(record.completed?{completed:false}:{completed:true,started:true})}><CheckCircle2 size={18}/>{record.completed?"Completed — mark in progress":"Mark as completed"}</button></div>
  <section className="setting-group personal-notes-section" aria-labelledby={ids+"-notes-label"}>
   <label id={ids+"-notes-label"} htmlFor={ids+"-notes"}>Private notes</label>
   <textarea id={ids+"-notes"} className="personal-notes" placeholder="An idea to remember, a question to explore…" value={record.notes} maxLength={20000} aria-describedby={ids+"-notes-help "+ids+"-notes-count"} onChange={event=>update({notes:event.target.value})}/>
   <div className="personal-notes-meta"><p id={ids+"-notes-help"}>Saved automatically as you type.</p><span id={ids+"-notes-count"} data-near-limit={record.notes.length>=19000||undefined}>{record.notes.length.toLocaleString()} / 20,000</span></div>
   {record.notes.length>=20000&&<p className="personal-limit" role="status">The notes limit is reached. Export a copy before replacing any text.</p>}
   <button type="button" className="toolbar-button personal-export" onClick={exportNotes} disabled={!record.notes.trim()&&!marks.length}><Download size={17}/>Download notes &amp; bookmarks</button>
   <p className="personal-export-help">A text file with this book’s title, your notes and saved locations.</p>
  </section>
  <section className="personal-bookmarks personal-bookmarks-enhanced" aria-labelledby={ids+"-bookmarks"}>
   <div className="personal-bookmark-heading"><h3 id={ids+"-bookmarks"}>Bookmarks <span>{marks.length} / 100</span></h3><button type="button" className="toolbar-button" disabled={!locationReady||limit||alreadySaved} onClick={addBookmark}>{alreadySaved?<Check size={16}/>:<Plus size={16}/>} {alreadySaved?"Page bookmarked":"Save this page"}</button></div>
   {!locationReady&&<p className="personal-bookmark-hint">You can bookmark this location when it finishes opening.</p>}
   {limit&&<p className="personal-bookmark-hint">All 100 bookmark slots are in use. Remove one to save another location.</p>}
   {marks.length>0&&<div className="personal-bookmark-tools">
    <label className="personal-search" htmlFor={ids+"-search"}><Search size={17}/><input id={ids+"-search"} type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find a bookmark" aria-label="Search bookmarks" maxLength={160}/></label>
    <label htmlFor={ids+"-scope"}>Show<select id={ids+"-scope"} value={scope} onChange={event=>setScope(event.target.value)}><option value="all">All bookmarks</option><option value="current">This location</option></select></label>
    <label htmlFor={ids+"-sort"}>Order<select id={ids+"-sort"} value={order} onChange={event=>setOrder(event.target.value)}><option value="saved">Saved order</option>{book.format==="pdf"&&<option value="page">Page number</option>}<option value="title">Bookmark name</option></select></label>
    <p className="personal-filter-count" role="status">{filtered.length} of {marks.length} bookmarks</p>
   </div>}
   <div className="personal-bookmark-list">{filtered.map(mark=><div className="personal-bookmark-item" key={mark.id}>
    {editing===mark.id?<form className="bookmark-rename" onSubmit={event=>renameBookmark(event,mark.id)}>
     <label htmlFor={ids+"-rename-"+mark.id}>Bookmark name<input id={ids+"-rename-"+mark.id} value={draft} onChange={event=>setDraft(event.target.value)} maxLength={160} autoFocus required onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setEditing(null);}}}/></label>
     <div><button type="submit" className="toolbar-button" disabled={!draft.trim()}><Check size={16}/>Save name</button><button type="button" className="toolbar-button" onClick={()=>setEditing(null)}><X size={16}/>Cancel</button></div>
    </form>:<><button type="button" className="personal-bookmark-open" onClick={()=>onJump(mark)}><BookmarkIcon size={18}/><span><strong>{mark.label}</strong><small>{book.format==="pdf"?`Page ${mark.page}`:"Saved EPUB location"}{current(mark)?" · Current location":""}</small></span></button><div className="personal-bookmark-actions"><button type="button" className="icon-button" aria-label={"Rename bookmark: "+mark.label} onClick={()=>{setEditing(mark.id);setDraft(mark.label);}}><Pencil size={16}/></button><button type="button" className="icon-button" aria-label={"Remove bookmark: "+mark.label} onClick={()=>removeBookmark(mark)}><Trash2 size={16}/></button></div></>}
   </div>)}</div>
   {!marks.length?<div className="personal-bookmark-empty"><BookmarkIcon size={24}/><strong>Keep useful pages close.</strong><p>Save a page, give it a memorable name, and return to it next time you sign in.</p></div>:!filtered.length?<div className="personal-bookmark-empty"><Search size={24}/><strong>No matching bookmarks</strong><p>Try another name or show all saved locations.</p><button type="button" className="toolbar-button" onClick={()=>{setQuery("");setScope("all");}}>Clear filters</button></div>:null}
   {removed&&<div className="personal-bookmark-undo"><span>Removed: {removed.mark.label}</span><button type="button" className="toolbar-button" onClick={undoRemove} disabled={limit}><Undo2 size={16}/>Undo</button></div>}
  </section>
  <p className="personal-action-notice" role="status" aria-live="polite">{notice}</p>
 </div>;
}
