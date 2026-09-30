"use client";
import {useEffect,useRef} from "react";
import type EpubBook from "epubjs/types/book";
import type Rendition from "epubjs/types/rendition";
import type {Location} from "epubjs/types/rendition";
import type {BookEntry,TocEntry} from "@/lib/catalog";
export type EpubControls={next:()=>Promise<void>;previous:()=>Promise<void>;go:(target:string)=>Promise<void>};
type Props={book:BookEntry;zoom:number;onReady:(toc:TocEntry[],controls:EpubControls)=>void;onLocation:(label:string,atStart:boolean,atEnd:boolean)=>void;onText:(text:string)=>void;onBusy:(busy:boolean)=>void;onError:(message:string)=>void;onActivity:()=>void};
export default function EpubReader({book,zoom,onReady,onLocation,onText,onBusy,onError,onActivity}:Props){
 const container=useRef<HTMLDivElement>(null),rendition=useRef<Rendition|null>(null);
 useEffect(()=>{let dead=false;let epub:EpubBook|undefined;onBusy(true);
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
   r.themes.fontSize(String(20*zoom)+"px");
   const nav=await epub.loaded.navigation;const toc:TocEntry[]=[];
   const walk=(items:typeof nav.toc,depth=0)=>items.forEach(item=>{toc.push({title:item.label,target:item.href,depth});if(item.subitems?.length)walk(item.subitems,depth+1);});walk(nav.toc);
   r.on("relocated",async(location:Location)=>{if(dead)return;onLocation("Section "+(location.start.index+1)+" · page "+location.start.displayed.page+" / "+location.start.displayed.total,location.atStart,location.atEnd);
    try{const contents=r.getContents() as unknown as Array<{document:Document;cfiFromRange:(range:Range)=>string}>;
     const range=await epub!.getRange(location.start.cfi);const end=await epub!.getRange(location.end.cfi);if(dead)return;
     if(range.startContainer.ownerDocument===end.endContainer.ownerDocument){range.setEnd(end.endContainer,end.endOffset);onText(range.toString());}else onText(contents[0]?.document.body.textContent||"");
    }catch{if(dead)return;const contents=r.getContents() as unknown as Array<{document:Document}>;onText(contents[0]?.document.body.textContent||"");}
    onBusy(false);onActivity();
   });
   r.hooks.content.register((contents:{document:Document})=>{contents.document.addEventListener("pointerdown",onActivity);contents.document.addEventListener("keydown",onActivity);});
   await r.display();if(dead)return;onReady(toc,{next:()=>r.next(),previous:()=>r.prev(),go:target=>r.display(target)});onBusy(false);
  }catch(e){if(!dead){onError("This EPUB could not be opened. Use an unencrypted EPUB or a PDF.");onBusy(false);}}})();
  return()=>{dead=true;rendition.current?.destroy();rendition.current=null;epub?.destroy();};
 },[book,onReady,onLocation,onText,onBusy,onError,onActivity]);
 useEffect(()=>{rendition.current?.themes.fontSize(String(20*zoom)+"px");},[zoom]);
 return <div className="epub-stage" ref={container} aria-label="EPUB book pages"/>;
}

