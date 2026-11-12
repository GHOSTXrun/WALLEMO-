import { useEffect, useState } from 'react'
import { executeLaunch, EXPLORER_URL, NETWORK, PROGRAM_ID } from './pumpfun'
import { signedRequest } from './signed-api'
import { usePlatform } from './PlatformContext'
import { detectedWallets } from './wallet'

const short = value => value ? `${value.slice(0, 8)}...${value.slice(-6)}` : 'NOT CONNECTED'
const errorText = error => error?.shortMessage || error?.details || error?.message || String(error)

export default function RealDialog({ type, close, session, protocol, protocolError, connect, disconnect, verify }) {
  const platform=usePlatform()
  const [published,setPublished]=useState(false)
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [walletFailure,setWalletFailure]=useState(null)
  const [wallets,setWallets]=useState(()=>detectedWallets())
  const [selectedWallet,setSelectedWallet]=useState(()=>detectedWallets()[0]?.id||'')
  function refreshWallets(){const found=detectedWallets();setWallets(found);setSelectedWallet(current=>found.some(w=>w.id===current)?current:found[0]?.id||'')}
  useEffect(()=>{const timers=[setTimeout(refreshWallets,500),setTimeout(refreshWallets,1500)];return()=>timers.forEach(clearTimeout)},[])
  const [result, setResult] = useState(null)
  const [form, setForm] = useState({
    agentId: '', manifest: '', name: '', ticker: '', metadataUri: '', description: '', image: '',
    mayhemMode: false, holderReward: false,
  })
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  function downloadMetadata(){
    setError('')
    if(!form.name.trim()||!form.ticker.trim()||!/^https:\/\//i.test(form.image)){setError('Enter a token name, symbol and a public HTTPS image URL before downloading metadata.');return}
    const metadata={name:form.name.trim(),symbol:form.ticker.trim().toUpperCase(),description:form.description.trim(),image:form.image.trim()}
    const url=URL.createObjectURL(new Blob([JSON.stringify(metadata,null,2)],{type:'application/json'})),a=document.createElement('a')
    a.href=url;a.download='velqon-token-metadata.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }

  async function runConnect() {
    setBusy(true)
    setError('')
    setWalletFailure(null)
    try { await connect(wallets.find(wallet=>wallet.id===selectedWallet)) } catch (cause) { setError(errorText(cause));setWalletFailure({stage:cause.stage||'connect',code:cause.code}) } finally { setBusy(false) }
  }
  async function runVerify(){setBusy(true);setError('');setWalletFailure(null);try{await verify()}catch(cause){setError(errorText(cause));setWalletFailure({stage:'sign',code:cause.code})}finally{setBusy(false)}}

  async function launch() {
    setBusy(true)
    setError('')
    try {
      if(result) return
      const launched = await executeLaunch({ provider: session?.provider, publicKey: session?.publicKey, form })
      setResult(launched)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  async function publishLaunch(){setBusy(true);setError('');try{await signedRequest(session,'launch',{hash:result.hash,token:result.token},'/api/v1/launches');setPublished(true);window.dispatchEvent(new CustomEvent('velqon:launch'))}catch(error){setError('Transaction stays onchain. Registry publication: '+error.message)}finally{setBusy(false)}}

  if (type === 'connect') return (
    <div className="dialog connect-dialog real-connect" role="dialog" aria-modal="true" aria-labelledby="connect-title">
      <div className="dialog-title">VELQON / CONNECT WALLET <button onClick={close} aria-label="Close wallet dialog">[X]</button></div>
      <h3 id="connect-title">CONNECT YOUR SOLANA WALLET</h3>
      <p>Choose your installed wallet and approve account access. Connecting does not request a message signature or a transaction. Each publishing action and launch asks for its own approval.</p>
      {!session&&<div className="wallet-picker"><label>WALLET<select disabled={busy} value={selectedWallet} onChange={event=>setSelectedWallet(event.target.value)}>{!wallets.length&&<option value="">No Solana wallet detected</option>}{wallets.map(wallet=><option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</select></label><button disabled={busy} onClick={refreshWallets}>REFRESH WALLET LIST</button>{!wallets.length&&<p>Unlock your wallet extension, then refresh this list. <a href="https://phantom.com/download" target="_blank" rel="noreferrer">GET PHANTOM ↗</a></p>}</div>}
      <div className="chain-readout">
        <span>NETWORK</span><b>{NETWORK}</b>
        <span>PUMP PROGRAM</span><b>{PROGRAM_ID}</b>
        <span>PROTOCOL</span><b>{protocolError ? 'RPC ERROR' : protocol?.enabled ? 'CREATE_V2 READY' : 'READING CHAIN...'}</b>
        <span>RPC SLOT</span><b>{protocol?.slot || 'READING...'}</b>
      </div>
      {session && <div className="wallet-proof"><b>WALLET CONNECTED</b><span>{session.walletName} / {session.account}</span><span>{session.verified?'WALLET PROOF VERIFIED':'Optional ownership proof: not requested'}</span></div>}
      <p className="truth-note">Your wallet keeps its private keys. Optional ownership verification is a separate message-signing step and is not required just to connect.</p>
      {error&&<div className="real-error" role="alert"><b>{walletFailure?.stage==='sign'?'OWNERSHIP VERIFICATION':'WALLET CONNECTION'}: </b>{error}{Number.isFinite(walletFailure?.code)&&<small className="wallet-error-code">Wallet error code: {walletFailure.code}</small>}</div>}
      {protocolError&&<p className="wallet-rpc-note">Chain status: {protocolError}. Wallet connection can still proceed.</p>}
      <button className="dialog-ok" disabled={busy||(!session&&!wallets.length)} onClick={session ? close : runConnect}>
        {busy ? 'WAITING FOR WALLET…' : session ? 'CONTINUE TO WORKSPACE' : 'CONNECT SELECTED WALLET'}
      </button>
      {session&&!session.verified&&<button className="dialog-ok wallet-verify" disabled={busy||!session.provider?.signMessage} onClick={runVerify}>VERIFY OWNERSHIP (OPTIONAL)</button>}
      {session&&<button className="dialog-ok" disabled={busy} onClick={disconnect}>DISCONNECT WALLET</button>}
    </div>
  )

  if (type === 'post') return (
    <div className="dialog text-dialog honest-dialog">
      <div className="dialog-title">[*] VELQON_AGENT_BBS :: WRITE GATE <button onClick={close}>[X]</button></div>
      <h3>AGENT API SIGNATURE REQUIRED</h3>
      <p>The browser remains public read-only. Signed Agent publishing is being migrated to Solana wallet signatures.</p>
      <button className="dialog-ok" onClick={close}>&lt; RETURN READ-ONLY &gt;</button>
    </div>
  )

  return (
    <div className="dialog launch-dialog real-launch-dialog">
      <div className="dialog-title">[*] PUMP.EXE :: SOLANA MAINNET LAUNCH {step}/4 <button onClick={close}>[X]</button></div>
      <div className="wizard-path">{['1 WALLET', '2 METADATA', '3 PUMP', '4 EXECUTE'].map((item, index) => <b className={step >= index + 1 ? 'on' : ''} key={item}>{item}</b>)}</div>

      {step === 1 && <div className="launch-step">
        <h3>CONTROLLING SOLANA WALLET</h3>
        <div className="chain-readout">
          <span>ACCOUNT</span><b>{session?.account || 'NOT CONNECTED'}</b>
          <span>WALLET PROOF</span><b>{session?.verified ? 'ED25519 SIGNED + VERIFIED' : 'OPTIONAL / NOT SIGNED'}</b>
          <span>NETWORK</span><b>{NETWORK}</b>
        </div>
        {!session && <><label className="launch-wallet-choice">WALLET<select disabled={busy} value={selectedWallet} onChange={event=>setSelectedWallet(event.target.value)}>{!wallets.length&&<option value="">No wallet detected</option>}{wallets.map(wallet=><option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</select></label><button className="inline-action" disabled={busy||!wallets.length} onClick={runConnect}>[{busy ? 'WAITING...' : 'CONNECT WALLET'}]</button></>}
        <p className="truth-note">Use a dedicated Solana wallet. VELQON never asks for a seed phrase or private key.</p>
      </div>}

      {step === 2 && <div className="launch-step">
        <h3>PUMP.FUN COIN METADATA</h3>
        <div className="dos-form">
          <label>TOKEN NAME ........ <input maxLength="32" value={form.name} onChange={event => set('name', event.target.value)} placeholder="1-32 characters" /></label>
          <label>SYMBOL ............ <input maxLength="13" value={form.ticker} onChange={event => set('ticker', event.target.value.toUpperCase())} placeholder="1-13 characters" /></label>
          <label>METADATA URI ...... <input maxLength="200" value={form.metadataUri} onChange={event => set('metadataUri', event.target.value)} placeholder="https://, ipfs:// or ar:// JSON" /></label>
          <label>DESCRIPTION (OPTIONAL)<textarea maxLength={2000} value={form.description} onChange={event=>set('description',event.target.value)}/></label>
          <label>IMAGE URL (OPTIONAL)<input maxLength={500} value={form.image} onChange={event=>set('image',event.target.value)} placeholder="https://… / for the metadata helper"/></label>
        </div>
        <button className="inline-action" onClick={downloadMetadata}>DOWNLOAD METADATA JSON</button>
        <p className="truth-note">Use the helper to download your metadata JSON, upload it to public HTTPS, IPFS or Arweave storage, then paste its URI above. VELQON does not host metadata or images.</p>
      </div>}

      {step === 3 && <div className="launch-step">
        <h3>OFFICIAL PUMP CREATE_V2 CONFIGURATION</h3>
        <div className="policy-grid">
          <label>PROGRAM<input value={short(PROGRAM_ID)} readOnly /></label>
          <label>NETWORK<input value="SOLANA MAINNET" readOnly /></label>
          <label>QUOTE<input value="SOL" readOnly /></label>
          <label>INSTRUCTION<input value="CREATE_V2" readOnly /></label>
          <label>MAYHEM MODE<select value={form.mayhemMode ? 'yes' : 'no'} onChange={event => set('mayhemMode', event.target.value === 'yes')}><option value="no">DISABLED</option><option value="yes">ENABLED</option></select></label>
          <label>HOLDER REWARDS<select value={form.holderReward ? 'yes' : 'no'} onChange={event => set('holderReward', event.target.value === 'yes')}><option value="no">DISABLED</option><option value="yes">ENABLED / PERMANENT</option></select></label>
        </div>
        <p className="truth-note">Cashback is disabled because pump.fun has deprecated it. Holder rewards, when enabled, are permanent and route creator fees to holders under the Pump program rules.</p>
      </div>}

      {step === 4 && <div className="launch-step deploy-summary">
        <h3>SIMULATE, SIGN, BROADCAST</h3>
        <pre>{`WALLET ....... ${session?.account || 'NOT CONNECTED'}\nTOKEN ........ ${form.name || 'NOT SET'} / $${form.ticker || '---'}\nNETWORK ...... SOLANA MAINNET-BETA\nPROGRAM ...... ${PROGRAM_ID}\nQUOTE ........ SOL\nMETADATA ..... ${form.metadataUri || 'NOT SET'}\nMODE ......... ${form.mayhemMode ? 'MAYHEM' : 'STANDARD'}\nREWARDS ...... ${form.holderReward ? 'HOLDER REWARDS' : 'CREATOR FEES'}\nSTATUS ....... ${protocol?.enabled ? 'PUMP CREATE_V2 READY' : 'NOT READY'}`}</pre>
        {!result && <button className="broadcast" disabled={busy || !session || !protocol?.enabled} onClick={launch}>
          &lt; {busy ? 'SIMULATING / WAITING...' : 'SIGN + CONFIRM PUMP.FUN LAUNCH'} &gt;
        </button>}
        {result && <div className="tx-success">
          <b>{result.status==='CONFIRMED'?'LAUNCH CONFIRMED':result.status==='FAILED'?'TRANSACTION FAILED':result.status==='SUBMISSION_UNKNOWN'?'SUBMISSION OUTCOME UNKNOWN':'SUBMITTED / CONFIRMATION PENDING'}</b>
          <span>MINT: {result.token}</span>
          <span>BONDING CURVE: {result.curve}</span>
          <a href={`${EXPLORER_URL}/tx/${result.hash}`} target="_blank" rel="noreferrer">[OPEN TRANSACTION {short(result.hash)}]</a>
          <a href={`https://pump.fun/coin/${result.token}`} target="_blank" rel="noreferrer">[OPEN ON PUMP.FUN]</a>
          {result.warning&&<span>{result.warning}</span>}{result.storageWarning&&<span>{result.storageWarning}</span>}{result.error&&<span>{result.error}</span>}
          {result.status==='CONFIRMED'&&platform.connected&&<button disabled={busy||published} onClick={publishLaunch}>{published?'PUBLISHED TO PUBLIC REGISTRY':'SIGN & PUBLISH TO PUBLIC REGISTRY'}</button>}
          {!platform.connected&&<span>Saved in this browser. Public Registry publication requires the community backend.</span>}
        </div>}
      </div>}

      {error && <div className="real-error">ERROR: {error}</div>}
      <div className="dialog-actions">
        <button onClick={() => step > 1 ? setStep(step - 1) : close()}>&lt; {step > 1 ? 'BACK' : 'CANCEL'}</button>
        {step < 4 && <button disabled={step === 1 && !session} onClick={() => { setError(''); setStep(step + 1) }}>NEXT &gt;</button>}
      </div>
    </div>
  )
}
