import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database,user,rpc} from './db-helper';
let db:Awaited<ReturnType<typeof database>>;const u1=randomUUID(),u2=randomUUID(),u3=randomUUID(),instance=randomUUID();let c1:string,c2:string,token:string,cn:string,source:string,dest:string,offer:string;
const act=(a:string,p:Record<string,unknown>={})=>rpc(db,'app_action',a,{company_id:c1,...p});
const engine=(a:string,p:Record<string,unknown>={})=>rpc(db,'engine_call',token,a,{instance_id:instance,...p});
before(async()=>{db=await database();await db.query('insert into auth.users values($1,$2),($3,$4),($5,$6)',[u1,'a@example.invalid',u2,'b@example.invalid',u3,'c@example.invalid']);});
after(async()=>{await db?.close();});
test('autenticação obrigatória e isolamento de empresas em SELECT, RPC e Storage',async()=>{
 await assert.rejects(rpc(db,'app_snapshot'),/Autenticação/);await user(db,u1);c1=(await act('create_company',{name:'Loja A',timezone:'America/Sao_Paulo'})).id;
 await user(db,u2);c2=(await act('create_company',{name:'Loja B',timezone:'UTC'})).id;
 assert.equal((await db.query('select * from companies')).rows.length,1);
 await assert.rejects(rpc(db,'app_snapshot',c1),/Acesso negado/);
 await assert.rejects(act('save_template',{name:'Invasão',body:'x'}),/Acesso negado/);
 await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['offer-media',c1+'/x.png']),/row-level security/);
 await assert.rejects(db.query('update companies set group_limit=999 where id=$1',[c2]),/permission denied/);
 await user(db,u1);await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['offer-media',c1+'/original.png']);
 await user(db,u2);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
 await user(db,u1);assert.equal((await db.query('select * from storage.objects')).rows.length,1);
});
test('motor revogável, escopo restrito e exclusão de instâncias concorrentes',async()=>{
 await user(db,u1);const issued=await act('issue_engine',{label:'Teste'});token=issued.token;cn=issued.connection_id;
 await assert.rejects(engine('heartbeat',{status:'connected'}),/permission denied/);
 await db.exec('reset role;set role service_role');
 await assert.rejects(rpc(db,'engine_call','ob_invalid','heartbeat',{}),/Credencial/);
 await engine('heartbeat',{status:'connected'});
 await assert.rejects(engine('heartbeat',{status:'connected',instance_id:randomUUID()}),/Outro motor/);
 await engine('groups',{groups:[{jid:'origem@g.us',name:'Origem'},{jid:'destino@g.us',name:'Destino'}]});
 await user(db,u1);const snap=await rpc(db,'app_snapshot',c1);source=snap.groups.find((g:any)=>g.jid==='origem@g.us').id;dest=snap.groups.find((g:any)=>g.jid==='destino@g.us').id;
 await act('set_groups',{groups:[{id:source,is_source:true,is_destination:false},{id:dest,is_source:false,is_destination:true}]});
 await assert.rejects(act('set_groups',{groups:[{id:dest,is_source:true,is_destination:true}]}),/check constraint/);
});
test('captura texto/imagem deduplicada e bloqueio de mensagens próprias/destinos',async()=>{
 await db.exec('reset role;set role service_role');
 const message={message_id:'m-1',group_jid:'origem@g.us',received_at:new Date().toISOString(),text:'Celular R$ 1.299,90',images:[c1+'/original.png'],media_kind:'image',media_status:'ready'};
 assert.equal((await engine('capture',{...message,from_me:true})).ignored,'own_message');
 assert.equal((await engine('capture',{...message,group_jid:'destino@g.us'})).ignored,'not_source');
 offer=(await engine('capture',message)).id;assert.ok(offer);assert.equal((await engine('capture',message)).duplicate,true);
 await assert.rejects(engine('capture',{...message,message_id:'foreign',images:[c2+'/secret.png']}),/Imagem inválida/);
 await user(db,u1);assert.equal((await rpc(db,'app_snapshot',c1)).offers.length,1);
});
test('aprovação, dinheiro exato, snapshots e proteção contra cliques repetidos',async()=>{
 await user(db,u1);
 await act('save_offer',{id:offer,version:1,edited_text:'Meu celular R$ 1.399,90',edited_image:null,price_minor:'139990',currency:'BRL'});
 await assert.rejects(act('approve_offer',{id:offer,version:1}),/Oferta mudou/);
 await act('approve_offer',{id:offer,version:2});
 const enqueue={offer_id:offer,version:2,group_ids:[dest],timezone:'America/Sao_Paulo',idempotency_key:randomUUID()};
 await assert.rejects(act('enqueue',enqueue),/Habilite/);
 let snap=await rpc(db,'app_snapshot',c1);await act('save_company',{...snap.company,settings:{...snap.company.settings,send_enabled:true,min_interval_seconds:10}});
 await act('enqueue',enqueue);await act('enqueue',{...enqueue,idempotency_key:randomUUID()});snap=await rpc(db,'app_snapshot',c1);assert.equal(snap.publications.length,1);assert.equal(snap.offers[0].price_minor,'139990');
 await act('save_offer',{id:offer,version:2,edited_text:'Outra versão',edited_image:null,price_minor:'9007199254740993',currency:'PYG'});
 snap=await rpc(db,'app_snapshot',c1);assert.equal(snap.offers[0].status,'pending');assert.equal(snap.offers[0].price_minor,'9007199254740993');assert.equal(snap.publications[0].text,'Meu celular R$ 1.399,90');
});
test('claim exclusivo; confirmação necessária; resultado incerto após reinício não é reenviado',async()=>{
 await db.exec('reset role;set role service_role');const job=await engine('claim');assert.ok(job);assert.equal(await engine('claim'),null);
 await assert.rejects(engine('finish',{id:job.id,lease_token:job.lease_token,outcome:'sent',transport_id:'x'}),/Confirmação/);
 await engine('begin_send',{id:job.id,lease_token:job.lease_token});
 await user(db,u1);await assert.rejects(act('cancel_publication',{id:job.id}),/já iniciada/);
 await db.exec('reset role');await db.query("update publications set lease_until=now()-interval '1 second' where id=$1",[job.id]);await db.exec('set role service_role');await engine('heartbeat',{status:'connected'});assert.equal(await engine('claim'),null);
 await user(db,u1);const p=(await rpc(db,'app_snapshot',c1)).publications[0];assert.equal(p.status,'uncertain');await act('resolve_publication',{id:p.id,resolution:'sent',note:'Verificado manualmente no grupo'});
});
test('agendamento, atraso retido, liberação explícita e cancelamento',async()=>{
 await user(db,u1);await act('approve_offer',{id:offer,version:3});
 await act('enqueue',{offer_id:offer,version:3,group_ids:[dest],timezone:'America/Sao_Paulo',scheduled_at:new Date(Date.now()+3600000).toISOString(),idempotency_key:randomUUID()});
 const p=(await rpc(db,'app_snapshot',c1)).publications.find((p:any)=>p.status==='scheduled');
 await db.exec('reset role;set role service_role');assert.equal(await engine('claim'),null);
 await db.exec('reset role');await db.query("update publications set scheduled_at=now()-interval '1 hour' where id=$1",[p.id]);await db.exec('set role service_role');await engine('heartbeat',{status:'connected'});
 await user(db,u1);assert.equal((await rpc(db,'app_snapshot',c1)).publications.find((x:any)=>x.id===p.id).on_hold,true);
 await act('release_publication',{id:p.id,scheduled_at:new Date(Date.now()+60000).toISOString(),timezone:'America/Sao_Paulo'});await act('cancel_publication',{id:p.id});assert.equal((await rpc(db,'app_snapshot',c1)).publications.find((x:any)=>x.id===p.id).status,'cancelled');
});
test('limite de plano é aplicado no backend e não pode ser elevado pelo proprietário',async()=>{
 await db.exec('reset role;set role service_role');await engine('groups',{groups:Array.from({length:12},(_,i)=>({jid:`g${i}@g.us`,name:`G${i}`}))});
 await user(db,u1);const snap=await rpc(db,'app_snapshot',c1);
 await assert.rejects(act('set_groups',{groups:snap.groups.map((g:any)=>({id:g.id,is_source:true,is_destination:false}))}),/Limite do plano/);
 assert.equal((await rpc(db,'app_snapshot',c1)).groups.filter((g:any)=>g.is_source||g.is_destination).length,2);
 await assert.rejects(rpc(db,'admin_set_plan',c1,'professional',null),/permission denied/);
 await db.exec('reset role;set role service_role');await rpc(db,'admin_set_plan',c1,'professional',null);await user(db,u1);assert.equal((await rpc(db,'app_snapshot',c1)).company.group_limit,50);
});
test('leitor não edita; QR privado não aparece ao leitor; credencial revogada para de funcionar',async()=>{
 await user(db,u1);await act('set_member',{email:'c@example.invalid',role:'viewer'});
 await db.exec('reset role;set role service_role');await engine('heartbeat',{status:'awaiting_qr',qr:'QR-TEST-SECRET'});
 await user(db,u3);assert.equal((await rpc(db,'app_snapshot',c1)).connections[0].qr,null);assert.equal((await db.query('select * from connections')).rows.length,0);await assert.rejects(act('save_template',{name:'x',body:'x'}),/Acesso negado/);
 await user(db,u1);await act('revoke_engine',{connection_id:cn});await db.exec('reset role;set role service_role');await assert.rejects(engine('heartbeat',{status:'connected'}),/Credencial/);
});
test('grupos de conexão revogada não podem voltar a ser ativados',async()=>{
 await user(db,u1);await assert.rejects(act('set_groups',{groups:[{id:dest,is_source:false,is_destination:true}]}),/revogada/);
});
test('agendamento rejeita destino revogado mesmo com marcação legada no banco',async()=>{
 await db.exec('reset role');await db.query('update groups set is_destination=true where id=$1',[dest]);await user(db,u1);
 await assert.rejects(act('enqueue',{offer_id:offer,version:3,group_ids:[dest],timezone:'UTC',idempotency_key:randomUUID()}),/Destino inválido/);
});
test('pesquisa alcança o arquivo e vídeo, áudio e documento prontos podem ser aprovados',async()=>{
 await user(db,u1);const issued=await act('issue_engine',{label:'Arquivo'});token=issued.token;const connection=issued.connection_id;
 await db.exec('reset role;set role service_role');
 await engine('heartbeat',{status:'connected'});
 await engine('groups',{groups:[{jid:'arquivo@g.us',name:'Arquivo'}]});
 await user(db,u1);const src=(await rpc(db,'app_snapshot',c1)).groups.find((g:any)=>g.jid==='arquivo@g.us').id;
 await act('set_groups',{groups:[{id:src,is_source:true,is_destination:false}]});
 await db.exec('reset role');
 for(const name of ['clip.mp4','nota.ogg','arquivo.pdf'])await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['offer-media',`${c1}/${name}`]);
 await db.exec('set role service_role');
 const video=await engine('capture',{message_id:'vid-1',group_jid:'arquivo@g.us',received_at:new Date().toISOString(),text:'Vídeo da loja',images:[`${c1}/clip.mp4`],media_kind:'video',media_status:'ready'});
 const audio=await engine('capture',{message_id:'aud-1',group_jid:'arquivo@g.us',received_at:new Date().toISOString(),text:'Áudio da loja',images:[`${c1}/nota.ogg`],media_kind:'audio',media_status:'ready'});
 const document=await engine('capture',{message_id:'doc-1',group_jid:'arquivo@g.us',received_at:new Date().toISOString(),text:'PDF da loja',images:[`${c1}/arquivo.pdf`],media_kind:'document',media_status:'ready'});
 const blocked=await engine('capture',{message_id:'bad-media',group_jid:'arquivo@g.us',received_at:new Date().toISOString(),text:'Tipo desconhecido',images:[],media_kind:'unsupported',media_status:'unsupported'});
 await user(db,u1);
 await act('approve_offer',{id:video.id,version:1});
 await act('approve_offer',{id:audio.id,version:1});
 await act('approve_offer',{id:document.id,version:1});
 await assert.rejects(act('approve_offer',{id:blocked.id,version:1}),/Mídia não processada/);
 await db.exec('reset role');
 await db.query(`insert into offers(company_id,connection_id,group_id,message_id,received_at,original_text,edited_text,media_kind,media_status)
  select $1,$2,$3,'old-'||g::text,now()-(g::text||' minutes')::interval,case when g=130 then 'ARQUIVO-UNICO-XYZ' else 'lote' end,'lote','text','ready' from generate_series(1,130) g`,[c1,connection,src]);
 await user(db,u1);
 const first=await rpc(db,'app_snapshot',c1,null,0,0,0,null);
 assert.equal(first.offers.some((o:any)=>String(o.original_text).includes('ARQUIVO-UNICO')),false);
 assert.ok(first.page.offers.total>100);
 const found=await rpc(db,'app_snapshot',c1,'ARQUIVO-UNICO-XYZ',0,0,0,null);
 assert.equal(found.offers.length,1);
 assert.equal(found.offers[0].original_text,'ARQUIVO-UNICO-XYZ');
 const later=await rpc(db,'app_snapshot',c1,null,100,0,0,null);
 assert.ok(later.offers.length>0);
 assert.ok(later.offers.some((o:any)=>o.original_text==='ARQUIVO-UNICO-XYZ'||o.original_text==='lote'));
});
