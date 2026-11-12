import { PublicKey } from '@solana/web3.js'
import nacl from 'tweetnacl'
import { standardWalletDescriptors } from './standard-wallet.js'

export function publicKeyString(value) {
  try { return new PublicKey(typeof value?.toBase58==='function'?value.toBase58():value).toBase58() } catch { return null }
}
export function walletAccount(provider) { return publicKeyString(provider?.publicKey) }
export function detectedWallets(scope=globalThis) {
  const candidates=[
    ...(scope===globalThis?standardWalletDescriptors().map(wallet=>[wallet.id,wallet.name,wallet.provider]):[]),
    ['phantom','Phantom',scope.phantom?.solana],
    ['backpack','Backpack',scope.backpack?.solana],
    ['backpack','Backpack',scope.backpack],
    ['okx','OKX Wallet',scope.okxwallet?.solana],
    ['solflare','Solflare',scope.solflare],
    ['injected','Solana Wallet',scope.solana],
  ],seen=new Set(),ids=new Set(),wallets=[]
  for(let [id,name,provider] of candidates){
    if(!provider||typeof provider.connect!=='function'||typeof provider.signTransaction!=='function'||seen.has(provider))continue
    if(id==='injected'){
      if(provider.isPhantom){id='phantom';name='Phantom'}
      else if(provider.isBackpack){id='backpack';name='Backpack'}
      else if(provider.isSolflare){id='solflare';name='Solflare'}
    }
    if(ids.has(id))continue
    seen.add(provider);ids.add(id);wallets.push({id,name,provider})
  }
  return wallets
}
export function walletError(error,stage='connect',name='wallet') {
  const code=Number(error?.code??error?.cause?.code)
  const raw=typeof error?.message==='string'?error.message:String(error||'Unknown wallet error')
  let message
  if(code===4001||/reject|denied|declined|cancel/i.test(raw))message=stage==='sign'?'Signature cancelled. Your wallet remains connected.':'Connection cancelled in your wallet. Click Connect when you are ready.'
  else if(code===-32002||/already.*pending|request.*pending/i.test(raw))message=`A ${name} request is already open. Open the wallet extension and finish or cancel that request.`
  else if(code===4100||/unauthori[sz]ed|locked/i.test(raw))message=`Unlock ${name} and allow this website to connect, then try again.`
  else if(code===-32603||/unexpected error|internal error/i.test(raw))message=stage==='sign'?`${name} could not sign the proof. Your wallet is still connected. Unlock the extension and retry the separate verification button if needed.`:`${name} returned an internal connection error. Unlock the extension, check this site's connection permission, and retry. If several wallets are installed, choose the intended wallet below.`
  else message=raw
  const result=new Error(message,{cause:error});result.code=Number.isFinite(code)?code:undefined;result.stage=stage;result.walletName=name;return result
}
const pending=new WeakMap()
export function connectWallet(descriptor) {
  if(!descriptor?.provider)return Promise.reject(new Error('Choose an installed Solana wallet.'))
  const {provider,name}=descriptor
  if(pending.has(provider))return pending.get(provider)
  const request=(async()=>{
    try {
      // Request account access only. Message signing must be a separate user gesture.
      let response
      if(provider.isConnected&&walletAccount(provider))response={publicKey:provider.publicKey}
      else if(descriptor.id==='phantom'||provider.isPhantom)response=await provider.connect({onlyIfTrusted:false})
      else response=await provider.connect()
      const account=publicKeyString(response?.publicKey)||walletAccount(provider)
      if(!account)throw new Error(`${name} did not return a valid Solana account.`)
      return {provider,publicKey:new PublicKey(account),account,walletName:name,walletId:descriptor.id,verified:false,signature:null}
    }catch(error){throw walletError(error,'connect',name)}
  })()
  pending.set(provider,request)
  request.then(()=>pending.delete(provider),()=>pending.delete(provider))
  return request
}
export async function verifyWalletControl(session,{origin=globalThis.location?.origin||'http://localhost',nonce=()=>globalThis.crypto.randomUUID(),now=()=>new Date().toISOString()}={}) {
  if(!session?.provider?.signMessage)throw new Error('This wallet does not support message signing. Account connection is still available.')
  const {provider,account}=session
  if(walletAccount(provider)!==account)throw new Error('Wallet account changed. Reconnect before verification.')
  const message=new TextEncoder().encode(`VELQON wallet-control proof\nOrigin: ${origin}\nNetwork: Solana mainnet-beta\nWallet: ${account}\nNonce: ${nonce()}\nIssued: ${now()}\nPurpose: verify control of the connected wallet. No transfer is authorized.`)
  try {
    const signed=await provider.signMessage(message,'utf8'),signature=Uint8Array.from(signed?.signature||signed||[])
    if(walletAccount(provider)!==account)throw new Error('Wallet account changed during verification. Reconnect first.')
    if(signature.length!==64||!nacl.sign.detached.verify(message,signature,session.publicKey.toBytes()))throw new Error('Wallet proof signature could not be verified.')
    return {...session,verified:true,signature:Array.from(signature)}
  }catch(error){throw walletError(error,'sign',session.walletName)}
}
