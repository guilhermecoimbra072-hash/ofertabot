import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const enabled=process.env.OFERTABOT_TEST_POSTGRES==='1';
test('PostgreSQL: duas sessões disputam claim e revogação vence heartbeat bloqueado',{skip:!enabled,timeout:90000},async t=>{
 const container='ofertabot-test-'+randomUUID();const actor=randomUUID(),instance=randomUUID();
 execFileSync('docker',['run','-d','--name',container,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17.6-alpine'],{stdio:'ignore'});
 const args=['exec','-i',container,'psql','-U','postgres','-d','postgres','-qXAt','-v','ON_ERROR_STOP=1'];
 const sql=(s:string)=>execFileSync('docker',args,{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const asyncSql=(s:string)=>new Promise<string>((resolve,reject)=>{const p=spawn('docker',args);let out='';p.stdout.on('data',d=>out+=d);p.stderr.resume();p.on('error',reject);p.on('close',code=>code?reject(new Error('Consulta PostgreSQL rejeitada')):resolve(out.trim()));p.stdin.end(s);});
 const waitFor=async(fn:()=>boolean)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,50));}throw new Error('Sessões PostgreSQL não sincronizaram');};
 try{
  await waitFor(()=>{try{execFileSync('docker',['exec',container,'pg_isready','-U','postgres'],{stdio:'ignore'});return true;}catch{return false;}});
  sql(await readFile(new URL('./support-schema.sql',import.meta.url),'utf8')+await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  sql(`insert into auth.users values('${actor}','local-test@example.invalid');`);
  const userSql=`set request.jwt.claim.sub='${actor}'; set role authenticated; `;
  const action=(name:string,p:unknown)=>JSON.parse(sql(userSql+`select app_action('${name}','${JSON.stringify(p)}'::jsonb);`));
  const company=action('create_company',{name:'CONCORRÊNCIA SIMULADA',timezone:'UTC'}).id;
  const issued=action('issue_engine',{company_id:company,label:'SIMULADO'});const token=issued.token,connection=issued.connection_id;
  const engineSql=(name:string,p:object={})=>`set role service_role; select engine_call('${token}','${name}','${JSON.stringify({instance_id:instance,...p})}'::jsonb);`;
  sql(engineSql('heartbeat',{status:'connected'}));sql(engineSql('groups',{groups:[{jid:'src@g.us',name:'Origem SIMULADA'},{jid:'dst@g.us',name:'Destino SIMULADO'}]}));
  const groups=JSON.parse(sql('select json_agg(g) from public.groups g;'));const source=groups.find((g:any)=>g.jid==='src@g.us').id,dest=groups.find((g:any)=>g.jid==='dst@g.us').id;
  action('set_groups',{company_id:company,groups:[{id:source,is_source:true,is_destination:false},{id:dest,is_source:false,is_destination:true}]});
  const offer=JSON.parse(sql(engineSql('capture',{group_jid:'src@g.us',message_id:'concurrent',received_at:new Date().toISOString(),text:'Produto simulado',images:[],media_kind:'text',media_status:'ready'}))).id;
  const companyState=JSON.parse(sql('select to_json(c) from public.companies c;'));
  action('save_company',{...companyState,company_id:company,settings:{...companyState.settings,send_enabled:true}});action('approve_offer',{company_id:company,id:offer,version:1});
  action('enqueue',{company_id:company,offer_id:offer,version:1,group_ids:[dest],timezone:'UTC',idempotency_key:randomUUID()});
  await t.test('claim concorrente entrega uma única tarefa',async()=>{
   const results=await Promise.all([asyncSql(engineSql('claim')),asyncSql(engineSql('claim'))]);assert.equal(results.filter(x=>x&&x!=='null').length,1);assert.equal(sql("select count(*) from publications where status='processing';"),'1');
  });
  await t.test('credencial revogada durante espera não ressuscita conexão',async()=>{
   const blocker=spawn('docker',args);let output='';blocker.stdout.on('data',d=>output+=d);blocker.stderr.resume();
   try{
    blocker.stdin.write(`begin;select id from public.companies where id='${company}' for update;select 'LOCK_HELD';\n`);await waitFor(()=>output.includes('LOCK_HELD'));
    const heartbeat=asyncSql(engineSql('heartbeat',{status:'connected'})).then(()=>true,()=>false);
    await waitFor(()=>Number(sql("select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%engine_call%';"))>0);
    blocker.stdin.end(userSql+`select app_action('revoke_engine','${JSON.stringify({company_id:company,connection_id:connection})}'::jsonb);commit;\n`);
    assert.equal(await heartbeat,false);assert.equal(sql(`select status from connections where id='${connection}';`),'revoked');
   }finally{blocker.stdin.end();if(blocker.exitCode===null)blocker.kill();}
  });
 }finally{execFileSync('docker',['rm','-f','-v',container],{stdio:'ignore'});}
});
