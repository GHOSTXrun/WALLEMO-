import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createVelqonApp } from './backend/app.mjs'

const root=fileURLToPath(new URL('.',import.meta.url))
const port=Number(process.env.PORT||process.env.VELQON_PORT||process.env.WALLEMO_PORT||4188)
const host=process.env.VELQON_HOST||process.env.WALLEMO_HOST||'127.0.0.1'
const legacy=resolve(root,'.wallemo/data/wallemo.sqlite')
const dbPath=process.env.VELQON_DB_PATH||process.env.WALLEMO_DB_PATH||(existsSync(legacy)?legacy:resolve(root,'.velqon/data/velqon.sqlite'))
const app=createVelqonApp({dbPath,distRoot:resolve(root,'dist'),publicOrigin:process.env.VELQON_PUBLIC_ORIGIN||`http://${host==='0.0.0.0'?'127.0.0.1':host}:${port}`})
app.server.listen(port,host,()=>console.log(`VELQON listening at ${host}:${port}`))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0)})
