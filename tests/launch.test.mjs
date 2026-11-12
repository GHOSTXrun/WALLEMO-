import test from 'node:test'
import assert from 'node:assert/strict'
import { Keypair, TransactionInstruction } from '@solana/web3.js'
import { executeLaunchWith } from '../src/launch-engine.js'
import { validateMetadata, encodeBase58 } from '../src/domain.js'
import { VersionedTransaction } from '@solana/web3.js'

function setup(){
 const wallet=Keypair.generate();let wire, sent=0, submitted
 const provider={publicKey:wallet.publicKey,signTransaction:async tx=>{tx.partialSign(wallet);return tx}}
 const sdk={createV2Instruction:async({mint})=>new TransactionInstruction({programId:Keypair.generate().publicKey,keys:[{pubkey:mint,isSigner:true,isWritable:true},{pubkey:wallet.publicKey,isSigner:true,isWritable:true}],data:Buffer.alloc(8)})}
 const connection={getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:99}),simulateTransaction:async(tx,config)=>{assert.equal(config.sigVerify,true);wire=tx.serialize();return {value:{err:null}}},sendRawTransaction:async bytes=>{assert.deepEqual(Uint8Array.from(bytes),wire);sent++;return encodeBase58(VersionedTransaction.deserialize(bytes).signatures[0])},getSignatureStatuses:async()=>({value:[{confirmationStatus:'confirmed',err:null}]})}
 return {args:{connection,sdk,provider,publicKey:wallet.publicKey,form:{name:'Agent',ticker:'AGNT',metadataUri:'https://example.com/meta.json'},onSubmitted:r=>{submitted=r},attempts:1,sleep:async()=>{}},sent:()=>sent,submitted:()=>submitted}
}
test('launch simulates exactly the signed bytes that are broadcast and persists signature before confirmation',async()=>{const f=setup(),result=await executeLaunchWith(f.args);assert.equal(result.status,'CONFIRMED');assert.equal(f.sent(),1);assert.equal(f.submitted().hash,result.hash);assert.equal(f.submitted().status,'SUBMITTED')})
test('failed simulation and wallet rejection never broadcast',async()=>{const f=setup();f.args.connection.simulateTransaction=async()=>({value:{err:{InstructionError:[0,'failure']}}});await assert.rejects(executeLaunchWith(f.args),/simulation failed/);assert.equal(f.sent(),0);const g=setup();g.args.provider.signTransaction=async()=>{throw new Error('User rejected')};await assert.rejects(executeLaunchWith(g.args),/User rejected/);assert.equal(g.sent(),0)})
test('an RPC outage after broadcast returns a pending signature rather than encouraging a second launch',async()=>{const f=setup();f.args.connection.getSignatureStatuses=async()=>{throw new Error('offline')};const result=await executeLaunchWith(f.args);assert.equal(result.status,'SUBMITTED');assert.equal(result.hash,f.submitted().hash);assert.match(result.warning,/check Solscan/);assert.equal(f.sent(),1)})
test('an ambiguous submission error retains the locally derived transaction signature',async()=>{const f=setup();f.args.connection.sendRawTransaction=async()=>{throw new Error('RPC timed out after sending')};const result=await executeLaunchWith(f.args);assert.equal(result.status,'SUBMISSION_UNKNOWN');assert.equal(result.hash,f.submitted().hash);assert.match(result.warning,/outcome is unknown/);assert.ok(result.hash.length>80)})
test('onchain execution errors are shown as failed; changed wallets cannot sign a launch',async()=>{const f=setup();f.args.connection.getSignatureStatuses=async()=>({value:[{err:{InstructionError:[0,'failed']}}]});assert.equal((await executeLaunchWith(f.args)).status,'FAILED');const g=setup();g.args.provider.publicKey=Keypair.generate().publicKey;await assert.rejects(executeLaunchWith(g.args),/Wallet account changed/);assert.equal(g.sent(),0)})
test('metadata validation counts UTF-8 bytes and rejects unsafe URLs',()=>{assert.throws(()=>validateMetadata({name:'中'.repeat(11),ticker:'A',metadataUri:'https://example.com/a'}),/UTF-8/);assert.throws(()=>validateMetadata({name:'A',ticker:'A',metadataUri:'javascript:alert(1)'}),/HTTPS/);assert.equal(validateMetadata({name:'Agent',ticker:'agnt',metadataUri:'ipfs://metadata'}).symbol,'AGNT')})
