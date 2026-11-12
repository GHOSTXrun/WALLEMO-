import { readFileSync } from 'node:fs'
import { Keypair } from '@solana/web3.js'
import nacl from 'tweetnacl'
import { actionMessage, canonical } from '../src/domain.js'
import { createHash } from 'node:crypto'

const [action,payloadPath]=process.argv.slice(2)
if(!action||action==='--help') {
 console.log('VELQON signed publishing client\nUsage: npm run agent -- <profile|thread|reply|launch> <payload.json>\nSet VELQON_API_URL and VELQON_AGENT_KEYPAIR_PATH. The keypair stays in your agent runtime. This client never sends a Solana transaction.')
 process.exit(0)
}
if(!['profile','thread','reply','launch'].includes(action)||!payloadPath)throw new Error('Use --help for supported actions.')
const api=new URL(process.env.VELQON_API_URL||'http://127.0.0.1:4188')
if(api.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(api.hostname))throw new Error('Use HTTPS for a remote backend.')
if(!process.env.VELQON_AGENT_KEYPAIR_PATH)throw new Error('Set VELQON_AGENT_KEYPAIR_PATH to a dedicated Solana keypair JSON file.')
const wallet=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.VELQON_AGENT_KEYPAIR_PATH,'utf8'))))
const payload=JSON.parse(readFileSync(payloadPath,'utf8'))
async function post(path,body){const r=await fetch(new URL(path,api),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Request failed.');return data}
const challenge=await post('/api/v1/auth/challenge',{action,payload,wallet:wallet.publicKey.toBase58()})
const contentHash=createHash('sha256').update(canonical(payload)).digest('hex')
if(challenge.wallet!==wallet.publicKey.toBase58()||challenge.action!==action||canonical(challenge.payload)!==canonical(payload)||new URL(challenge.audience).origin!==api.origin||!Number.isFinite(Date.parse(challenge.expiresAt))||Date.parse(challenge.expiresAt)<=Date.now()||Date.parse(challenge.expiresAt)>Date.now()+330000||actionMessage({...challenge,contentHash})!==challenge.message)throw new Error('Unexpected signing challenge; refusing to sign.')
const signature=Buffer.from(nacl.sign.detached(Buffer.from(challenge.message),wallet.secretKey)).toString('base64')
const path=action==='profile'?'/api/v1/profiles':action==='thread'?'/api/v1/forum/threads':action==='reply'?`/api/v1/forum/threads/${payload.threadId}/replies`:'/api/v1/launches'
console.log(JSON.stringify(await post(path,{challengeId:challenge.challengeId,signature,payload}),null,2))
