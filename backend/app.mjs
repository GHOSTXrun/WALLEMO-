import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { PublicKey } from '@solana/web3.js'
import nacl from 'tweetnacl'
import { CHANNELS, canonical, MAINNET_GENESIS, actionMessage } from '../src/domain.js'
import { publishedPosts } from '../src/editorial.js'
import { verifyLaunch } from './launch-verifier.mjs'

export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
const digest = value => createHash('sha256').update(value).digest('hex')
const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
const text = (value, name, max, required = true) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, `${name} must be ${required ? '1' : '0'}–${max} characters.`)
  return value.trim()
}
function walletKey(value) {
  try { const key = new PublicKey(value); if (typeof value !== 'string' || key.toBase58() !== value || !PublicKey.isOnCurve(key)) throw new Error(); return key } catch { fail(400, 'A valid Ed25519 wallet public key is required.') }
}
function payloadFor(action, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'A payload object is required.')
  if (action === 'profile') {
    const agentId = text(input.agentId, 'Agent handle', 32).toLowerCase()
    if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(agentId) || /^(velqon|admin|official|support|editorial|system)(?:$|[-_])/.test(agentId)) fail(400, 'Choose a non-reserved handle of 3–32 lowercase letters, numbers, dashes or underscores.')
    const manifest = text(input.manifest ?? '', 'Manifest', 300, false)
    if (manifest && !/^(https:\/\/|ipfs:\/\/|ar:\/\/)/i.test(manifest)) fail(400, 'Manifest must use HTTPS, IPFS or Arweave.')
    return { agentId, displayName: text(input.displayName, 'Display name', 80), bio: text(input.bio ?? '', 'Bio', 1000, false), manifest }
  }
  if (action === 'thread') {
    if (!CHANNELS.includes(input.channel)) fail(400, 'Unknown channel.')
    return { channel: input.channel, subject: text(input.subject, 'Subject', 160), body: text(input.body, 'Body', 8000) }
  }
  if (action === 'reply') return { threadId: text(input.threadId, 'Thread ID', 100), body: text(input.body, 'Body', 8000) }
  if (action === 'launch') return { hash: text(input.hash, 'Transaction signature', 90), token: text(input.token, 'Mint', 44) }
  if (action === 'delete-thread') return { threadId: text(input.threadId, 'Thread ID', 100) }
  fail(400, 'Unknown signed action.')
}
export function createRpc(urls) {
  return async (method, params = []) => {
    for (const endpoint of urls) {
      try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(12000) })
        const data = await response.json()
        if (!response.ok || data.error) throw new Error('RPC unavailable.')
        return data.result
      } catch { /* Try the next configured endpoint without exposing credentials. */ }
    }
    fail(502, 'Solana RPC is unavailable. Try again shortly.')
  }
}

export function createVelqonApp(options = {}) {
  const dbPath = options.dbPath || resolve('.velqon/data/velqon.sqlite')
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS bbs_threads (id TEXT PRIMARY KEY, channel TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, agent_id TEXT NOT NULL, wallet TEXT NOT NULL, message_hash TEXT NOT NULL, signature TEXT NOT NULL, created_at INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'signed');
    CREATE TABLE IF NOT EXISTS bbs_replies (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, body TEXT NOT NULL, agent_id TEXT NOT NULL, wallet TEXT NOT NULL, message_hash TEXT NOT NULL, signature TEXT NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(thread_id) REFERENCES bbs_threads(id));
    CREATE TABLE IF NOT EXISTS profiles (wallet TEXT PRIMARY KEY, agent_id TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, bio TEXT NOT NULL, manifest TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, wallet TEXT NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL, message TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS launches (hash TEXT PRIMARY KEY, wallet TEXT NOT NULL, record TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS replies_thread_idx ON bbs_replies(thread_id,created_at);
    CREATE INDEX IF NOT EXISTS challenges_wallet_idx ON challenges(wallet,expires_at);`)
  if (!db.prepare('PRAGMA table_info(bbs_threads)').all().some(c => c.name === 'source')) db.exec("ALTER TABLE bbs_threads ADD COLUMN source TEXT NOT NULL DEFAULT 'signed'")
  for (const table of ['bbs_threads','bbs_replies','profiles']) {
    if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name==='signed_message'))db.exec(`ALTER TABLE ${table} ADD COLUMN signed_message TEXT NOT NULL DEFAULT ''`)
  }
  if(!db.prepare('PRAGMA table_info(profiles)').all().some(c=>c.name==='signature'))db.exec("ALTER TABLE profiles ADD COLUMN signature TEXT NOT NULL DEFAULT ''")
  const seed = db.prepare('INSERT OR IGNORE INTO bbs_threads(id,channel,subject,body,agent_id,wallet,message_hash,signature,created_at,source) VALUES(?,?,?,?,?,?,?,?,?,?)')
  for (const { thread } of publishedPosts) seed.run(thread.id, thread.channel, thread.subject, thread.body, thread.agentId, thread.wallet, thread.messageHash, '', Date.parse(thread.createdAt), 'editorial')
  const rpc = options.rpc || createRpc([process.env.SOLANA_RPC_URL, 'https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'].filter(Boolean))
  const now = options.now || Date.now
  const origin = options.publicOrigin || process.env.VELQON_PUBLIC_ORIGIN || 'http://127.0.0.1:4188'
  const origins = new Set([new URL(origin).origin, ...(options.allowedOrigins || String(process.env.VELQON_ALLOWED_ORIGIN || 'https://ghostxrun.github.io,https://velqon.fun,https://www.velqon.fun').split(','))].map(s => s.trim()).filter(Boolean))
  if (origins.has('*')) throw new Error('Configure explicit allowed origins instead of a wildcard.')
  const dist = resolve(options.distRoot || 'dist'), limits = new Map()
  const thread = row => ({ id: row.id, threadId:row.thread_id, project: 'velqon', channel: row.channel, subject: row.subject, body: row.body, agentId: row.agent_id, wallet: row.wallet, messageHash: row.message_hash, signature: row.signature, signedMessage:row.signed_message, source: row.source || 'signed', createdAt: new Date(row.created_at).toISOString() })
  const profile = row => row && ({ wallet: row.wallet, agentId: row.agent_id, displayName: row.display_name, bio: row.bio, manifest: row.manifest, updatedAt: new Date(row.updated_at).toISOString(), proof: 'wallet-signature', signedMessage:row.signed_message,signature:row.signature,autonomous: false })
  const getProfile = wallet => db.prepare('SELECT * FROM profiles WHERE wallet=?').get(wallet)
  const getThread = id => db.prepare('SELECT * FROM bbs_threads WHERE id=?').get(id)
  const featureState = { signedPublishing: true, agentProfiles: true, publicRegistry: true, agentPayments: false, autonomousExecution: false }
  let healthCache = null, healthPending = null
  async function status() {
    if (healthCache && now() - healthCache.at < 15000) return healthCache.value
    if (healthPending) return healthPending
    healthPending = (async () => {
      let protocol
      try {
        const [genesis, account, slot] = await Promise.all([rpc('getGenesisHash'), rpc('getAccountInfo', [PUMP_PROGRAM, { encoding: 'base64', commitment: 'confirmed' }]), rpc('getSlot', [{ commitment: 'confirmed' }])])
        protocol = { launchEnabled: genesis === MAINNET_GENESIS && Boolean(account?.value?.executable), networkVerified: genesis === MAINNET_GENESIS, slot, instruction: 'create_v2', quoteAsset: 'SOL' }
      } catch { protocol = { launchEnabled: false, networkVerified: false, error: 'RPC unavailable', instruction: 'create_v2', quoteAsset: 'SOL' } }
      const value = { service: 'velqon-solana-gateway', version: '3.0.0', network: 'solana-mainnet-beta', pumpProgram: PUMP_PROGRAM, protocol, features: featureState }
      healthCache = { at: now(), value }; return value
    })()
    try { return await healthPending } finally { healthPending = null }
  }
  function json(req, res, code, value) {
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', vary: 'Origin' }
    if (origins.has(req.headers.origin)) headers['access-control-allow-origin'] = req.headers.origin
    headers['access-control-allow-methods'] = 'GET, POST, DELETE, OPTIONS'; headers['access-control-allow-headers'] = 'content-type'
    res.writeHead(code, headers); res.end(code === 204 || req.method === 'HEAD' ? undefined : JSON.stringify(value))
  }
  async function readBody(req, max = 24000) {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'Use application/json.')
    if (Number(req.headers['content-length']) > max) fail(413, 'Request is too large.')
    const chunks = []; let size = 0
    for await (const chunk of req) { size += chunk.length; if (size > max) fail(413, 'Request is too large.'); chunks.push(chunk) }
    try { const body = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error(); return body } catch { fail(400, 'A JSON object is required.') }
  }
  function rateLimit(req) {
    const ip = req.socket.remoteAddress || 'unknown', key = `${ip}:${req.method === 'GET' ? 'read' : 'write'}`
    if (limits.size > 10000) for (const [k,v] of limits) if (v.until < now()) limits.delete(k)
    const bucket = limits.get(key)
    if (!bucket || bucket.until < now()) { limits.set(key, { count: 1, until: now() + 60000 }); return }
    if (++bucket.count > (req.method === 'GET' ? 240 : 120)) fail(429, 'Too many requests. Try again in a minute.')
  }
  function authorize(body, action) {
    const challenge = db.prepare('SELECT * FROM challenges WHERE id=?').get(text(body.challengeId, 'Challenge ID', 64))
    if (!challenge || challenge.action !== action) fail(401, 'Signature challenge is missing or does not match this action.')
    if (challenge.used) fail(409, 'This challenge has already been used.')
    if (challenge.expires_at <= now()) fail(401, 'Signature challenge expired. Please sign again.')
    const payload = payloadFor(action, body.payload)
    if (canonical(payload) !== challenge.payload) fail(401, 'The signed content has changed. Please sign again.')
    if (typeof body.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(body.signature)) fail(401, 'A base64 Ed25519 signature is required.')
    const signature = Buffer.from(body.signature, 'base64')
    if (signature.length !== 64 || !nacl.sign.detached.verify(Buffer.from(challenge.message), signature, walletKey(challenge.wallet).toBytes())) fail(401, 'Wallet signature is invalid.')
    return { challenge, payload, wallet: challenge.wallet, signature: body.signature }
  }
  function commit(auth, write) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = db.prepare('UPDATE challenges SET used=1 WHERE id=? AND used=0 AND expires_at>?').run(auth.challenge.id, now())
      if (Number(result.changes) !== 1) fail(409, 'Challenge was used or expired.')
      const value = write(); db.exec('COMMIT'); return value
    } catch(error) { db.exec('ROLLBACK'); throw error }
  }
  async function api(req, res, path) {
    if (req.headers.origin && !origins.has(req.headers.origin)) fail(403, 'This frontend origin is not allowed.')
    if (req.method === 'OPTIONS') return json(req,res,204,{})
    rateLimit(req)
    if (req.method === 'GET') {
      if (path === '/api/v1/health') return json(req,res,200,{ok:true,service:'velqon',database:'ready'})
      if (path === '/api/v1/status') return json(req,res,200,await status())
      if (path === '/api/v1/config') return json(req,res,200,{project:'velqon',features:featureState,channels:CHANNELS,officialMint:null})
      if (path === '/api/v1/rules') return json(req,res,200,{version:'3.0.0',network:'solana-mainnet-beta',rules:['Wallet owners approve every onchain transaction.','Publishing requires a fresh signature bound to the exact content.','Agent profiles prove wallet control, not autonomy or intelligence.','Only server-checked Pump create_v2 launches enter the public Registry.','The official VELQON token mint has not been announced.']})
      if (path === '/api/v1/profiles') return json(req,res,200,{profiles:db.prepare('SELECT * FROM profiles ORDER BY updated_at DESC LIMIT 100').all().map(profile)})
      if (path.startsWith('/api/v1/profiles/')) { const row = getProfile(path.slice('/api/v1/profiles/'.length)); if(!row) fail(404,'Profile not found.'); return json(req,res,200,{profile:profile(row)}) }
      if (path === '/api/v1/launches') return json(req,res,200,{launches:db.prepare('SELECT record FROM launches ORDER BY created_at DESC LIMIT 100').all().map(row=>JSON.parse(row.record)),source:'server-verified'})
      if (path === '/api/v1/forum/threads') {
        const rows=db.prepare('SELECT t.*, COUNT(r.id) AS reply_count, MAX(COALESCE(r.created_at,t.created_at)) AS activity FROM bbs_threads t LEFT JOIN bbs_replies r ON r.thread_id=t.id GROUP BY t.id ORDER BY activity DESC LIMIT 100').all()
        return json(req,res,200,{threads:rows.map(row=>({...thread(row),replyCount:Number(row.reply_count)})),writeStatus:'enabled'})
      }
      const detail=path.match(/^\/api\/v1\/forum\/threads\/([^/]+)$/)
      if(detail) { const row=getThread(detail[1]);if(!row)fail(404,'Thread not found.');return json(req,res,200,{thread:thread(row),replies:db.prepare('SELECT * FROM bbs_replies WHERE thread_id=? ORDER BY created_at ASC LIMIT 500').all(row.id).map(thread)}) }
      fail(404,'API route not found.')
    }
    if(req.method==='POST' && path==='/api/v1/solana-rpc') {
      const body=await readBody(req,2*1024*1024)
      const allowed=new Set(['getGenesisHash','getAccountInfo','getSlot','getLatestBlockhash','simulateTransaction','sendTransaction','getSignatureStatuses','getBlockHeight','getTransaction','getBalance'])
      if(body.jsonrpc!=='2.0'||!allowed.has(body.method)||!Array.isArray(body.params??[]))fail(400,'RPC method or parameters are not allowed.')
      if(JSON.stringify(body.params??[]).length>1500000)fail(413,'RPC payload is too large.')
      return json(req,res,200,{jsonrpc:'2.0',id:typeof body.id==='number'||typeof body.id==='string'?body.id:null,result:await rpc(body.method,body.params??[])})
    }
    if(req.method==='POST' && path==='/api/v1/auth/challenge') {
      const body=await readBody(req);walletKey(body.wallet)
      const payload=payloadFor(body.action,body.payload), encoded=canonical(payload), id=randomUUID(), expires=now()+5*60000
      db.prepare('DELETE FROM challenges WHERE expires_at<?').run(now()-3600000)
      if(db.prepare('SELECT COUNT(*) AS count FROM challenges WHERE wallet=? AND used=0 AND expires_at>?').get(body.wallet,now()).count>=20)fail(429,'Too many pending wallet challenges.')
      const message=actionMessage({audience:origin,wallet:body.wallet,action:body.action,contentHash:digest(encoded),challengeId:id,expiresAt:new Date(expires).toISOString()})
      db.prepare('INSERT INTO challenges(id,wallet,action,payload,message,expires_at) VALUES(?,?,?,?,?,?)').run(id,body.wallet,body.action,encoded,message,expires)
      return json(req,res,201,{challengeId:id,message,payload,expiresAt:new Date(expires).toISOString(),action:body.action,wallet:body.wallet,audience:origin})
    }
    const action=path==='/api/v1/profiles'?'profile':path==='/api/v1/launches'?'launch':path==='/api/v1/forum/threads'?'thread':/^\/api\/v1\/forum\/threads\/[^/]+\/replies$/.test(path)?'reply':req.method==='DELETE'&&/^\/api\/v1\/forum\/threads\/[^/]+$/.test(path)?'delete-thread':null
    if(!action||!['POST','DELETE'].includes(req.method)||(action!=='delete-thread'&&req.method!=='POST'))fail(405,'Method not allowed.')
    const auth=authorize(await readBody(req),action), {payload,wallet}=auth
    const agent=getProfile(wallet)?.agent_id || `wallet:${wallet.slice(0,8)}`
    let launch
    if(action==='launch') {
      try{launch=await verifyLaunch(rpc,payload,wallet)}catch(error){fail(error.status||422,error.message)}
    }
    const result=commit(auth,()=>{
      if(action==='profile') {
        const existing=getProfile(wallet), taken=db.prepare('SELECT wallet FROM profiles WHERE agent_id=?').get(payload.agentId)
        if(existing&&existing.agent_id!==payload.agentId)fail(409,'Your registered agent handle cannot be changed.')
        if(taken&&taken.wallet!==wallet)fail(409,'This agent handle is already registered.')
        db.prepare('INSERT INTO profiles(wallet,agent_id,display_name,bio,manifest,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(wallet) DO UPDATE SET display_name=excluded.display_name,bio=excluded.bio,manifest=excluded.manifest,updated_at=excluded.updated_at').run(wallet,payload.agentId,payload.displayName,payload.bio,payload.manifest,now())
        db.prepare('UPDATE profiles SET signed_message=?,signature=? WHERE wallet=?').run(auth.challenge.message,auth.signature,wallet)
        return {profile:profile(getProfile(wallet))}
      }
      if(action==='thread') {
        const id=randomUUID();db.prepare("INSERT INTO bbs_threads(id,channel,subject,body,agent_id,wallet,message_hash,signature,created_at,source,signed_message) VALUES(?,?,?,?,?,?,?,?,?,'signed',?)").run(id,payload.channel,payload.subject,payload.body,agent,wallet,digest(canonical(payload)),auth.signature,now(),auth.challenge.message);return {thread:thread(getThread(id))}
      }
      if(action==='reply') {
        if(path!==`/api/v1/forum/threads/${payload.threadId}/replies`||!getThread(payload.threadId))fail(404,'Thread not found.')
        const id=randomUUID();db.prepare('INSERT INTO bbs_replies(id,thread_id,body,agent_id,wallet,message_hash,signature,created_at,signed_message) VALUES(?,?,?,?,?,?,?,?,?)').run(id,payload.threadId,payload.body,agent,wallet,digest(canonical(payload)),auth.signature,now(),auth.challenge.message);return {reply:thread(db.prepare('SELECT * FROM bbs_replies WHERE id=?').get(id))}
      }
      if(action==='delete-thread') {
        const row=getThread(payload.threadId)
        if(path!==`/api/v1/forum/threads/${payload.threadId}`||!row)fail(404,'Thread not found.')
        if(row.wallet!==wallet||row.source==='editorial')fail(403,'Only the author can remove this thread.')
        db.prepare('DELETE FROM bbs_replies WHERE thread_id=?').run(row.id);db.prepare('DELETE FROM bbs_threads WHERE id=?').run(row.id);return {deleted:true}
      }
      db.prepare('INSERT OR IGNORE INTO launches(hash,wallet,record,created_at) VALUES(?,?,?,?)').run(launch.hash,wallet,JSON.stringify(launch),now());return {launch:JSON.parse(db.prepare('SELECT record FROM launches WHERE hash=?').get(launch.hash).record)}
    })
    json(req,res,action==='delete-thread'?200:201,result)
  }
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json'}
  const server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost'), path=decodeURIComponent(url.pathname)
      if(path.startsWith('/api/'))return await api(req,res,path)
      if(!['GET','HEAD'].includes(req.method))fail(405,'Method not allowed.')
      const file=resolve(dist,'.'+(path==='/'?'/index.html':path))
      if(!file.startsWith(dist+sep))fail(403,'Forbidden path.')
      if(!existsSync(file)||!statSync(file).isFile())fail(404,'File not found.')
      let data=readFileSync(file)
      if(path==='/velqon-config.js')data=Buffer.concat([data,Buffer.from('\nwindow.VELQON_CONFIG = {...(window.VELQON_CONFIG || {}), sameOriginApi: true};\n')])
      res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','content-length':data.length,'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','cache-control':path.includes('/assets/')?'public,max-age=31536000,immutable':'no-cache','content-security-policy':"default-src 'self'; connect-src 'self' https:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"})
      res.end(req.method==='HEAD'?undefined:data)
    }catch(error){if(!res.headersSent)json(req,res,error.status||500,{error:error.status?error.message:'Internal server error.'});else res.end()}
  })
  server.requestTimeout=20000;server.headersTimeout=10000
  return {server,db,close:()=>new Promise(resolveClose=>{server.close(()=>{db.close();resolveClose()});server.closeIdleConnections()})}
}
