import { useState } from 'react'
import { OFFICIAL_MINT } from './project'
export default function ContractAddress() {
 const [state,setState]=useState('COPY')
 async function copy(){try{await navigator.clipboard.writeText(OFFICIAL_MINT);setState('COPIED')}catch{setState('SELECT TO COPY')}}
 return <button type="button" className="hero-ca" translate="no" onClick={copy} aria-label="Copy VELQON contract address" title="Copy contract address"><span>CA:</span><strong>{OFFICIAL_MINT}</strong><small aria-live="polite">{state}</small></button>
}
