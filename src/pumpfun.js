import { PUMP_PROGRAM_ID, PUMP_SDK, bondingCurvePda } from '@pump-fun/pump-sdk'
import { Connection, PublicKey } from '@solana/web3.js'
import { apiEnabled, apiUrl } from './api'
import { rpcOverride } from './config'
import { MAINNET_GENESIS } from './domain'
import { executeLaunchWith } from './launch-engine'

export const RPC_URL = rpcOverride || (apiEnabled ? new URL(apiUrl('/api/v1/solana-rpc'), location.origin).href : 'https://solana-rpc.publicnode.com')
export const PROGRAM_ID=PUMP_PROGRAM_ID.toBase58(), EXPLORER_URL='https://solscan.io', NETWORK='SOLANA MAINNET-BETA'
export const connection=new Connection(RPC_URL,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(20000)})})
export async function readProtocol() {
 const [genesis,program,slot]=await Promise.all([connection.getGenesisHash(),connection.getAccountInfo(PUMP_PROGRAM_ID,'confirmed'),connection.getSlot('confirmed')])
 if(genesis!==MAINNET_GENESIS)throw new Error('The configured RPC is not connected to Solana mainnet.')
 if(!program?.executable)throw new Error('The Pump program is unavailable on Solana mainnet.')
 return {enabled:true,programId:PROGRAM_ID,slot,feeLabel:'SOL NETWORK + PUMP FEES',config:{enabled:true,quote:'SOL',mode:'CREATE_V2'}}
}
export function loadLocalLaunches() {
 try {const data=JSON.parse(localStorage.getItem('velqon-solana-launches')||localStorage.getItem('wallemo-solana-launches')||'[]');return Array.isArray(data)?data.filter(item=>item&&typeof item.hash==='string'&&typeof item.token==='string').slice(0,100):[]}catch{return []}
}
function saveLaunch(result) {
 try{const stored=loadLocalLaunches();localStorage.setItem('velqon-solana-launches',JSON.stringify([result,...stored.filter(item=>item.hash!==result.hash)].slice(0,100)))}catch{result.storageWarning='Browser storage unavailable. Keep your transaction signature.'}
 window.dispatchEvent(new CustomEvent('velqon:launch',{detail:result}))
}
export async function executeLaunch({provider,publicKey,form}) {
 const result=await executeLaunchWith({connection,sdk:PUMP_SDK,provider,publicKey,form,onSubmitted:saveLaunch})
 result.curve=bondingCurvePda(new PublicKey(result.token)).toBase58();saveLaunch(result);return result
}
export function isSolanaAddress(value){try{new PublicKey(value);return true}catch{return false}}
