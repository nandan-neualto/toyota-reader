"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { BookEntry, SearchHit, SearchRunner, TocEntry } from "@/lib/catalog";
import { highlightParts, pageScale, searchText, type PageFit } from "@/lib/reader-tools.mjs";
export type PDFReady = {pages:number; toc:TocEntry[]; search:SearchRunner};
type Props={book:BookEntry;page:number;zoom:number;fit:PageFit;view:"page"|"text";onReady:(data:PDFReady)=>void;onText:(text:string)=>void;onError:(message:string)=>void;text:string;activeText?:string;highlight?:string;onBusy:(busy:boolean)=>void;onViewed:(page:number,total:number)=>void};
type TextContent=Awaited<ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["getTextContent"]>>;
type Loaded={book:BookEntry;pdf:PDFDocumentProxy;readText:(page:number)=>Promise<string>};

function pageText(content:TextContent){
 return content.items.map(item=>"str" in item?item.str+("hasEOL" in item&&item.hasEOL?"\n":" "):"").join("").replace(/(\w)-\n(\w)/g,"$1$2").trim();
}

// Page text is extracted once per document and shared by narration, text view and search.
function pageTextReader(doc:PDFDocumentProxy){
 const texts=new Map<number,Promise<string>>();
 return (page:number)=>{
  let text=texts.get(page);
  if(!text){text=doc.getPage(page).then(p=>p.getTextContent()).then(pageText);texts.set(page,text);text.catch(()=>texts.delete(page));}
  return text;
 };
}

function findSpoken(paragraphs:string[],spoken:string){
 for(const [paragraph,value] of paragraphs.entries()){const [match]=searchText(value,spoken,{limit:1,context:0}).matches;if(match)return {paragraph,match};}
 return null;
}

function pageSearch(doc:PDFDocumentProxy,readText:(page:number)=>Promise<string>):SearchRunner{
 return async(query,signal,onProgress)=>{
  const hits:SearchHit[]=[];let matches=0,reported=0;
  for(let page=1;page<=doc.numPages;page++){
   const found=searchText(await readText(page),query,{limit:1});
   if(signal.aborted)return;
   if(found.total){const [first]=found.matches;matches+=found.total;hits.push({key:"page-"+page,target:page,label:"Page "+page,count:found.total,before:first.before,match:first.match,after:first.after});}
   if(page===doc.numPages||performance.now()-reported>120){
    reported=performance.now();onProgress([...hits],page,doc.numPages,matches);
    await new Promise(resolve=>setTimeout(resolve,0));if(signal.aborted)return;
   }
  }
 };
}

export default function PDFReader({book,page,zoom,fit,view,onReady,onText,onError,text,activeText,highlight,onBusy,onViewed}:Props){
 const canvas=useRef<HTMLCanvasElement>(null),container=useRef<HTMLDivElement>(null),shown=useRef<{pdf:PDFDocumentProxy;page:number;view:string}|null>(null);
 const [loaded,setLoaded]=useState<Loaded|null>(null),[size,setSize]=useState({width:700,height:0});
 const current=loaded?.book===book?loaded:null,pdf=current?.pdf??null,readText=current?.readText;
 // Whole-page fitting depends on the frame height; width fitting ignores it.
 const fitHeight=fit==="page"?size.height:0;
 const paragraphs=useMemo(()=>text?text.split(/\n\s*\n/):[],[text]);
 // Narration follow-along: find the sentence being read so text view can mark it in place.
 const spokenAt=useMemo(()=>view==="text"&&activeText?findSpoken(paragraphs,activeText):null,[view,activeText,paragraphs]);
 useEffect(()=>{if(!spokenAt)return;const reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;container.current?.querySelector(".spoken-mark")?.scrollIntoView({block:"center",behavior:reduce?"auto":"smooth"});},[spokenAt]);
 useEffect(()=>{const el=container.current;if(!el)return;
  const measure=()=>{const style=getComputedStyle(el);
   const width=Math.max(260,Math.floor(el.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)));
   const height=Math.max(0,Math.floor(el.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)));
   setSize(old=>old.width===width&&old.height===height?old:{width,height});};
  const obs=new ResizeObserver(measure);obs.observe(el);return()=>obs.disconnect();},[]);
 useEffect(()=>{
  let dead=false;let doc:PDFDocumentProxy|undefined;let destroy:()=>void=()=>{};
  onBusy(true);onText("");
  (async()=>{try{
   const lib=await import("pdfjs-dist");
   if(dead)return;
   lib.GlobalWorkerOptions.workerSrc="/vendor/pdf.worker.mjs";
   const source=book.file?{data:new Uint8Array(await book.file.arrayBuffer())}:{url:book.url!};
   if(dead)return;
   // Shared books arrive in 256 KB ranges, so a large PDF shows its first page without downloading the whole file.
   const task=lib.getDocument({...source,rangeChunkSize:262144,cMapUrl:"/vendor/cmaps/",cMapPacked:true,standardFontDataUrl:"/vendor/standard_fonts/",wasmUrl:"/vendor/wasm/"});
   destroy=()=>{void task.destroy();};
   doc=await task.promise;if(dead){destroy();return;}
   const outline=await doc.getOutline();const toc:TocEntry[]=[];
   async function walk(items:NonNullable<typeof outline>,depth=0):Promise<void>{for(const item of items){
    try{const dest=typeof item.dest==="string"?await doc!.getDestination(item.dest):item.dest;
     if(dest){const target=typeof dest[0]==="number"?dest[0]+1:(await doc!.getPageIndex(dest[0]))+1;toc.push({title:item.title,target,depth});}
    }catch{}if(item.items?.length)await walk(item.items,depth+1);
   }}
   if(outline)await walk(outline);
   if(dead)return;
   const reader=pageTextReader(doc);
   setLoaded({book,pdf:doc,readText:reader});onReady({pages:doc.numPages,toc,search:pageSearch(doc,reader)});
  }catch(e){if(!dead){onError(e instanceof Error&&e.name==="PasswordException"?"This PDF needs a password. Choose an unlocked copy.":"This PDF could not be opened. Check that the file is complete, then try again.");onBusy(false);}}})();
  return()=>{dead=true;destroy();};
 },[book,onReady,onText,onError,onBusy]);
 useEffect(()=>{
  if(!pdf||!readText)return;let cancelled=false;let render:RenderTask|undefined;
  // Size, zoom and fit changes redraw the same page: no loading state, cleared text or extra progress save.
  const relayout=shown.current?.pdf===pdf&&shown.current.page===page&&shown.current.view===view;
  if(!relayout){onBusy(true);onText("");}
  (async()=>{try{
   const p=await pdf.getPage(page);if(cancelled)return;
   const extracted=await readText(page);if(cancelled)return;
   onText(extracted);
   if(view==="page"&&canvas.current){
    const base=p.getViewport({scale:1});
    const scale=pageScale({pageWidth:base.width,pageHeight:base.height,availableWidth:size.width,availableHeight:fitHeight,fit,zoom});
    const vp=p.getViewport({scale});const dpr=Math.min(window.devicePixelRatio||1,2);
    // Draw off screen first so the visible page never flashes blank while it redraws.
    const buffer=document.createElement("canvas");buffer.width=Math.floor(vp.width*dpr);buffer.height=Math.floor(vp.height*dpr);
    render=p.render({canvas:buffer,viewport:vp,transform:dpr!==1?[dpr,0,0,dpr,0,0]:undefined});
    await render.promise;
    const c=canvas.current;if(cancelled||!c)return;
    c.width=buffer.width;c.height=buffer.height;c.style.width=Math.floor(vp.width)+"px";c.style.height=Math.floor(vp.height)+"px";c.getContext("2d")?.drawImage(buffer,0,0);
   }
   if(!cancelled){if(!relayout)onViewed(page,pdf.numPages);shown.current={pdf,page,view};onBusy(false);}
  }catch(e){if(!cancelled&&!(e instanceof Error&&e.name==="RenderingCancelledException")){onError("Could not display this page. Try another page or reopen the book.");onBusy(false);}}})();
  return()=>{cancelled=true;render?.cancel();};
 },[pdf,readText,page,zoom,fit,size.width,fitHeight,view,onBusy,onText,onError,onViewed]);
 return <div ref={container} className={"document-stage "+(view==="text"?"text-stage":"fit-"+fit)} tabIndex={0} aria-label={"Book page "+page}>
  {view==="page"?<canvas ref={canvas} aria-label={"Original PDF page "+page} role="img"/>:<article className="reading-text" style={{fontSize:22*zoom}}>{paragraphs.length?paragraphs.map((p,i)=>{
   const spoken=spokenAt?.paragraph===i?spokenAt.match:null;
   if(spoken)return <p key={i}>{p.slice(0,spoken.start)}<mark className="spoken-mark">{p.slice(spoken.start,spoken.end)}</mark>{p.slice(spoken.end)}</p>;
   return <p key={i}>{highlight?highlightParts(p,highlight).map((part,j)=>part.hit?<mark key={j}>{part.text}</mark>:<Fragment key={j}>{part.text}</Fragment>):p}</p>;
  }):<p>No readable text on this page. Use the original page view.</p>}</article>}
  {activeText&&!spokenAt&&<div className="spoken-line" role="status"><span>READING NOW</span>{activeText}</div>}
 </div>;
}
