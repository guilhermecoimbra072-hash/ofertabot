import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
try{const d=JSON.parse(await readFile(resolve(process.env.ENGINE_DATA_DIR??'.engine-data','health.json'),'utf8'));if(Date.now()-Date.parse(d.last_heartbeat)>90000)process.exit(1);console.log('Motor com comunicação recente');}catch{process.exit(1);}
