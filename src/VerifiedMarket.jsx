import { useEffect, useMemo, useState } from 'react'
import { connection, EXPLORER_URL, PROGRAM_ID } from './pumpfun'

const short = value => value ? `${value.slice(0, 8)}...${value.slice(-6)}` : 'N/A'
const official = {
  id: 'velqon', token: 'VELQON', ticker: 'VELQON', type: 'OFFICIAL PROJECT TOKEN',
  status: 'CA PENDING', agent: 'VELQON NETWORK', network: 'SOLANA MAINNET-BETA',
  contract: '', curve: '', txHash: '', pairLabel: 'SOL',
  description: 'The official VELQON token mint has not been published. No address should be treated as official until it appears here.',
  proof: 'AWAITING OFFICIAL TOKEN MINT',
}


const testTokens = [
  {
    id: 'test-1', token: 'TEST 1', ticker: 'TEST', type: 'PUMP.FUN TEST TOKEN',
    status: 'LEGACY TEST', agent: 'VELQON TEST', network: 'SOLANA MAINNET-BETA',
    contract: 'AqXqcSX2yLNHsUEp932XZR443Uk8KJWkKYYQeNhRpump',
    curve: '8DrLzN6U3WGLCgRWAquNsbuRaWhb8ovZhcM5eL57P2o3', txHash: '', pairLabel: 'SOL',
    description: 'Imported development token from the previous build. This is not the official VELQON token. Inspect the linked mint independently.',
    proof: 'IMPORTED TEST RECORD',
  },
  {
    id: 'test-2', token: 'TEST 2', ticker: 'TEST', type: 'PUMP.FUN TEST TOKEN',
    status: 'LEGACY TEST', agent: 'VELQON TEST', network: 'SOLANA MAINNET-BETA',
    contract: 'F7HRNAN1KPLuYAT1Y2ChdyAsjFw3Gz7sGexhxt3Ppump',
    curve: '2a28PSokNMjzx7rpiDbXguEerZXVzKWPuhBKyxUuPckC', txHash: '', pairLabel: 'SOL',
    description: 'Imported development token from the previous build. This is not the official VELQON token. Inspect the linked mint independently.',
    proof: 'IMPORTED TEST RECORD',
  },
]

function loadLaunches() {
  try { return JSON.parse((localStorage.getItem('velqon-solana-launches') || localStorage.getItem('wallemo-solana-launches')) || '[]') } catch { return [] }
}

function Pane({ title, meta, className, children }) {
  return <section className={'frame ' + className}><div className="frame-title"><span>|- {title} -|</span><b>{meta}</b></div>{children}</section>
}

export default function VerifiedMarket() {
  const [launches, setLaunches] = useState([])
  const [sync, setSync] = useState('SYNCING')
  const [selectedId, setSelectedId] = useState('velqon')

  async function refresh() {
    const stored = loadLaunches()
    if (!stored.length) { setLaunches([]); setSync('SOLANA READY'); return }
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
  }, [])

  const records = useMemo(() => [official, ...launches.map(item => ({
    id: item.id || item.hash,
    token: item.name || 'UNNAMED',
    ticker: item.symbol || 'N/A',
    type: 'PUMP.FUN CREATE_V2',
    status: item.status || 'CONFIRMED',
    agent: short(item.creator),
    network: 'SOLANA MAINNET-BETA',
    contract: item.token,
    curve: item.curve,
    pairLabel: 'SOL',
    txHash: item.hash,
    description: `Created through the Pump program using metadata ${item.metadataUri || 'not recorded'}.`,
    proof: 'SOLANA PUMP TRANSACTION',
  })), ...testTokens], [launches])
  const selected = records.find(item => item.id === selectedId) || records[0]

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
      {selected.txHash ? <a className="verified-action" href={`${EXPLORER_URL}/tx/${selected.txHash}`} target="_blank" rel="noreferrer">[OPEN SOLANA TRANSACTION]</a> : <button className="execute" disabled>{selected.id === 'velqon' ? '[AWAITING OFFICIAL MINT]' : '[TEST TOKEN VERIFIED]'}</button>}
    </Pane>

    <Pane title="TOKEN REGISTRY :: SOLANA" meta={`${launches.length} PUMP LAUNCH${launches.length === 1 ? '' : 'ES'} / 2 LEGACY TESTS / OFFICIAL CA PENDING`} className="list-pane token-list verified-registry">
      <div className="market-controls"><span>DATA SOURCE:</span><button className="on">[SOLANA RPC]</button><button onClick={refresh}>[REFRESH]</button><b>{sync}</b></div>
      <div className="verified-table-head"><span>TOKEN</span><span>RECORD</span><span>STATUS</span><span>MINT</span></div>
      <div className="verified-agent-list">{records.map(record => <button key={record.id} className={(selected.id === record.id ? 'selected ' : '') + (record.id === 'velqon' ? 'official-token-row' : '')} onClick={() => setSelectedId(record.id)}><b>{'$' + record.ticker}</b><span>{record.token}{record.id === 'velqon' && <em>OFFICIAL</em>}</span><span>{record.status}</span><span>{record.contract ? short(record.contract) : 'PENDING'}</span></button>)}</div>
      <div className="market-summary verified-summary"><span>LOCAL PUMP RECORDS <b>{String(launches.length).padStart(2, '0')}</b></span><span>$VELQON OFFICIAL MINT <b>PENDING</b></span><span>TEST TOKENS <b>02 IMPORTED</b></span><span>SYNC STATE <b>{sync}</b></span></div>
      <div className="pane-foot">LEGACY TEST RECORDS / OFFICIAL $VELQON MINT NOT ANNOUNCED</div>
    </Pane>

    <Pane title="PROJECT :: VELQON" meta={sync} className="project-pane velqon-profile velqon-plain verified-project">
      <div className="velqon-scroll">
        <div className="project-title"><div className="token-glyph">WA</div><div><h2>VELQON</h2><p>THE LAUNCH LAYER FOR THE AGENT ECONOMY</p><span className="signal">BUILDER PREVIEW / SOLANA</span></div></div>
        <div className="velqon-token-card">
          <div className="velqon-token-card-head"><b>$VELQON TOKEN</b><span>CA PENDING</span></div>
          <div className="velqon-token-ca"><span>OFFICIAL TOKEN MINT</span><strong>TO BE ANNOUNCED</strong></div>
          <div className="velqon-token-links"><a href="https://ghostxrun.github.io/WALLEMO-/" target="_blank" rel="noreferrer">[OFFICIAL SITE]</a></div>
          <p>No official VELQON mint has been published. Wait for the real address to appear here and through the official VELQON channel.</p>
        </div>
        <div className="velqon-lead">From a private idea to a public onchain record. VELQON gives agent builders a wallet-controlled launch path, inspectable transactions and a place to share what comes next.</div>
        <div className="velqon-summary"><b>LIVE SYSTEM STATE</b><span>RPC: {sync}</span><span>PROGRAM: {short(PROGRAM_ID)}</span><span>PUMP CREATE: WALLET APPROVAL</span><span>QUOTE: SOL</span><span>LOCAL LAUNCHES: {launches.length}</span><span>LEGACY TEST RECORDS: 2</span></div>
        <Section title="01 / A PUBLIC BEGINNING"><p>Agents are moving from answering questions to participating in markets. VELQON starts at the first public step: a token launch that its builder can inspect and approve.</p></Section>
        <Section title="02 / OWN THE LAUNCH"><p>Connect a Solana wallet, prepare your token metadata and review the launch. Your wallet signs; the browser simulates and submits the transaction through the Pump program.</p></Section>
        <Section title="03 / LEAVE A TRACE"><p>Confirmed launches from this browser appear in the Registry with mint and transaction links. A public record makes a launch inspectable; it does not certify the agent behind it.</p></Section>
        <Section title="NEXT / AGENT COORDINATION"><p>Signed agent publishing, richer public profiles and agent-to-agent commerce are directions we are exploring. They are not enabled in this preview.</p></Section>
        <div className="project-section final-note"><b>OFFICIAL IDENTIFIERS</b><p>Network: Solana mainnet-beta. Pump program: {PROGRAM_ID}. $VELQON mint: PENDING PUBLICATION.</p><p><a href="https://ghostxrun.github.io/WALLEMO-/" target="_blank" rel="noreferrer">[OFFICIAL SITE]</a> <a href="#thesis">[READ THE THESIS]</a> <a href="https://pump.fun" target="_blank" rel="noreferrer">[PUMP.FUN]</a></p></div>
      </div>
    </Pane>
  </main>
}

function Section({ title, children }) { return <div className="project-section"><b>{title}</b>{children}</div> }
