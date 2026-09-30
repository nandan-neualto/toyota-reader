"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { BookEntry, TocEntry } from "@/lib/catalog";
export type PDFReady = {pages:number; toc:TocEntry[]};
type Props={book:BookEntry;page:number;zoom:number;view:"page"|"text";onReady:(data:PDFReady)=>void;onText:(text:string)=>void;onError:(message:string)=>void;text:string;activeText?:string;onBusy:(busy:boolean)=>void};
export default function PDFReader({book,page,zoom,view,onReady,onText,onError,text,activeText,onBusy}:Props){
 const canvas=useRef<HTMLCanvasElement>(null),container=useRef<HTMLDivElement>(null);
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[width,setWidth]=useState(700);
 useEffect(()=>{const el=container.current;if(!el)return;const obs=new ResizeObserver(()=>setWidth(Math.max(260,el.clientWidth-48)));obs.observe(el);return()=>obs.disconnect();},[]);
 useEffect(()=>{
  let dead=false;let doc:PDFDocumentProxy|undefined;let destroy:()=>void=()=>{};
  setPdf(null);onBusy(true);onText("");
  (async()=>{try{
   const lib=await import("pdfjs-dist");
   if(dead)return;
   lib.GlobalWorkerOptions.workerSrc="/vendor/pdf.worker.mjs";
   const source=book.file?{data:new Uint8Array(await book.file.arrayBuffer())}:{url:book.url!};
   if(dead)return;
   const task=lib.getDocument({...source,cMapUrl:"/vendor/cmaps/",cMapPacked:true,standardFontDataUrl:"/vendor/standard_fonts/",wasmUrl:"/vendor/wasm/"});
   destroy=()=>{void task.destroy();};
   doc=await task.promise;if(dead){destroy();return;}
   const outline=await doc.getOutline();const toc:TocEntry[]=[];
   async function walk(items:NonNullable<typeof outline>,depth=0):Promise<void>{for(const item of items){
    try{const dest=typeof item.dest==="string"?await doc!.getDestination(item.dest):item.dest;
     if(dest){const target=typeof dest[0]==="number"?dest[0]+1:(await doc!.getPageIndex(dest[0]))+1;toc.push({title:item.title,target,depth});}
    }catch{}if(item.items?.length)await walk(item.items,depth+1);
   }}
   if(outline)await walk(outline);
   if(dead)return;setPdf(doc);onReady({pages:doc.numPages,toc});
  }catch(e){if(!dead){onError(e instanceof Error&&e.name==="PasswordException"?"This PDF needs a password. Choose an unlocked copy.":"This PDF could not be opened. Check that the file is complete, then try again.");onBusy(false);}}})();
  return()=>{dead=true;destroy();};
 },[book,onReady,onText,onError,onBusy]);
 useEffect(()=>{
  if(!pdf)return;let cancelled=false;let render:RenderTask|undefined;
  onBusy(true);onText("");
  (async()=>{try{
   const p=await pdf.getPage(page);if(cancelled)return;
   const content=await p.getTextContent();if(cancelled)return;
   const extracted=content.items.map(item=>"str" in item?item.str+("hasEOL" in item&&item.hasEOL?"\n":" "):"").join("").replace(/(\w)-\n(\w)/g,"$1$2").trim();
   onText(extracted);
   if(view==="page"&&canvas.current){
    const base=p.getViewport({scale:1});const scale=Math.min(width/base.width,1.65)*zoom;
    const vp=p.getViewport({scale});const dpr=Math.min(window.devicePixelRatio||1,2);
    const c=canvas.current;c.width=Math.floor(vp.width*dpr);c.height=Math.floor(vp.height*dpr);c.style.width=vp.width+"px";c.style.height=vp.height+"px";
    render=p.render({canvas:c,viewport:vp,transform:dpr!==1?[dpr,0,0,dpr,0,0]:undefined});
    await render.promise;
   }
   if(!cancelled)onBusy(false);
  }catch(e){if(!cancelled&&!(e instanceof Error&&e.name==="RenderingCancelledException")){onError("Could not display this page. Try another page or reopen the book.");onBusy(false);}}})();
  return()=>{cancelled=true;render?.cancel();};
 },[pdf,page,zoom,width,view,onBusy,onText,onError]);
 return <div ref={container} className={"document-stage "+(view==="text"?"text-stage":"")} tabIndex={0} aria-label={"Book page "+page}>
  {view==="page"?<canvas ref={canvas} aria-label={"Original PDF page "+page} role="img"/>:<article className="reading-text" style={{fontSize:22*zoom}}>{text?text.split(/\n\s*\n/).map((p,i)=><p key={i}>{p}</p>):<p>No readable text on this page. Use the original page view.</p>}</article>}
  {activeText&&<div className="spoken-line" role="status"><span>READING NOW</span>{activeText}</div>}
 </div>;
}

