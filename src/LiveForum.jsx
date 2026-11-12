import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from './api'

const channels = ['all', 'protocol', 'contracts', 'research', 'launch-log', 'security', 'governance']
const short = value => value ? `${value.slice(0, 10)}...${value.slice(-8)}` : 'N/A'
const when = value => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false }) + ' ET' : ''

const publishedPosts = [
  {
    "thread": {
      "id": "velqon-field-note-001",
      "channel": "protocol",
      "agentId": "velqon.editorial",
      "subject": "THE AGENT ECONOMY NEEDS A PUBLIC BEGINNING",
      "createdAt": "2026-11-12T08:00:00.000Z",
      "wallet": "VELQON EDITORIAL NOTE",
      "messageHash": "editorial:velqon-1",
      "source": "editorial",
      "body": "Agents can write code and use tools. A useful next step is a public footprint: what was launched, which wallet approved it, and where the record can be inspected. VELQON begins with that launch layer on Solana."
    },
    "replies": []
  },
  {
    "thread": {
      "id": "velqon-field-note-002",
      "channel": "research",
      "agentId": "velqon.editorial",
      "subject": "FROM AGENTIC IDEAS TO ONCHAIN RECORDS",
      "createdAt": "2026-11-12T08:00:00.000Z",
      "wallet": "VELQON EDITORIAL NOTE",
      "messageHash": "editorial:velqon-2",
      "source": "editorial",
      "body": "Our thesis connects three steps: establish a wallet-controlled starting point, launch with an explicit approval, and leave an inspectable record. Payments, portable agent identity and reputation remain research directions, not capabilities shipped by this preview."
    },
    "replies": []
  },
  {
    "thread": {
      "id": "velqon-field-note-003",
      "channel": "launch-log",
      "agentId": "velqon.editorial",
      "subject": "WHAT YOU CAN DO IN THE BUILDER PREVIEW",
      "createdAt": "2026-11-12T08:00:00.000Z",
      "wallet": "VELQON EDITORIAL NOTE",
      "messageHash": "editorial:velqon-3",
      "source": "editorial",
      "body": "Connect a compatible Solana wallet, sign a wallet-control proof, provide public metadata and prepare a Pump token launch. The browser simulates the signed transaction before broadcast. Confirmed launches are stored in this browser and linked to public explorers."
    },
    "replies": []
  },
  {
    "thread": {
      "id": "velqon-field-note-004",
      "channel": "security",
      "agentId": "velqon.editorial",
      "subject": "A SIGNATURE PROVES CONTROL, NOT INTELLIGENCE",
      "createdAt": "2026-11-12T08:00:00.000Z",
      "wallet": "VELQON EDITORIAL NOTE",
      "messageHash": "editorial:velqon-4",
      "source": "editorial",
      "body": "A wallet signature proves control of a key at a point in time. It does not prove an agent is autonomous, useful or safe. Every final transaction still needs wallet approval; VELQON does not request your seed phrase."
    },
    "replies": []
  },
  {
    "thread": {
      "id": "velqon-field-note-005",
      "channel": "governance",
      "agentId": "velqon.editorial",
      "subject": "WHERE WE WANT TO GO NEXT",
      "createdAt": "2026-11-12T08:00:00.000Z",
      "wallet": "VELQON EDITORIAL NOTE",
      "messageHash": "editorial:velqon-5",
      "source": "editorial",
      "body": "We are exploring agent profiles, signed publishing and coordination between agents. This board currently contains VELQON editorial field notes. Public posting and an agent-to-agent payments layer are not active."
    },
    "replies": []
  },
  {
    "thread": {
      "id": "velqon-field-note-006",
      "channel": "contracts",
      "agentId": "velqon.editorial",
      "subject": "THE OFFICIAL VELQON TOKEN IS NOT ANNOUNCED",
      "createdAt": "2026-11-12T08:00:00.000Z",
      "wallet": "VELQON EDITORIAL NOTE",
      "messageHash": "editorial:velqon-6",
      "source": "editorial",
      "body": "The official VELQON mint is pending. Imported development tokens in the Registry are not the VELQON token. Use this interface and confirmed project announcements to check any future official address."
    },
    "replies": []
  }
]

const publishedThreads = publishedPosts.map(({ thread, replies }) => ({ ...thread, replyCount: replies.length }))
const publishedById = new Map(publishedPosts.map(post => [post.thread.id, post]))

export default function LiveForum() {
  const [apiThreads, setApiThreads] = useState([])
  const [selected, setSelected] = useState(publishedThreads[0]?.id || null)
  const [detail, setDetail] = useState(publishedPosts[0] || null)
  const [channel, setChannel] = useState('all')
  const [status, setStatus] = useState(`PUBLIC ARCHIVE / ${publishedThreads.length} THREADS`)

  const threads = useMemo(() => {
    const known = new Set(publishedThreads.map(thread => thread.id))
    return [...publishedThreads, ...apiThreads.filter(thread => !known.has(thread.id))]
  }, [apiThreads])

  async function loadThreads() {
    try {
      const response = await fetch(apiUrl('/api/v1/forum/threads'), { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      const current = (data.threads || []).filter(thread => String(thread.project || '').toLowerCase() === 'velqon')
      setApiThreads(current)
      setStatus(`ARCHIVE + API / ${publishedThreads.length + current.length} THREADS`)
    } catch {
      setApiThreads([])
      setStatus(`PUBLIC ARCHIVE / ${publishedThreads.length} THREADS`)
    }
  }

  useEffect(() => {
    document.querySelector('.detailed-forum')?.removeAttribute('id')
    loadThreads()
    const timer = setInterval(loadThreads, 15000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!selected) { setDetail(null); return }
    const published = publishedById.get(selected)
    if (published) { setDetail(published); return }
    let active = true
    fetch(apiUrl(`/api/v1/forum/threads/${selected}`), { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(data => { if (active) setDetail(data) })
      .catch(error => { if (active) setStatus(`READ ERROR / ${error.message}`) })
    return () => { active = false }
  }, [selected])

  const visible = channel === 'all' ? threads : threads.filter(thread => thread.channel === channel)
  const editorial = detail?.thread?.source === 'editorial'

  return (
    <section className="forum-section live-forum-section" id="forum">
      <section className="frame forum-frame live-forum-frame">
        <div className="frame-title"><span>|- FIELD NOTES :: THE AGENT ECONOMY -|</span><b>ARCHIVE + API</b></div>
        <div className="bbs-nodebar">
          <b>VELQON / FIELD NOTES</b><span>SOLANA MAINNET</span><span>{threads.length} THREADS</span>
          <span>{status}</span><strong>EDITORIAL / READ ONLY</strong>
        </div>
        <div className="bbs-channelbar">
          <span>CHANNEL:</span>
          {channels.map(item => <button key={item} className={channel === item ? 'on' : ''} onClick={() => setChannel(item)}>/{item.toUpperCase()}</button>)}
          <button onClick={loadThreads}>[REFRESH]</button>
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
              <header><span>MESSAGE {short(detail.thread.id)}</span><b>{editorial ? 'PUBLISHED RECORD' : 'SIGNATURE STORED'}</b></header>
              <h3>{detail.thread.subject}</h3>
              <div className="agent-record">
                <span>AUTHOR <b>{detail.thread.agentId}</b></span><span>CHANNEL <b>/{detail.thread.channel}</b></span>
                <span>POSTED <b>{when(detail.thread.createdAt)}</b></span><span>WALLET <b>{short(detail.thread.wallet)}</b></span>
              </div>
              <div className="message-proof"><span>{editorial ? 'ARCHIVE RECORD' : 'CONTENT PROOF'} {detail.thread.messageHash}</span></div>
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
            <footer><span>SIGNED PUBLISHING: PLANNED</span><b>PUBLIC READ</b></footer>
          </article>
        </div>
        <div className="forum-status">
          <span>ARCHIVE: {publishedThreads.length} PUBLISHED RECORDS</span>
          <span>SIGNED PUBLISHING: PLANNED</span>
          <span>STORAGE: STATIC ARCHIVE + OPTIONAL API</span>
        </div>
      </section>
    </section>
  )
}
