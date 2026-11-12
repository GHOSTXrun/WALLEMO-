import { createContext, useContext, useEffect, useState } from 'react'
import { apiEnabled, apiRequest } from './api'
const Context=createContext({connected:false,features:{},error:'Backend not connected.'})
export function PlatformProvider({children}) {
 const [state,setState]=useState({connected:false,checking:apiEnabled,features:{},error:apiEnabled?'Checking backend…':'Backend connection pending.'})
 useEffect(()=>{let active=true
  async function refresh(){try{const [health,config]=await Promise.all([apiRequest('/api/v1/health'),apiRequest('/api/v1/config')]);if(active)setState({connected:Boolean(health.ok),checking:false,features:config.features||{},error:''})}catch(error){if(active)setState({connected:false,checking:false,features:{},error:error.message})}}
  if(apiEnabled)refresh();const timer=apiEnabled?setInterval(refresh,30000):null
  return()=>{active=false;clearInterval(timer)}
 },[])
 return <Context.Provider value={state}>{children}</Context.Provider>
}
export const usePlatform=()=>useContext(Context)
