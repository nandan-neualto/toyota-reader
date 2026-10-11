const clampPercent=value=>Math.max(0,Math.min(100,Number.isFinite(value)?value:0));
const validTotal=value=>Number.isInteger(value)&&value>0&&value<=1000000?value:0;

export function normalizeReadRanges(value,total=0,maxInput=10000){
 if(!Array.isArray(value)||value.length>maxInput)throw new Error('Invalid page coverage.');
 const limit=validTotal(total)||1000000;
 const sorted=value.map(range=>{
  if(!Array.isArray(range)||range.length!==2||!range.every(Number.isInteger)||range[0]<1||range[1]<range[0]||range[1]>limit)throw new Error('Invalid page coverage.');
  return [...range];
 }).sort((a,b)=>a[0]-b[0]);
 const merged=[];
 for(const range of sorted){const last=merged.at(-1);if(last&&range[0]<=last[1]+1)last[1]=Math.max(last[1],range[1]);else merged.push(range);}
 if(merged.length>10000)throw new Error("Page coverage is too fragmented.");
 return merged;
}

export function getReadingProgress(record={},format='pdf',fallbackTotal=0){
 const total=validTotal(record.total)||validTotal(fallbackTotal);
 const positionPercent=clampPercent(record.percent);
 if(format==='pdf'&&Array.isArray(record.readRanges)){
  try{const ranges=normalizeReadRanges(record.readRanges,total);const pagesRead=ranges.reduce((count,[start,end])=>count+end-start+1,0);return {percent:total?Math.min(100,pagesRead/total*100):0,pagesRead,total,positionPercent,tracked:true};}catch{}
 }
 return {percent:Math.max(positionPercent,clampPercent(record.furthestPercent)),pagesRead:null,total,positionPercent,tracked:format==='epub'&&Number.isFinite(record.furthestPercent)};
}

export function trackReadingLocation(record={},location){
 const {format,page,total,cfi='',percent,at=new Date().toISOString()}=location;
 if(!['pdf','epub'].includes(format)||!Number.isInteger(page)||page<1||page>1000000||!Number.isFinite(percent)||percent<0||percent>100)throw new Error('Invalid reading location.');
 if(format==='pdf'&&(!validTotal(total)||page>total))throw new Error('Invalid PDF page.');
 const updated={...record,page,total,cfi,percent,started:true,lastReadAt:at,furthestPercent:Math.max(clampPercent(record.furthestPercent),clampPercent(record.percent),percent)};
 if(format==='pdf'){
  updated.readRanges=normalizeReadRanges([...(record.readRanges||[]),[page,page]],total,10001);
  updated.furthestPage=Math.max(record.furthestPage||0,record.started?record.page||0:0,page);
 }
 // Completion is an employee choice, independent of the saved resume position.
 return updated;
}

export function mergeReadingHistory(previous,incoming){
 const merged={...incoming};
 const total=validTotal(incoming.total)||validTotal(previous.total);
 if(Array.isArray(previous.readRanges)||Array.isArray(incoming.readRanges))merged.readRanges=normalizeReadRanges([...(previous.readRanges||[]),...(incoming.readRanges||[])],total,20000);
 if(Number.isFinite(previous.furthestPercent)||Number.isFinite(incoming.furthestPercent))merged.furthestPercent=Math.max(clampPercent(previous.furthestPercent),clampPercent(previous.percent),clampPercent(incoming.furthestPercent),clampPercent(incoming.percent));
 if(Number.isInteger(previous.furthestPage)||Number.isInteger(incoming.furthestPage))merged.furthestPage=Math.max(previous.furthestPage||0,incoming.furthestPage||0);
 return merged;
}

export function formatProgress(percent){const value=clampPercent(percent);return value>0&&value<1?'Less than 1%':`${Math.round(value)}%`;}
