import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {HttpGateway} from './gateway.js';
import {Vault} from './vault.js';
import {BaileysTransport} from './baileys.js';
import {Worker} from './worker.js';
import {CaptureQueue} from './capture-queue.js';
import {normalizeExpectedPhone} from './account.js';
import {classifyCycleError,cycleErrorLine,heartbeatPayload,supervise} from './supervisor.js';
const required=['ENGINE_URL','ENGINE_TOKEN','ENGINE_SESSION_KEY'];for(const key of required)if(!process.env[key])throw new Error(`Configure ${key} no arquivo .env`);
if(process.env.ENGINE_TRANSPORT!=='baileys')throw new Error('Para vincular sua conta, escolha explicitamente ENGINE_TRANSPORT=baileys. Simulação existe apenas nos testes.');
const dir=resolve(process.env.ENGINE_DATA_DIR??'.engine-data');
const api=new HttpGateway(process.env.ENGINE_URL!,process.env.ENGINE_TOKEN!,randomUUID());
const vault=new Vault(dir,Buffer.from(process.env.ENGINE_SESSION_KEY!,'base64'));
const transport=new BaileysTransport(vault,normalizeExpectedPhone(process.env.ENGINE_EXPECTED_PHONE));const worker=new Worker(api,transport,vault);
const queue=new CaptureQueue(api,vault);await queue.load();
let sources=new Set<string>();let stopped=false;let hb:ReturnType<typeof setInterval>|undefined;
async function heartbeat(){const cfg=await api.call<{sources:string[]}>('heartbeat',heartbeatPayload(transport.status,transport.qr,transport.qrAt,Date.now()));sources=new Set(cfg.sources);await mkdir(dir,{recursive:true,mode:0o700});await writeFile(resolve(dir,'health.json'),JSON.stringify({last_heartbeat:new Date().toISOString(),status:transport.status,pending_captures:queue.pending}),{mode:0o600});}
function onHeartbeatError(error:unknown){const kind=classifyCycleError(error);if(kind==='cycle_failed'){console.error('heartbeat_failed: backend sem comunicação');return;}console.error(cycleErrorLine(kind));if(kind==='credential_rejected'){process.exitCode=1;void shutdown();}}
async function shutdown(){if(stopped)return;stopped=true;clearInterval(hb);await transport.stop();await heartbeat().catch(()=>{});}
process.on('SIGINT',()=>{void shutdown();});process.on('SIGTERM',()=>{void shutdown();});
const result=await supervise({
 heartbeat,
 startTransport:async()=>{await transport.start(async m=>{if(!sources.has(m.group_jid)||m.from_me)return;try{await queue.add(m);}catch{await queue.preserveFailure(m,'capture_failed');}});console.info('OfertaBot iniciado. QR Code somente no painel privado. Ctrl+C para encerrar.');hb=setInterval(()=>{void heartbeat().catch(onHeartbeatError);},20000);},
 syncGroups:async()=>{await api.call('groups',{groups:await transport.groups()});},
 flushCaptures:()=>queue.flush(),
 work:()=>worker.once(),
 shutdown,
 sleep:ms=>new Promise(r=>setTimeout(r,ms)),
 log:line=>console.error(line),
 isStopped:()=>stopped,
 transportStatus:()=>transport.status,
 connectionEpoch:()=>transport.connectionEpoch,
 now:()=>Date.now(),
});
await queue.drain();
if(result==='credential_rejected')process.exitCode=1;
