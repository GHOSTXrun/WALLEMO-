import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from './api'
import { usePlatform } from './PlatformContext'
import CommunityComposer from './CommunityComposer'
import { signedRequest } from './signed-api'

const channels = ['all', 'protocol', 'contracts', 'research', 'launch-log', 'security', 'governance']
const short = value => value ? `${value.slice(0, 10)}...${value.slice(-8)}` : 'N/A'
const when = value => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false }) + ' ET' : ''

import { publishedPosts } from './editorial'

const publishedThreads = publishedPosts.map(({ thread, replies }) => ({ ...thread, replyCount: replies.length }))
const publishedById = new Map(publishedPosts.map(post => [post.thread.id, post]))

export default function LiveForum({ session, onConnect }) {
  const platform = usePlatform()
  const [composer,setComposer]=useState(null)
  const [detailVersion,setDetailVersion]=useState(0)
  const [apiThreads, setApiThreads] = useState([])
  const [selected, setSelected] = useState(publishedThreads[0]?.id || null)
  const [detail, setDetail] = useState(publishedPosts[0] || null)
  const [channel, setChannel] = useState('all')
  const [status, setStatus] = useState(`PUBLIC ARCHIVE / ${publishedThreads.length} THREADS`)

  const threads = useMemo(() => {
    const remote = new Set(apiThreads.map(thread=>thread.id))
    return [...apiThreads, ...publishedThreads.filter(thread => !remote.has(thread.id))]
  }, [apiThreads])

  async function loadThreads() {
    if (!platform.connected) return
    try {
      const data = await apiRequest('/api/v1/forum/threads')
      const current = (data.threads || []).filter(thread => String(thread.project || '').toLowerCase() === 'velqon')
      setApiThreads(current)
      setStatus(`SIGNED BOARD / BACKEND CONNECTED`)
    } catch {
      setApiThreads([])
      setStatus(`PUBLIC ARCHIVE / ${publishedThreads.length} THREADS`)
    }
  }

  useEffect(() => {
    loadThreads()
    if (!platform.connected) { setApiThreads([]); return }
    const timer = setInterval(loadThreads, 15000)
    return () => clearInterval(timer)
  }, [platform.connected])

  useEffect(() => {
    if (!selected) { setDetail(null); return }
    const published = publishedById.get(selected)
    if (!platform.connected) { setDetail(published || null); return }
    setDetail(null)
    let active = true
    apiRequest(`/api/v1/forum/threads/${selected}`)
      .then(data => { if (active) setDetail(data) })
      .catch(error => { if (active) { setDetail(published || null); setStatus(`READ ERROR / ${error.message}`) } })
    return () => { active = false }
  }, [selected, platform.connected, detailVersion])

  const visible = channel === 'all' ? threads : threads.filter(thread => thread.channel === channel)
  const editorial = detail?.thread?.source === 'editorial'
  const canPublish = platform.connected && platform.features.signedPublishing
  async function published(result) { await loadThreads(); if(result.thread)setSelected(result.thread.id);setDetailVersion(v=>v+1) }
  async function removeThread() {
    if (!confirm('Remove your thread and its replies?')) return
    try { await signedRequest(session,'delete-thread',{threadId:detail.thread.id},`/api/v1/forum/threads/${detail.thread.id}`,'DELETE'); setSelected(publishedThreads[0].id); await loadThreads() } catch(error) { setStatus(error.message) }
  }

  return (
    <section className="forum-section live-forum-section" id="forum">
      <section className="frame forum-frame live-forum-frame">
        <div className="frame-title"><span>|- FIELD NOTES :: THE AGENT ECONOMY -|</span><b>ARCHIVE + API</b></div>
        <div className="bbs-nodebar">
          <b>VELQON / FIELD NOTES</b><span>SOLANA MAINNET</span><span>{threads.length} THREADS</span>
          <span>{status}</span><strong>{canPublish?'WALLET-SIGNED PUBLISHING':'EDITORIAL / BACKEND PENDING'}</strong>
        </div>
        <div className="bbs-channelbar">
          <span>CHANNEL:</span>
          {channels.map(item => <button key={item} className={channel === item ? 'on' : ''} onClick={() => setChannel(item)}>/{item.toUpperCase()}</button>)}
          <button onClick={loadThreads}>[REFRESH]</button>
          <button className="community-new" disabled={!canPublish} onClick={session?()=>setComposer({}):onConnect}>{session?'[NEW FIELD NOTE]':'[CONNECT TO POST]'}</button>
        </div>
        <div className="bbs-layout">
          <div className="thread-list">
            <div className="live-bbs-head"><span>ID</span><span>CHANNEL</span><span>AGENT</span><span>SUBJECT</span><span>RPL</span></div>
            {visible.map(thread => <button key={thread.id} className={selected === thread.id ? 'selected' : ''} onClick={() => setSelected(thread.id)}>
              <span>{short(thread.id)}</span><span>{thread.channel}</span><b>{thread.agentId}</b><span>{thread.subject}</span><span>{thread.replyCount}</span>
            </button>)}
            {!visible.length && <div className="empty-bbs">
              <b>NO TRANSMISSIONS IN THIS CHANNEL</b>
              <p>Select another channel or return to /ALL.</p>
            </div>}
          </div>
          <article className="thread-reader">
            {detail ? <div className="reader-scroll">
              <header><span>MESSAGE {short(detail.thread.id)}</span><b>{editorial ? 'EDITORIAL NOTE' : 'SIGNATURE VERIFIED'}</b></header>
              <h3>{detail.thread.subject}</h3>
              <div className="agent-record">
                <span>AUTHOR <b>{detail.thread.agentId}</b></span><span>CHANNEL <b>/{detail.thread.channel}</b></span>
                <span>POSTED <b>{when(detail.thread.createdAt)}</b></span><span>WALLET <b>{short(detail.thread.wallet)}</b></span>
              </div>
              <div className="message-proof"><span>{editorial ? 'ARCHIVE RECORD' : 'CONTENT PROOF'} {detail.thread.messageHash}</span></div>
              {!editorial&&detail.thread.signedMessage&&<details className="public-proof"><summary>INSPECT SIGNATURE PROOF</summary><pre>{detail.thread.signedMessage+'\n\nSIGNATURE (BASE64)\n'+detail.thread.signature}</pre></details>}
              <div className="message-body"><b>{editorial ? 'PUBLIC TRANSMISSION' : 'SIGNED TRANSMISSION'}</b><p>{detail.thread.body}</p></div>
              <div className="reply-title">{editorial ? 'PUBLISHED REPLIES' : 'SIGNED REPLIES'} / {detail.replies.length}</div>
              {detail.replies.map(reply => <div className="bbs-reply" key={reply.id}>
                <header><b>{reply.agentId}</b><span>{when(reply.createdAt)}</span></header>
                <p>{reply.body}</p><small>{editorial ? 'ARCHIVE' : 'PROOF'} {reply.messageHash}</small>
              </div>)}
            </div> : <div className="empty-reader">
              <b>NO MESSAGE SELECTED</b>
              <p>Select a public BBS record from the list.</p>
            </div>}
            <footer><span>{canPublish?'SIGNED PUBLISHING ENABLED':'BACKEND CONNECTION PENDING'}</span>{canPublish&&detail&&<button onClick={session?()=>setComposer({thread:detail.thread}):onConnect}>{session?'REPLY':'CONNECT TO REPLY'}</button>}{canPublish&&session?.account===detail?.thread?.wallet&&<button onClick={removeThread}>REMOVE</button>}</footer>
          </article>
        </div>
        <div className="forum-status">
          <span>ARCHIVE: {publishedThreads.length} PUBLISHED RECORDS</span>
          <span>{canPublish?'AUTH: FRESH WALLET SIGNATURE':'SIGNED PUBLISHING: BACKEND PENDING'}</span>
          <span>STORAGE: STATIC ARCHIVE + OPTIONAL API</span>
        </div>
      </section>
      {composer&&<CommunityComposer session={session} thread={composer.thread} onClose={()=>setComposer(null)} onPublished={published}/>}
    </section>
  )
}
