"use client";
import {useEffect,useRef} from "react";
import type EpubBook from "epubjs/types/book";
import type Rendition from "epubjs/types/rendition";
import type Section from "epubjs/types/section";
import type {Location} from "epubjs/types/rendition";
import type {BookEntry,SearchHit,SearchRunner,TocEntry} from "@/lib/catalog";
import {readerThemes,searchText,swipeDirection,type ReaderTheme,type SwipePoint} from "@/lib/reader-tools.mjs";
export type EpubControls={next:()=>Promise<void>;previous:()=>Promise<void>;go:(target:string)=>Promise<void>;goToFraction:(fraction:number)=>Promise<void>;search:SearchRunner};
type Props={book:BookEntry;initialLocation?:string;zoom:number;onReady:(toc:TocEntry[],controls:EpubControls)=>void;onLocation:(label:string,atStart:boolean,atEnd:boolean,cfi:string,percent:number)=>void;onText:(text:string)=>void;onBusy:(busy:boolean)=>void;onError:(message:string)=>void;onNotice?:(message:string)=>void;onActivity:()=>void;onSwipe?:(direction:number)=>void;theme?:ReaderTheme};
const MAX_SEARCH_HITS=200;
// Inline important overrides beat the default theme and carry over to sections rendered later.
function applyTheme(r:Rendition,theme:ReaderTheme){const colors=readerThemes[theme];r.themes.override("color",colors.text,true);r.themes.override("background",colors.page,true);}

function sectionSearch(epub:EpubBook):SearchRunner{
 return async(query,signal,onProgress)=>{
  const sections:Section[]=[];epub.spine.each((section:Section)=>sections.push(section));
  const hits:SearchHit[]=[];let matches=0;
  for(const [index,section] of sections.entries()){
   if(signal.aborted)return;
   // Leave sections the reader already holds in memory loaded.
   const wasLoaded=!!section.contents;
   await (section.load(epub.load.bind(epub)) as unknown as Promise<Element>);
   try{
    if(signal.aborted)return;
    const doc=section.document,root=doc?.body||doc?.documentElement;if(!root)continue;
    const label=(epub.navigation?.get(section.href)?.label||"").trim()||"Section "+(index+1);
    const walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    for(let node=walker.nextNode();node;node=walker.nextNode()){
     const found=searchText(node.textContent||"",query,{limit:Math.max(0,MAX_SEARCH_HITS-hits.length)});
     matches+=found.total;
     for(const match of found.matches){
      try{const range=doc.createRange();range.setStart(node,match.start);range.setEnd(node,match.end);
       hits.push({key:section.index+":"+hits.length,target:section.cfiFromRange(range),label,count:1,before:match.before,match:match.match,after:match.after});}catch{}
     }
    }
   }finally{if(!wasLoaded)section.unload();}
   onProgress([...hits],index+1,sections.length,matches);
   await new Promise(resolve=>setTimeout(resolve,0));
  }
 };
}

export default function EpubReader({book,initialLocation,zoom,onReady,onLocation,onText,onBusy,onError,onNotice,onActivity,onSwipe,theme="light"}:Props){
 const container=useRef<HTMLDivElement>(null),rendition=useRef<Rendition|null>(null),zoomRef=useRef(zoom),themeRef=useRef(theme),swipe=useRef(onSwipe);
 useEffect(()=>{swipe.current=onSwipe;},[onSwipe]);
 useEffect(()=>{let dead=false,relocationGeneration=0;let epub:EpubBook|undefined;let resizeTimer:ReturnType<typeof setTimeout>|undefined;
  // epub.js repaginates on window resizes only; banners and toolbars can also change the frame.
  const resizer=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(!dead)(rendition.current as unknown as {resize:()=>void}|null)?.resize();},150);});
  onBusy(true);
  (async()=>{try{
   const {default:ePub}=await import("epubjs");if(dead)return;epub=ePub();await epub.open(await book.file!.arrayBuffer(),"binary");await epub.ready;if(dead)return;
   // Strip active and remote content before sections are serialized into sandboxed frames.
   epub.spine.hooks.content.register((doc:Document)=>{
    doc.querySelectorAll("script,iframe,object,embed,form,link,style,meta,audio,video").forEach(n=>n.remove());
    doc.querySelectorAll("*").forEach(el=>{for(const attr of [...el.attributes]){if(/^on/i.test(attr.name)||["style","srcset"].includes(attr.name)||((attr.name==="href"||attr.name==="src"||attr.name==="xlink:href")&&/^(https?:|\/\/|javascript:)/i.test(attr.value.trim())))el.removeAttribute(attr.name);}});
    const policy=doc.createElement("meta");policy.setAttribute("http-equiv","Content-Security-Policy");policy.setAttribute("content","default-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob: data:; font-src blob: data:; base-uri 'none'; form-action 'none'");doc.head.insertBefore(policy,doc.head.firstChild);
   });
   const r=epub.renderTo(container.current!,{width:"100%",height:"100%",flow:"paginated",spread:"none",allowScriptedContent:false});rendition.current=r;
   r.themes.default({body:{"font-family":"Georgia, serif","line-height":"1.8","padding":"28px !important",color:"#283341","background":"#fff"},img:{"max-width":"100%"}});
   r.themes.fontSize(String(20*zoomRef.current)+"px");applyTheme(r,themeRef.current);
   const nav=await epub.loaded.navigation;if(dead)return;const toc:TocEntry[]=[];
   const walk=(items:typeof nav.toc,depth=0)=>items.forEach(item=>{toc.push({title:item.label,target:item.href,depth});if(item.subitems?.length)walk(item.subitems,depth+1);});walk(nav.toc);
   // Prepare percentages before displaying any location; no late generation result can replace a newer position.
   await epub.locations.generate(1600);if(dead)return;
   r.on("relocated",async(location:Location)=>{
    if(dead)return;const generation=++relocationGeneration;onBusy(true);let pageText="";
    const isCurrent=()=>!dead&&generation===relocationGeneration;
    try{
     const range=await epub!.getRange(location.start.cfi);if(!isCurrent())return;
     const end=await epub!.getRange(location.end.cfi);if(!isCurrent())return;
     if(range.startContainer.ownerDocument===end.endContainer.ownerDocument){range.setEnd(end.endContainer,end.endOffset);pageText=range.toString();}
     else{const contents=r.getContents() as unknown as Array<{document:Document}>;pageText=contents[0]?.document.body.textContent||"";}
    }catch{if(!isCurrent())return;const contents=r.getContents() as unknown as Array<{document:Document}>;pageText=contents[0]?.document.body.textContent||"";}
    if(!isCurrent())return;
    const percent=location.atEnd?100:Math.min(99.9,Math.max(0,epub!.locations.percentageFromCfi(location.start.cfi)*100));
    onText(pageText);
    onLocation("Section "+(location.start.index+1)+" · page "+location.start.displayed.page+" / "+location.start.displayed.total,location.atStart,location.atEnd,location.start.cfi,Number.isFinite(percent)?percent:0);
    onBusy(false);onActivity();
   });
   r.hooks.content.register((contents:{document:Document;window:Window})=>{
    const doc=contents.document;let start:SwipePoint|null=null;
    doc.addEventListener("pointerdown",onActivity);doc.addEventListener("keydown",onActivity);
    // Touches inside the book frame do not reach the reader, so page swipes are detected here.
    doc.addEventListener("touchstart",event=>{const touch=event.touches[0];start=event.touches.length===1&&touch?{x:touch.clientX,y:touch.clientY,time:Date.now()}:null;},{passive:true});
    doc.addEventListener("touchend",event=>{const touch=event.changedTouches[0],from=start;start=null;if(!touch||contents.window.getSelection()?.isCollapsed===false)return;
     const direction=swipeDirection(from,{x:touch.clientX,y:touch.clientY,time:Date.now()});if(direction)swipe.current?.(direction);},{passive:true});
   });
   try{await r.display(initialLocation||undefined);}catch(error){
    if(dead)return;if(!initialLocation)throw error;
    relocationGeneration++;await r.display();if(dead)return;
    onNotice?.("Your saved position could not be opened. This book has been opened at the beginning.");
   }
   if(dead)return;resizer.observe(container.current!);
   onReady(toc,{next:()=>r.next(),previous:()=>r.prev(),go:target=>r.display(target),goToFraction:fraction=>r.display(epub!.locations.cfiFromPercentage(Math.min(1,Math.max(0,fraction)))),search:sectionSearch(epub)});
  }catch{if(!dead){onError("This EPUB could not be opened. Use an unencrypted EPUB or a PDF.");onBusy(false);}}})();
  return()=>{dead=true;relocationGeneration++;clearTimeout(resizeTimer);resizer.disconnect();rendition.current?.destroy();rendition.current=null;epub?.destroy();};
 },[book,initialLocation,onReady,onLocation,onText,onBusy,onError,onNotice,onActivity]);
 useEffect(()=>{zoomRef.current=zoom;rendition.current?.themes.fontSize(String(20*zoom)+"px");},[zoom]);
 useEffect(()=>{themeRef.current=theme;if(rendition.current)applyTheme(rendition.current,theme);},[theme]);
 return <div className="epub-stage" ref={container} aria-label="EPUB book pages"/>;
}
