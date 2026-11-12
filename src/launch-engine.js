import { ComputeBudgetProgram, Keypair, Transaction, VersionedTransaction } from '@solana/web3.js'
import { validateMetadata, encodeBase58 } from './domain.js'
import { walletAccount } from './wallet.js'
export async function executeLaunchWith({connection,sdk,provider,publicKey,form,onSubmitted=()=>{},attempts=45,sleep=ms=>new Promise(r=>setTimeout(r,ms))}) {
 if(!provider||!publicKey)throw new Error('Connect a Solana wallet first.')
 if(walletAccount(provider)!==publicKey.toBase58())throw new Error('Wallet account changed. Reconnect first.')
 const {name,symbol,uri}=validateMetadata(form), mint=Keypair.generate()
 const instruction=await sdk.createV2Instruction({mint:mint.publicKey,name,symbol,uri,creator:publicKey,user:publicKey,mayhemMode:Boolean(form.mayhemMode),cashback:false,holderReward:Boolean(form.holderReward)})
 const latest=await connection.getLatestBlockhash('confirmed')
 const transaction=new Transaction({feePayer:publicKey,recentBlockhash:latest.blockhash}).add(ComputeBudgetProgram.setComputeUnitLimit({units:350000}),instruction)
 transaction.partialSign(mint)
 const signed=await provider.signTransaction(transaction)
 if(walletAccount(provider)!==publicKey.toBase58())throw new Error('Wallet account changed during signing.')
 const wire=signed.serialize()
 // The legacy simulateTransaction overload refreshes blockhashes. Simulate the exact signed bytes instead.
 const simulation=await connection.simulateTransaction(VersionedTransaction.deserialize(wire),{sigVerify:true,commitment:'confirmed'})
 if(simulation.value.err)throw new Error('Launch simulation failed: '+JSON.stringify(simulation.value.err))
 const hash=encodeBase58(VersionedTransaction.deserialize(wire).signatures[0])
 const result={id:hash,hash,token:mint.publicKey.toBase58(),name,symbol,metadataUri:uri,creator:publicKey.toBase58(),createdAt:new Date().toISOString(),status:'SUBMITTED',lastValidBlockHeight:latest.lastValidBlockHeight}
 try {
  const submittedHash=await connection.sendRawTransaction(wire,{skipPreflight:false,maxRetries:3})
  if(submittedHash!==hash)throw new Error('Unexpected RPC transaction signature.')
 } catch {
  const unknown={...result,status:'SUBMISSION_UNKNOWN',warning:'RPC submission outcome is unknown. Keep this signature and check Solscan before attempting another launch.'}
  onSubmitted(unknown);return unknown
 }
 // Keep the signature even if RPC confirmation or browser storage fails after broadcast.
 onSubmitted(result)
 for(let i=0;i<attempts;i++) {
  try {
   const response=await connection.getSignatureStatuses([hash],{searchTransactionHistory:true}), status=response.value[0]
   if(status?.err)return {...result,status:'FAILED',error:JSON.stringify(status.err)}
   if(['confirmed','finalized'].includes(status?.confirmationStatus))return {...result,status:'CONFIRMED'}
  }catch{ /* A submitted transaction must not become a retryable new launch on an RPC outage. */ }
  await sleep(1000)
 }
 return {...result,warning:'Submitted, but confirmation is still pending. Keep the signature and check Solscan before attempting another launch.'}
}
