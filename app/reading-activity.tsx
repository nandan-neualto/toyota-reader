"use client";
import {useMemo,useState} from "react";
import {CalendarDays,Flame,Minus,Timer,TrendingDown,TrendingUp} from "lucide-react";
import type {ReadingRecord} from "@/lib/employee-library";
import {ACTIVITY_LEVELS,activityLevel,formatDuration,localDate,summarizeActivity} from "@/lib/reading-activity.mjs";

const WEEKS=12;
const dayName=(day:string,options:Intl.DateTimeFormatOptions={weekday:"short",day:"numeric",month:"short"})=>new Intl.DateTimeFormat(undefined,{...options,timeZone:"UTC"}).format(new Date(day+"T00:00:00Z"));

export default function ReadingActivity({records}:{records:Record<string,ReadingRecord>}){
 const today=localDate();
 const summary=useMemo(()=>summarizeActivity(Object.values(records),today,WEEKS),[records,today]);
 const cells=useMemo(()=>summary.calendar.flat(),[summary]);
 const lastIndex=cells.findIndex(cell=>cell.day===today);
 // The tooltip follows whichever came last: the pointer or keyboard focus.
 const [focused,setFocused]=useState<number|null>(null),[active,setActive]=useState<number|null>(null);
 const tabStop=focused??lastIndex;
 const readToday=(cells[lastIndex]?.seconds||0)>=60;
 const change=summary.thisWeek-summary.lastWeek,ChangeIcon=change>0?TrendingUp:change<0?TrendingDown:Minus;
 // Month names sit above the first week that starts in a new month.
 const months=summary.calendar.map((week,index)=>{const month=week[0].day.slice(0,7);return index===0||month!==summary.calendar[index-1][0].day.slice(0,7)?dayName(week[0].day,{month:"short"}):"";});
 function move(event:React.KeyboardEvent,index:number){
  const step={ArrowUp:-1,ArrowDown:1,ArrowLeft:-7,ArrowRight:7}[event.key];
  const target=step!==undefined?index+step:event.key==="Home"?0:event.key==="End"?lastIndex:null;
  if(target===null)return;
  event.preventDefault();const next=Math.max(0,Math.min(lastIndex,target));setFocused(next);setActive(next);
  (event.currentTarget.parentElement?.children[next] as HTMLElement|undefined)?.focus();
 }
 const tip=active!==null?cells[active]:null;
 return <section className="reading-activity" aria-labelledby="reading-activity-title">
  <div className="reading-activity-heading"><h3 id="reading-activity-title">Your reading rhythm</h3><p>Time spent reading while signed in, counted by day. Only you can see it.</p></div>
  <div className="reading-activity-body">
   <div className="activity-tiles">
    <div className="activity-tile"><span className="activity-tile-label"><Flame size={16}/> Current streak</span><strong>{summary.streak} {summary.streak===1?"day":"days"}</strong><small>{summary.streak&&!readToday?"Read a minute today to keep it going":`Longest: ${summary.longest} ${summary.longest===1?"day":"days"}`}</small></div>
    <div className="activity-tile"><span className="activity-tile-label"><Timer size={16}/> This week</span><strong>{formatDuration(summary.thisWeek)}</strong><small className={change>0?"activity-up":""}><ChangeIcon size={14}/>{change===0?"Same as last week":Math.abs(change)<60?`A little ${change>0?"more":"less"} than last week`:`${change>0?"+":"−"}${formatDuration(Math.abs(change))} vs last week`}</small></div>
    <div className="activity-tile"><span className="activity-tile-label"><CalendarDays size={16}/> Reading days</span><strong>{summary.activeDays}</strong><small>In the last {WEEKS} weeks · {formatDuration(summary.windowSeconds)} in total</small></div>
   </div>
   <div className="activity-calendar">
    <div className="activity-months" aria-hidden="true">{months.map((month,index)=><span key={index}>{month}</span>)}</div>
    <div className="activity-grid-wrap">
     <div className="activity-weekdays" aria-hidden="true"><span>Mon</span><span/><span>Wed</span><span/><span>Fri</span><span/><span/></div>
     <div className="activity-grid" role="group" aria-label={`Reading time per day for the last ${WEEKS} weeks. Use the arrow keys to move between days.`} onPointerLeave={()=>setActive(focused)}>
      {cells.map((cell,index)=>cell.future?<span key={cell.day} className="activity-cell is-future" aria-hidden="true"/>:<span key={cell.day} role="img" tabIndex={index===tabStop?0:-1}
       className={"activity-cell level-"+activityLevel(cell.seconds)+(index===active?" is-active":"")+(cell.day===today?" is-today":"")}
       aria-label={`${dayName(cell.day,{weekday:"long",day:"numeric",month:"long"})}: ${cell.seconds?formatDuration(cell.seconds):"no reading"}`}
       onPointerEnter={()=>setActive(index)} onFocus={()=>{setFocused(index);setActive(index);}} onBlur={()=>{setFocused(null);setActive(null);}} onKeyDown={event=>move(event,index)}/>)}
      {tip&&active!==null&&<div className="activity-tooltip" role="presentation" style={{"--column":Math.floor(active/7),"--row":active%7,"--shift":Math.floor(active/7)<2?"-15%":Math.floor(active/7)>WEEKS-3?"-85%":"-50%"} as React.CSSProperties}><strong>{tip.seconds?formatDuration(tip.seconds):"No reading"}</strong><span>{dayName(tip.day)}{tip.day===today?" · today":""}</span></div>}
     </div>
    </div>
    <div className="activity-legend" aria-hidden="true"><span>Less</span><i className="activity-cell level-0"/>{ACTIVITY_LEVELS.map((level,index)=><i key={level.min} className={"activity-cell level-"+(index+1)} title={level.label}/>)}<span>More</span></div>
    <p className="activity-scale">Darker days mean more reading: {ACTIVITY_LEVELS.map(level=>level.label.toLowerCase()).join(", ")}.</p>
   </div>
  </div>
  {summary.days.length>0?<details className="activity-table"><summary>Show daily reading time</summary><table><thead><tr><th scope="col">Day</th><th scope="col">Reading time</th></tr></thead><tbody>{summary.days.slice(0,90).map(entry=><tr key={entry.day}><td>{dayName(entry.day,{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</td><td>{formatDuration(entry.seconds)}</td></tr>)}</tbody></table>{summary.days.length>90&&<p>Showing the latest 90 reading days.</p>}</details>
   :<p className="activity-empty">Open a book while signed in and your reading days will start to fill in here.</p>}
 </section>;
}
