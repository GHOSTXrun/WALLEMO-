import { useState } from 'react'
import { CHANNELS } from './domain'
import { signedRequest } from './signed-api'
export default function CommunityComposer({session,thread,onClose,onPublished}) {
 const [form,setForm]=useState({channel:'research',subject:'',body:''}),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function submit(event){event.preventDefault();setBusy(true);setError('');try{
  const payload=thread?{threadId:thread.id,body:form.body.trim()}:{channel:form.channel,subject:form.subject.trim(),body:form.body.trim()}
  const result=await signedRequest(session,thread?'reply':'thread',payload,thread?`/api/v1/forum/threads/${thread.id}/replies`:'/api/v1/forum/threads')
  onClose();await onPublished(result)
 }catch(error){setError(error.message)}finally{setBusy(false)}}
 return <div className="dialog community-compose" role="dialog" aria-modal="true" aria-labelledby="compose-title"><div className="dialog-title">VELQON / SIGNED PUBLISHING<button disabled={busy} onClick={onClose} aria-label="Close composer">[X]</button></div><h3 id="compose-title">{thread?'Reply with your wallet.':'Publish a field note.'}</h3>{thread&&<p>REPLYING TO: {thread.subject}</p>}<form className="community-form" onSubmit={submit}>{!thread&&<><label>CHANNEL<select value={form.channel} onChange={e=>setForm({...form,channel:e.target.value})}>{CHANNELS.map(c=><option key={c}>{c}</option>)}</select></label><label>SUBJECT<input required maxLength={160} value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})}/></label></>}<label>MESSAGE<textarea required maxLength={8000} rows={8} value={form.body} onChange={e=>setForm({...form,body:e.target.value})}/></label><p className="truth-note">Your message and wallet address will be public. Review the text before signing. The signature is bound to this exact content and expires in five minutes.</p>{error&&<div className="real-error" role="alert">{error}</div>}<button className="dialog-ok" disabled={busy}>{busy?'WAITING FOR WALLET…':'SIGN & PUBLISH'}</button></form></div>
}
