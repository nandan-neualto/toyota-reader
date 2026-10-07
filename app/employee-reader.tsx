"use client";
import {useState} from "react";
import {ArrowRight,BookOpen,Bookmark,Headphones,LoaderCircle,ShieldCheck} from "lucide-react";
import {useEmployeeLibrary} from "@/hooks/use-employee-library";
import ReadingRoom from "./reading-room";

export default function EmployeeReader(){
 const library=useEmployeeLibrary();
 const [id,setId]=useState(""),[pin,setPin]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 if(library.checking)return <div className="employee-loading" role="status"><img src="/toyota-industries-group.svg" alt="Toyota Industries Group" width={330} height={110}/><LoaderCircle className="reader-spinner"/><p>{library.closing?"Saving your progress and signing out…":"Opening your library…"}</p></div>;
 if(library.user||library.guest)return <ReadingRoom key={library.user?.id||"guest"} library={library}/>;
 async function login(event:React.FormEvent){event.preventDefault();setBusy(true);setError("");try{await library.login(id,pin);setPin("");}catch(error){setError(error instanceof Error?error.message:"Could not sign in. Try again.");}finally{setBusy(false);}}
 return <div className="employee-entry">
  <header className="entry-header"><img src="/toyota-industries-group.svg" alt="Toyota Industries Group" width={330} height={110}/><span>EMPLOYEE LIBRARY</span><span className="entry-topline">Ideas that move us forward.</span></header>
  <main className="entry-main"><section className="entry-story"><p className="eyebrow">LEARN. REFLECT. KEEP IMPROVING.</p><h1>Your next chapter<br/>starts here<span>.</span></h1><p className="entry-intro">A shared library for Toyota employees. Discover something useful today, and pick up where you left off tomorrow.</p>
   <div className="entry-benefits"><div><BookOpen/><span><strong>A growing collection</strong><small>PDFs and EPUBs, organized for easy discovery.</small></span></div><div><Bookmark/><span><strong>Your own reading space</strong><small>Progress, bookmarks, favorites and private notes.</small></span></div><div><Headphones/><span><strong>Read or listen</strong><small>Keep learning at a pace that works for you.</small></span></div></div>
   <div className="entry-art" aria-hidden="true"><div>THE TOYOTA WAY<small>Continuous improvement<br/>begins with curiosity.</small><span>01 / LEARNING TOGETHER</span></div><div>KAIZEN<small>Small steps.<br/>Lasting change.</small><span>TOYOTA LIBRARY</span></div></div>
  </section><section className="entry-card"><div className="entry-card-icon"><ShieldCheck/></div><p className="eyebrow">YOUR PERSONAL LIBRARY</p><h2>Welcome back.</h2><p>Sign in with the employee ID and PIN provided by your library administrator.</p>
   <form onSubmit={login}><label htmlFor="employee-id">Employee ID</label><input id="employee-id" autoComplete="username" value={id} onChange={e=>setId(e.target.value)} placeholder="Enter your employee ID" maxLength={40} required disabled={busy}/><label htmlFor="employee-pin">PIN or passphrase</label><input id="employee-pin" type="password" autoComplete="current-password" value={pin} onChange={e=>setPin(e.target.value)} placeholder="Enter your PIN" maxLength={128} required disabled={busy}/>
    {(error||library.message)&&<p className="library-alert" role="alert">{error||library.message}</p>}<button className="primary-button" disabled={busy}>{busy?<LoaderCircle className="reader-spinner" size={18}/>:<>Sign in<ArrowRight size={18}/></>}</button></form>
   <p className="sign-in-help">Need access or a PIN reset? Contact your library administrator.</p><div className="entry-divider"/><button className="guest-button" onClick={()=>library.setGuest(true)} disabled={busy}>Explore as a guest<ArrowRight size={17}/></button><small className="guest-help">Guest reading is available without an account. Sign in to save your reading progress.</small>
  </section></main><footer className="entry-footer"><span>TOYOTA • EMPLOYEE LEARNING</span><span>A little reading. A new perspective.</span></footer>
 </div>;
}
