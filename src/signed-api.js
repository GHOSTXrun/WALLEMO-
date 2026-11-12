import nacl from 'tweetnacl'
import { apiRequest, apiUrl } from './api'
import { canonical, actionMessage } from './domain'

export async function signedRequest(session, action, payload, path, method = 'POST') {
  if (!session?.provider?.signMessage) throw new Error('Connect a Solana wallet that supports message signing.')
  if (session.provider.publicKey?.toBase58() !== session.account) throw new Error('Wallet account changed. Reconnect before publishing.')
  const challenge = await apiRequest('/api/v1/auth/challenge',{method:'POST',body:JSON.stringify({wallet:session.account,action,payload})})
  const contentHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(payload))))).map(n=>n.toString(16).padStart(2,'0')).join('')
  const validUntil=Date.parse(challenge.expiresAt)
  if (canonical(challenge.payload)!==canonical(payload)||challenge.action!==action||challenge.wallet!==session.account||new URL(challenge.audience).origin!==new URL(apiUrl('/'),location.origin).origin||!Number.isFinite(validUntil)||validUntil<=Date.now()||validUntil>Date.now()+330000) throw new Error('The backend returned an unexpected signing request.')
  const expected=actionMessage({...challenge,contentHash})
  if(expected!==challenge.message)throw new Error('Signing message does not match the content you entered.')
  const message=new TextEncoder().encode(expected)
  const signed=await session.provider.signMessage(message,'utf8'), signature=signed.signature||signed
  if(session.provider.publicKey?.toBase58()!==session.account||!nacl.sign.detached.verify(message,signature,session.publicKey.toBytes()))throw new Error('Wallet signature could not be verified.')
  return apiRequest(path,{method,body:JSON.stringify({challengeId:challenge.challengeId,signature:Buffer.from(signature).toString('base64'),payload})})
}
