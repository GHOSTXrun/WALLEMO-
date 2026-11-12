import test from 'node:test'
import assert from 'node:assert/strict'
import { Keypair, Transaction, TransactionInstruction } from '@solana/web3.js'
import nacl from 'tweetnacl'
import { standardWalletProvider } from '../src/standard-wallet.js'
import { connectWallet, verifyWalletControl, walletAccount } from '../src/wallet.js'
function fixture(){
 const key=Keypair.generate(),account={address:key.publicKey.toBase58(),publicKey:key.publicKey.toBytes(),chains:['solana:mainnet'],features:['solana:signTransaction','solana:signMessage']};let change
 const wallet={name:'Backpack',chains:['solana:mainnet'],accounts:[],features:{
  'standard:connect':{connect:async()=>({accounts:[account]})},
  'standard:disconnect':{disconnect:async()=>{}},
  'standard:events':{on:(_event,callback)=>{change=callback;return()=>{}}},
  'solana:signMessage':{signMessage:async({message})=>[{signedMessage:message,signature:nacl.sign.detached(message,key.secretKey)}]},
  'solana:signTransaction':{signTransaction:async input=>{assert.equal(input.chain,'solana:mainnet');assert.equal(input.account.address,account.address);const tx=Transaction.from(input.transaction);tx.partialSign(key);return [{signedTransaction:tx.serialize()}]}},
 }}
 return {key,account,wallet,change:accounts=>change({accounts})}
}
test('Wallet Standard-only Backpack can connect and verify a message without window.backpack',async()=>{const f=fixture(),provider=standardWalletProvider(f.wallet);assert.equal(provider.isConnected,false);const session=await connectWallet({id:'backpack',name:'Backpack',provider});assert.equal(session.account,f.account.address);assert.equal((await verifyWalletControl(session)).verified,true);assert.equal(standardWalletProvider(f.wallet),provider)})
test('Wallet Standard transaction adapter preserves the mint signature and adds the wallet signature',async()=>{const f=fixture(),provider=standardWalletProvider(f.wallet),mint=Keypair.generate();await provider.connect();const tx=new Transaction({feePayer:f.key.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(new TransactionInstruction({programId:Keypair.generate().publicKey,keys:[{pubkey:f.key.publicKey,isSigner:true,isWritable:true},{pubkey:mint.publicKey,isSigner:true,isWritable:true}],data:Buffer.alloc(0)}));tx.partialSign(mint);const signed=await provider.signTransaction(tx);assert.equal(signed.verifySignatures(),true);assert.equal(signed.signatures.length,2)})
test('Wallet Standard account-change and disconnect events update the active wallet account',async()=>{const f=fixture(),provider=standardWalletProvider(f.wallet);await provider.connect();let changed,disconnected=0;provider.on('accountChanged',key=>{changed=key.toBase58()});provider.on('disconnect',()=>{disconnected++});const replacement=Keypair.generate(),next={...f.account,address:replacement.publicKey.toBase58(),publicKey:replacement.publicKey.toBytes()};f.change([next]);assert.equal(changed,next.address);assert.equal(walletAccount(provider),next.address);f.change([]);assert.equal(provider.publicKey,null);assert.equal(disconnected,1)})
