import { useEffect, useMemo, useState } from 'react'
import { connection, EXPLORER_URL, PROGRAM_ID, loadLocalLaunches } from './pumpfun'
import { apiRequest } from './api'
import { usePlatform } from './PlatformContext'
import { signedRequest } from './signed-api'
import { links } from './config'
import { OFFICIAL_MINT } from './project'

const short = value => value ? `${value.slice(0, 8)}...${value.slice(-6)}` : 'N/A'
const official = {
  id: 'velqon', token: 'VELQON', ticker: 'VELQON', type: 'OFFICIAL PROJECT TOKEN',
  status: 'CA ANNOUNCED', agent: 'VELQON NETWORK', network: 'SOLANA MAINNET-BETA',
  contract: OFFICIAL_MINT, curve: '', txHash: '', pairLabel: 'SOL',
  description: 'The project-published VELQON token address is listed below. View the mint on Solscan or pump.fun.',
  proof: 'PROJECT-PUBLISHED ADDRESS',
}


function Pane({ title, meta, className, children }) {
  return <section className={'frame ' + className}><div className="frame-title"><span>|- {title} -|</span><b>{meta}</b></div>{children}</section>
}

export default function VerifiedMarket({session,onConnect}) {
  const platform = usePlatform()
  const [publicLaunches,setPublicLaunches]=useState([])
  const [publishing,setPublishing]=useState(false)
  const [publicationMessage,setPublicationMessage]=useState('')
  const [launches, setLaunches] = useState([])
  const [sync, setSync] = useState('SYNCING')
  const [selectedId, setSelectedId] = useState('velqon')

  async function refresh() {
    if(platform.connected)try{const data=await apiRequest('/api/v1/launches');setPublicLaunches(data.launches||[])}catch{setPublicLaunches([])}
    const stored = loadLocalLaunches()
    if (!stored.length) { setLaunches([]); setSync(platform.connected?'REGISTRY CONNECTED':'LOCAL REGISTRY'); return }
    setSync('VERIFYING')
    try {
      const result = await connection.getSignatureStatuses(stored.map(item => item.hash), { searchTransactionHistory: true })
      setLaunches(stored.map((item, index) => ({
        ...item,
        status: result.value[index]?.err ? 'FAILED' : (result.value[index]?.confirmationStatus || 'NOT FOUND').toUpperCase(),
      })))
      setSync('SOLANA VERIFIED')
    } catch {
      setLaunches(stored.map(item => ({ ...item, status: 'LOCAL RECORD' })))
      setSync('RPC OFFLINE')
    }
  }

  useEffect(() => {
    refresh()
    const update = () => refresh()
    addEventListener('velqon:launch', update)
    return () => removeEventListener('velqon:launch', update)
  }, [platform.connected])

  const combined = useMemo(()=>{const entries=new Map(launches.map(item=>[item.hash,item]));for(const item of publicLaunches)entries.set(item.hash,item);return [...entries.values()]},[launches,publicLaunches])
  const records = useMemo(() => [official, ...combined.map(item => ({
    id: item.id || item.hash,
    token: item.name || 'UNNAMED',
    ticker: item.symbol || 'N/A',
    type: item.source==='server-verified'?'SERVER-VERIFIED PUMP LAUNCH':'LOCAL BROWSER RECORD',
    status: item.status || 'SUBMITTED',
    agent: short(item.creator),
    network: 'SOLANA MAINNET-BETA',
    contract: item.token,
    curve: item.curve,
    pairLabel: 'SOL',
    txHash: item.hash,
    description: `Created through the Pump program using metadata ${item.metadataUri || 'not recorded'}.`,
    proof: item.source==='server-verified'?'PUMP CREATE_V2 CHECKED BY SERVER':'LOCAL RECORD / INSPECT TRANSACTION',
    public: item.source==='server-verified',
  }))], [combined])
  const selected = records.find(item => item.id === selectedId) || records[0]
  async function publishSelected(){setPublishing(true);setPublicationMessage('');try{await signedRequest(session,'launch',{hash:selected.txHash,token:selected.contract},'/api/v1/launches');await refresh();setPublicationMessage('Published to the public Registry.')}catch(error){setPublicationMessage(error.message)}finally{setPublishing(false)}}

  return <main className="main-panes verified-market">
    <Pane title={'INSPECT :: $' + selected.ticker} meta={selected.status} className="inspect-pane project-inspect verified-inspect">
      <div className="project-title"><div className={'token-glyph ' + (selected.id === 'velqon' ? 'official-velqon-logo' : '')}>{selected.id === 'velqon' ? '' : '$'}</div><div><h2>{selected.token}</h2><p>{selected.agent}</p><span className="signal">{selected.type}</span></div></div>
      <p className="description">{selected.description}</p>
      <dl>
        <dt>CLASSIFICATION</dt><dd>{selected.type}</dd><dt>NETWORK</dt><dd>{selected.network}</dd>
        <dt>TOKEN MINT</dt><dd>{selected.contract || 'NOT PUBLISHED'}</dd>
        <dt>BONDING CURVE</dt><dd>{selected.curve ? short(selected.curve) : 'NOT AVAILABLE'}</dd>
        <dt>QUOTE ASSET</dt><dd>{selected.pairLabel}</dd>
        <dt>PRICE</dt><dd>NOT INDEXED</dd><dt>HOLDERS</dt><dd>NOT INDEXED</dd>
        <dt>ONCHAIN PROOF</dt><dd>{selected.proof}</dd>
      </dl>
      {selected.contract && <a className="verified-action" href={`${EXPLORER_URL}/token/${selected.contract}`} target="_blank" rel="noreferrer">[OPEN TOKEN ON SOLSCAN]</a>}
      {selected.contract && <a className="verified-action" href={`https://pump.fun/coin/${selected.contract}`} target="_blank" rel="noreferrer">[OPEN ON PUMP.FUN]</a>}
      {selected.txHash ? <a className="verified-action" href={`${EXPLORER_URL}/tx/${selected.txHash}`} target="_blank" rel="noreferrer">[OPEN SOLANA TRANSACTION]</a> : !selected.contract&&<button className="execute" disabled>[TRANSACTION NOT AVAILABLE]</button>}
      {selected.txHash&&!selected.public&&platform.connected&&<button className="verified-action" disabled={publishing||['FAILED','NOT FOUND'].includes(selected.status)} onClick={session?publishSelected:onConnect}>{publishing?'VERIFYING…':session?'SIGN & PUBLISH RECORD':'CONNECT TO PUBLISH'}</button>}
      {publicationMessage&&<p className="registry-notice" role="status">{publicationMessage}</p>}
    </Pane>

    <Pane title="TOKEN REGISTRY :: SOLANA" meta={`${publicLaunches.length} PUBLIC / ${launches.length} LOCAL / CA ANNOUNCED`} className="list-pane token-list verified-registry">
      <div className="market-controls"><span>DATA SOURCE:</span><button className="on">[SOLANA RPC]</button><button onClick={refresh}>[REFRESH]</button><b>{sync}</b></div>
      <div className="verified-table-head"><span>TOKEN</span><span>RECORD</span><span>STATUS</span><span>MINT</span></div>
      <div className="verified-agent-list">{records.map(record => <button key={record.id} className={(selected.id === record.id ? 'selected ' : '') + (record.id === 'velqon' ? 'official-token-row' : '')} onClick={() => setSelectedId(record.id)}><b>{'$' + record.ticker}</b><span>{record.token}{record.id === 'velqon' && <em>OFFICIAL</em>}</span><span>{record.status}</span><span>{record.contract ? short(record.contract) : 'PENDING'}</span></button>)}</div>
      <div className="market-summary verified-summary"><span>LOCAL RECORDS <b>{String(launches.length).padStart(2, '0')}</b></span><span>$VELQON OFFICIAL MINT <b>ANNOUNCED</b></span><span>PUBLIC VERIFIED <b>{publicLaunches.length}</b></span><span>SYNC STATE <b>{sync}</b></span></div>
      <div className="pane-foot">{platform.connected?'PUBLIC REGISTRY CONNECTED':'PUBLIC REGISTRY: BACKEND CONNECTION PENDING'} / VELQON CA ANNOUNCED</div>
    </Pane>

    <Pane title="PROJECT :: VELQON" meta={sync} className="project-pane velqon-profile velqon-plain verified-project">
      <div className="velqon-scroll">
        <div className="project-title"><div className="token-glyph">WA</div><div><h2>VELQON</h2><p>THE LAUNCH LAYER FOR THE AGENT ECONOMY</p><span className="signal">BUILDER PREVIEW / SOLANA</span></div></div>
        <div className="velqon-token-card">
          <div className="velqon-token-card-head"><b>$VELQON TOKEN</b><span>CA ANNOUNCED</span></div>
          <div className="velqon-token-ca"><span>OFFICIAL TOKEN MINT</span><strong translate="no">{OFFICIAL_MINT}</strong></div>
          <div className="velqon-token-links"><a href={links.website||import.meta.env.BASE_URL}>[PROJECT HOME]</a><a href={`${EXPLORER_URL}/token/${OFFICIAL_MINT}`} target="_blank" rel="noreferrer">[SOLSCAN]</a><a href={`https://pump.fun/coin/${OFFICIAL_MINT}`} target="_blank" rel="noreferrer">[PUMP.FUN]</a></div>
          <p>The official project address is published above. Use the full address when checking the token.</p>
        </div>
        <div className="velqon-lead">From a private idea to a public onchain record. VELQON gives agent builders a wallet-controlled launch path, inspectable transactions and a place to share what comes next.</div>
        <div className="velqon-summary"><b>LIVE SYSTEM STATE</b><span>REGISTRY: {sync}</span><span>PROGRAM: {short(PROGRAM_ID)}</span><span>PUMP CREATE: WALLET APPROVAL</span><span>QUOTE: SOL</span><span>LOCAL LAUNCHES: {launches.length}</span><span>PUBLIC LAUNCHES: {publicLaunches.length}</span></div>
        <Section title="01 / A PUBLIC BEGINNING"><p>Agents are moving from answering questions to participating in markets. VELQON starts at the first public step: a token launch that its builder can inspect and approve.</p></Section>
        <Section title="02 / OWN THE LAUNCH"><p>Connect a Solana wallet, prepare your token metadata and review the launch. Your wallet signs; the browser simulates and submits the transaction through the Pump program.</p></Section>
        <Section title="03 / LEAVE A TRACE"><p>Keep local transaction records and publish confirmed launches to the public Registry with a second wallet signature. The backend checks the mainnet transaction, Pump instruction, mint and creator before accepting a public record.</p></Section>
        <Section title="NEXT / AGENT COORDINATION"><p>{platform.connected?'Wallet-verified profiles and signed field notes are available below.':'Profiles and signed field notes require the community backend connection.'} Agent-to-agent payments and autonomous trading remain research directions.</p></Section>
        <div className="project-section final-note"><b>OFFICIAL IDENTIFIERS</b><p>Network: Solana mainnet-beta. Pump program: {PROGRAM_ID}. $VELQON mint: <span translate="no">{OFFICIAL_MINT}</span>.</p><p><a href={links.website||import.meta.env.BASE_URL}>[PROJECT HOME]</a> <a href="#thesis">[READ THE THESIS]</a> <a href="https://pump.fun" target="_blank" rel="noreferrer">[PUMP.FUN]</a></p></div>
      </div>
    </Pane>
  </main>
}

function Section({ title, children }) { return <div className="project-section"><b>{title}</b>{children}</div> }
