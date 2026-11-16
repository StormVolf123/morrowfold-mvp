import { useEffect, useState } from 'react';
import { google } from './client';
import type { Item } from './domain';

type Status = {configured:boolean;connected:boolean;email:string};
type Email = {id:string;subject:string;sender:string;date:string;text?:string};
export function GooglePanel({areas,onResult}:{areas:Item[];onResult:(item:Item)=>void}) {
  const [status,setStatus]=useState<Status|null>(null),[emails,setEmails]=useState<Email[]>([]),[preview,setPreview]=useState<Email|null>(null),[selected,setSelected]=useState<string[]>([]),[area,setArea]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{google.status().then(setStatus).catch(e=>setError(e.message));},[]);
  async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function assist(action:'summary'|'reply'){
    await run(async()=>{const item=await google.assist(selected,area||null,action,consent);setConsent(false);onResult(item);});
  }
  return <section className="panel settings gmail-panel" aria-label="Gmail connection">
    <span className="eyebrow">CONNECTIONS</span><h2>Gmail, on your terms.</h2>
    <p>Choose messages to work with. Reading your inbox does not send it to AI. Nothing here sends email or changes your mailbox.</p>
    {error&&<p role="alert">{error}</p>}
    {!status?<p>Checking connection…</p>:<>
      {status.connected?<><p>Connected: {status.email}</p><div className="gmail-actions">
        <button className="primary" disabled={busy} onClick={()=>run(async()=>{setEmails(await google.messages());setSelected([]);setConsent(false);})}>Load 10 recent inbox messages</button>
        <button className="text-button" disabled={busy} onClick={()=>run(async()=>{const r=await google.disconnect();setStatus({...status,connected:false,email:''});setEmails([]);setSelected([]);setPreview(null);setConsent(false);if(!r.provider_revoked)setError('Disconnected here. Also remove Morrowfold in your Google Account’s third-party connections because Google revocation could not be confirmed.');})}>Disconnect</button>
      </div></>:<><p>Google grants read-only access to your mailbox. You choose which messages to use here. Test accounts may need to reconnect after seven days.</p><button className="primary" disabled={busy||!status.configured} onClick={()=>run(async()=>{await google.connect();})}>{status.configured?'Connect Gmail':'Google setup pending'}</button></>}
      {emails.length>0&&<div className="gmail-messages">{emails.map(email=><div className="gmail-message" key={email.id}>
        <input type="checkbox" aria-label={'Select '+(email.subject||'Untitled email')} checked={selected.includes(email.id)} disabled={busy||(!selected.includes(email.id)&&selected.length>=3)} onChange={e=>{setSelected(e.target.checked?[...selected,email.id]:selected.filter(id=>id!==email.id));setConsent(false);}}/>
        <button className="text-button gmail-subject" disabled={busy} onClick={()=>run(async()=>setPreview(await google.message(email.id)))}><strong>{email.subject||'Untitled email'}</strong><span>{email.sender}</span></button>
      </div>)}</div>}
      {preview&&<section className="gmail-preview" aria-label="Selected email preview"><h3>{preview.subject||'Untitled email'}</h3><p>{preview.sender}</p><pre>{preview.text||'No readable text. Attachments are not imported.'}</pre><button className="text-button" onClick={()=>setPreview(null)}>Close preview</button></section>}
      {selected.length>0&&<div className="gmail-assist"><label>Use context from<select value={area} disabled={busy} onChange={e=>{setArea(e.target.value);setConsent(false);}}><option value="">All areas</option>{areas.map(a=><option key={a.id} value={a.id}>{a.data.title}</option>)}</select></label>
        <label className="gmail-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/><span>Share these {selected.length} selected messages (sender, subject and text) and the selected workspace context with Mistral. Save the resulting summary or draft in my chat history.</span></label>
        <div className="gmail-actions"><button className="primary" disabled={busy||!consent} onClick={()=>assist('summary')}>Summarise with AI</button><button className="text-button" disabled={busy||!consent||selected.length!==1} onClick={()=>assist('reply')}>Draft a reply</button></div>
      </div>}
    </>}
  </section>;
}
