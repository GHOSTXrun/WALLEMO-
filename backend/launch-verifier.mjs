import { createHash } from 'node:crypto'
import { PublicKey } from '@solana/web3.js'
import { bondingCurvePda, PUMP_PROGRAM_ID } from '@pump-fun/pump-sdk'
import { decodeBase58, MAINNET_GENESIS } from '../src/domain.js'

const discriminator = createHash('sha256').update('global:create_v2').digest().subarray(0, 8)
export async function verifyLaunch(rpc, { hash, token }, wallet) {
  if (decodeBase58(hash).length !== 64) throw new Error('Invalid transaction signature.')
  new PublicKey(token)
  if (await rpc('getGenesisHash') !== MAINNET_GENESIS) throw new Error('RPC is not connected to Solana mainnet.')
  const tx = await rpc('getTransaction', [hash, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }])
  if (!tx?.meta || tx.meta.err) throw new Error('Transaction is not confirmed or was unsuccessful.')
  const message = tx.transaction?.message
  if (!message?.accountKeys?.some(key => key.pubkey === wallet && key.signer)) throw new Error('The submitting wallet did not sign this transaction.')
  const instruction = message.instructions?.find(ix => {
    if (ix.programId !== PUMP_PROGRAM_ID.toBase58() || ix.accounts?.[0] !== token || !ix.data) return false
    const data = Buffer.from(decodeBase58(ix.data))
    return data.subarray(0, 8).equals(discriminator)
  })
  if (!instruction) throw new Error('No Pump create_v2 instruction for this mint was found.')
  const data = Buffer.from(decodeBase58(instruction.data))
  let offset = 8
  const readString = limit => {
    if (offset + 4 > data.length) throw new Error('Invalid Pump instruction.')
    const length = data.readUInt32LE(offset); offset += 4
    if (length > limit || offset + length > data.length) throw new Error('Invalid Pump metadata.')
    const value = data.subarray(offset, offset + length).toString('utf8'); offset += length
    return value
  }
  const name = readString(32), symbol = readString(13), metadataUri = readString(200)
  if (offset + 32 > data.length || new PublicKey(data.subarray(offset, offset + 32)).toBase58() !== wallet) throw new Error('The launch creator does not match the submitting wallet.')
  return { id: hash, hash, token, name, symbol, metadataUri, creator: wallet, curve: bondingCurvePda(new PublicKey(token)).toBase58(), slot: tx.slot, status: 'CONFIRMED', createdAt: new Date((tx.blockTime || Date.now() / 1000) * 1000).toISOString(), source: 'server-verified' }
}
