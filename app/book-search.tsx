"use client";
import {useEffect,useId,useRef,useState} from "react";
import {LoaderCircle,Search,X} from "lucide-react";
import type {SearchHit,SearchRunner} from "@/lib/catalog";
import {normalizeSearchQuery} from "@/lib/reader-tools.mjs";

export type SearchResult={query:string;hits:SearchHit[];matches:number;searched:number;total:number;complete:boolean};
type Props={search:SearchRunner|null;format:"pdf"|"epub";initial:SearchResult|null;onResult:(result:SearchResult|null)=>void;onJump:(hit:SearchHit,result:SearchResult)=>void;onActivity:()=>void};
const VISIBLE_HITS=200;

export default function BookSearch({search,format,initial,onResult,onJump,onActivity}:Props){
 const id=useId(),input=useRef<HTMLInputElement>(null),controller=useRef<AbortController|null>(null);
 const [draft,setDraft]=useState(initial?.query||""),[result,setResult]=useState<SearchResult|null>(initial),[running,setRunning]=useState(false),[error,setError]=useState("");
 useEffect(()=>{const field=input.current;requestAnimationFrame(()=>{field?.focus();field?.select();});return()=>controller.current?.abort();},[]);
 async function run(event:React.FormEvent){
  event.preventDefault();onActivity();
  const query=draft.trim();
  if(normalizeSearchQuery(query).length<2){setError("Enter at least 2 characters to search this book.");return;}
  if(!search){setError("Search is available when the book finishes opening.");return;}
  controller.current?.abort();const current=new AbortController();controller.current=current;
  setRunning(true);setError("");setResult({query,hits:[],matches:0,searched:0,total:0,complete:false});
  try{
   let latest:SearchResult={query,hits:[],matches:0,searched:0,total:0,complete:false};
   await search(query,current.signal,(hits,searched,total,matches)=>{if(current.signal.aborted)return;latest={query,hits,matches,searched,total,complete:false};setResult(latest);onActivity();});
   if(current.signal.aborted)return;
   latest={...latest,complete:true};setResult(latest);onResult(latest);
  }catch{if(!current.signal.aborted)setError("This book could not be searched. Reopen it and try again.");}
  finally{if(controller.current===current){controller.current=null;setRunning(false);}}
 }
 function cancel(){controller.current?.abort();controller.current=null;setRunning(false);setResult(value=>value?{...value,complete:false}:value);onActivity();}
 function clear(){cancel();setDraft("");setResult(null);setError("");onResult(null);input.current?.focus();}
 const unit=format==="pdf"?"pages":"sections",hits=result?.hits||[];
 const summary=!result?"":running?`Searching… ${result.searched} of ${result.total||"…"} ${unit} checked · ${result.matches} ${result.matches===1?"match":"matches"} so far`
  :!result.complete?`Search stopped after ${result.searched} of ${result.total} ${unit} · ${result.matches} ${result.matches===1?"match":"matches"}`
  :result.matches?`${result.matches} ${result.matches===1?"match":"matches"} for “${result.query}”${format==="pdf"?` on ${hits.length} ${hits.length===1?"page":"pages"}`:""}`:`No matches for “${result.query}”. Check the spelling or try fewer words.`;
 return <div className="book-search">
  <form className="book-search-form" role="search" onSubmit={run}>
   <label htmlFor={id}>Find words in this book</label>
   <div className="book-search-field"><Search size={18} aria-hidden="true"/><input ref={input} id={id} type="search" enterKeyHint="search" value={draft} maxLength={120} placeholder="A word or phrase…" autoComplete="off" onChange={event=>{setDraft(event.target.value);onActivity();}}/>{draft&&<button type="button" className="book-search-clear" aria-label="Clear search" onClick={clear}><X size={16}/></button>}</div>
   <div className="book-search-actions">{running?<button key="stop" type="button" className="toolbar-button" onClick={cancel}>Stop searching</button>:<button key="search" type="submit" className="primary-button" disabled={!search||!draft.trim()}><Search size={17}/>Search</button>}</div>
  </form>
  {!search&&<p className="book-search-note">Search is available when the book finishes opening.</p>}
  {error&&<p className="library-alert" role="alert">{error}</p>}
  {result&&<p className="book-search-summary" role="status" aria-live="polite">{running&&<LoaderCircle size={15} className="reader-spinner"/>}{summary}</p>}
  {running&&result&&result.total>0&&<progress className="book-search-progress" value={result.searched} max={result.total} aria-label="Search progress"/>}
  {!!hits.length&&<ol className="book-search-results" aria-label="Search results">{hits.slice(0,VISIBLE_HITS).map(hit=><li key={hit.key}><button type="button" onClick={()=>result&&onJump(hit,result)}>
   <span className="book-search-hit-label"><strong>{hit.label}</strong>{hit.count>1&&<small>{hit.count} matches</small>}</span>
   <span className="book-search-excerpt">{hit.before}<mark>{hit.match}</mark>{hit.after}</span>
  </button></li>)}</ol>}
  {hits.length>VISIBLE_HITS&&<p className="book-search-note">Showing the first {VISIBLE_HITS} results. Add more words to narrow your search.</p>}
  {format==="epub"&&result?.complete&&result.matches>hits.length&&<p className="book-search-note">Showing the first {hits.length} of {result.matches} matches. Add more words to narrow your search.</p>}
  <p className="book-search-help">{format==="pdf"?"Search uses the text inside the PDF. Scanned pages without a text layer cannot be searched.":"Matches split across formatting, such as a partly italic word, may not be found."}</p>
 </div>;
}
