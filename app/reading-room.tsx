"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {Headphones,Maximize2,Library,Plus,Minus,Upload,List,Play,Pause,Square,Settings2,Check,LoaderCircle,ChevronLeft,ChevronRight,RotateCcw,Bookmark,LogOut,UserRound,RectangleVertical,TextSearch,X} from "lucide-react";
import {Sheet,SheetContent,SheetTitle,SheetDescription} from "@/components/ui/sheet";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Tabs,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {Switch} from "@/components/ui/switch";
import PageScrubber from "./page-scrubber";
import {featuredBook,type BookEntry,type SearchHit,type SearchRunner,type TocEntry} from "@/lib/catalog";
import {useNarration} from "@/hooks/use-narration";
import {visitClock} from "@/lib/visit-clock";
import PDFReader,{type PDFReady} from "./pdf-reader";
import EpubReader,{type EpubControls} from "./epub-reader";
import LibraryShelf from "./library-shelf";
import LibraryManager from "./library-manager";
import ReadingDashboard from "./reading-dashboard";
import PersonalReadingSpace from "./personal-reading-space";
import BookSearch,{type SearchResult} from "./book-search";
import {getReadingProgress,formatProgress} from "@/lib/reading-progress.mjs";
import {readerThemes,swipeDirection,type PageFit,type ReaderTheme,type SwipePoint} from "@/lib/reader-tools.mjs";
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
 const [adminBusy,setAdminBusy]=useState(false),[progress,setProgress]=useState(false),[readerNotice,setReaderNotice]=useState("");
 const [epubCfi,setEpubCfi]=useState(""),[epubPercent,setEpubPercent]=useState(0),[epubInitial,setEpubInitial]=useState("");
 const [currentPin,setCurrentPin]=useState(""),[newPin,setNewPin]=useState(""),[pinBusy,setPinBusy]=useState(false),[pinError,setPinError]=useState("");
 const [blankPage,setBlankPage]=useState(false),[theme,setTheme]=useState<ReaderTheme>("light"),[listen,setListen]=useState(false);
 const [fit,setFit]=useState<PageFit>("width"),[searching,setSearching]=useState(false),[searchRunner,setSearchRunner]=useState<SearchRunner|null>(null),[lastSearch,setLastSearch]=useState<SearchResult|null>(null);
 const swipeStart=useRef<(SwipePoint&{stage:HTMLElement|null;scrollLeft:number})|null>(null);
 const records=useRef(library.records);
 useEffect(()=>{records.current=library.records;},[library.records]);
 const recordLocation=library.recordLocation,recordReadingTime=library.recordReadingTime,loadBook=library.loadBook,logout=library.logout;
 // Reading time counts while a library book is open, the screen is visible and the reader is active (narration keeps it active).
 const readingClock=useRef({bookId:"",seconds:0,tick:0}),commitReading=useRef(()=>{});
 const visitGeneration=useRef(0),bookLoadGeneration=useRef(0),libraryStart=useRef<HTMLButtonElement>(null);
 const speech=useNarration(),stop=speech.stop,read=speech.read,resetSpeech=speech.reset,setNarrationCompletion=speech.setCompletion;
 const epubControls=useRef<EpubControls|null>(null),autoplay=useRef(false),activity=useRef(0),input=useRef<HTMLInputElement>(null),readerState=useRef({book,page,total});
 useEffect(()=>{readerState.current={book,page,total};},[book,page,total]);
 const touch=useCallback(()=>{activity.current=Date.now();},[]);
 const closeBook=useCallback(()=>{commitReading.current();bookLoadGeneration.current++;stop();autoplay.current=false;setBook(null);setText("");setError("");setBusy(false);setContents(false);setSettings(false);setPersonal(false);setSearching(false);setSearchRunner(null);setLastSearch(null);setReaderNotice("");setIdle(false);setListen(false);epubControls.current=null;window.scrollTo(0,0);touch();},[stop,touch]);
 const finishVisit=useCallback(()=>{
  visitGeneration.current++;closeBook();resetSpeech();setVisitActive(false);setPersonalBooks([]);
  setContinuous(false);setZoom(1);setFit("width");setTheme("light");setView("page");setPage(1);setPageDraft("1");setTotal(0);setToc([]);
  setImporting(false);setImportBusy(false);setSeconds(30);setEpubLabel("Opening book…");setEpubStart(true);setEpubEnd(false);
  setManager(false);setAccount(false);setProgress(false);setOpening(false);setCurrentPin("");setNewPin("");void logout();
  if(input.current)input.current.value="";
  requestAnimationFrame(()=>libraryStart.current?.focus({preventScroll:true}));
 },[closeBook,resetSpeech,logout,setPage]);
 const openBook=useCallback(async(entry:BookEntry)=>{
  const epoch=visitGeneration.current,request=++bookLoadGeneration.current;stop();setVisitActive(true);autoplay.current=false;setError("");setReaderNotice("");setProgress(false);setOpening(true);touch();
  try{const loaded=await loadBook(entry);if(epoch!==visitGeneration.current||request!==bookLoadGeneration.current)return;const saved=records.current[entry.id]||emptyRecord();setSearchRunner(null);setLastSearch(null);setSearching(false);setText("");setPage(saved.started?saved.page:1);setPageDraft(String(saved.started?saved.page:1));setTotal(0);setToc([]);setBusy(true);setEpubCfi("");setEpubPercent(0);setEpubInitial(saved.started?saved.cfi:"");setBook({...loaded});window.scrollTo(0,0);setEpubLabel("Opening book…");setEpubStart(true);setEpubEnd(false);epubControls.current=null;
  }catch(error){if(epoch===visitGeneration.current&&request===bookLoadGeneration.current)setError(error instanceof Error?error.message:"Could not open this book.");}finally{if(epoch===visitGeneration.current&&request===bookLoadGeneration.current)setOpening(false);}
 },[stop,touch,loadBook,setPage]);
 // Search runners are functions, so they are stored through an updater.
 const ready=useCallback((data:PDFReady)=>{setTotal(data.pages);setToc(data.toc);setSearchRunner(()=>data.search);if(readerState.current.page>data.pages)setPage(data.pages);},[setPage]);
 const epubReady=useCallback((items:TocEntry[],controls:EpubControls)=>{setToc(items);epubControls.current=controls;setSearchRunner(()=>controls.search);},[]);
 const epubLocation=useCallback((label:string,start:boolean,end:boolean,cfi:string,percent:number)=>{setEpubLabel(label);setEpubStart(start);setEpubEnd(end);setEpubCfi(cfi);setEpubPercent(percent);},[]);
 const trackedBookId=library.user&&book&&!book.personal?book.id:"";
 useEffect(()=>{
  if(!trackedBookId)return;
  const clock=readingClock.current;clock.bookId=trackedBookId;clock.seconds=0;clock.tick=Date.now();
  const commit=()=>{if(clock.bookId&&clock.seconds>=1)recordReadingTime(clock.bookId,clock.seconds);clock.seconds=0;};
  commitReading.current=commit;
  const timer=setInterval(()=>{
   const now=Date.now(),elapsed=Math.min(10000,Math.max(0,now-clock.tick));clock.tick=now;
   if(document.visibilityState==="visible"&&now-activity.current<150000)clock.seconds+=elapsed/1000;
   if(clock.seconds>=60)commit();
  },5000);
  const hidden=()=>{if(document.visibilityState==="hidden")commit();};
  document.addEventListener("visibilitychange",hidden);
  return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",hidden);commit();clock.bookId="";commitReading.current=()=>{};};
 },[trackedBookId,recordReadingTime]);
 const pdfViewed=useCallback((viewedPage:number,pages:number)=>{
  if(!library.user||!book||book.personal||book.format!=="pdf")return;
  recordLocation(book.id,{format:"pdf",page:viewedPage,total:pages,cfi:"",percent:viewedPage/pages*100});
 },[library.user,book,recordLocation]);
 useEffect(()=>{
  if(!library.user||!book||book.personal||book.format!=="epub"||busy||error||!epubCfi)return;
  recordLocation(book.id,{format:"epub",page:1,total:0,cfi:epubCfi,percent:epubPercent});
 },[library.user,book,epubCfi,epubPercent,busy,error,recordLocation]);
 const changePage=useCallback((target:number)=>{const current=readerState.current;if(!Number.isInteger(target)||target<1||target>current.total){setError("Enter a page number from 1 to "+current.total+".");return;}if(target===current.page){setError("");setPageDraft(String(target));return;}stop();autoplay.current=false;setError("");setBusy(true);setText("");setPage(target);touch();},[stop,touch,setPage]);
 const turn=useCallback(async(direction:number,keepListening=false)=>{
  stop();autoplay.current=keepListening;setError("");touch();const current=readerState.current;
  if(current.book?.format==="pdf"){const next=Math.min(current.total,Math.max(1,current.page+direction));if(next!==current.page){setBusy(true);setText("");setPage(next);}else autoplay.current=false;return;}
  if(!epubControls.current)return;setBusy(true);setText("");
  try{await(direction>0?epubControls.current.next():epubControls.current.previous());}catch{setError("This section could not be opened.");setBusy(false);autoplay.current=false;}
 },[stop,touch,setPage]);
 useEffect(()=>{setNarrationCompletion(()=>{touch();if(continuous&&book&&!idle){if(book.format==="pdf"?page<total:!epubEnd)void turn(1,true);}});},[setNarrationCompletion,touch,continuous,book,idle,page,total,epubEnd,turn]);
 useEffect(()=>{touch();},[speech.state,touch]);
 useEffect(()=>{if(autoplay.current&&!busy&&text&&book){autoplay.current=false;read(text,book.language);}},[text,busy,book,read]);
 useEffect(()=>{if(!book)return;const key=(e:KeyboardEvent)=>{const target=e.target as HTMLElement,overlay=contents||settings||personal||searching||idle;
  // Browser find cannot read rendered PDF pages, so Ctrl/Cmd+F opens the book search instead.
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==="f"&&!overlay){e.preventDefault();setSearching(true);touch();return;}
  if(busy||target.closest("input,textarea,select,button,[role=dialog],[role=combobox],[role=tablist]")||overlay)return;if(e.key==="ArrowRight"&&(book.format==="pdf"?page<total:!epubEnd)){e.preventDefault();void turn(1);}if(e.key==="ArrowLeft"&&(book.format==="pdf"?page>1:!epubStart)){e.preventDefault();void turn(-1);}};
  window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
 },[book,contents,settings,personal,searching,idle,turn,touch,busy,page,total,epubEnd,epubStart]);
 useEffect(()=>{
  const onTouch=()=>{if(!idle)touch();};window.addEventListener("pointerdown",onTouch);window.addEventListener("keydown",onTouch);window.addEventListener("wheel",onTouch,{passive:true});
  const timer=setInterval(()=>{if(!visitActive)return;if(speech.state==="playing"||adminBusy){touch();return;}
   const clock=visitClock(activity.current,Date.now(),false);if(clock.expired)finishVisit();else if(clock.warning){setContents(false);setSettings(false);setImporting(false);setPersonal(false);setSearching(false);setManager(false);setAccount(false);setProgress(false);setIdle(true);setSeconds(clock.remaining);}
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
 async function jumpTo(item:TocEntry){stop();autoplay.current=false;setContents(false);setSearching(false);setError("");setReaderNotice("");touch();if(typeof item.target==="number")changePage(item.target);else{setBusy(true);try{await epubControls.current?.go(item.target);}catch{setError("Could not open this chapter.");setBusy(false);}}}
 const play=()=>{touch();speech.setError("");if(speech.state==="playing")speech.pause();else if(speech.state==="paused")speech.resume();else read(text,book?.language||"en");};
 // The "no readable text" notice changes only once a page settles, so redrawing a page cannot resize its frame in a loop.
 const pageWithoutText=!!book&&!text&&!error;
 if(!busy&&blankPage!==pageWithoutText)setBlankPage(pageWithoutText);
 const canPrevious=book?.format==="pdf"?page>1:!epubStart;
 const canNext=book?.format==="pdf"?page<total:!epubEnd;
 // The read-aloud bar appears only when asked for, or while narration is running.
 const listenOpen=listen||speech.state!=="idle";
 const syncText=library.pendingCount?`${library.pendingCount} ${library.pendingCount===1?"change":"changes"} ${library.deviceSaved?"saved on device":"waiting to sync"}`:"";
 const readerProgress=book&&library.user&&!book.personal?formatProgress(getReadingProgress(library.records[book.id]||emptyRecord(),book.format,total||book.pages).percent)+" read":"";
 async function scrubEpub(fraction:number){if(!epubControls.current)return;stop();autoplay.current=false;setError("");setReaderNotice("");touch();setBusy(true);try{await epubControls.current.goToFraction(fraction);}catch{setError("Could not open this part of the book.");setBusy(false);}}
 function jumpToHit(hit:SearchHit,result:SearchResult){setLastSearch(result);setSearching(false);void jumpTo({title:hit.label,target:hit.target,depth:0});}
 function swipeTurn(direction:number){if(busy||!book||contents||settings||personal||searching||idle)return;touch();if(direction>0&&canNext)void turn(1);else if(direction<0&&canPrevious)void turn(-1);}
 function swipeBegin(event:React.TouchEvent){const point=event.touches[0],stage=(event.target as HTMLElement).closest<HTMLElement>(".document-stage");swipeStart.current=event.touches.length===1&&point?{x:point.clientX,y:point.clientY,time:Date.now(),stage,scrollLeft:stage?.scrollLeft??0}:null;}
 function swipeEnd(event:React.TouchEvent){
  const start=swipeStart.current,point=event.changedTouches[0];swipeStart.current=null;if(!start||!point||window.getSelection()?.isCollapsed===false)return;
  const direction=swipeDirection(start,{x:point.clientX,y:point.clientY,time:Date.now()});if(!direction)return;
  // A zoomed page scrolls sideways first; only a swipe that starts at its edge turns the page.
  const stage=start.stage;if(stage&&stage.scrollWidth>stage.clientWidth+2&&(direction>0?start.scrollLeft<stage.scrollWidth-stage.clientWidth-2:start.scrollLeft>2))return;
  swipeTurn(direction);
 }
 return <div className={"reading-room "+(book?"book-open theme-"+theme:"")}>
  <header className="room-header"><button className="brand" type="button" aria-label="Return to library" onClick={closeBook}><img src="/toyota-industries-group.svg" alt="Toyota Industries Group" width={330} height={110}/><span/><div>Employee Library</div></button><div className="header-actions">{library.user?<>{!book&&<span className={"account-sync "+(library.pendingCount?"sync-pending":"is-synced")} role="status" title={syncText||"Progress synced"}>{library.syncing?<LoaderCircle size={14} className="reader-spinner"/>:<Check size={14}/>}{syncText?<span>{syncText}</span>:<span className="sr-only">Progress synced</span>}</span>}<button className="toolbar-button account-button" title={library.user.employeeId} onClick={()=>{setPinError("");setAccount(true);}}><UserRound size={17}/><span>{library.user.name}</span></button></>:<span className="quiet-label">{offlineReady?"Ready to read offline":"Guest reading"}</span>}{(visitActive||library.guest)&&<button ref={libraryStart} className="finish-visit toolbar-button" onClick={finishVisit}><LogOut size={17}/>{library.user?"Sign out":"Finish visit"}</button>}<button className="icon-button" aria-label="Toggle full screen" title="Full screen" onClick={fullscreen}><Maximize2 size={20}/></button></div></header>
  {library.message&&library.user&&<div className="account-message" role="status">{library.message}<button onClick={()=>void library.flush()}>Try sync</button></div>}
  {error&&!book&&!importing&&<p className="error-banner" role="alert">{error}</p>}
  {!book?<><LibraryShelf library={library} books={books} onOpen={entry=>{if(!opening)void openBook(entry);}} onManage={()=>setManager(true)} onProgress={()=>setProgress(true)} onImport={()=>{setError("");setVisitActive(true);touch();setImporting(true);}}/>{opening&&<div className="opening-book-overlay" role="status"><LoaderCircle size={25} className="reader-spinner"/><span>Opening your book…</span></div>}</>:
  <main className="reader">
   <div className="reader-toolbar"><button onClick={closeBook} aria-label="Library"><Library size={18}/><span>Library</span></button><button onClick={()=>setContents(true)} disabled={!toc.length} aria-label="Open contents" title={toc.length?"Book contents":"This book has no contents list"}><List size={18}/><span>Contents</span></button><button className="search-toggle" onClick={()=>{setSearching(true);touch();}} aria-label="Find in book" title="Find words in this book (Ctrl+F)"><TextSearch size={18}/><span>Find</span></button><button className={"listen-toggle"+(listenOpen?" is-active":"")} aria-pressed={listenOpen} aria-label="Listen" title="Read aloud" onClick={()=>{if(listenOpen){autoplay.current=false;stop();setListen(false);}else setListen(true);touch();}}><Headphones size={18}/><span>Listen</span></button><h1 title={book.title}>{book.title}</h1><div className="zoom-tools"><button aria-label="Decrease size" disabled={zoom<=.65} onClick={()=>{stop();setZoom(z=>Math.max(.65,z-.15));}}><Minus size={18}/></button><span>{Math.round(zoom*100)}%</span><button aria-label="Increase size" disabled={zoom>=2} onClick={()=>{stop();setZoom(z=>Math.min(2,z+.15));}}><Plus size={18}/></button>{book.format==="pdf"&&view==="page"&&<button className="fit-toggle" aria-label="Show whole page" aria-pressed={fit==="page"} title={fit==="page"?"Showing the whole page. Select to fill the width.":"Show the whole page without scrolling"} onClick={()=>{stop();setFit(value=>value==="page"?"width":"page");touch();}}><RectangleVertical size={18}/></button>}</div>{library.user&&!book.personal&&<button className="personal-toggle" aria-label="My notes" onClick={()=>setPersonal(true)}><Bookmark size={18}/><span>My notes</span></button>}<button className="settings-toggle" aria-label="Reading settings" onClick={()=>setSettings(true)}><Settings2 size={19}/><span>Settings</span></button><button className="reader-fullscreen" aria-label="Toggle full screen" title="Full screen" onClick={fullscreen}><Maximize2 size={18}/></button></div>
   {error&&<p className="error-banner" role="alert">{error} <button onClick={()=>openBook(book)}>Reopen book</button></p>}
   {readerNotice&&<p className="reader-recovery-notice" role="status">{readerNotice}<button className="toolbar-button" onClick={()=>setReaderNotice("")}>Dismiss</button></p>}
   <div className="document-frame" aria-busy={busy} onTouchStart={swipeBegin} onTouchEnd={swipeEnd} onTouchCancel={()=>{swipeStart.current=null;}}>{busy&&<div className="reader-loading" role="status"><LoaderCircle size={22} className="reader-spinner"/><span>Preparing your page…</span></div>}{book.format==="pdf"?<PDFReader book={book} page={page} zoom={zoom} fit={fit} view={view} onReady={ready} onText={setText} onError={setError} onBusy={setBusy} onViewed={pdfViewed} text={text} activeText={speech.activeText} highlight={lastSearch?.query}/>:<EpubReader book={book} initialLocation={epubInitial} zoom={zoom} onReady={epubReady} onLocation={epubLocation} onText={setText} onBusy={setBusy} onError={setError} onNotice={setReaderNotice} onActivity={touch} onSwipe={swipeTurn} theme={theme}/>}</div>
   {book.format==="epub"&&speech.activeText&&<div className="epub-spoken" role="status">{speech.activeText}</div>}
   {listenOpen&&<div className="narration-bar"><div className="narration-caption"><Headphones size={18}/><strong>{speech.state==="playing"?"Listening":speech.state==="paused"?"Paused":"Listen to this page"}</strong></div><div className="narration-actions"><button className="play-button" onClick={play} disabled={busy||!text||!speech.supported}>{speech.state==="playing"?<Pause size={18}/>:<Play size={18}/>} {speech.state==="playing"?"Pause":speech.state==="paused"?"Resume":"Read aloud"}</button>{speech.state!=="idle"&&<button className="stop-button" aria-label="Stop reading" onClick={()=>{autoplay.current=false;stop();}}><Square size={16}/></button>}<button className="rate-button" onClick={()=>setSettings(true)} aria-label="Voice and speed settings">{speech.rate}×</button><button className="close-listen" aria-label="Close read aloud" onClick={()=>{autoplay.current=false;stop();setListen(false);}}><X size={17}/></button></div></div>}
   {listenOpen&&(speech.error||blankPage||!speech.supported)&&<p className="speech-notice" role="status">{speech.error||(!speech.supported?"Read aloud is unavailable in this browser.":"This page has no readable text. Turn the page to listen.")}</p>}
   <div className="reader-bottom"><button className="page-turn" aria-label="Previous page" disabled={!canPrevious||busy} onClick={()=>void turn(-1)}><ChevronLeft size={20}/><span>Previous</span></button>
    <div className="reader-position">{book.format==="pdf"?<PageScrubber name="Go to page" value={page} min={1} max={Math.max(1,total)} disabled={busy||!total} label={value=>`Page ${value} of ${total}`} onCommit={changePage}/>:<PageScrubber name="Go to a position in this book" value={Math.round(epubPercent*10)} min={0} max={1000} disabled={busy||!searchRunner} label={value=>`${formatProgress(value/10)} through the book`} onCommit={value=>void scrubEpub(value/1000)}/>}
     <div className="reader-position-text">{book.format==="pdf"?<form className="page-jump" aria-label="Go to a page" onSubmit={e=>{e.preventDefault();changePage(Number(pageDraft));}}><label htmlFor="page-number">Page</label><input id="page-number" aria-label="Page number" type="number" min={1} max={total||1} value={pageDraft} onChange={e=>setPageDraft(e.target.value)}/><span>of {total||"…"}</span></form>:<span className="epub-location">{epubLabel}</span>}{readerProgress&&<span className="reader-progress">{readerProgress}</span>}{syncText&&<span className="reader-sync" role="status">{syncText}</span>}</div></div>
    <button className="page-turn" aria-label="Next page" disabled={!canNext||busy} onClick={()=>void turn(1)}><span>Next</span><ChevronRight size={20}/></button></div>
  </main>}
  {manager&&library.user?.role==="admin"&&<LibraryManager library={library} onClose={()=>setManager(false)} onBusyChange={setAdminBusy}/>}
  {progress&&library.user&&<ReadingDashboard library={library} onOpenBook={entry=>void openBook(entry)} onClose={()=>{setProgress(false);touch();}}/>}
  <Sheet open={personal} onOpenChange={open=>{setPersonal(open);touch();}}><SheetContent className="reader-sheet personal-sheet"><SheetTitle>Your reading space</SheetTitle><SheetDescription>{book?.title}. Notes and bookmarks are private to your employee account.</SheetDescription>{book&&<PersonalReadingSpace key={book.id} book={book} library={library} page={page} epubCfi={epubCfi} epubLabel={epubLabel} locationReady={!busy&&!error&&(book.format==="pdf"?total>0:!!epubCfi)} onJump={mark=>{setPersonal(false);if(book.format==="pdf")changePage(mark.page);else void jumpTo({title:mark.label,target:mark.cfi,depth:0});}}/>}</SheetContent></Sheet>
  <Dialog open={account} onOpenChange={open=>{setAccount(open);if(!open){setCurrentPin("");setNewPin("");}touch();}}><DialogContent className="library-edit"><DialogTitle>Your employee account</DialogTitle><DialogDescription>{library.user?.name} · {library.user?.employeeId}</DialogDescription><div className="account-progress-entry"><button type="button" className="toolbar-button" onClick={()=>{setAccount(false);setProgress(true);}}>My reading progress</button></div><form onSubmit={async e=>{e.preventDefault();setPinBusy(true);setPinError("");try{await library.flush();await api("/api/account/pin",{method:"PUT",body:JSON.stringify({currentPin,newPin})});finishVisit();}catch(error){setPinError(error instanceof Error?error.message:"Could not change your PIN.");}finally{setPinBusy(false);}}}><div className="account-downloads"><h3>Downloaded books</h3><p>Your progress, notes and bookmarks stay saved.</p><button type="button" className="toolbar-button" onClick={async()=>{if(!library.user)return;try{await clearFiles(library.user.id);setPinError("Downloaded copies cleared from this device.");}catch(error){setPinError(error instanceof Error?error.message:"Could not clear downloads.");}}}>Clear downloaded books</button></div><h3>Change your PIN</h3><label>Current PIN<input type="password" autoComplete="current-password" value={currentPin} onChange={e=>setCurrentPin(e.target.value)} required maxLength={128}/></label><label>New PIN or passphrase<input type="password" autoComplete="new-password" value={newPin} onChange={e=>setNewPin(e.target.value)} minLength={6} required maxLength={128}/></label><p>At least 6 characters. You’ll be signed out on all devices.</p>{pinError&&<p className="library-alert" role="alert">{pinError}</p>}<button className="primary-button" disabled={pinBusy}>{pinBusy?"Saving…":"Change PIN and sign out"}</button></form></DialogContent></Dialog>
  <Sheet open={contents} onOpenChange={open=>{setContents(open);touch();}}><SheetContent className="reader-sheet" side="left"><SheetTitle>Contents</SheetTitle><SheetDescription>{book?.title}</SheetDescription><nav className="toc-list" aria-label="Book contents">{toc.map((item,i)=><button key={i} style={{paddingLeft:16+Math.min(item.depth,3)*16}} onClick={()=>void jumpTo(item)}><span>{item.title}</span>{typeof item.target==="number"&&<small>{item.target}</small>}</button>)}</nav></SheetContent></Sheet>
  <Sheet open={searching} onOpenChange={open=>{setSearching(open);touch();}}><SheetContent className="reader-sheet search-sheet" side="left"><SheetTitle>Find in this book</SheetTitle><SheetDescription>{book?.title}</SheetDescription>{book&&<BookSearch key={book.id} search={searchRunner} format={book.format} initial={lastSearch} onResult={setLastSearch} onJump={jumpToHit} onActivity={touch}/>}</SheetContent></Sheet>
  <Sheet open={settings} onOpenChange={open=>{setSettings(open);touch();}}><SheetContent className="reader-sheet"><SheetTitle>Reading settings</SheetTitle><SheetDescription>{book?.title}</SheetDescription>
   {book?.format==="pdf"&&<div className="setting-group"><label>Reading view</label><Tabs value={view} onValueChange={value=>{stop();setView(value as "page"|"text");}}><TabsList className="view-tabs"><TabsTrigger value="page">Original page</TabsTrigger><TabsTrigger value="text">Text view</TabsTrigger></TabsList></Tabs></div>}
   {book?.format==="pdf"&&view==="page"&&<div className="setting-group"><label>Page size</label><Tabs value={fit} onValueChange={value=>{stop();setFit(value as PageFit);}}><TabsList className="view-tabs"><TabsTrigger value="page">Whole page</TabsTrigger><TabsTrigger value="width">Page width</TabsTrigger></TabsList></Tabs></div>}
   <div className="setting-group"><label id="theme-label">Page colour</label><div className="theme-choices" role="radiogroup" aria-labelledby="theme-label">{(Object.keys(readerThemes) as ReaderTheme[]).map(value=><label key={value} className={"theme-choice theme-choice-"+value}><input type="radio" name="reader-theme" value={value} checked={theme===value} onChange={()=>{setTheme(value);touch();}}/><span className="theme-swatch" aria-hidden="true">Aa</span>{readerThemes[value].label}</label>)}</div></div>
   <div className="setting-group"><label id="voice-label">Reading voice</label><Select value={speech.voiceId} onValueChange={speech.chooseVoice}><SelectTrigger aria-labelledby="voice-label"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="default">Match book language</SelectItem>{speech.voices.map((voice,i)=><SelectItem key={voice.voiceURI+i} value={voice.voiceURI}>{voice.name} · {voice.lang}{voice.localService?" · on-device":" · online"}</SelectItem>)}</SelectContent></Select><p>Voices come from this device.</p></div>
   <div className="setting-group"><label id="speed-label">Listening speed</label><Select value={String(speech.rate)} onValueChange={value=>speech.chooseRate(Number(value))}><SelectTrigger aria-labelledby="speed-label"><SelectValue/></SelectTrigger><SelectContent>{[.75,1,1.25,1.5,1.75,2].map(rate=><SelectItem value={String(rate)} key={rate}>{rate}×{rate===1?" · Normal":""}</SelectItem>)}</SelectContent></Select></div>
   <div className="setting-switch"><div><label htmlFor="continuous-reading">Keep reading</label><p>Continue to the next page when narration finishes.</p></div><Switch id="continuous-reading" checked={continuous} onCheckedChange={setContinuous}/></div>
   <p className="settings-footnote">Swipe across the page to turn it. Press Ctrl+F to find words.</p>
  </SheetContent></Sheet>
  <Dialog open={importing} onOpenChange={open=>{setImporting(open);setError("");}}><DialogContent className="reader-dialog"><Upload size={29} color="var(--brand-primary)"/><DialogTitle>Open another book</DialogTitle><DialogDescription>It opens on this device only and isn’t uploaded.</DialogDescription><input ref={input} className="file-picker" type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" aria-label="Choose PDF or EPUB book" onChange={e=>void importBook(e.target.files?.[0])} disabled={importBusy}/><p className="import-note">PDF or EPUB, up to 50 MB</p>{error&&<p className="error-banner" role="alert">{error}</p>}</DialogContent></Dialog>
  <Dialog open={idle} onOpenChange={open=>{if(!open){setIdle(false);touch();}}}><DialogContent className="reader-dialog" showCloseButton={false}><RotateCcw size={26} color="var(--brand-primary)"/><DialogTitle>Still reading?</DialogTitle><DialogDescription>{library.user?"Your account will sign out":"This visit will end"} in {seconds} seconds. {library.user?"Your reading progress stays saved. ":""}Personal files will be cleared.</DialogDescription><button className="primary-button" onClick={()=>{setIdle(false);touch();}}>Keep reading</button><button className="toolbar-button" onClick={finishVisit}>{library.user?"Sign out now":"Finish this visit"}</button></DialogContent></Dialog>
 </div>;
}


