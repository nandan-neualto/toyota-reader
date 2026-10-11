"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {Upload,Users,BookOpen,Check,LoaderCircle,FileText,Plus,RefreshCw,Download,X,SlidersHorizontal} from "lucide-react";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {api,ApiError,type Employee} from "@/lib/employee-library";
import {parseEmployeeCsv} from "@/lib/employee-csv.mjs";
import {catalogCsv,filterCatalog,selectVisibleBooks} from "@/lib/catalog-controls.mjs";
import type {BookEntry} from "@/lib/catalog";
import type {EmployeeLibrary} from "@/hooks/use-employee-library";

type AccountInput={employeeId:string;name:string;pin:string;role:string};
type UploadItem={file:File;status:string;state:"waiting"|"uploading"|"done"|"error"};
type CatalogResult={books:BookEntry[];usage:Record<string,number>;storage?:{usedBytes:number;limitBytes:number}};
const languageNames:Record<string,string>={en:"English",ja:"Japanese",kn:"Kannada",hi:"Hindi"};
const message=(error:unknown,fallback:string)=>error instanceof Error?error.message:fallback;
const validFile=(file:File)=>/\.(pdf|epub)$/i.test(file.name)&&file.size>0&&file.size<=50*1024*1024;
const storageSize=(bytes:number)=>`${(Math.max(0,bytes)/1024/1024).toLocaleString(undefined,{maximumFractionDigits:1})} MB`;

export default function LibraryManager({library,onClose,onBusyChange}:{library:EmployeeLibrary;onClose:()=>void;onBusyChange:(busy:boolean)=>void}){
 const [tab,setTab]=useState("books"),[books,setBooks]=useState<BookEntry[]>([]),[employees,setEmployees]=useState<Employee[]>([]),[usage,setUsage]=useState<Record<string,number>>({});
 const [loading,setLoading]=useState(true),[catalogReady,setCatalogReady]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [storage,setStorage]=useState<CatalogResult["storage"]>();
 const [selected,setSelected]=useState<string[]>([]),[bulkCategory,setBulkCategory]=useState(""),[bulkAuthor,setBulkAuthor]=useState(""),[bulkLanguage,setBulkLanguage]=useState("");
 const [bookQuery,setBookQuery]=useState(""),[bookStatus,setBookStatus]=useState("all"),[bookCollection,setBookCollection]=useState(""),[bookFormat,setBookFormat]=useState("all"),[bookLanguage,setBookLanguage]=useState(""),[bookSort,setBookSort]=useState("title");
 const [items,setItems]=useState<UploadItem[]>([]),[uploading,setUploading]=useState(false),[category,setCategory]=useState("General"),[author,setAuthor]=useState("Toyota library"),[language,setLanguage]=useState("en");
 const [edit,setEdit]=useState<BookEntry|null>(null),[account,setAccount]=useState<Employee|null>(null),[replacement,setReplacement]=useState(""),[saving,setSaving]=useState(false),[bulkProgress,setBulkProgress]=useState<{completed:number;total:number}|null>(null);
 const [employeeId,setEmployeeId]=useState(""),[name,setName]=useState(""),[pin,setPin]=useState(""),[role,setRole]=useState("employee"),[batch,setBatch]=useState<AccountInput[]>([]),[results,setResults]=useState<Array<{employeeId:string;ok?:boolean;error?:string}>>([]);
 const uploadController=useRef<AbortController|null>(null),refreshController=useRef<AbortController|null>(null),refreshSequence=useRef(0),importSequence=useRef(0),closed=useRef(false),operation=useRef(false),importInput=useRef<HTMLInputElement>(null),bookInput=useRef<HTMLInputElement>(null),selectAllInput=useRef<HTMLInputElement>(null);
 const busy=uploading||saving;
 const refreshLibrary=library.refresh;
 const filteredBooks=useMemo(()=>filterCatalog(books,{query:bookQuery,status:bookStatus,collection:bookCollection,format:bookFormat,language:bookLanguage,sort:bookSort},usage),[books,bookQuery,bookStatus,bookCollection,bookFormat,bookLanguage,bookSort,usage]);
 const collections=useMemo(()=>[...new Set(books.map(book=>book.category||""))].filter(Boolean).sort((a,b)=>a.localeCompare(b)),[books]);
 const languages=useMemo(()=>[...new Set([...Object.keys(languageNames),...books.map(book=>book.language)])].filter(Boolean).sort(),[books]);
 const visibleIds=useMemo(()=>filteredBooks.map(book=>book.id),[filteredBooks]);
 const visibleSelected=selected.filter(id=>visibleIds.includes(id)).length;
 const allVisibleSelected=visibleIds.length>0&&visibleSelected===visibleIds.length;
 const hasFilters=!!bookQuery.trim()||bookStatus!=="all"||!!bookCollection||bookFormat!=="all"||!!bookLanguage;
 const processedUploads=items.filter(item=>item.state==="done"||item.state==="error").length;
 const successfulUploads=items.filter(item=>item.state==="done").length;
 const retryableUploads=items.filter(item=>item.state!=="done"&&validFile(item.file)).length;
 const metadataChange={...(bulkCategory.trim()?{category:bulkCategory.trim()}:{}),...(bulkAuthor.trim()?{author:bulkAuthor.trim()}:{}),...(bulkLanguage?{language:bulkLanguage}:{})};

 useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
 useEffect(()=>{if(selectAllInput.current)selectAllInput.current.indeterminate=visibleSelected>0&&!allVisibleSelected;},[visibleSelected,allVisibleSelected]);
 const refresh=useCallback(async()=>{
  refreshController.current?.abort();
  const controller=new AbortController(),sequence=++refreshSequence.current;
  refreshController.current=controller;setLoading(true);setCatalogReady(false);setError("");
  try{
   const [catalog,directory]=await Promise.all([api<CatalogResult>("/api/admin/books",{signal:controller.signal}),api<{employees:Employee[]}>("/api/admin/employees",{signal:controller.signal})]);
   if(closed.current||controller.signal.aborted||sequence!==refreshSequence.current)return false;
   setBooks(catalog.books);setUsage(catalog.usage);setStorage(catalog.storage);setEmployees(directory.employees);setCatalogReady(true);return true;
  }catch(error){
   if(!controller.signal.aborted&&!closed.current&&sequence===refreshSequence.current)setError(message(error,"Could not load the library. Refresh to try again."));
   return false;
  }finally{if(!controller.signal.aborted&&!closed.current&&sequence===refreshSequence.current)setLoading(false);}
 },[]);
 useEffect(()=>{closed.current=false;const start=setTimeout(()=>void refresh(),0);return()=>{closed.current=true;clearTimeout(start);refreshController.current?.abort();uploadController.current?.abort();};},[refresh]);
 function beginOperation(){if(operation.current||loading||closed.current)return false;operation.current=true;setError("");setNotice("");return true;}
 function finishOperation(){operation.current=false;if(!closed.current){setUploading(false);setSaving(false);setBulkProgress(null);}}
 function clearFilters(){setBookQuery("");setBookStatus("all");setBookCollection("");setBookFormat("all");setBookLanguage("");}
 async function syncViews(){await refresh();if(closed.current)return;try{await refreshLibrary();}catch{if(!closed.current)setError(current=>[current,"Changes were saved, but the employee shelf could not refresh. Try Refresh."].filter(Boolean).join(" "));}}
 function chooseFiles(files:File[]){
  if(operation.current)return;setError("");setNotice("");
  if(files.length>100){setError("Choose up to 100 books per batch.");return;}
  setItems(files.map(file=>({file,state:validFile(file)?"waiting":"error",status:!/\.(pdf|epub)$/i.test(file.name)?"Choose a PDF or EPUB file.":file.size===0?"This file is empty.":file.size>50*1024*1024?"File exceeds 50 MB.":"Ready to upload"})));
 }
 function clearUploads(){setItems([]);if(bookInput.current)bookInput.current.value="";}
 async function upload(){
  if(!retryableUploads||!category.trim()||!author.trim()||!beginOperation())return;
  setUploading(true);const controller=new AbortController();uploadController.current=controller;
  const pending=items.map((item,index)=>({item,index})).filter(({item})=>item.state!=="done"&&validFile(item.file));
  let succeeded=0,failed=0;
  try{
   for(const {item,index} of pending){
    if(controller.signal.aborted||closed.current)break;
    setItems(list=>list.map((entry,i)=>i===index?{...entry,state:"uploading",status:"Uploading…"}:entry));
    const params=new URLSearchParams({filename:item.file.name,category:category.trim(),author:author.trim(),language});
    try{
     const result=await api<{duplicate:boolean;book:BookEntry}>("/api/admin/books?"+params,{method:"POST",body:item.file,signal:controller.signal,headers:{"Content-Type":"application/octet-stream"}});
     if(closed.current)break;succeeded++;
     setItems(list=>list.map((entry,i)=>i===index?{...entry,state:"done",status:result.duplicate?result.book.active!==false?"Already in library — skipped":"Already archived — restore it in catalog":"Added to library"}:entry));
    }catch(error){
     if(closed.current)break;failed++;
     setItems(list=>list.map((entry,i)=>i===index?{...entry,state:"error",status:controller.signal.aborted?"Interrupted. Retry safely; duplicates are skipped.":message(error,"Upload failed.")}:entry));
     if(error instanceof ApiError&&(error.status===401||error.status===403||error.status===409)){controller.abort();break;}
    }
   }
   if(!closed.current){await syncViews();setNotice(`${succeeded} files processed successfully${failed?`; ${failed} need a retry`:""}. ${controller.signal.aborted?"Batch stopped. Remaining files are kept for another attempt.":"Employee reading records are preserved."}`);}
  }finally{finishOperation();}
 }
 async function saveBook(event:React.FormEvent){
  event.preventDefault();if(!edit||!beginOperation())return;setSaving(true);
  try{await api("/api/admin/books/"+edit.id,{method:"PUT",body:JSON.stringify(edit)});if(!closed.current){setEdit(null);await syncViews();setNotice("Book details saved. Archived books keep employee reading records.");}}
  catch(error){if(!closed.current)setError(message(error,"Could not update the book. Your edits are still here."));}finally{finishOperation();}
 }
 async function bulkChange(change:Partial<BookEntry>){
  if(!selected.length||!beginOperation())return;
  setSaving(true);const ids=[...selected],failedIds:string[]=[],failureTitles:string[]=[];let success=0;
  setBulkProgress({completed:0,total:ids.length});
  try{
   // Merge into the latest catalog so fields outside this operation are preserved.
   const catalog=await api<CatalogResult>("/api/admin/books");
   if(closed.current)return;
   const latest=new Map(catalog.books.map(book=>[book.id,book]));
   for(let index=0;index<ids.length;index++){
    if(closed.current)return;const id=ids[index],book=latest.get(id);
    try{if(!book)throw new Error("Book unavailable.");await api("/api/admin/books/"+id,{method:"PUT",body:JSON.stringify({...book,...change})});success++;}
    catch(error){
     failedIds.push(id);failureTitles.push(book?.title||id);
     if(error instanceof ApiError&&(error.status===401||error.status===403||error.status===409)){failedIds.push(...ids.slice(index+1));break;}
    }
    setBulkProgress({completed:index+1,total:ids.length});
   }
   if(closed.current)return;
   setSelected(failedIds);await syncViews();
   setNotice(`${success} ${success===1?"book":"books"} updated. Employee reading records are preserved.${failedIds.length?` ${failedIds.length} remain selected for retry.`:""}`);
   if(failedIds.length)setError(current=>[current,`Could not update ${failureTitles.slice(0,5).join(", ")}${failedIds.length>5?" and other selected books":""}. Failed books remain selected.`].filter(Boolean).join(" "));
  }catch(error){if(!closed.current)setError(message(error,"Could not update the selection. All books remain selected for retry."));}
  finally{finishOperation();}
 }
 function exportCatalog(){
  if(busy||loading||!catalogReady||!filteredBooks.length)return;
  const url=URL.createObjectURL(new Blob([catalogCsv(filteredBooks,usage)],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");
  link.href=url;link.download=`toyota-catalog-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
  setNotice(`Exported the current ${filteredBooks.length} ${filteredBooks.length===1?"book":"books"}. Japanese and Kannada text are preserved in the CSV.`);
 }
 async function addEmployees(entries:AccountInput[]){
  if(!beginOperation())return;setSaving(true);setResults([]);
  try{const response=await api<{results:typeof results}>("/api/admin/employees",{method:"POST",body:JSON.stringify({employees:entries})});if(closed.current)return;setResults(response.results);setPin("");setBatch([]);if(importInput.current)importInput.current.value="";await refresh();}
  catch(error){if(!closed.current)setError(message(error,"Could not create accounts."));}finally{finishOperation();}
 }
 async function importEmployees(file?:File){
  if(operation.current)return;setError("");const sequence=++importSequence.current;if(!file){setBatch([]);return;}
  try{if(file.size>200000)throw new Error("Choose a CSV smaller than 200 KB.");const parsed=parseEmployeeCsv(await file.text());if(!closed.current&&sequence===importSequence.current&&!operation.current)setBatch(parsed);}
  catch(error){if(!closed.current&&sequence===importSequence.current){setBatch([]);setError(message(error,"Could not read this CSV."));}}
 }
 async function saveAccount(event:React.FormEvent){
  event.preventDefault();if(!account||!beginOperation())return;setSaving(true);
  try{await api("/api/admin/employees/"+account.id,{method:"PUT",body:JSON.stringify({active:account.active,...(replacement?{pin:replacement}:{})})});if(closed.current)return;setAccount(null);setReplacement("");await refresh();setNotice("Employee access updated. PIN changes or paused access end existing sessions.");}
  catch(error){if(!closed.current)setError(message(error,"Could not update access."));}finally{finishOperation();}
 }

 return <Dialog open onOpenChange={open=>{if(!open&&!operation.current)onClose();}}>
  <DialogContent className="library-manager" onEscapeKeyDown={event=>{if(operation.current)event.preventDefault();}} onPointerDownOutside={event=>{if(operation.current)event.preventDefault();}}>
   <DialogTitle>Library administration</DialogTitle><DialogDescription>Build the collection and manage employee access. Reading records stay with each employee account.</DialogDescription>
   <div className="manager-tabs">
    <button aria-pressed={tab==="books"} disabled={busy} onClick={()=>setTab("books")}><BookOpen size={18}/> Book catalog</button>
    <button aria-pressed={tab==="employees"} disabled={busy} onClick={()=>setTab("employees")}><Users size={18}/> Employees</button>
    <button className="toolbar-button" disabled={loading||busy} onClick={()=>void refresh()}><RefreshCw size={16}/> Refresh</button>
   </div>
   {error&&<p className="library-alert" role="alert">{error}</p>}{notice&&<p className="shelf-notice" role="status">{notice}</p>}
   {bulkProgress&&<div className="catalog-operation" role="status"><LoaderCircle size={18} className="reader-spinner"/> Updating books · {bulkProgress.completed} of {bulkProgress.total}<progress value={bulkProgress.completed} max={bulkProgress.total} aria-label="Selected books updated"/></div>}
   {loading?<div className="manager-loading" role="status"><LoaderCircle className="reader-spinner"/> Loading library records…</div>:tab==="books"?<>
    <div className="catalog-overview" aria-label="Catalog overview"><div><strong>{books.length}</strong><span>Total books</span></div><div><strong>{books.filter(book=>book.active!==false).length}</strong><span>Available</span></div><div><strong>{books.filter(book=>book.active===false).length}</strong><span>Archived</span></div><div><strong>{collections.length}</strong><span>Collections</span></div></div>
    {storage&&<div className="catalog-storage"><div><strong>Library file storage</strong><span>{storageSize(storage.usedBytes)} of {storageSize(storage.limitBytes)} used · {storageSize(storage.limitBytes-storage.usedBytes)} available</span></div><progress value={Math.min(storage.usedBytes,storage.limitBytes)} max={storage.limitBytes||1} aria-label="Library file storage used"/><p>Archived files still use library storage. Employee reading records are kept.</p></div>}
    <section className="bulk-panel">
     <div><span className="shelf-kicker">GROW THE COLLECTION</span><h3>Add books in a batch.</h3><p>Select or drop up to 100 PDF/EPUB files. Each book can be up to 50 MB. Matching files are skipped automatically.</p></div>
     <fieldset disabled={busy} className="catalog-fieldset"><div className="bulk-defaults"><label>Collection<input value={category} onChange={event=>setCategory(event.target.value)} maxLength={80}/></label><label>Author / publisher<input value={author} onChange={event=>setAuthor(event.target.value)} maxLength={200}/></label><label>Book language<select value={language} onChange={event=>setLanguage(event.target.value)}>{Object.entries(languageNames).map(([code,name])=><option value={code} key={code}>{name}</option>)}</select></label></div>
      <label className="bulk-drop" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();chooseFiles(Array.from(event.dataTransfer.files));}}><Upload size={26}/><strong>Drop books here or choose files</strong><span>PDF & EPUB · multiple files supported</span><input ref={bookInput} type="file" multiple accept=".pdf,.epub" aria-label="Choose books for bulk upload" onChange={event=>chooseFiles(Array.from(event.target.files||[]))}/></label>
     </fieldset>
     {!!items.length&&<>
      <div className="batch-upload-summary"><p role="status">{uploading?"Uploading your batch…":`${successfulUploads} ready in the library · ${items.filter(item=>item.state==="error").length} need attention · ${items.filter(item=>item.state==="waiting").length} waiting`}</p><progress value={processedUploads} max={items.length} aria-label="Files processed"/><span>{processedUploads} of {items.length} processed</span></div>
      <div className="upload-list" aria-label="Batch upload results">{items.map((item,index)=><div key={`${item.file.name}-${index}`}><FileText size={17}/><span>{item.file.name}<small>{(item.file.size/1024/1024).toFixed(1)} MB</small></span><span className={"upload-status "+item.state}>{item.state==="uploading"?<LoaderCircle size={15} className="reader-spinner"/>:item.state==="done"?<Check size={15}/>:null}{item.status}</span>{item.state!=="done"&&<button className="icon-button upload-remove" disabled={busy} aria-label={`Remove ${item.file.name} from this batch`} onClick={()=>setItems(list=>list.filter((_,i)=>i!==index))}><X size={17}/></button>}</div>)}</div>
      <div className="bulk-actions"><span>Completed files are skipped when you retry.</span>{uploading?<button className="toolbar-button" onClick={()=>uploadController.current?.abort()}>Cancel remaining uploads</button>:<div className="upload-batch-actions"><button className="toolbar-button" disabled={busy} onClick={clearUploads}>Clear batch</button><button className="primary-button" disabled={busy||!retryableUploads||!category.trim()||!author.trim()} onClick={()=>void upload()}><Upload size={17}/> {items.some(item=>item.state==="error")?"Upload / retry":"Upload"} {retryableUploads} books</button></div>}</div>
     </>}
    </section>
    <div className="manager-section-title catalog-section-heading"><div><h3>Manage the catalog</h3><p>{filteredBooks.length} of {books.length} books shown. Edit metadata, organize collections, or archive books.</p></div><button className="toolbar-button" disabled={busy||!catalogReady||!filteredBooks.length} onClick={exportCatalog}><Download size={17}/> Export results CSV</button></div>
    {!catalogReady&&<p className="catalog-stale">These are the last loaded records. Refresh successfully before exporting the catalog.</p>}
    <fieldset disabled={busy} className="catalog-fieldset"><div className="manager-catalog-tools catalog-control-grid">
     <label className="catalog-admin-search">Search catalog<input aria-label="Search administration catalog" placeholder="Title, author or description…" value={bookQuery} onChange={event=>setBookQuery(event.target.value)}/></label>
     <label>Availability<select aria-label="Filter book availability" value={bookStatus} onChange={event=>setBookStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Available books</option><option value="archived">Archived books</option></select></label>
     <label>Collection<select aria-label="Filter catalog collection" value={bookCollection} onChange={event=>setBookCollection(event.target.value)}><option value="">All collections</option>{collections.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
     <label>Format<select aria-label="Filter catalog format" value={bookFormat} onChange={event=>setBookFormat(event.target.value)}><option value="all">All formats</option><option value="pdf">PDF</option><option value="epub">EPUB</option></select></label>
     <label>Language<select aria-label="Filter catalog language" value={bookLanguage} onChange={event=>setBookLanguage(event.target.value)}><option value="">All languages</option>{languages.map(value=><option key={value} value={value}>{languageNames[value]||value}</option>)}</select></label>
     <label>Sort by<select aria-label="Sort administration catalog" value={bookSort} onChange={event=>setBookSort(event.target.value)}><option value="title">Title A–Z</option><option value="newest">Recently added</option><option value="readers">Most readers</option><option value="collection">Collection</option></select></label>
    </div></fieldset>
    <div className="catalog-results-toolbar"><span>{selected.length?`${visibleSelected} selected in these results · ${selected.length-visibleSelected} selected outside these filters${selected.length>=100?" · 100-book limit reached":""}`:"Select up to 100 books for a batch update."}</span><div>{!!visibleSelected&&<button className="toolbar-button" disabled={busy} onClick={()=>setSelected(ids=>selectVisibleBooks(ids,visibleIds,false))}>Deselect visible</button>}{hasFilters&&<button className="toolbar-button" disabled={busy} onClick={clearFilters}><X size={16}/> Clear filters</button>}</div></div>
    {!!selected.length&&<div className="bulk-book-controls catalog-bulk-panel">
     <div className="catalog-selection-heading"><strong>{selected.length} books selected</strong><button className="toolbar-button" disabled={busy} onClick={()=>setSelected([])}>Clear selection</button></div>
     <p>Changes apply to every selected book, including books outside the current filters. Leave a field blank to preserve its value.</p>
     <fieldset disabled={busy} className="catalog-fieldset"><div className="catalog-bulk-fields"><label>New collection<input aria-label="New collection for selected books" placeholder="Keep existing collection" value={bulkCategory} onChange={event=>setBulkCategory(event.target.value)} maxLength={80}/></label><label>New author / publisher<input aria-label="New author for selected books" placeholder="Keep existing author" value={bulkAuthor} onChange={event=>setBulkAuthor(event.target.value)} maxLength={200}/></label><label>New book language<select aria-label="New language for selected books" value={bulkLanguage} onChange={event=>setBulkLanguage(event.target.value)}><option value="">Keep existing language</option>{languages.map(value=><option key={value} value={value}>{languageNames[value]||value}</option>)}</select></label></div></fieldset>
     <div className="catalog-bulk-actions"><button className="toolbar-button" disabled={busy||!Object.keys(metadataChange).length} onClick={()=>void bulkChange(metadataChange)}><SlidersHorizontal size={16}/> Apply metadata</button><button className="toolbar-button" disabled={busy} onClick={()=>void bulkChange({active:false})}>Archive selected</button><button className="toolbar-button" disabled={busy} onClick={()=>void bulkChange({active:true})}>Restore selected</button></div>
    </div>}
    <div className="manager-table-wrap"><table><thead><tr><th><label className="table-selection"><input ref={selectAllInput} type="checkbox" aria-label="Select visible books, preserving selections outside these filters, up to 100 total" checked={allVisibleSelected} disabled={busy||!visibleIds.length||selected.length>=100&&!allVisibleSelected} onChange={event=>{const checked=event.target.checked;setSelected(ids=>selectVisibleBooks(ids,visibleIds,checked));}}/></label></th><th>Book</th><th>Collection</th><th>Readers</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredBooks.map(book=><tr key={book.id}><td><label className="table-selection"><input type="checkbox" aria-label={"Select "+book.title} checked={selected.includes(book.id)} disabled={busy||selected.length>=100&&!selected.includes(book.id)} onChange={event=>{const checked=event.target.checked;setSelected(ids=>selectVisibleBooks(ids,[book.id],checked));}}/></label></td><td><strong>{book.title}</strong><small>{book.author} · {book.format.toUpperCase()} · {languageNames[book.language]||book.language}</small></td><td>{book.category}</td><td>{usage[book.id]||0}</td><td><span className={book.active!==false?"status-active":"status-archived"}>{book.active!==false?"Available":"Archived"}</span></td><td><button className="toolbar-button" disabled={busy} onClick={()=>{setError("");setEdit({...book});}}>Edit details</button></td></tr>)}</tbody></table>
     {!filteredBooks.length&&<div className="catalog-filter-empty"><BookOpen size={26}/><h4>{books.length?"No books match these filters":"Your collection is ready to grow"}</h4><p>{books.length?"Try another title, collection, format or language. Your selected books are kept.":"Add PDF and EPUB books using the batch uploader above."}</p>{hasFilters&&<button className="toolbar-button" disabled={busy} onClick={clearFilters}>Clear filters</button>}</div>}
    </div>
   </>:<>
    <section className="employee-create"><div><h3>Add employee access</h3><p>Provide the employee’s ID and an initial PIN or passphrase. They can change their PIN after signing in.</p></div><form onSubmit={event=>{event.preventDefault();void addEmployees([{employeeId,name,pin,role}]);}}><label>Employee ID<input value={employeeId} onChange={event=>setEmployeeId(event.target.value)} required maxLength={40} disabled={busy}/></label><label>Full name<input value={name} onChange={event=>setName(event.target.value)} required maxLength={100} disabled={busy}/></label><label>Initial PIN<input type="password" autoComplete="new-password" value={pin} onChange={event=>setPin(event.target.value)} required minLength={6} maxLength={128} disabled={busy}/></label><label>Access role<select value={role} onChange={event=>setRole(event.target.value)} disabled={busy}><option value="employee">Employee</option><option value="admin">Library administrator</option></select></label><button className="primary-button" disabled={busy}><Plus size={17}/> Add employee</button></form></section>
    <section className="employee-import"><div><h3>Import an employee list</h3><p>CSV columns: <code>employeeId,name,pin</code> and optional <code>role</code>. Import up to 200 accounts. Existing IDs keep their credentials.</p></div><label className="csv-picker">Choose employee CSV<input ref={importInput} type="file" accept=".csv,text/csv" disabled={busy} onChange={event=>void importEmployees(event.target.files?.[0])}/></label>{!!batch.length&&<div className="batch-preview"><p>{batch.length} employees ready: {batch.slice(0,5).map(employee=>`${employee.employeeId} (${employee.name})`).join(", ")}{batch.length>5?"…":""}</p><button className="primary-button" disabled={busy} onClick={()=>void addEmployees(batch)}>Add {batch.length} employees</button><button className="toolbar-button" onClick={()=>{setBatch([]);importSequence.current++;if(importInput.current)importInput.current.value="";}} disabled={busy}>Clear list</button></div>}{!!results.length&&<div className="employee-import-results" role="status">{results.map((result,index)=><p key={index} className={result.ok?"import-success":"import-error"}>{result.employeeId}: {result.ok?"Account created":result.error}</p>)}</div>}</section>
    <div className="manager-section-title"><h3>Employee directory · {employees.length}</h3><p>Pause access or reset a PIN. Reading records are preserved.</p></div><div className="manager-table-wrap"><table><thead><tr><th>Employee</th><th>ID</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{employees.map(employee=><tr key={employee.id}><td><strong>{employee.name}</strong></td><td>{employee.employeeId}</td><td>{employee.role==="admin"?"Administrator":"Employee"}</td><td><span className={employee.active?"status-active":"status-archived"}>{employee.active?"Active":"Paused"}</span></td><td>{employee.id===library.user?.id?<span className="directory-self">Your account</span>:<button className="toolbar-button" disabled={busy} onClick={()=>{setError("");setReplacement("");setAccount({...employee});}}>Manage access</button>}</td></tr>)}</tbody></table>{!employees.length&&<p className="library-empty">No employee accounts have loaded. Refresh the directory or add an employee above.</p>}</div>
   </>}
   <Dialog open={!!edit} onOpenChange={open=>{if(!open&&!operation.current)setEdit(null);}}><DialogContent className="library-edit" onEscapeKeyDown={event=>{if(operation.current)event.preventDefault();}} onPointerDownOutside={event=>{if(operation.current)event.preventDefault();}}><DialogTitle>Edit book details</DialogTitle><DialogDescription>Organize how this book appears in the employee library.</DialogDescription>{edit&&<form onSubmit={saveBook}><fieldset disabled={busy} className="catalog-edit-fields"><label>Title<input value={edit.title} onChange={event=>setEdit({...edit,title:event.target.value})} required maxLength={200}/></label><label>Author<input value={edit.author} onChange={event=>setEdit({...edit,author:event.target.value})} required maxLength={200}/></label><label>Collection<input value={edit.category||""} onChange={event=>setEdit({...edit,category:event.target.value})} required maxLength={80}/></label><label>Description<textarea value={edit.description||""} onChange={event=>setEdit({...edit,description:event.target.value})} maxLength={3000}/></label><label>Language code<input value={edit.language} onChange={event=>setEdit({...edit,language:event.target.value})} required maxLength={30}/></label><label className="checkbox-label"><input type="checkbox" checked={edit.active!==false} onChange={event=>setEdit({...edit,active:event.target.checked})}/> Available to employees</label></fieldset><p>Uncheck to archive this book. Its file and all saved reading records remain in the library.</p>{error&&<p className="library-alert" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{saving?"Saving…":"Save book details"}</button></form>}</DialogContent></Dialog>
   <Dialog open={!!account} onOpenChange={open=>{if(!open&&!operation.current)setAccount(null);}}><DialogContent className="library-edit" onEscapeKeyDown={event=>{if(operation.current)event.preventDefault();}} onPointerDownOutside={event=>{if(operation.current)event.preventDefault();}}><DialogTitle>Manage employee access</DialogTitle><DialogDescription>{account?.name} · {account?.employeeId}</DialogDescription>{account&&<form onSubmit={saveAccount}><fieldset disabled={busy} className="catalog-edit-fields"><label>New PIN or passphrase<input type="password" autoComplete="new-password" value={replacement} onChange={event=>setReplacement(event.target.value)} minLength={6} maxLength={128}/></label><p>Leave empty to keep the current PIN. A reset ends existing sessions.</p><label className="checkbox-label"><input type="checkbox" checked={account.active} onChange={event=>setAccount({...account,active:event.target.checked})}/> Employee access is active</label></fieldset>{error&&<p className="library-alert" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{saving?"Saving…":"Save access"}</button></form>}</DialogContent></Dialog>
  </DialogContent>
 </Dialog>;
}
