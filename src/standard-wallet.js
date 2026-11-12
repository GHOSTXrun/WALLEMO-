import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import { getWallets } from './vendor/wallet-standard-app.js'
const adapters=new WeakMap()
const mainnet='solana:mainnet'
function accountFor(accounts=[]) { return accounts.find(account=>account.chains?.includes(mainnet))||null }
export function standardWalletProvider(wallet) {
  if(adapters.has(wallet))return adapters.get(wallet)
  const features=wallet.features||{}
  if(!features['standard:connect']?.connect||!features['solana:signTransaction']?.signTransaction||!wallet.chains?.includes(mainnet))return null
  let account=accountFor(wallet.accounts),listeners=new Map()
  const emit=(event,value)=>{for(const callback of listeners.get(event)||[])callback(value)}
  function key(){if(!account)return null;const publicKey=new PublicKey(account.publicKey);if(publicKey.toBase58()!==account.address)throw new Error('Wallet account address does not match its public key.');return publicKey}
  function requireAccount(){if(!account)throw new Error('Reconnect this wallet before signing.');return account}
  const provider={
    get publicKey(){return key()},get isConnected(){return Boolean(account)},
    async connect(){const result=await features['standard:connect'].connect();account=accountFor(result?.accounts||wallet.accounts);if(!account)throw new Error('Select a Solana mainnet account in this wallet.');return {publicKey:key()}},
    async disconnect(){await features['standard:disconnect']?.disconnect?.();account=null;emit('disconnect')},
    async signTransaction(transaction){
      const bytes=typeof transaction.compileMessage==='function'?transaction.serialize({requireAllSignatures:false,verifySignatures:false}):transaction.serialize()
      const output=await features['solana:signTransaction'].signTransaction({account:requireAccount(),chain:mainnet,transaction:Uint8Array.from(bytes)})
      const signed=output?.[0]?.signedTransaction
      if(!(signed instanceof Uint8Array))throw new Error('The wallet did not return a signed Solana transaction.')
      try{return Transaction.from(signed)}catch{return VersionedTransaction.deserialize(signed)}
    },
    on(event,callback){if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(callback)},
    removeListener(event,callback){listeners.get(event)?.delete(callback)},
  }
  if(features['solana:signMessage']?.signMessage)provider.signMessage=async message=>{
    const output=await features['solana:signMessage'].signMessage({account:requireAccount(),message:Uint8Array.from(message)}),result=output?.[0]
    if(!result?.signature||!result.signedMessage||result.signedMessage.length!==message.length||!result.signedMessage.every((byte,i)=>byte===message[i]))throw new Error('Wallet returned a proof for a different message.')
    return {signature:Uint8Array.from(result.signature)}
  }
  features['standard:events']?.on?.('change',change=>{
    if(!change.accounts)return
    const previous=account?.address
    account=change.accounts.find(item=>item.address===previous&&item.chains?.includes(mainnet))||accountFor(change.accounts)
    if(!account)emit('disconnect')
    else if(account.address!==previous)emit('accountChanged',key())
  })
  adapters.set(wallet,provider);return provider
}
export function standardWalletDescriptors() {
  return getWallets().get().map(wallet=>{
    const provider=standardWalletProvider(wallet)
    if(!provider)return null
    const name=String(wallet.name||'Solana Wallet'),normalized=name.toLowerCase()
    const id=normalized.includes('phantom')?'phantom':normalized.includes('backpack')?'backpack':normalized.includes('solflare')?'solflare':normalized.includes('okx')?'okx':'standard-'+normalized.replace(/[^a-z0-9]/g,'-')
    return {id,name,provider}
  }).filter(Boolean)
}
export function subscribeStandardWallets(callback){const wallets=getWallets(),register=wallets.on('register',callback),unregister=wallets.on('unregister',callback);return()=>{register();unregister()}}
