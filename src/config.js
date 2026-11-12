const runtime = globalThis.VELQON_CONFIG || {}
export function publicUrl(value) {
  if (!value) return ''
  try { const url = new URL(value); return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)) ? url.href.replace(/\/$/,'') : '' } catch { return '' }
}
export const apiOrigin = publicUrl(runtime.apiOrigin || import.meta.env.VITE_VELQON_API_ORIGIN || '')
export const rpcOverride = publicUrl(runtime.rpcUrl || import.meta.env.VITE_SOLANA_RPC_URL || '')
export const links = Object.fromEntries(['website','x','telegram','docs'].map(key=>[key,publicUrl(runtime.links?.[key])]))
export const apiEnabled = Boolean(apiOrigin) || Boolean(runtime.sameOriginApi) || ['localhost','127.0.0.1'].includes(location.hostname)
