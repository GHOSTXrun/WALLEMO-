// Local integration check. Uses an in-memory database, a generated test wallet and mocked chain reads.
import { chromium } from 'playwright-core'
import { Keypair } from '@solana/web3.js'
import nacl from 'tweetnacl'
import assert from 'node:assert/strict'
import { createVelqonApp } from '../backend/app.mjs'
import { MAINNET_GENESIS } from '../src/domain.js'

const app=createVelqonApp({dbPath:':memory:',publicOrigin:'https://velqon.test',rpc:async method=>{
 if(method==='getGenesisHash')return MAINNET_GENESIS
 if(method==='getSlot')return 123
 if(method==='getAccountInfo')return {context:{slot:123},value:{data:['','base64'],executable:true,lamports:1000000,owner:Keypair.generate().publicKey.toBase58(),rentEpoch:0}}
 throw new Error('Unexpected chain method in browser test: '+method)
}})
await new Promise(r=>app.server.listen(0,'127.0.0.1',r))
const local=`http://127.0.0.1:${app.server.address().port}`
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'/usr/bin/google-chrome'),headless:true,args:['--no-sandbox']})
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],key=Keypair.generate(),backpackKey=Keypair.generate()
 page.setDefaultTimeout(12000)
 page.on('pageerror',error=>errors.push(error.message))
 await page.exposeFunction('testSignMessage',message=>Array.from(nacl.sign.detached(Uint8Array.from(message),key.secretKey)))
 await page.exposeFunction('testBackpackSignMessage',message=>Array.from(nacl.sign.detached(Uint8Array.from(message),backpackKey.secretKey)))
 await page.addInitScript(({publicKey,bytes,backpackPublicKey,backpackBytes})=>{
  const key={toBase58:()=>publicKey,toBytes:()=>Uint8Array.from(bytes)}
  window.walletConnectCounts={phantom:0,backpack:0}
  window.phantom={solana:{isPhantom:true,publicKey:key,connect:async()=>{window.walletConnectCounts.phantom++;return {publicKey:key}},disconnect:async()=>{},signTransaction:async()=>{throw new Error('No real transactions in this test.')},signMessage:async message=>{if(window.rejectTestSignature)throw new Error('User rejected signature');return {signature:Uint8Array.from(await window.testSignMessage(Array.from(message)))}}}}
  const backpack={toBase58:()=>backpackPublicKey,toBytes:()=>Uint8Array.from(backpackBytes)}
  const backpackAccount={address:backpackPublicKey,publicKey:Uint8Array.from(backpackBytes),chains:['solana:mainnet'],features:['solana:signTransaction','solana:signMessage']}
  // Deliberately omit window.backpack: exercise modern Wallet Standard discovery.
  const backpackWallet={name:'Backpack',version:'1.0.0',chains:['solana:mainnet'],accounts:[],features:{'standard:connect':{version:'1.0.0',connect:async()=>{window.walletConnectCounts.backpack++;return {accounts:[backpackAccount]}}},'standard:disconnect':{version:'1.0.0',disconnect:async()=>{}},'standard:events':{version:'1.0.0',on:()=>()=>{}},'solana:signMessage':{version:'1.0.0',signMessage:async({message})=>[{signedMessage:message,signature:Uint8Array.from(await window.testBackpackSignMessage(Array.from(message)))}]},'solana:signTransaction':{version:'1.0.0',supportedTransactionVersions:['legacy',0],signTransaction:async()=>{throw new Error('No real transactions in this test.')}}}}
  window.addEventListener('wallet-standard:app-ready',event=>event.detail.register(backpackWallet))
 },{publicKey:key.publicKey.toBase58(),bytes:Array.from(key.publicKey.toBytes()),backpackPublicKey:backpackKey.publicKey.toBase58(),backpackBytes:Array.from(backpackKey.publicKey.toBytes())})
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url())
  if(url.hostname!=='velqon.test')return route.abort()
  const req=route.request(),response=await fetch(local+url.pathname+url.search,{method:req.method(),headers:{...req.headers(),origin:'https://velqon.test'},body:['GET','HEAD'].includes(req.method())?undefined:req.postDataBuffer()})
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
 })
 await page.goto('https://velqon.test/',{waitUntil:'networkidle'})
 await page.getByRole('button',{name:'CONNECT TO REGISTER'}).waitFor()
 await page.getByRole('button',{name:'CONNECT WALLET',exact:true}).click()
 await page.getByRole('dialog').screenshot({path:'velqon-complete-wallets.png'})
 await page.getByRole('button',{name:'Connect Backpack',exact:true}).click()
 await page.getByText('WALLET CONNECTED',{exact:true}).waitFor()
 assert.deepEqual(await page.evaluate(()=>window.walletConnectCounts),{phantom:0,backpack:1})
 await page.getByRole('button',{name:'VERIFY OWNERSHIP (OPTIONAL)',exact:true}).click()
 await page.getByRole('dialog').getByText('WALLET PROOF VERIFIED',{exact:true}).waitFor()
 await page.getByRole('button',{name:'DISCONNECT WALLET',exact:true}).click()
 await page.getByRole('button',{name:'CONNECT WALLET',exact:true}).click()
 await page.getByRole('button',{name:'Connect Phantom',exact:true}).click()
 await page.getByText('WALLET CONNECTED',{exact:true}).waitFor()
 await page.evaluate(()=>{window.rejectTestSignature=true})
 await page.getByRole('button',{name:'VERIFY OWNERSHIP (OPTIONAL)',exact:true}).click()
 await page.getByRole('alert').filter({hasText:'Signature cancelled'}).waitFor()
 await page.getByText('WALLET CONNECTED',{exact:true}).waitFor()
 await page.evaluate(()=>{window.rejectTestSignature=false})
 await page.getByRole('button',{name:'VERIFY OWNERSHIP (OPTIONAL)',exact:true}).click()
 await page.getByRole('dialog').getByText('WALLET PROOF VERIFIED',{exact:true}).waitFor()
 await page.locator('.real-connect .dialog-ok').first().click()
 await page.getByRole('button',{name:'CREATE YOUR PROFILE'}).click()
 await page.getByLabel('PUBLIC HANDLE',{exact:true}).fill('integration-builder')
 await page.getByLabel('DISPLAY NAME',{exact:true}).fill('Integration Builder')
 await page.getByLabel('BIO',{exact:true}).fill('Signed profile from a local integration test.')
 await page.getByRole('button',{name:'SIGN & SAVE PROFILE'}).click()
 await page.getByRole('heading',{name:'Integration Builder',exact:true}).waitFor()
 await page.getByRole('button',{name:'[NEW FIELD NOTE]',exact:true}).click()
 await page.getByLabel('SUBJECT',{exact:true}).fill('Browser publishing works')
 await page.getByLabel('MESSAGE',{exact:true}).fill('Signed with a dedicated test wallet, stored by the real backend.')
 await page.getByRole('button',{name:'SIGN & PUBLISH',exact:true}).click()
 await page.getByRole('heading',{name:'Browser publishing works',exact:true}).waitFor()
 await page.getByRole('button',{name:'REPLY',exact:true}).click()
 await page.getByLabel('MESSAGE',{exact:true}).fill('<script>window.injected=true</script> This is plain text.')
 await page.getByRole('button',{name:'SIGN & PUBLISH',exact:true}).click()
 await page.getByText('<script>window.injected=true</script> This is plain text.',{exact:true}).waitFor()
 assert.equal(await page.evaluate(()=>Boolean(window.injected)),false)
 await page.getByRole('button',{name:'[NEW FIELD NOTE]',exact:true}).click()
 await page.getByLabel('SUBJECT',{exact:true}).fill('Rejected signature must not publish')
 await page.getByLabel('MESSAGE',{exact:true}).fill('This request will be rejected by the test wallet.')
 await page.evaluate(()=>{window.rejectTestSignature=true})
 await page.getByRole('button',{name:'SIGN & PUBLISH',exact:true}).click()
 await page.getByRole('alert').filter({hasText:'User rejected signature'}).waitFor()
 assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM bbs_threads WHERE subject='Rejected signature must not publish'").get().n,0)
 await page.evaluate(()=>{window.rejectTestSignature=false})
 await page.getByLabel('Close composer').click()
 await page.screenshot({path:'velqon-complete-desktop.png',fullPage:true})
 await page.setViewportSize({width:390,height:844})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await page.screenshot({path:'velqon-complete-mobile.png',fullPage:true})
 assert.deepEqual(errors,[])
 console.log('PASS: separate Backpack and Phantom connections with both installed, wallet proof, profile registration, signed thread, signed reply, escaped content, rejected signature, desktop/mobile layout. No mainnet transactions were sent.')
}finally{await browser.close();await app.close()}
