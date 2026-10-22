import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {HttpGateway} from './gateway.js';
import {Vault} from './vault.js';
import {BaileysTransport} from './baileys.js';
import {Worker} from './worker.js';
import {CaptureQueue} from './capture-queue.js';
import {normalizeExpectedPhone} from './account.js';
const required=['ENGINE_URL','ENGINE_TOKEN','ENGINE_SESSION_KEY'];for(const key of required)if(!process.env[key])throw new Error(`Configure ${key} no arquivo .env`);
if(process.env.ENGINE_TRANSPORT!=='baileys')throw new Error('Para vincular sua conta, escolha explicitamente ENGINE_TRANSPORT=baileys. Simulação existe apenas nos testes.');
const dir=resolve(process.env.ENGINE_DATA_DIR??'.engine-data');
const api=new HttpGateway(process.env.ENGINE_URL!,process.env.ENGINE_TOKEN!,randomUUID());
const vault=new Vault(dir,Buffer.from(process.env.ENGINE_SESSION_KEY!,'base64'));
const transport=new BaileysTransport(vault,normalizeExpectedPhone(process.env.ENGINE_EXPECTED_PHONE));const worker=new Worker(api,transport,vault);
const queue=new CaptureQueue(api,vault);await queue.load();
let sources=new Set<string>();let stopped=false;let lastGroups=0;
async function heartbeat(){const cfg=await api.call<{sources:string[]}>('heartbeat',{status:transport.status,qr:transport.qrAt && Date.now()-transport.qrAt<25000?transport.qr:null});sources=new Set(cfg.sources);await mkdir(dir,{recursive:true,mode:0o700});await writeFile(resolve(dir,'health.json'),JSON.stringify({last_heartbeat:new Date().toISOString(),status:transport.status,pending_captures:queue.pending}),{mode:0o600});}
await heartbeat();
await transport.start(async m=>{if(!sources.has(m.group_jid)||m.from_me)return;await queue.add(m);});
console.info('OfertaBot iniciado. QR Code somente no painel privado. Ctrl+C para encerrar.');
const hb=setInterval(()=>{void heartbeat().catch(()=>console.error('heartbeat_failed: backend sem comunicação'));},20000);
async function shutdown(){if(stopped)return;stopped=true;clearInterval(hb);await transport.stop();await heartbeat().catch(()=>{});}
process.on('SIGINT',()=>{void shutdown();});process.on('SIGTERM',()=>{void shutdown();});
while(!stopped){
 try{
  await heartbeat();
  if(transport.status==='connected' && Date.now()-lastGroups>60000){await api.call('groups',{groups:await transport.groups()});lastGroups=Date.now();}
  try{await queue.flush();}catch(e){if([401,403].includes((e as {status?:number}).status??0))throw e;console.error('capture_sync_delayed: capturas preservadas; publicação continua independente');}
  await worker.once();
 }catch(e){
  const msg=(e as Error).message;
  console.error(msg.includes('401')||msg.includes('403')?'credential_rejected: motor encerrado':'cycle_failed: verifique rede e histórico no painel');
  if(msg.includes('401')||msg.includes('403'))await shutdown();
 }
 await new Promise(r=>setTimeout(r,5000));
}
await queue.drain();
