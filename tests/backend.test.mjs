import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import nacl from 'tweetnacl'
import { Keypair } from '@solana/web3.js'
import { PUMP_SDK, PUMP_PROGRAM_ID } from '@pump-fun/pump-sdk'
import { createVelqonApp } from '../backend/app.mjs'
import { MAINNET_GENESIS } from '../src/domain.js'

function base58(bytes){const a='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const b of bytes)n=n*256n+BigInt(b);let s='';while(n){s=a[Number(n%58n)]+s;n/=58n}for(const b of bytes){if(b)break;s='1'+s}return s}
async function fixture(t,{persistent=false,rpc}={}) {
 const directory=mkdtempSync(join(tmpdir(),'velqon-test-'));assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep))
 const dbPath=persistent?join(directory,'data.sqlite'):':memory:'
 let clock=Date.now()
 const app=createVelqonApp({dbPath,publicOrigin:'http://127.0.0.1',allowedOrigins:['https://ghostxrun.github.io'],now:()=>clock,rpc:rpc||(async()=>{throw new Error('offline')})})
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${app.server.address().port}`
 t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true})})
 const request=async(path,options={})=>{const r=await fetch(url+path,{...options,headers:{'content-type':'application/json',...options.headers}});return {status:r.status,data:r.status===204?{}:await r.json()}}
 const key=Keypair.generate()
 async function envelope(action,payload,wallet=key){const r=await request('/api/v1/auth/challenge',{method:'POST',body:JSON.stringify({action,payload,wallet:wallet.publicKey.toBase58()})});assert.equal(r.status,201,JSON.stringify(r.data));return {challengeId:r.data.challengeId,payload,signature:Buffer.from(nacl.sign.detached(Buffer.from(r.data.message),wallet.secretKey)).toString('base64')}}
 const post=(path,body,method='POST')=>request(path,{method,body:JSON.stringify(body)})
 return {...app,key,dbPath,request,envelope,post,advance:ms=>{clock+=ms}}
}

test('health and editorial content work during an RPC outage; status is degraded rather than throwing',async t=>{
 const f=await fixture(t);assert.equal((await f.request('/api/v1/health')).data.ok,true)
 const board=await f.request('/api/v1/forum/threads');assert.equal(board.data.threads.length,6);assert.equal(board.data.threads[0].project,'velqon')
 const status=await f.request('/api/v1/status');assert.equal(status.status,200);assert.equal(status.data.protocol.launchEnabled,false);assert.equal(status.data.features.autonomousExecution,false)
 assert.equal((await f.request('/api/v1/profiles')).data.profiles.length,0)
})
test('publishing verifies exact content, rejects wrong signatures and consumes a nonce only once',async t=>{
 const f=await fixture(t),payload={channel:'research',subject:'An agent idea',body:'An independently inspectable record.'}
 const signed=await f.envelope('thread',payload)
 assert.equal((await f.post('/api/v1/forum/threads',{...signed,payload:{...payload,body:'tampered'}})).status,401)
 assert.equal((await f.post('/api/v1/forum/threads',{...signed,signature:Buffer.alloc(64).toString('base64')})).status,401)
 const created=await f.post('/api/v1/forum/threads',signed);assert.equal(created.status,201);assert.equal(created.data.thread.wallet,f.key.publicKey.toBase58());assert.equal(created.data.thread.source,'signed')
 assert.ok(nacl.sign.detached.verify(Buffer.from(created.data.thread.signedMessage),Buffer.from(created.data.thread.signature,'base64'),f.key.publicKey.toBytes()))
 assert.equal((await f.post('/api/v1/forum/threads',signed)).status,409)
 const detail=await f.request('/api/v1/forum/threads/'+created.data.thread.id);assert.equal(detail.data.thread.body,payload.body)
})
test('expired, cross-action and disallowed-origin requests cannot publish',async t=>{
 const f=await fixture(t),payload={channel:'research',subject:'Subject',body:'Body'},signed=await f.envelope('thread',payload)
 assert.equal((await f.post('/api/v1/profiles',signed)).status,401)
 f.advance(300001);assert.equal((await f.post('/api/v1/forum/threads',signed)).status,401)
 assert.equal((await f.request('/api/v1/health',{headers:{origin:'https://attacker.example'}})).status,403)
 assert.equal((await f.post('/api/v1/auth/challenge',{wallet:f.key.publicKey.toBase58(),action:'thread',payload:{...payload,channel:'invalid'}})).status,400)
 assert.equal((await f.request('/api/v1/health',{method:'OPTIONS',headers:{origin:'https://ghostxrun.github.io'}})).status,204)
})
test('profiles have immutable unique handles; other wallets cannot impersonate an owner',async t=>{
 const f=await fixture(t),payload={agentId:'builder-one',displayName:'Builder One',bio:'An agent builder',manifest:'https://example.com/agent.json'}
 const signed=await f.envelope('profile',payload)
 const saved=await f.post('/api/v1/profiles',signed);assert.equal(saved.status,201);assert.equal(saved.data.profile.autonomous,false)
 const other=Keypair.generate();assert.equal((await f.post('/api/v1/profiles',await f.envelope('profile',payload,other))).status,409)
 assert.equal((await f.post('/api/v1/profiles',await f.envelope('profile',{...payload,agentId:'renamed'}))).status,409)
 assert.equal((await f.post('/api/v1/profiles',await f.envelope('profile',{...payload,bio:'Updated'}))).status,201)
 assert.equal((await f.request('/api/v1/profiles/'+f.key.publicKey.toBase58())).data.profile.bio,'Updated')
})
test('signed replies are bound to the target thread; owners alone can remove their own threads',async t=>{
 const f=await fixture(t),created=await f.post('/api/v1/forum/threads',await f.envelope('thread',{channel:'protocol',subject:'Protocol',body:'Hello'})),id=created.data.thread.id
 const reply=await f.envelope('reply',{threadId:id,body:'Signed reply'})
 assert.equal((await f.post('/api/v1/forum/threads/wrong/replies',reply)).status,404)
 assert.equal((await f.post(`/api/v1/forum/threads/${id}/replies`,reply)).status,201)
 assert.equal((await f.request('/api/v1/forum/threads/'+id)).data.replies.length,1)
 const other=Keypair.generate();assert.equal((await f.post('/api/v1/forum/threads/'+id,await f.envelope('delete-thread',{threadId:id},other),'DELETE')).status,403)
 assert.equal((await f.post('/api/v1/forum/threads/'+id,await f.envelope('delete-thread',{threadId:id}),'DELETE')).status,200)
 assert.equal((await f.request('/api/v1/forum/threads/'+id)).status,404)
})
test('posts and consumed challenges survive a process/database restart',async t=>{
 const f=await fixture(t,{persistent:true}), signed=await f.envelope('thread',{channel:'security',subject:'Persistent',body:'Keep this record'})
 const response=await f.post('/api/v1/forum/threads',signed);assert.equal(response.status,201)
 // A second application opens the same WAL database, as it would after restart.
 const second=createVelqonApp({dbPath:f.dbPath,publicOrigin:'http://127.0.0.1',rpc:async()=>null});await new Promise(r=>second.server.listen(0,'127.0.0.1',r))
 try{assert.equal(second.db.prepare('SELECT body FROM bbs_threads WHERE id=?').get(response.data.thread.id).body,'Keep this record');assert.equal(second.db.prepare('SELECT used FROM challenges WHERE id=?').get(signed.challengeId).used,1)}finally{await second.close()}
})
test('public registry checks mainnet, creator, mint, successful Pump instruction and onchain metadata',async t=>{
 const creator=Keypair.generate(),mint=Keypair.generate(),hash=base58(nacl.randomBytes(64))
 const ix=await PUMP_SDK.createV2Instruction({mint:mint.publicKey,user:creator.publicKey,creator:creator.publicKey,name:'Agent Launch',symbol:'AGNT',uri:'https://example.com/metadata.json',mayhemMode:false,cashback:false,holderReward:false})
 let genesis=MAINNET_GENESIS,tx={slot:123,blockTime:1700000000,meta:{err:null},transaction:{message:{accountKeys:[{pubkey:creator.publicKey.toBase58(),signer:true}],instructions:[{programId:PUMP_PROGRAM_ID.toBase58(),accounts:ix.keys.map(k=>k.pubkey.toBase58()),data:base58(ix.data)}]}}}
 const f=await fixture(t,{rpc:async method=>method==='getGenesisHash'?genesis:tx})
 const payload={hash,token:mint.publicKey.toBase58()}
 const result=await f.post('/api/v1/launches',await f.envelope('launch',payload,creator));assert.equal(result.status,201,JSON.stringify(result));assert.equal(result.data.launch.name,'Agent Launch');assert.equal(result.data.launch.source,'server-verified')
 genesis='devnet';assert.equal((await f.post('/api/v1/launches',await f.envelope('launch',payload,creator))).status,422)
 genesis=MAINNET_GENESIS;tx.meta.err={InstructionError:[0,'failed']};assert.equal((await f.post('/api/v1/launches',await f.envelope('launch',payload,creator))).status,422)
 tx.meta.err=null;assert.equal((await f.post('/api/v1/launches',await f.envelope('launch',{hash,token:Keypair.generate().publicKey.toBase58()},creator))).status,422)
 assert.equal((await f.request('/api/v1/launches')).data.launches.length,1)
})
test('RPC proxy is allowlisted and static missing scripts return a real 404',async t=>{
 const f=await fixture(t,{rpc:async()=>123})
 assert.equal((await f.post('/api/v1/solana-rpc',{jsonrpc:'2.0',id:1,method:'getSlot',params:[]})).data.result,123)
 assert.equal((await f.post('/api/v1/solana-rpc',{jsonrpc:'2.0',id:1,method:'requestAirdrop',params:[]})).status,400)
 assert.equal((await f.request('/missing-script.js')).status,404)
})
