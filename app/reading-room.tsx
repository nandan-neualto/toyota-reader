"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {Headphones,Maximize2,Library,Plus,Minus,Upload,List,Play,Pause,Square,Settings2,Check,LoaderCircle,ChevronLeft,ChevronRight,RotateCcw,Bookmark,LogOut,UserRound,Trash2,CheckCircle2} from "lucide-react";
import {Sheet,SheetContent,SheetTitle,SheetDescription} from "@/components/ui/sheet";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Tabs,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {Switch} from "@/components/ui/switch";
import {Progress} from "@/components/ui/progress";
import {featuredBook,type BookEntry,type TocEntry} from "@/lib/catalog";
import {useNarration} from "@/hooks/use-narration";
import {visitClock} from "@/lib/visit-clock";
import PDFReader,{type PDFReady} from "./pdf-reader";
import EpubReader,{type EpubControls} from "./epub-reader";
import LibraryShelf from "./library-shelf";
import LibraryManager from "./library-manager";
import type {EmployeeLibrary} from "@/hooks/use-employee-library";
import {api,clearFiles,emptyRecord} from "@/lib/employee-library";

export default function ReadingRoom({library}:{library:EmployeeLibrary}){
 const [book,setBook]=useState<BookEntry|null>(null),[personalBooks,setPersonalBooks]=useState<BookEntry[]>([]);
 const books=useMemo(()=>[...library.books,...personalBooks],[library.books,personalBooks]);
 const [page,setPageState]=useState(1),[pageDraft,setPageDraft]=useState("1"),[total,setTotal]=useState(0),[zoom,setZoom]=useState(1),[view,setView]=useState<"page"|"text">("page");
 const setPage=useCallback((value:number)=>{setPageState(value);setPageDraft(String(value));},[]);
 const [text,setText]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[toc,setToc]=useState<TocEntry[]>([]);
 const [contents,setContents]=useState(false),[settings,setSettings]=useState(false),[importing,setImporting]=useState(false),[importBusy,setImportBusy]=useState(false);
 const [epubLabel,setEpubLabel]=useState("Opening book…"),[epubStart,setEpubStart]=useState(true),[epubEnd,setEpubEnd]=useState(false);
 const [continuous,setContinuous]=useState(false),[idle,setIdle]=useState(false),[seconds,setSeconds]=useState(30),[offlineReady,setOfflineReady]=useState(false);
 const [visitActive,setVisitActive]=useState(!!library.user);
 const [manager,setManager]=useState(false),[personal,setPersonal]=useState(false),[account,setAccount]=useState(false),[opening,setOpening]=useState(false);
 const [adminBusy,setAdminBusy]=useState(false);
 const [epubCfi,setEpubCfi]=useState(""),[epubPercent,setEpubPercent]=useState(0),[epubInitial,setEpubInitial]=useState("");
 const [currentPin,setCurrentPin]=useState(""),[newPin,setNewPin]=useState(""),[pinBusy,setPinBusy]=useState(false),[pinError,setPinError]=useState("");
 const records=useRef(library.records);
 useEffect(()=>{records.current=library.records;},[library.records]);
 const saveRecord=library.update,loadBook=library.loadBook,logout=library.logout;
 const visitGeneration=useRef(0),bookLoadGeneration=useRef(0),libraryStart=useRef<HTMLButtonElement>(null);
 const speech=useNarration(),stop=speech.stop,read=speech.read,resetSpeech=speech.reset,setNarrationCompletion=speech.setCompletion;
 const epubControls=useRef<EpubControls|null>(null),autoplay=useRef(false),activity=useRef(0),input=useRef<HTMLInputElement>(null),readerState=useRef({book,page,total});
 useEffect(()=>{readerState.current={book,page,total};},[book,page,total]);
 const touch=useCallback(()=>{activity.current=Date.now();},[]);
 const closeBook=useCallback(()=>{bookLoadGeneration.current++;stop();autoplay.current=false;setBook(null);setText("");setError("");setBusy(false);setContents(false);setSettings(false);setPersonal(false);setIdle(false);epubControls.current=null;window.scrollTo(0,0);touch();},[stop,touch]);
 const finishVisit=useCallback(()=>{
  visitGeneration.current++;closeBook();resetSpeech();setVisitActive(false);setPersonalBooks([]);
  setContinuous(false);setZoom(1);setView("page");setPage(1);setPageDraft("1");setTotal(0);setToc([]);
  setImporting(false);setImportBusy(false);setSeconds(30);setEpubLabel("Opening book…");setEpubStart(true);setEpubEnd(false);
  setManager(false);setAccount(false);setOpening(false);setCurrentPin("");setNewPin("");void logout();
  if(input.current)input.current.value="";
  requestAnimationFrame(()=>libraryStart.current?.focus({preventScroll:true}));
 },[closeBook,resetSpeech,logout,setPage]);
 const openBook=useCallback(async(entry:BookEntry)=>{
  const epoch=visitGeneration.current,request=++bookLoadGeneration.current;stop();setVisitActive(true);autoplay.current=false;setError("");setOpening(true);touch();
  try{const loaded=await loadBook(entry);if(epoch!==visitGeneration.current||request!==bookLoadGeneration.current)return;const saved=records.current[entry.id]||emptyRecord();setText("");setPage(saved.started?saved.page:1);setPageDraft(String(saved.started?saved.page:1));setTotal(0);setToc([]);setBusy(true);setEpubCfi("");setEpubPercent(0);setEpubInitial(saved.started?saved.cfi:"");setBook({...loaded});window.scrollTo(0,0);setEpubLabel("Opening book…");setEpubStart(true);setEpubEnd(false);epubControls.current=null;
  }catch(error){if(epoch===visitGeneration.current&&request===bookLoadGeneration.current)setError(error instanceof Error?error.message:"Could not open this book.");}finally{if(epoch===visitGeneration.current&&request===bookLoadGeneration.current)setOpening(false);}
 },[stop,touch,loadBook,setPage]);
 const ready=useCallback((data:PDFReady)=>{setTotal(data.pages);setToc(data.toc);if(readerState.current.page>data.pages)setPage(data.pages);},[setPage]);
 const epubReady=useCallback((items:TocEntry[],controls:EpubControls)=>{setToc(items);epubControls.current=controls;},[]);
 const epubLocation=useCallback((label:string,start:boolean,end:boolean,cfi:string,percent:number)=>{setEpubLabel(label);setEpubStart(start);setEpubEnd(end);setEpubCfi(cfi);setEpubPercent(percent);},[]);
 useEffect(()=>{
  if(!library.user||!book||book.personal||busy||error||(book.format==="pdf"?!total:!epubCfi))return;
  const percent=book.format==="pdf"?page/total*100:epubPercent;
  saveRecord(book.id,{page,total,cfi:epubCfi,percent,started:true,completed:records.current[book.id]?.completed||percent>=99.99,lastReadAt:new Date().toISOString()});
 },[library.user,book,page,total,epubCfi,epubPercent,busy,error,saveRecord]);
 const changePage=useCallback((target:number)=>{const current=readerState.current;if(!Number.isInteger(target)||target<1||target>current.total){setError("Enter a page number from 1 to "+current.total+".");return;}stop();autoplay.current=false;setError("");setPage(target);touch();},[stop,touch,setPage]);
 const turn=useCallback(async(direction:number,keepListening=false)=>{
  stop();autoplay.current=keepListening;setError("");touch();const current=readerState.current;
  if(current.book?.format==="pdf"){const next=Math.min(current.total,Math.max(1,current.page+direction));if(next!==current.page){setBusy(true);setText("");setPage(next);}else autoplay.current=false;return;}
  if(!epubControls.current)return;setBusy(true);setText("");
  try{await(direction>0?epubControls.current.next():epubControls.current.previous());}catch{setError("This section could not be opened.");setBusy(false);autoplay.current=false;}
 },[stop,touch,setPage]);
 useEffect(()=>{setNarrationCompletion(()=>{touch();if(continuous&&book&&!idle){if(book.format==="pdf"?page<total:!epubEnd)void turn(1,true);}});},[setNarrationCompletion,touch,continuous,book,idle,page,total,epubEnd,turn]);
 useEffect(()=>{touch();},[speech.state,touch]);
 useEffect(()=>{if(autoplay.current&&!busy&&text&&book){autoplay.current=false;read(text,book.language);}},[text,busy,book,read]);
 useEffect(()=>{if(!book)return;const key=(e:KeyboardEvent)=>{const target=e.target as HTMLElement;if(busy||target.closest("input,textarea,select,button,[role=dialog],[role=combobox],[role=tablist]")||contents||settings||personal||idle)return;if(e.key==="ArrowRight"&&(book.format==="pdf"?page<total:!epubEnd)){e.preventDefault();void turn(1);}if(e.key==="ArrowLeft"&&(book.format==="pdf"?page>1:!epubStart)){e.preventDefault();void turn(-1);}};
  window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
 },[book,contents,settings,personal,idle,turn,busy,page,total,epubEnd,epubStart]);
 useEffect(()=>{
  const onTouch=()=>{if(!idle)touch();};window.addEventListener("pointerdown",onTouch);window.addEventListener("keydown",onTouch);window.addEventListener("wheel",onTouch,{passive:true});
  const timer=setInterval(()=>{if(!visitActive)return;if(speech.state==="playing"||adminBusy){touch();return;}
   const clock=visitClock(activity.current,Date.now(),false);if(clock.expired)finishVisit();else if(clock.warning){setContents(false);setSettings(false);setImporting(false);setPersonal(false);setManager(false);setAccount(false);setIdle(true);setSeconds(clock.remaining);}
  },1000);
  return()=>{clearInterval(timer);window.removeEventListener("pointerdown",onTouch);window.removeEventListener("keydown",onTouch);window.removeEventListener("wheel",onTouch);};
 },[visitActive,idle,speech.state,adminBusy,finishVisit,touch]);
 useEffect(()=>{
  if(!("serviceWorker"in navigator)||process.env.NODE_ENV!=="production")return;
  const handle=(event:MessageEvent)=>{if(event.data?.type==="READER_READY")setOfflineReady(true);};
  navigator.serviceWorker.addEventListener("message",handle);
  void navigator.serviceWorker.register("/sw.js").then(()=>navigator.serviceWorker.ready).then(reg=>reg.active?.postMessage({type:"CHECK_READY"})).catch(()=>{});
  return()=>navigator.serviceWorker.removeEventListener("message",handle);
 },[]);
 useEffect(()=>{
  const ctx=(document as unknown as {modelContext?:{registerTool:(tool:unknown,options:unknown)=>Promise<void>}}).modelContext;if(!ctx)return;
  const life=new AbortController();
  void Promise.resolve(ctx.registerTool({name:"open_toyota_book",title:"Open Toyota book",description:"Open the supplied Toyota book in the reader at its first page. Does not start audio.",inputSchema:{type:"object",properties:{bookId:{type:"string",enum:[featuredBook.id]}},required:["bookId"],additionalProperties:false},annotations:{readOnlyHint:false},execute(value:unknown){if((value as {bookId?:string})?.bookId!==featuredBook.id)throw new Error("Unknown book");openBook(featuredBook);return{bookId:featuredBook.id,page:1,audioStarted:false};}},{signal:life.signal})).catch(()=>{});
  return()=>life.abort();
 },[openBook]);
 async function importBook(file?:File){
  if(!file)return;const generation=visitGeneration.current;setError("");setImportBusy(true);setVisitActive(true);touch();
  try{
   const ext=file.name.split(".").pop()?.toLowerCase();
   if(ext!=="pdf"&&ext!=="epub")throw new Error("Choose a PDF or EPUB file.");
   if(file.size>50*1024*1024)throw new Error("Choose a book smaller than 50 MB.");
   if(file.size<10)throw new Error("This file is empty or incomplete.");
   const bytes=new Uint8Array(await file.slice(0,1024).arrayBuffer());
   if(generation!==visitGeneration.current)return;
   if(ext==="pdf"&&!new TextDecoder().decode(bytes).includes("%PDF-"))throw new Error("This file is not a valid PDF.");
   if(ext==="epub"&&(bytes[0]!==80||bytes[1]!==75))throw new Error("This file is not a valid EPUB.");
   const entry:BookEntry={id:crypto.randomUUID(),title:file.name.replace(/\.(pdf|epub)$/i,"").replaceAll("_"," "),author:"Added for this visit",format:ext,file,language:"en",personal:true};
   setPersonalBooks(items=>[...items,entry]);setImporting(false);openBook(entry);
  }catch(e){if(generation===visitGeneration.current)setError(e instanceof Error?e.message:"Could not open this file.");}
  finally{if(generation===visitGeneration.current){setImportBusy(false);if(input.current)input.current.value="";}}
 }
 async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{setError("Full screen is unavailable here. Use your browser’s full-screen option on the kiosk.");}}
 async function jumpTo(item:TocEntry){stop();autoplay.current=false;setContents(false);touch();if(typeof item.target==="number")changePage(item.target);else{setBusy(true);try{await epubControls.current?.go(item.target);}catch{setError("Could not open this chapter.");setBusy(false);}}}
 const play=()=>{touch();speech.setError("");if(speech.state==="playing")speech.pause();else if(speech.state==="paused")speech.resume();else read(text,book?.language||"en");};
 const canPrevious=book?.format==="pdf"?page>1:!epubStart;
 const canNext=book?.format==="pdf"?page<total:!epubEnd;
 return <div className={"reading-room "+(book?"book-open":"")}>
  <header className="room-header"><button className="brand" type="button" aria-label="Return to library" onClick={closeBook}><img src="/toyota-logo.svg" alt="Toyota"/><span/><div>EMPLOYEE LIBRARY<small>Learning together</small></div></button><div className="header-actions">{library.user?<><span className={"account-sync "+(library.pendingCount?"sync-pending":"")} role="status">{library.syncing?<LoaderCircle size={14} className="reader-spinner"/>:<Check size={14}/>} {library.pendingCount?`${library.pendingCount} ${library.pendingCount===1?"change":"changes"} ${library.deviceSaved?"saved on device":"waiting to sync"}`:"Progress synced"}</span><button className="toolbar-button account-button" onClick={()=>{setPinError("");setAccount(true);}}><UserRound size={17}/><span>{library.user.name}<small>{library.user.employeeId}</small></span></button></>:<span className="quiet-label">{offlineReady?"Ready to read offline":"Guest reading"}</span>}{(visitActive||library.guest)&&<button ref={libraryStart} className="finish-visit toolbar-button" onClick={finishVisit}><LogOut size={17}/>{library.user?"Sign out":"Finish visit"}</button>}<button className="icon-button" aria-label="Toggle full screen" title="Full screen" onClick={fullscreen}><Maximize2 size={20}/></button></div></header>
  {library.message&&library.user&&<div className="account-message" role="status">{library.message}<button onClick={()=>void library.flush()}>Try sync</button></div>}
  {error&&!book&&!importing&&<p className="error-banner" role="alert">{error}</p>}
  {!book?<><LibraryShelf library={library} books={books} onOpen={entry=>{if(!opening)void openBook(entry);}} onManage={()=>setManager(true)} onImport={()=>{setError("");setVisitActive(true);touch();setImporting(true);}}/>{opening&&<div className="opening-book-overlay" role="status"><LoaderCircle size={25} className="reader-spinner"/><span>Opening your book…</span></div>}</>:
  <main className="reader">
   <div className="reader-toolbar"><button onClick={closeBook}><Library size={18}/> Library</button><button onClick={()=>setContents(true)} disabled={!toc.length} aria-label="Open contents" title={toc.length?"Book contents":"This book has no contents list"}><List size={18}/><span>Contents</span></button><h1 title={book.title}>{book.title}</h1><div className="zoom-tools"><button aria-label="Decrease size" disabled={zoom<=.65} onClick={()=>{stop();setZoom(z=>Math.max(.65,z-.15));}}><Minus size={18}/></button><span>{Math.round(zoom*100)}%</span><button aria-label="Increase size" disabled={zoom>=2} onClick={()=>{stop();setZoom(z=>Math.min(2,z+.15));}}><Plus size={18}/></button></div>{library.user&&!book.personal&&<button className="personal-toggle" onClick={()=>setPersonal(true)}><Bookmark size={18}/><span>My notes</span></button>}<button className="settings-toggle" aria-label="Reading settings" onClick={()=>setSettings(true)}><Settings2 size={19}/><span>Settings</span></button></div>
   {error&&<p className="error-banner" role="alert">{error} <button onClick={()=>openBook(book)}>Reopen book</button></p>}
   <div className="document-frame" aria-busy={busy}>{busy&&<div className="reader-loading" role="status"><LoaderCircle size={22} className="reader-spinner"/><span>Preparing your page…</span></div>}{book.format==="pdf"?<PDFReader book={book} page={page} zoom={zoom} view={view} onReady={ready} onText={setText} onError={setError} onBusy={setBusy} text={text} activeText={speech.activeText}/>:<EpubReader book={book} initialLocation={epubInitial} zoom={zoom} onReady={epubReady} onLocation={epubLocation} onText={setText} onBusy={setBusy} onError={setError} onActivity={touch}/>}</div>
   {book.format==="epub"&&speech.activeText&&<div className="epub-spoken" role="status">{speech.activeText}</div>}
   <div className="narration-bar"><div className="narration-caption"><Headphones size={20}/><div><strong>{speech.state==="playing"?"Listening":speech.state==="paused"?"Paused":"Listen to this page"}</strong><span>{busy?"Preparing page…":speech.state==="idle"?"Use headphones for a quieter visit":"Follow along at your own pace"}</span></div></div><div className="narration-actions"><button className="play-button" onClick={play} disabled={busy||!text||!speech.supported}>{speech.state==="playing"?<Pause size={20}/>:<Play size={20}/>} {speech.state==="playing"?"Pause":speech.state==="paused"?"Resume":"Read aloud"}</button>{speech.state!=="idle"&&<button className="stop-button" aria-label="Stop reading" onClick={()=>{autoplay.current=false;stop();}}><Square size={17}/></button>}<button className="rate-button" onClick={()=>setSettings(true)} aria-label="Voice and speed settings">{speech.rate}× <Settings2 size={15}/></button></div></div>
   {(speech.error||(!busy&&!text&&!error)||!speech.supported)&&<p className="speech-notice" role="status">{speech.error||(!speech.supported?"Read aloud is unavailable in this browser. The book is still available to read.":"This page has no readable text. Turn the page to listen.")}</p>}
   <div className="reader-bottom"><button disabled={!canPrevious||busy} onClick={()=>void turn(-1)}><ChevronLeft size={20}/><span>Previous</span></button>{book.format==="pdf"?<form className="page-jump" aria-label="Go to a page" onSubmit={e=>{e.preventDefault();changePage(Number(pageDraft));}}><label htmlFor="page-number">Page</label><input id="page-number" aria-label="Page number" type="number" min={1} max={total||1} value={pageDraft} onChange={e=>setPageDraft(e.target.value)}/><span>of {total||"…"}</span><button type="submit" disabled={!total||busy}>Go</button></form>:<span className="epub-location">{epubLabel}</span>}<button disabled={!canNext||busy} onClick={()=>void turn(1)}><span>Next page</span><ChevronRight size={20}/></button></div>
   {book.format==="pdf"&&<Progress className="reading-progress" value={total?page/total*100:0} aria-label={"Book progress, page "+page+" of "+total}/>}
  </main>}
  {manager&&library.user?.role==="admin"&&<LibraryManager library={library} onClose={()=>setManager(false)} onBusyChange={setAdminBusy}/>}
  <Sheet open={personal} onOpenChange={open=>{setPersonal(open);touch();}}><SheetContent className="reader-sheet personal-sheet"><SheetTitle>Your reading space</SheetTitle><SheetDescription>{book?.title}. Notes and bookmarks are private to your employee account.</SheetDescription>{book&&<><div className="personal-book-actions"><button className="toolbar-button" aria-pressed={!!library.records[book.id]?.completed} onClick={()=>saveRecord(book.id,{completed:!library.records[book.id]?.completed})}><CheckCircle2 size={18}/>{library.records[book.id]?.completed?"Completed — mark in progress":"Mark as completed"}</button></div><div className="setting-group"><label htmlFor="reading-notes">Private notes</label><textarea id="reading-notes" className="personal-notes" placeholder="An idea to remember, a question to explore…" value={library.records[book.id]?.notes||""} maxLength={20000} onChange={e=>saveRecord(book.id,{notes:e.target.value})}/><p>Saved automatically. {library.pendingCount?"Waiting to sync with the server.":"All changes have reached the server."}</p></div><div className="personal-bookmarks"><div><h3>Bookmarks</h3><button className="toolbar-button" disabled={(library.records[book.id]?.bookmarks.length||0)>=100||(book.format==="epub"&&!epubCfi)} onClick={()=>{const old=library.records[book.id]||emptyRecord();saveRecord(book.id,{bookmarks:[...old.bookmarks,{id:crypto.randomUUID(),label:book.format==="pdf"?`Page ${page}`:epubLabel,page,cfi:epubCfi}]});}}><Plus size={16}/> Save this page</button></div>{(library.records[book.id]?.bookmarks||[]).map(mark=><div className="bookmark-row" key={mark.id}><button onClick={()=>{setPersonal(false);if(book.format==="pdf")changePage(mark.page);else void jumpTo({title:mark.label,target:mark.cfi,depth:0});}}><Bookmark size={17}/>{mark.label}</button><button className="icon-button" aria-label={"Remove bookmark: "+mark.label} onClick={()=>saveRecord(book.id,{bookmarks:(library.records[book.id]?.bookmarks||[]).filter(b=>b.id!==mark.id)})}><Trash2 size={16}/></button></div>)}{!library.records[book.id]?.bookmarks.length&&<p>Save a page to find it again later.</p>}</div></>}</SheetContent></Sheet>
  <Dialog open={account} onOpenChange={open=>{setAccount(open);if(!open){setCurrentPin("");setNewPin("");}touch();}}><DialogContent className="library-edit"><DialogTitle>Your employee account</DialogTitle><DialogDescription>{library.user?.name} · {library.user?.employeeId}</DialogDescription><form onSubmit={async e=>{e.preventDefault();setPinBusy(true);setPinError("");try{await library.flush();await api("/api/account/pin",{method:"PUT",body:JSON.stringify({currentPin,newPin})});finishVisit();}catch(error){setPinError(error instanceof Error?error.message:"Could not change your PIN.");}finally{setPinBusy(false);}}}><div className="account-downloads"><h3>Downloaded copies</h3><p>Clear books saved on this device. Your server progress, notes and bookmarks remain saved.</p><button type="button" className="toolbar-button" onClick={async()=>{if(!library.user)return;try{await clearFiles(library.user.id);setPinError("Downloaded copies cleared from this device.");}catch(error){setPinError(error instanceof Error?error.message:"Could not clear downloads.");}}}>Clear downloaded books</button></div><h3>Change your PIN</h3><label>Current PIN<input type="password" autoComplete="current-password" value={currentPin} onChange={e=>setCurrentPin(e.target.value)} required maxLength={128}/></label><label>New PIN or passphrase<input type="password" autoComplete="new-password" value={newPin} onChange={e=>setNewPin(e.target.value)} minLength={6} required maxLength={128}/></label><p>Use at least 6 characters. Changing your PIN signs you out on all devices.</p>{pinError&&<p className="library-alert" role="alert">{pinError}</p>}<button className="primary-button" disabled={pinBusy}>{pinBusy?"Saving…":"Change PIN and sign out"}</button></form></DialogContent></Dialog>
  <Sheet open={contents} onOpenChange={open=>{setContents(open);touch();}}><SheetContent className="reader-sheet" side="left"><SheetTitle>Contents</SheetTitle><SheetDescription>{book?.title}</SheetDescription><nav className="toc-list" aria-label="Book contents">{toc.map((item,i)=><button key={i} style={{paddingLeft:16+Math.min(item.depth,3)*16}} onClick={()=>void jumpTo(item)}><span>{item.title}</span>{typeof item.target==="number"&&<small>{item.target}</small>}</button>)}</nav></SheetContent></Sheet>
  <Sheet open={settings} onOpenChange={open=>{setSettings(open);touch();}}><SheetContent className="reader-sheet"><SheetTitle>Make yourself comfortable</SheetTitle><SheetDescription>Adjust your reading and listening experience.</SheetDescription>
   {book?.format==="pdf"&&<div className="setting-group"><label>Reading view</label><Tabs value={view} onValueChange={value=>{stop();setView(value as "page"|"text");}}><TabsList className="view-tabs"><TabsTrigger value="page">Original page</TabsTrigger><TabsTrigger value="text">Text view</TabsTrigger></TabsList></Tabs><p>Original pages preserve illustrations. Text view offers larger, selectable text.</p></div>}
   <div className="setting-group"><label id="voice-label">Reading voice</label><Select value={speech.voiceId} onValueChange={speech.chooseVoice}><SelectTrigger aria-labelledby="voice-label"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="default">Match book language</SelectItem>{speech.voices.map((voice,i)=><SelectItem key={voice.voiceURI+i} value={voice.voiceURI}>{voice.name} · {voice.lang}{voice.localService?" · on-device":" · online"}</SelectItem>)}</SelectContent></Select><p>Voices come from this device. On-device voices can work offline. Changing voices does not translate the book.</p></div>
   <div className="setting-group"><label id="speed-label">Listening speed</label><Select value={String(speech.rate)} onValueChange={value=>speech.chooseRate(Number(value))}><SelectTrigger aria-labelledby="speed-label"><SelectValue/></SelectTrigger><SelectContent>{[.75,1,1.25,1.5,1.75,2].map(rate=><SelectItem value={String(rate)} key={rate}>{rate}×{rate===1?" · Normal":""}</SelectItem>)}</SelectContent></Select></div>
   <div className="setting-switch"><div><label htmlFor="continuous-reading">Keep reading</label><p>Continue to the next page when narration finishes.</p></div><Switch id="continuous-reading" checked={continuous} onCheckedChange={setContinuous}/></div>
   <p className="settings-footnote">Finish your visit to clear added books and reading preferences. After four minutes without activity, we’ll check whether you need more time.</p>
  </SheetContent></Sheet>
  <Dialog open={importing} onOpenChange={open=>{setImporting(open);setError("");}}><DialogContent className="reader-dialog"><Upload size={29} color="#eb0a1e"/><DialogTitle>Open another book</DialogTitle><DialogDescription>Choose a PDF or EPUB from this kiosk. It is opened on this device for the current visit and is not uploaded.</DialogDescription><input ref={input} className="file-picker" type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" aria-label="Choose PDF or EPUB book" onChange={e=>void importBook(e.target.files?.[0])} disabled={importBusy}/><p className="import-note">PDF or EPUB · up to 50 MB · no password or DRM</p>{error&&<p className="error-banner" role="alert">{error}</p>}</DialogContent></Dialog>
  <Dialog open={idle} onOpenChange={open=>{if(!open){setIdle(false);touch();}}}><DialogContent className="reader-dialog" showCloseButton={false}><RotateCcw size={26} color="#eb0a1e"/><DialogTitle>Still reading?</DialogTitle><DialogDescription>{library.user?"Your account will sign out":"This visit will end"} in {seconds} seconds. {library.user?"Your reading progress stays saved. ":""}Personal files will be cleared.</DialogDescription><button className="primary-button" onClick={()=>{setIdle(false);touch();}}>Keep reading</button><button className="toolbar-button" onClick={finishVisit}>{library.user?"Sign out now":"Finish this visit"}</button></DialogContent></Dialog>
 </div>;
}


