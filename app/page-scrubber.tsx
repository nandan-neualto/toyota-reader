"use client";
import {useState} from "react";

type Props={value:number;min:number;max:number;label:(value:number)=>string;name:string;disabled?:boolean;onCommit:(value:number)=>void};

// Drag (or use arrow keys) to preview a position; the book moves only when the thumb is released.
export default function PageScrubber({value,min,max,label,name,disabled,onCommit}:Props){
 const [draft,setDraft]=useState<number|null>(null);
 const shown=Math.min(max,Math.max(min,draft??value)),percent=max>min?(shown-min)/(max-min)*100:0;
 function commit(){if(draft===null)return;const target=draft;setDraft(null);if(target!==value)onCommit(target);}
 return <div className={"page-scrubber"+(draft!==null?" is-scrubbing":"")} style={{"--scrub-percent":percent+"%"} as React.CSSProperties}>
  {draft!==null&&<output className="page-scrubber-bubble" style={{left:`clamp(70px, ${percent}%, calc(100% - 70px))`}}>{label(shown)}</output>}
  <input type="range" min={min} max={max} step={1} value={shown} disabled={disabled||max<=min} aria-label={name} aria-valuetext={label(shown)}
   onChange={event=>setDraft(Number(event.target.value))} onPointerUp={commit} onTouchEnd={commit} onKeyUp={commit} onBlur={commit}/>
 </div>;
}
