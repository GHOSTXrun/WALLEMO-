import { apiOrigin, apiEnabled } from './config'
export { apiOrigin, apiEnabled }
export function apiUrl(path) { return `${apiOrigin}${path}` }
export async function apiRequest(path, options = {}) {
  if (!apiEnabled) throw new Error('Community backend is not connected yet.')
  const response = await fetch(apiUrl(path), { ...options, headers: { 'content-type':'application/json', ...options.headers }, signal:options.signal || AbortSignal.timeout(20000) })
  const data = await response.json().catch(()=>({error:'The backend returned an invalid response.'}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`)
  return data
}
