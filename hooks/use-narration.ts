"use client";
import {useCallback,useEffect,useRef,useState} from "react";
export function splitForSpeech(text:string):string[]{
 const clean=text.replace(/(\w)-\s*\n(\w)/g,"$1$2").replace(/\s+/g," ").trim();
 const sentences=clean.match(/[^.!?。！？]+[.!?。！？]*/gu)||[];
 return sentences.flatMap(sentence=>{const chunks:string[]=[];let part="";for(const word of sentence.trim().split(" ")){if(part.length+word.length>230){chunks.push(part);part="";}part+=(part?" ":"")+word;}if(part)chunks.push(part);return chunks;}).filter(Boolean);
}
export function useNarration(){
 const [supported,setSupported]=useState(false),[voices,setVoices]=useState<SpeechSynthesisVoice[]>([]),[voiceId,setVoiceId]=useState("default"),[rate,setRate]=useState(1),[state,setState]=useState<"idle"|"playing"|"paused">("idle"),[activeText,setActiveText]=useState(""),[error,setError]=useState("");
 const generation=useRef(0),utterance=useRef<SpeechSynthesisUtterance|null>(null),completion=useRef<()=>void>(()=>{}),watchdog=useRef<ReturnType<typeof setTimeout>|null>(null);
 const stop=useCallback(()=>{generation.current++;if(watchdog.current)clearTimeout(watchdog.current);if(typeof window!=="undefined"&&"speechSynthesis"in window)window.speechSynthesis.cancel();utterance.current=null;setState("idle");setActiveText("");},[]);
 const reset=useCallback(()=>{stop();setVoiceId("default");setRate(1);setError("");},[stop]);
 useEffect(()=>{if(!("speechSynthesis"in window))return;setSupported(true);const refresh=()=>setVoices(window.speechSynthesis.getVoices());refresh();window.speechSynthesis.addEventListener("voiceschanged",refresh);return()=>{generation.current++;window.speechSynthesis.cancel();if(watchdog.current)clearTimeout(watchdog.current);window.speechSynthesis.removeEventListener("voiceschanged",refresh);};},[]);
 const read=useCallback((text:string,language="en")=>{
  stop();setError("");if(!("speechSynthesis"in window)){setError("Read aloud is not supported in this browser.");return;}
  const choices=window.speechSynthesis.getVoices();const voice=voiceId==="default"?(choices.find(v=>v.lang.toLowerCase().startsWith(language.toLowerCase().split("-")[0])&&v.localService)||choices.find(v=>v.lang.toLowerCase().startsWith(language.toLowerCase().split("-")[0]))):choices.find(v=>v.voiceURI===voiceId);
  if(!choices.length){setError("No speech voices are available. Install a voice in this device’s speech settings, then reopen the reader.");return;}
  if(!voice){setError("No matching voice is installed. Choose a voice in reading settings.");return;}
  if(!navigator.onLine&&!voice.localService){setError("This voice needs an internet connection. Select an on-device voice to listen offline.");return;}
  const chunks=splitForSpeech(text);if(!chunks.length){setError("This page has no readable text. Try another page.");return;}
  const run=++generation.current;setState("playing");
  const speak=(index:number)=>{if(run!==generation.current)return;if(index>=chunks.length){setState("idle");setActiveText("");completion.current();return;}
   const u=new SpeechSynthesisUtterance(chunks[index]);utterance.current=u;u.voice=voice;u.lang=voice.lang;u.rate=rate;
   watchdog.current=setTimeout(()=>{if(run===generation.current){stop();setError("The speech engine did not start. Try a different installed voice.");}},12000);
   u.onstart=()=>{if(run!==generation.current)return;if(watchdog.current)clearTimeout(watchdog.current);setActiveText(chunks[index]);};
   u.onend=()=>{if(watchdog.current)clearTimeout(watchdog.current);if(run===generation.current)speak(index+1);};
   u.onerror=e=>{if(run!==generation.current)return;if(watchdog.current)clearTimeout(watchdog.current);if(e.error!=="canceled"&&e.error!=="interrupted"){setState("idle");setActiveText("");setError("This voice could not play. Try another voice or check the device’s audio settings.");}};
   window.speechSynthesis.speak(u);
  };speak(0);
 },[stop,voiceId,rate]);
 const pause=()=>{window.speechSynthesis.pause();setState("paused");};
 const resume=()=>{window.speechSynthesis.resume();setState("playing");};
 const chooseVoice=(id:string)=>{stop();setVoiceId(id);setError("");};
 const chooseRate=(value:number)=>{stop();setRate(value);};
 return {supported,voices,voiceId,rate,state,activeText,error,setError,read,stop,reset,pause,resume,chooseVoice,chooseRate,completion};
}
