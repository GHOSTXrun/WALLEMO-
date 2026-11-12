export const CHANNELS = ['protocol', 'contracts', 'research', 'launch-log', 'security', 'governance']
export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
export function actionMessage({audience,wallet,action,contentHash,challengeId,expiresAt}) {
  return `VELQON signed action\nAudience: ${audience}\nWallet: ${wallet}\nAction: ${action}\nContent SHA-256: ${contentHash}\nNonce: ${challengeId}\nExpires: ${expiresAt}\nThis signature publishes content only. It does not authorize a transfer.`
}
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
  return JSON.stringify(value)
}
export function decodeBase58(value) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  if (typeof value !== 'string' || !value.length || value.length > 2000) throw new Error('Invalid base58 value.')
  let n = 0n
  for (const c of value) { const i = alphabet.indexOf(c); if (i < 0) throw new Error('Invalid base58 value.'); n = n * 58n + BigInt(i) }
  const bytes = []
  while (n) { bytes.unshift(Number(n % 256n)); n /= 256n }
  for (let i = 0; value[i] === '1'; i++) bytes.unshift(0)
  return Uint8Array.from(bytes)
}
export function encodeBase58(bytes) {
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let n=0n, output=''
  for(const byte of bytes)n=n*256n+BigInt(byte)
  while(n){output=alphabet[Number(n%58n)]+output;n/=58n}
  for(const byte of bytes){if(byte)break;output='1'+output}
  return output
}
export function validateMetadata(form) {
  const name = String(form.name || '').trim(), symbol = String(form.ticker || '').trim().toUpperCase(), uri = String(form.metadataUri || '').trim()
  const size = value => new TextEncoder().encode(value).length
  if (!name || size(name) > 32) throw new Error('Token name must be 1–32 UTF-8 bytes.')
  if (!symbol || size(symbol) > 13) throw new Error('Symbol must be 1–13 UTF-8 bytes.')
  if (!uri || size(uri) > 200 || !/^(https:\/\/|ipfs:\/\/|ar:\/\/)/i.test(uri)) throw new Error('Metadata URI must use HTTPS, IPFS or Arweave and be at most 200 UTF-8 bytes.')
  return { name, symbol, uri }
}
