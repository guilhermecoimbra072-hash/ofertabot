import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {Vault} from '../engine/src/vault';
import {BaileysTransport} from '../engine/src/baileys';
import {disconnectCode,planReconnect,RECONNECT_CAP_MS,RECONNECT_JITTER_MS} from '../engine/src/reconnect';
import {GROUPS_REFRESH_MS,classifyCycleError,cycleErrorLine,heartbeatPayload,shouldSyncGroups,supervise} from '../engine/src/supervisor';

const loggedOutCode=401;
const restartRequiredCode=515;
const plan=(code:number|undefined,attempt:number,randomUnit=0)=>planReconnect({code,attempt,randomUnit,loggedOutCode,restartRequiredCode});

test('reconexão continua com atraso curto, teto e jitter, e não desiste',()=>{
 const first=plan(408,0,0);assert.equal(first.action,'retry');if(first.action!=='retry')return;
 assert.equal(first.delayMs,1000);assert.equal(first.nextAttempt,1);assert.equal(first.line,'whatsapp_reconnect attempt=1 delay_ms=1000 code=408');
 const third=plan(428,2,0);assert.equal(third.action,'retry');if(third.action!=='retry')return;assert.equal(third.delayMs,4000);
 const capped=plan(408,3,0);assert.equal(capped.action,'retry');if(capped.action!=='retry')return;assert.equal(capped.delayMs,RECONNECT_CAP_MS);
 const later=plan(503,40,0);assert.equal(later.action,'retry');if(later.action!=='retry')return;assert.equal(later.delayMs,RECONNECT_CAP_MS);
 const jitter=plan(408,40,0.5);assert.equal(jitter.action,'retry');if(jitter.action!=='retry')return;assert.equal(jitter.delayMs,RECONNECT_CAP_MS+500);
 assert.ok(RECONNECT_CAP_MS+RECONNECT_JITTER_MS<15000);
 const unknown=plan(undefined,0,0);assert.equal(unknown.action,'retry');if(unknown.action!=='retry')return;assert.match(unknown.line,/code=unknown/);
});

test('logout não reconecta e pede para gerar outro QR sem apagar a sessão',()=>{
 const planStop=plan(loggedOutCode,2,0.9);
 assert.equal(planStop.action,'stop');
 assert.match(planStop.line,/logged_out/);
 assert.match(planStop.line,/session\.enc/);
 assert.match(planStop.line,/QR/);
 assert.doesNotMatch(planStop.line,/\d{8,}/);
});

test('restartRequired 515 reconecta na hora mesmo depois de várias quedas',()=>{
 const planNow=plan(restartRequiredCode,6,0.9);
 assert.equal(planNow.action,'retry');if(planNow.action!=='retry')return;
 assert.equal(planNow.delayMs,0);
 assert.equal(planNow.line,'whatsapp_reconnect attempt=7 delay_ms=0 code=515');
});

test('código de desconexão sai do erro Boom e não vaza objeto',()=>{
 assert.equal(disconnectCode({output:{statusCode:515}}),515);
 assert.equal(disconnectCode({statusCode:408}),408);
 assert.equal(disconnectCode(new Error('socket')),undefined);
 assert.equal(disconnectCode(undefined),undefined);
});

test('credencial rejeitada no primeiro heartbeat encerra com a mensagem amigável',async()=>{
 const logs:string[]=[];let started=0;let shutdowns=0;
 const error=Object.assign(new Error('Backend 401: Credencial inválida'),{status:401,stack:'Error: Backend 401\n    at gateway.ts:9:1 token=ob_secret'});
 const result=await supervise({
  heartbeat:async()=>{throw error;},
  startTransport:async()=>{started++;},
  syncGroups:async()=>{throw new Error('não devia sincronizar');},
  flushCaptures:async()=>{},
  work:async()=>{throw new Error('não devia trabalhar');},
  shutdown:async()=>{shutdowns++;},
  sleep:async()=>{throw new Error('não devia esperar');},
  log:line=>logs.push(line),
  isStopped:()=>false,
  transportStatus:()=>'disconnected',
  now:()=>0,
 });
 assert.equal(result,'credential_rejected');
 assert.deepEqual(logs,[cycleErrorLine('credential_rejected')]);
 assert.equal(logs[0],'credential_rejected: motor encerrado');
 assert.equal(started,0);assert.equal(shutdowns,1);
 assert.equal(logs.join('\n').includes('ob_secret'),false);
 assert.equal(logs.join('\n').includes('gateway.ts'),false);
 assert.equal(classifyCycleError(Object.assign(new Error('Backend 403: Credencial revogada'),{status:403})),'credential_rejected');
});

test('lease de outro motor no início espera e tenta de novo sem encerrar',async()=>{
 const logs:string[]=[];const sleeps:number[]=[];let beats=0;let started=0;let shutdowns=0;const statuses:string[]=[];
 const result=await supervise({
  heartbeat:async()=>{beats++;statuses.push('disconnected');if(beats<3)throw Object.assign(new Error('Backend 409: Outro motor está ativo'),{status:409});},
  startTransport:async()=>{started++;},
  syncGroups:async()=>{},
  flushCaptures:async()=>{},
  work:async()=>{},
  shutdown:async()=>{shutdowns++;},
  sleep:async ms=>{sleeps.push(ms);},
  log:line=>logs.push(line),
  isStopped:()=>beats>=3&&started===1,
  transportStatus:()=>'disconnected',
  now:()=>0,
 });
 assert.equal(result,'stopped');
 assert.equal(started,1);assert.equal(shutdowns,0);
 assert.deepEqual(logs,['lease_held: outro motor ainda detém a lease; nova tentativa em seguida','lease_held: outro motor ainda detém a lease; nova tentativa em seguida']);
 assert.deepEqual(sleeps,[5000,5000]);
 assert.deepEqual(statuses,['disconnected','disconnected','disconnected']);
 assert.equal(logs.join('\n').includes('Outro motor'),false);
});

test('heartbeat segue com o estado real e grupos só na conexão e a cada 15 minutos',async()=>{
 assert.ok(GROUPS_REFRESH_MS>60_000);
 assert.equal(GROUPS_REFRESH_MS,15*60*1000);
 assert.equal(shouldSyncGroups('disconnected',false,0),false);
 assert.equal(shouldSyncGroups('connected',false,0),true);
 assert.equal(shouldSyncGroups('connected',true,60_000),false);
 assert.equal(shouldSyncGroups('connected',true,GROUPS_REFRESH_MS),true);
 assert.equal(shouldSyncGroups('connected',true,1000,true),true);
 assert.equal(shouldSyncGroups('disconnected',false,0,true),false);
 const seen:string[]=[];const syncAt:number[]=[];let status:'connected'|'disconnected'='disconnected';let now=0;let cycles=0;
 await supervise({
  heartbeat:async()=>{seen.push(status);},
  startTransport:async()=>{},
  syncGroups:async()=>{syncAt.push(now);},
  flushCaptures:async()=>{},
  work:async()=>{
   cycles++;
   if(cycles===1)status='connected';
   else if(cycles===2)now=60_000;
   else if(cycles===3)now=60_000+GROUPS_REFRESH_MS;
   else if(cycles===4)status='disconnected';
   else if(cycles===5){status='connected';now+=1000;}
  },
  shutdown:async()=>{},
  sleep:async()=>{},
  log:()=>{},
  isStopped:()=>cycles>=6,
  transportStatus:()=>status,
  now:()=>now,
 });
 assert.deepEqual(seen,['disconnected','connected','connected','connected','disconnected','connected']);
 assert.deepEqual(syncAt,[0,60_000+GROUPS_REFRESH_MS,60_000+GROUPS_REFRESH_MS+1000]);
});

test('reconexão curta sincroniza grupos mesmo se o ciclo não observou a queda',async()=>{
 let epoch=1;let syncs=0;let cycles=0;
 await supervise({
  heartbeat:async()=>{},
  startTransport:async()=>{},
  syncGroups:async()=>{syncs++;},
  flushCaptures:async()=>{},
  work:async()=>{cycles++;if(cycles===1)epoch=2;},
  shutdown:async()=>{},
  sleep:async()=>{},
  log:()=>{},
  isStopped:()=>cycles>=2,
  transportStatus:()=>'connected',
  connectionEpoch:()=>epoch,
  now:()=>1_000,
 });
 assert.equal(syncs,2);
});

test('payload de heartbeat leva o estado desconectado e omite QR vencido',()=>{
 assert.deepEqual(heartbeatPayload('disconnected','QR-SECRET',1_000,2_000),{status:'disconnected',qr:null});
 assert.deepEqual(heartbeatPayload('awaiting_qr','QR-SECRET',1_000,20_000),{status:'awaiting_qr',qr:'QR-SECRET'});
 assert.deepEqual(heartbeatPayload('awaiting_qr','QR-SECRET',0,1_000),{status:'awaiting_qr',qr:null});
 assert.equal(classifyCycleError(Object.assign(new Error('Backend 409: Captura excede limite'),{status:409})),'cycle_failed');
 assert.equal(classifyCycleError(new Error('Backend 401: Credencial inválida')),'credential_rejected');
});

test('main supervisiona o primeiro heartbeat e o Baileys permanece silencioso',async()=>{
 const main=await readFile(new URL('../engine/src/main.ts',import.meta.url),'utf8');
 const baileys=await readFile(new URL('../engine/src/baileys.ts',import.meta.url),'utf8');
 assert.match(main,/supervise\(/);
 assert.match(main,/heartbeatPayload\(transport\.status/);
 assert.doesNotMatch(main,/await heartbeat\(\);\s*\nawait transport\.start/);
 assert.match(baileys,/level:\s*'silent'/);
 assert.match(baileys,/planReconnect\(/);
});

test('motor distribuído espelha engine/src',async()=>{
 const a=(await readdir(new URL('../engine/src',import.meta.url))).filter(name=>name.endsWith('.ts')).sort();
 const b=(await readdir(new URL('../distribuicao/motor/engine/src',import.meta.url))).filter(name=>name.endsWith('.ts')).sort();
 assert.deepEqual(a,b);
 for(const name of a)assert.equal(await readFile(new URL(`../distribuicao/motor/engine/src/${name}`,import.meta.url),'utf8'),await readFile(new URL(`../engine/src/${name}`,import.meta.url),'utf8'),name);
});

function fakeSocket(userId?:string){
 const listeners=new Map<string,Array<(payload:unknown)=>void>>();
 const sock={user:userId?{id:userId}:undefined,ended:false,ev:{on(event:string,fn:(payload:unknown)=>void){const list=listeners.get(event)??[];list.push(fn);listeners.set(event,list);}},end(){sock.ended=true;},emit(event:string,payload:unknown){for(const fn of [...(listeners.get(event)??[])])fn(payload);}};
 return sock;
}
async function transportFixture(random:()=>number=()=>0,expectedPhone?:string){
 const dir=await mkdtemp(join(tmpdir(),'ob-test-'));
 const vault=new Vault(dir,randomBytes(32));
 const sockets:ReturnType<typeof fakeSocket>[]=[];
 const queued:{ms:number;fn:()=>void}[]=[];
 const lines:string[]=[];
 const transport=new BaileysTransport(vault,expectedPhone,{
  createSocket:()=>{const sock=fakeSocket();sockets.push(sock);return sock as never;},
  schedule:(fn,ms)=>{const entry={ms,fn};queued.push(entry);return {cancel(){const index=queued.indexOf(entry);if(index>=0)queued.splice(index,1);}};},
  random,
  log:line=>lines.push(line),
 });
 await transport.start(async()=>{});
 return {transport,sockets,queued,lines,flush(){const batch=queued.splice(0,queued.length);for(const entry of batch)entry.fn();},clean:()=>rm(dir,{recursive:true,force:true})};
}
function close(sock:ReturnType<typeof fakeSocket>,code?:number){sock.emit('connection.update',{connection:'close',lastDisconnect:{error:code===undefined?new Error('queda'):{output:{statusCode:code}}}});}

test('o socket reconecta além de 8 quedas, na hora no 515, e registra o código',async()=>{
 const fx=await transportFixture(()=>0);try{
  const phone='5511900000000:12@s.whatsapp.net';
  fx.sockets[0].user={id:phone};
  fx.sockets[0].emit('connection.update',{connection:'open'});
  assert.equal(fx.transport.status,'connected');
  assert.equal(fx.lines.includes('whatsapp_connected'),true);
  assert.equal(fx.lines.join('\n').includes('5511900000000'),false);
  const delays:number[]=[];
  for(let i=0;i<9;i++){close(fx.sockets.at(-1)!,408);delays.push(fx.queued.at(-1)?.ms??-1);fx.flush();}
  assert.deepEqual(delays,[1000,2000,4000,5000,5000,5000,5000,5000,5000]);
  assert.equal(fx.sockets.length,10);
  assert.equal(fx.transport.status,'disconnected');
  assert.equal(fx.lines.filter(line=>line==='whatsapp_disconnected code=408').length,9);
  close(fx.sockets.at(-1)!,515);
  assert.equal(fx.queued[0]?.ms,0);
  assert.equal(fx.lines.at(-1),'whatsapp_reconnect attempt=10 delay_ms=0 code=515');
  fx.flush();
  assert.equal(fx.sockets.length,11);
 }finally{await fx.clean();}
});

test('logout, QR e socket antigo não reconectam nem vazam segredo',async()=>{
 const fx=await transportFixture(()=>0,'5511900000000');try{
  fx.sockets[0].emit('connection.update',{qr:'QR-SECRET-DO-NOT-LOG'});
  assert.equal(fx.transport.status,'awaiting_qr');
  assert.equal(fx.lines.join('\n').includes('QR-SECRET'),false);
  close(fx.sockets[0],401);
  assert.equal(fx.queued.length,0);
  assert.equal(fx.transport.status,'disconnected');
  assert.equal(fx.lines.includes('whatsapp_disconnected code=401'),true);
  assert.match(fx.lines.join('\n'),/logged_out:.*session\.enc/);
  fx.sockets[0].emit('connection.update',{connection:'open'});
  assert.equal(fx.transport.status,'disconnected');
  assert.equal(fx.sockets.length,1);
  const replaced=await transportFixture(()=>0,'5511900000000');
  try{
   replaced.sockets[0].user={id:'5511999999999:1@s.whatsapp.net'};
   replaced.sockets[0].emit('connection.update',{connection:'open'});
   assert.equal(replaced.transport.status,'disconnected');
   assert.match(replaced.lines.join('\n'),/account_mismatch/);
   assert.equal(replaced.lines.join('\n').includes('5511999999999'),false);
   close(replaced.sockets[0],408);
   assert.equal(replaced.queued.length,0);
  }finally{await replaced.clean();}
 }finally{await fx.clean();}
});

test('queda de um socket substituído não derruba a sessão nova',async()=>{
 const fx=await transportFixture();try{
  fx.sockets[0].user={id:'5511900000000:1@s.whatsapp.net'};
  fx.sockets[0].emit('connection.update',{connection:'open'});
  assert.equal(fx.transport.connectionEpoch,1);
  close(fx.sockets[0],408);fx.flush();
  fx.sockets[1].user={id:'5511900000000:1@s.whatsapp.net'};
  fx.sockets[1].emit('connection.update',{connection:'open'});
  assert.equal(fx.transport.status,'connected');
  assert.equal(fx.transport.connectionEpoch,2);
  close(fx.sockets[0],401);
  assert.equal(fx.transport.status,'connected');
  assert.equal(fx.queued.length,0);
  assert.equal(fx.sockets.length,2);
  close(fx.sockets[1],428);
  assert.equal(fx.transport.status,'disconnected');
  assert.equal(fx.queued.length,1);
 }finally{await fx.clean();}
});
