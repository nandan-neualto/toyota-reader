"use client";
import {useState} from "react";
import {ArrowRight,LoaderCircle} from "lucide-react";
import {useEmployeeLibrary} from "@/hooks/use-employee-library";
import ReadingRoom from "./reading-room";

export default function EmployeeReader(){
 const library=useEmployeeLibrary();
 const [id,setId]=useState(""),[pin,setPin]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 if(library.checking)return <div className="employee-loading" role="status"><img src="/toyota-industries-group.svg" alt="Toyota Industries Group" width={330} height={110}/><LoaderCircle className="reader-spinner"/><p>{library.closing?"Saving your progress and signing out…":"Opening your library…"}</p></div>;
 if(library.user||library.guest)return <ReadingRoom key={library.user?.id||"guest"} library={library}/>;
 async function login(event:React.FormEvent){event.preventDefault();setBusy(true);setError("");try{await library.login(id,pin);setPin("");}catch(error){setError(error instanceof Error?error.message:"Could not sign in. Try again.");}finally{setBusy(false);}}
 return <div className="employee-entry entry-simple">
  <header className="entry-header"><img src="/toyota-industries-group.svg" alt="Toyota Industries Group" width={330} height={110}/><span>Employee Library</span></header>
  <main className="entry-main"><section className="entry-card"><h1>Welcome back.</h1><p>Sign in with your employee ID and PIN.</p>
   <form onSubmit={login}><label htmlFor="employee-id">Employee ID</label><input id="employee-id" autoComplete="username" value={id} onChange={e=>setId(e.target.value)} maxLength={40} required disabled={busy}/><label htmlFor="employee-pin">PIN or passphrase</label><input id="employee-pin" type="password" autoComplete="current-password" value={pin} onChange={e=>setPin(e.target.value)} maxLength={128} required disabled={busy}/>
    {(error||library.message)&&<p className="library-alert" role="alert">{error||library.message}</p>}<button className="primary-button" disabled={busy}>{busy?<LoaderCircle className="reader-spinner" size={18}/>:<>Sign in<ArrowRight size={18}/></>}</button></form>
   <p className="sign-in-help">Forgot your PIN? Ask your library administrator.</p>
   <button className="guest-button" onClick={()=>library.setGuest(true)} disabled={busy}>Continue as a guest<ArrowRight size={17}/></button>
  </section></main>
 </div>;
}
