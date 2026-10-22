/** Integração opcional: somente Supabase local exclusivo do OfertaBot, nunca banco hospedado. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {HttpGateway} from '../engine/src/gateway';
import {Worker} from '../engine/src/worker';
import {Vault} from '../engine/src/vault';
import {MockTransport} from '../engine/src/mock';
const enabled=process.env.OFERTABOT_LOCAL_INTEGRATION==='1';
test('Supabase local: Auth, Storage, API HTTP, publicação simulada e revogação concorrente',{skip:!enabled,timeout:120000},async t=>{
 const config=JSON.parse(execFileSync(process.platform==='win32'?'npx.cmd':'npx',['supabase','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
 assert.equal(new URL(config.API_URL).hostname,'127.0.0.1','Este teste recusa backend remoto');
 const container='supabase_db_ofertabot';execFileSync('docker',['inspect',container],{stdio:'ignore'});
 const client=()=>createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const a=client(),b=client(),anon=client();const password=randomBytes(24).toString('hex');const email=`ofertabot-${randomUUID()}@example.test`;
 const act=async(c:SupabaseClient,action:string,payload:Record<string,unknown>)=>{const r=await c.rpc('app_action',{p_action:action,p_payload:payload});assert.equal(r.error,null,r.error?.message);return r.data;};
 const snap=async()=>{const r=await a.rpc('app_snapshot',{p_company:company});assert.equal(r.error,null,r.error?.message);return r.data;};
 let company:string,otherCompany:string,engine:HttpGateway,connection:string,token:string,source:string,dest:string,offer:string;
 const dir=await mkdtemp(join(tmpdir(),'ofertabot-local-test-'));
 try{
 await t.test('cadastro, login, senha errada e recuperação no Auth real local',async()=>{
  const first=await a.auth.signUp({email,password});assert.equal(first.error,null,first.error?.message);assert.ok(first.data.user);assert.ok(first.data.session);
  const second=await b.auth.signUp({email:`ofertabot-${randomUUID()}@example.test`,password});assert.equal(second.error,null,second.error?.message);
  const bad=await anon.auth.signInWithPassword({email,password:'senha-invalida'});assert.ok(bad.error);
  await a.auth.signOut();const login=await a.auth.signInWithPassword({email,password});assert.equal(login.error,null);
  const recover=await a.auth.resetPasswordForEmail(email,{redirectTo:'http://localhost:5173'});assert.equal(recover.error,null,recover.error?.message);
 });
 await t.test('empresa e isolamento real pela API e RLS',async()=>{
  assert.ok((await anon.rpc('app_snapshot')).error);
  company=(await act(a,'create_company',{name:'INTEGRAÇÃO LOCAL A',timezone:'America/Sao_Paulo'})).id;
  otherCompany=(await act(b,'create_company',{name:'INTEGRAÇÃO LOCAL B',timezone:'UTC'})).id;
  assert.ok((await b.rpc('app_snapshot',{p_company:company})).error);
  const rows=await b.from('companies').select('id');assert.deepEqual(rows.data,[{id:otherCompany}]);
  assert.ok((await b.from('companies').update({group_limit:999}).eq('id',otherCompany)).error);
 });
 await t.test('credencial limitada, listagem e configuração dos grupos pela API',async()=>{
  const issued=await act(a,'issue_engine',{company_id:company,label:'MOTOR SIMULADO LOCAL'});token=issued.token;connection=issued.connection_id;
  engine=new HttpGateway(config.API_URL+'/functions/v1/engine-api',token,randomUUID());
  const invalid=await fetch(config.API_URL+'/functions/v1/engine-api',{method:'POST',headers:{Authorization:'Bearer invalid'},body:'{}'});assert.equal(invalid.status,401);
  await engine.call('heartbeat',{status:'connected'});await engine.call('groups',{groups:[{jid:'local-source@g.us',name:'ORIGEM SIMULADA'},{jid:'local-dest@g.us',name:'DESTINO SIMULADO'}]});
  const state=await snap();source=state.groups.find((g:any)=>g.is_source===false&&g.jid==='local-source@g.us').id;dest=state.groups.find((g:any)=>g.jid==='local-dest@g.us').id;
  await act(a,'set_groups',{company_id:company,groups:[{id:source,is_source:true,is_destination:false},{id:dest,is_source:false,is_destination:true}]});
 });
 await t.test('upload privado, bloqueio entre empresas e captura deduplicada de imagem',async()=>{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN6kAAAAASUVORK5CYII=','base64');
  const path=await engine.upload(png,'image/png',createHash('sha256').update(png).digest('hex'));
  assert.ok((await b.storage.from('offer-media').download(path)).error);assert.equal((await a.storage.from('offer-media').download(path)).error,null);
  assert.ok((await b.storage.from('offer-media').upload(company+'/invasion.png',png,{contentType:'image/png'})).error);
  const message={message_id:'local-image',group_jid:'local-source@g.us',received_at:new Date().toISOString(),text:'Produto R$ 19,90',images:[path],media_kind:'image',media_status:'ready'};
  offer=(await engine.call<{id:string}>('capture',message)).id;assert.ok(offer);assert.equal((await engine.call<{duplicate:boolean}>('capture',message)).duplicate,true);
 });
 await t.test('aprovação e envio por transporte simulado usando backend HTTP real',async()=>{
  const state=await snap();await act(a,'save_company',{...state.company,company_id:company,settings:{...state.company.settings,send_enabled:true,min_interval_seconds:10}});
  await act(a,'approve_offer',{company_id:company,id:offer,version:1});
  const payload={company_id:company,offer_id:offer,version:1,group_ids:[dest],timezone:'America/Sao_Paulo',idempotency_key:randomUUID()};
  await act(a,'enqueue',payload);await act(a,'enqueue',{...payload,idempotency_key:randomUUID()});
  const transport=new MockTransport();const worker=new Worker(engine,transport,new Vault(dir,randomBytes(32)));await worker.once();await worker.once();
  assert.equal(transport.sent.length,1);assert.ok(transport.sent[0].image);const after=await snap();assert.equal(after.publications.length,1);assert.equal(after.publications[0].status,'sent');
 });
 await t.test('IA sem chave mantém edição manual disponível',async()=>{
  const session=(await a.auth.getSession()).data.session!;const r=await fetch(config.API_URL+'/functions/v1/rewrite',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({company_id:company,offer_id:offer})});assert.equal(r.status,503);
 });
 await t.test('revogação vence heartbeat aguardando lock em outra sessão PostgreSQL',async()=>{
  const psql=['exec','-i',container,'psql','-U','postgres','-d','postgres','-XAt','-v','ON_ERROR_STOP=1'];
  const blocker=spawn('docker',psql,{stdio:['pipe','pipe','pipe']});let output='';let err='';blocker.stdout.on('data',d=>output+=d);blocker.stderr.on('data',d=>err+=d);
  const waitFor=async(fn:()=>boolean|Promise<boolean>)=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw new Error('Timeout ao sincronizar sessões PostgreSQL');};
  try{
   blocker.stdin.write(`begin; select id from public.companies where id='${company}' for update; select 'LOCK_HELD';\n`);await waitFor(()=>output.includes('LOCK_HELD'));
   const heartbeat=engine.call('heartbeat',{status:'connected'}).then(()=>({allowed:true}),e=>({allowed:false,status:e.status}));
   await waitFor(()=>Number(execFileSync('docker',psql,{input:"select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%engine_call%';",encoding:'utf8'}).trim())>0);
   blocker.stdin.end(`update private.engine_credentials set revoked_at=now() where connection_id='${connection}'; update public.connections set status='revoked' where id='${connection}'; commit;\n`);
   const result=await heartbeat;assert.equal(result.allowed,false);assert.equal('status' in result?result.status:null,403);assert.equal((await snap()).connections[0].status,'revoked');
  }finally{blocker.stdin.end();if(blocker.exitCode===null)blocker.kill();assert.equal(err,'');}
 });
 }finally{await a.auth.signOut();await b.auth.signOut();await rm(dir,{recursive:true,force:true});}
});
