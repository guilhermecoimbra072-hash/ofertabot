-- Arquivo paginado, mídia aprovável e código real de falha de captura.
drop function if exists public.app_snapshot(uuid);
create function public.app_snapshot(p_company uuid default null, p_search text default null, p_offer_offset int default 0, p_publication_offset int default 0, p_audit_offset int default 0, p_offer_status text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid; r text; result jsonb; s text; oo int; po int; ao int; st text; begin
 if auth.uid() is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select co.*,m.role from public.companies co join public.members m on co.id=m.company_id where m.user_id=auth.uid() order by co.created_at) x;
 c:=coalesce(p_company,(result->0->>'id')::uuid);
 if c is null then return jsonb_build_object('companies',result); end if;
 perform private.require_role(c,array['owner','admin','editor','viewer']); r:=private.member_role(c);
 s:=nullif(left(btrim(coalesce(p_search,'')),200),'');
 oo:=least(greatest(coalesce(p_offer_offset,0),0),1000000);
 po:=least(greatest(coalesce(p_publication_offset,0),0),1000000);
 ao:=least(greatest(coalesce(p_audit_offset,0),0),1000000);
 st:=case when p_offer_status in ('pending','approved','rejected') then p_offer_status else null end;
 return jsonb_build_object('companies',result,'company',(select to_jsonb(co)||jsonb_build_object('role',r) from public.companies co where id=c),
 'connections',(select coalesce(jsonb_agg((to_jsonb(x)-'instance_id'-'instance_until'-'qr')||jsonb_build_object('qr',case when r in ('owner','admin') and x.qr_expires_at>now() then x.qr else null end)),'[]') from public.connections x where company_id=c),
 'stats',jsonb_build_object('received',(select count(*) from public.offers where company_id=c),'pending',(select count(*) from public.offers where company_id=c and status='pending'),'sent',(select count(*) from public.publications where company_id=c and status='sent'),'failed',(select count(*) from public.publications where company_id=c and status='failed')),
 'groups',(select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]') from public.groups x where company_id=c),
 'offers',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('price_minor',x.price_minor::text) order by x.received_at desc),'[]') from (select * from public.offers where company_id=c and (s is null or strpos(lower(original_text||' '||edited_text||' '||message_id), lower(s))>0) and (st is null or status=st) order by received_at desc offset oo limit 100) x),
 'publications',(select coalesce(jsonb_agg(to_jsonb(x)-'lease_token' order by x.created_at desc),'[]') from (select * from public.publications where company_id=c and (s is null or strpos(lower(text), lower(s))>0) order by created_at desc offset po limit 100) x),
 'audit',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from (select * from public.audit where company_id=c and (s is null or strpos(lower(event), lower(s))>0) order by created_at desc offset ao limit 100) x),
 'templates',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.templates x where company_id=c),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,'role',m.role)),'[]') from public.members m join auth.users u on u.id=m.user_id where m.company_id=c and r in ('owner','admin')),
 'page',jsonb_build_object(
  'offers',jsonb_build_object('offset',oo,'limit',100,'total',(select count(*)::int from public.offers where company_id=c and (s is null or strpos(lower(original_text||' '||edited_text||' '||message_id), lower(s))>0) and (st is null or status=st))),
  'publications',jsonb_build_object('offset',po,'limit',100,'total',(select count(*)::int from public.publications where company_id=c and (s is null or strpos(lower(text), lower(s))>0))),
  'audit',jsonb_build_object('offset',ao,'limit',100,'total',(select count(*)::int from public.audit where company_id=c and (s is null or strpos(lower(event), lower(s))>0)))
 ));
end $$;

create or replace function public.app_action(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid; i uuid; o public.offers; co public.companies; pub public.publications; item jsonb; target uuid; t text; r text; z text; n int; when_at timestamptz; result jsonb:='{}'; begin
 if auth.uid() is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
 if p_action='create_company' then
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if (select count(*) from public.members where user_id=auth.uid() and role='owner')>=5 then raise exception 'Limite de empresas próprias atingido'; end if;
  z:=coalesce(p_payload->>'timezone','America/Sao_Paulo'); if not private.valid_timezone(z) then raise exception 'Fuso inválido'; end if;
  insert into public.companies(name,timezone) values(trim(p_payload->>'name'),z) returning id into c;
  insert into public.members values(c,auth.uid(),'owner'); perform private.log(c,'company.created',c); return jsonb_build_object('id',c);
 end if;
 c:=(p_payload->>'company_id')::uuid; perform private.require_role(c,array['owner','admin','editor']); r:=private.member_role(c);
 select * into co from public.companies where id=c for update;
 i:=nullif(p_payload->>'id','')::uuid;
 if p_action in ('save_offer','approve_offer','reject_offer','enqueue') then
  if p_action='enqueue' then i:=(p_payload->>'offer_id')::uuid; end if;
  select * into o from public.offers where company_id=c and id=i for update;
  if not found then raise exception 'Oferta não encontrada'; end if;
  if o.version is distinct from (p_payload->>'version')::int then raise exception 'Oferta mudou. Atualize antes de continuar.' using errcode='40001'; end if;
 end if;
 case p_action
 when 'save_offer' then
  if not private.valid_image(c,p_payload->>'uploaded_original') then raise exception 'Original inválido'; end if;
  if not private.valid_image(c,p_payload->>'edited_image') then raise exception 'Imagem inválida'; end if;
  if length(p_payload->>'edited_text')>4000 then raise exception 'Texto deve ter até 4000 caracteres'; end if;
  update public.offers set original_images=case when p_payload->>'uploaded_original' is not null and not original_images ? (p_payload->>'uploaded_original') then original_images||jsonb_build_array(p_payload->>'uploaded_original') else original_images end,edited_text=coalesce(p_payload->>'edited_text',''),edited_image=p_payload->>'edited_image',price_minor=nullif(p_payload->>'price_minor','')::bigint,currency=coalesce(p_payload->>'currency','BRL'),status='pending',version=version+1 where id=i returning * into o;
  insert into public.offer_revisions(company_id,offer_id,version,content,actor_id) values(c,i,o.version,to_jsonb(o),auth.uid());
 when 'approve_offer' then
  if o.media_status<>'ready' or o.media_kind not in ('text','image','video','audio','document') then raise exception 'Mídia não processada: revisão necessária'; end if;
  if trim(o.edited_text)='' and o.edited_image is null and jsonb_array_length(o.original_images)=0 then raise exception 'Oferta vazia'; end if;
  update public.offers set status='approved' where id=i;
 when 'reject_offer' then update public.offers set status='rejected' where id=i;
 when 'enqueue' then
  if o.status<>'approved' then raise exception 'Aprovação necessária'; end if;
  if not coalesce((co.settings->>'send_enabled')::boolean,false) then raise exception 'Habilite os envios nas configurações do motor'; end if;
  z:=p_payload->>'timezone'; if not private.valid_timezone(z) then raise exception 'Fuso inválido'; end if;
  when_at:=coalesce(nullif(p_payload->>'scheduled_at','')::timestamptz,now());
  if when_at<now()-interval '5 seconds' then raise exception 'Horário no passado'; end if;
  if jsonb_array_length(p_payload->'group_ids') not between 1 and 100 then raise exception 'Selecione de 1 a 100 destinos'; end if;
  for t in select jsonb_array_elements_text(p_payload->'group_ids') loop
   select id into target from public.groups where id=t::uuid and company_id=c and is_destination and not is_source and exists(select 1 from public.connections cn where cn.id=public.groups.connection_id and cn.status<>'revoked');
   if not found then raise exception 'Destino inválido'; end if;
   insert into public.publications(company_id,connection_id,offer_id,group_id,offer_version,text,image,status,scheduled_at,timezone,idempotency_key)
   select c,g.connection_id,i,target,o.version,o.edited_text,coalesce(o.edited_image,o.original_images->>0),case when when_at>now()+interval '5 seconds' then 'scheduled' else 'queued' end,when_at,z,(p_payload->>'idempotency_key')::uuid from public.groups g where g.id=target
   on conflict(offer_id,offer_version,group_id) do nothing;
  end loop;
 when 'cancel_publication' then
  update public.publications set status='cancelled',lease_token=null,lease_until=null where id=i and company_id=c and (status in ('queued','scheduled') or (status='processing' and send_started_at is null));
  if not found then raise exception 'Publicação já iniciada ou encerrada'; end if;
 when 'release_publication' then
  when_at:=(p_payload->>'scheduled_at')::timestamptz; z:=p_payload->>'timezone';
  if when_at is null or when_at<now() or not private.valid_timezone(z) then raise exception 'Horário/fuso inválido'; end if;
  update public.publications set on_hold=false,scheduled_at=when_at,timezone=z,error_code=null where id=i and company_id=c and on_hold and status in ('queued','scheduled');
  if not found then raise exception 'Agendamento não está retido'; end if;
 when 'resolve_publication' then
  perform private.require_role(c,array['owner','admin']);
  if p_payload->>'resolution' not in ('sent','failed') or length(trim(p_payload->>'note'))<5 then raise exception 'Informe o resultado verificado e uma nota'; end if;
  update public.publications set status=p_payload->>'resolution',error_code='manual_review',sent_at=case when p_payload->>'resolution'='sent' then now() else null end where id=i and company_id=c and status='uncertain';
  if not found then raise exception 'Resultado não é incerto'; end if;
  perform private.log(c,'publication.reviewed',i,jsonb_build_object('note',left(p_payload->>'note',300),'resolution',p_payload->>'resolution'));
 when 'set_groups' then
  perform private.require_role(c,array['owner','admin']);
  for item in select jsonb_array_elements(p_payload->'groups') loop
   if ((item->>'is_source')::boolean or (item->>'is_destination')::boolean) and not exists(select 1 from public.groups g join public.connections cn on cn.id=g.connection_id where g.id=(item->>'id')::uuid and g.company_id=c and cn.status<>'revoked') then raise exception 'Conexão revogada ou grupo inválido'; end if;
   update public.groups set is_source=(item->>'is_source')::boolean,is_destination=(item->>'is_destination')::boolean where id=(item->>'id')::uuid and company_id=c;
   if not found then raise exception 'Grupo inválido'; end if;
  end loop;
  select count(*) into n from public.groups where company_id=c and (is_source or is_destination);
  if n>co.group_limit then raise exception 'Limite do plano: % grupos ativos',co.group_limit; end if;
 when 'save_company' then
  perform private.require_role(c,array['owner','admin']); z:=p_payload->>'timezone';
  if not private.valid_timezone(z) then raise exception 'Fuso inválido'; end if;
  if not private.valid_image(c,nullif(p_payload->'brand'->>'logo','')) then raise exception 'Logo inválida'; end if;
  item:=p_payload->'settings';
  if not coalesce((item->>'min_interval_seconds')::int between 10 and 3600,false) or not coalesce((item->>'late_after_seconds')::int between 60 and 3600,false) or not coalesce((item->>'max_attempts')::int between 1 and 5,false) then raise exception 'Limites de envio inválidos'; end if;
  update public.companies set name=p_payload->>'name',timezone=z,brand=p_payload->'brand',settings=jsonb_build_object('send_enabled',coalesce((item->>'send_enabled')::boolean,false),'min_interval_seconds',(item->>'min_interval_seconds')::int,'late_after_seconds',(item->>'late_after_seconds')::int,'max_attempts',(item->>'max_attempts')::int,'ai_prompt',left(item->>'ai_prompt',3000)) where id=c;
 when 'save_template' then
  if length(p_payload->>'body')>4000 or trim(p_payload->>'name')='' then raise exception 'Modelo inválido'; end if;
  insert into public.templates(company_id,name,body) values(c,left(p_payload->>'name',100),p_payload->>'body');
 when 'issue_engine' then
  perform private.require_role(c,array['owner','admin']);
  if exists(select 1 from public.connections where company_id=c and status<>'revoked') then raise exception 'Revogue o motor existente antes de criar outro'; end if;
  t:='ob_'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.connections(company_id,label) values(c,left(coalesce(p_payload->>'label','Notebook'),100)) returning id into i;
  insert into private.engine_credentials(connection_id,token_hash) values(i,encode(sha256(convert_to(t,'UTF8')),'hex'));
  result:=jsonb_build_object('token',t,'connection_id',i);
 when 'revoke_engine' then
  perform private.require_role(c,array['owner','admin']); i:=(p_payload->>'connection_id')::uuid;
  update public.connections set status='revoked',qr=null,qr_expires_at=null where id=i and company_id=c;
  if not found then raise exception 'Motor inválido'; end if;
  update private.engine_credentials set revoked_at=now() where connection_id=i;
  update public.groups set is_source=false,is_destination=false where connection_id=i;
  update public.publications set status=case when send_started_at is null then 'cancelled' else 'uncertain' end,error_code='engine_revoked' where connection_id=i and status in ('processing','queued','scheduled');
 when 'set_member' then
  perform private.require_role(c,array['owner','admin']);
  select id into target from auth.users where lower(email)=lower(trim(p_payload->>'email'));
  if target is null then raise exception 'Usuário deve cadastrar-se primeiro'; end if;
  if p_payload->>'role' not in ('admin','editor','viewer') then raise exception 'Perfil inválido'; end if;
  if exists(select 1 from public.members where company_id=c and user_id=target and role='owner') then raise exception 'Proprietário não pode ser alterado'; end if;
  insert into public.members values(c,target,p_payload->>'role') on conflict(company_id,user_id) do update set role=excluded.role;
 when 'remove_member' then
  perform private.require_role(c,array['owner','admin']); target:=(p_payload->>'user_id')::uuid;
  delete from public.members where company_id=c and user_id=target and role<>'owner';
 else raise exception 'Ação desconhecida';
 end case;
 perform private.log(c,p_action,i);
 return result;
end $$;

create or replace function public.engine_call(p_token text,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; c uuid; cn uuid; co public.companies; con public.connections; g public.groups; p public.publications; i uuid; item jsonb; result jsonb; started boolean; begin
 ctx:=public.engine_context(p_token); c:=(ctx->>'company_id')::uuid; cn:=(ctx->>'connection_id')::uuid;
 select * into co from public.companies where id=c for update;
 select * into con from public.connections where id=cn for update;
 -- Revalidar depois dos locks: revogação pode ter confirmado enquanto aguardávamos.
 perform public.engine_context(p_token);
 if con.status='revoked' then raise exception 'Credencial revogada' using errcode='42501'; end if;
 if p_action='heartbeat' then
  if con.instance_until>now() and con.instance_id is distinct from (p_payload->>'instance_id')::uuid then raise exception 'Outro motor está ativo'; end if;
  if p_payload->>'instance_id' is null then raise exception 'Instância obrigatória'; end if;
  if p_payload->>'status' not in ('connected','disconnected','awaiting_qr') then raise exception 'Estado inválido'; end if;
  update public.connections set instance_id=(p_payload->>'instance_id')::uuid,instance_until=now()+interval '90 seconds',last_seen_at=now(),status=p_payload->>'status',qr=case when p_payload->>'status'='awaiting_qr' then left(p_payload->>'qr',3000) else null end,qr_expires_at=case when p_payload->>'status'='awaiting_qr' and p_payload->>'qr' is not null then now()+interval '30 seconds' else null end where id=cn;
  -- Lease perdida antes de iniciar é recuperável; depois de iniciar exige revisão.
  for p in select * from public.publications where connection_id=cn and status='processing' and lease_until<now() for update loop
   update public.publications set status=case when p.send_started_at is not null then 'uncertain' when p.attempts>=(co.settings->>'max_attempts')::int then 'failed' else 'queued' end,error_code=case when p.send_started_at is not null then 'confirmation_lost' else 'worker_interrupted_before_send' end,lease_token=null,lease_until=null where id=p.id;
   perform private.log(c,'publication.recovered',p.id,jsonb_build_object('started',p.send_started_at is not null));
  end loop;
  update public.publications set on_hold=true,error_code='schedule_overdue' where connection_id=cn and status in ('queued','scheduled') and not on_hold and scheduled_at<now()-make_interval(secs=>(co.settings->>'late_after_seconds')::int);
  return ctx||jsonb_build_object('settings',co.settings,'sources',(select coalesce(jsonb_agg(jid),'[]') from public.groups where connection_id=cn and is_source));
 end if;
 if con.instance_id is distinct from (p_payload->>'instance_id')::uuid or con.instance_until is null or con.instance_until<now() then raise exception 'Lease de motor inválida' using errcode='42501'; end if;
 case p_action
 when 'groups' then
  if jsonb_array_length(p_payload->'groups')>3000 then raise exception 'Muitos grupos'; end if;
  for item in select jsonb_array_elements(p_payload->'groups') loop
   insert into public.groups(company_id,connection_id,jid,name) values(c,cn,item->>'jid',left(item->>'name',200)) on conflict(connection_id,jid) do update set name=excluded.name;
  end loop;
  result:='{}';
 when 'capture_error' then
  perform private.log(c,'capture.failed',null,jsonb_build_object('message_hash',left(coalesce(p_payload->>'message_hash',''),64),'code',case when coalesce(p_payload->>'code','') ~ '^[a-z0-9_]{1,40}$' then p_payload->>'code' else 'capture_failed' end));result:='{}';
 when 'capture' then
  if coalesce((p_payload->>'from_me')::boolean,false) then return '{"ignored":"own_message"}'; end if;
  select * into g from public.groups where company_id=c and connection_id=cn and jid=p_payload->>'group_jid' and is_source and not is_destination;
  if not found then return '{"ignored":"not_source"}'; end if;
  if exists(select 1 from public.publications where connection_id=cn and transport_id=p_payload->>'message_id') then return '{"ignored":"outgoing"}'; end if;
  if length(p_payload->>'text')>10000 or length(p_payload->>'message_id')>200 or jsonb_array_length(coalesce(p_payload->'images','[]'))>10 then raise exception 'Captura excede limite'; end if;
  for item in select jsonb_array_elements(coalesce(p_payload->'images','[]')) loop
   if not private.valid_image(c,item#>>'{}') then raise exception 'Imagem inválida'; end if;
  end loop;
  insert into public.offers(company_id,connection_id,group_id,message_id,received_at,original_text,original_images,edited_text,media_kind,media_status)
  values(c,cn,g.id,p_payload->>'message_id',(p_payload->>'received_at')::timestamptz,coalesce(p_payload->>'text',''),coalesce(p_payload->'images','[]'),left(coalesce(p_payload->>'text',''),4000),coalesce(p_payload->>'media_kind','text'),coalesce(p_payload->>'media_status','ready'))
  on conflict(connection_id,group_id,message_id) do nothing returning id into i;
  if i is not null then
   insert into public.offer_revisions(company_id,offer_id,version,content) select c,i,1,to_jsonb(o) from public.offers o where id=i;
   perform private.log(c,'offer.captured',i);
  end if;
  result:=jsonb_build_object('id',i,'duplicate',i is null);
 when 'claim' then
  if con.status<>'connected' or not (co.settings->>'send_enabled')::boolean or con.next_send_at>now() then return 'null'; end if;
  if exists(select 1 from public.publications where connection_id=cn and status='processing') then return 'null'; end if;
  select * into p from public.publications where connection_id=cn and status in ('queued','scheduled') and not on_hold and scheduled_at<=now() and scheduled_at>=now()-make_interval(secs=>(co.settings->>'late_after_seconds')::int) order by scheduled_at,id for update skip locked limit 1;
  if not found then return 'null'; end if;
  if not exists(select 1 from public.groups where id=p.group_id and is_destination and not is_source) then
   update public.publications set status='cancelled',error_code='destination_disabled' where id=p.id; return 'null';
  end if;
  update public.publications set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds',send_started_at=null where id=p.id returning * into p;
  perform private.log(c,'publication.claimed',p.id,jsonb_build_object('attempt',p.attempts));
  result:=to_jsonb(p)||jsonb_build_object('jid',(select jid from public.groups where id=p.group_id),'media_kind',(select media_kind from public.offers where id=p.offer_id));
 when 'begin_send' then
  select * into p from public.publications where id=(p_payload->>'id')::uuid and connection_id=cn and status='processing' and lease_token=(p_payload->>'lease_token')::uuid and lease_until>now() and send_started_at is null for update;
  if not found then raise exception 'Publicação cancelada, iniciada ou lease expirada'; end if;
  if con.status<>'connected' or not (co.settings->>'send_enabled')::boolean then raise exception 'Envios desativados'; end if;
  if not exists(select 1 from public.groups where id=p.group_id and is_destination) then raise exception 'Destino desativado'; end if;
  update public.publications set send_started_at=now(),lease_until=now()+interval '120 seconds' where id=p.id;
  update public.connections set next_send_at=now()+make_interval(secs=>(co.settings->>'min_interval_seconds')::int) where id=cn;
  perform private.log(c,'publication.send_started',p.id); result:='{}';
 when 'finish' then
  select * into p from public.publications where id=(p_payload->>'id')::uuid and connection_id=cn and lease_token=(p_payload->>'lease_token')::uuid and status='processing' for update;
  if not found then
   if exists(select 1 from public.publications where id=(p_payload->>'id')::uuid and connection_id=cn and status='sent' and transport_id=p_payload->>'transport_id') then return '{"duplicate":true}'; end if;
   raise exception 'Lease inválida: consulte histórico';
  end if;
  if p_payload->>'outcome'='sent' then
   if p.send_started_at is null or coalesce(p_payload->>'transport_id','')='' then raise exception 'Confirmação de transporte necessária'; end if;
   update public.publications set status='sent',transport_id=left(p_payload->>'transport_id',200),sent_at=now(),lease_token=null,lease_until=null,error_code=null where id=p.id;
  elsif p.send_started_at is not null then
   update public.publications set status='uncertain',error_code='transport_uncertain',lease_token=null,lease_until=null where id=p.id;
  else
   update public.publications set status=case when p_payload->>'outcome'='retryable' and attempts<(co.settings->>'max_attempts')::int then 'queued' else 'failed' end,scheduled_at=now()+make_interval(secs=>least(300,30*p.attempts)),error_code=case when p_payload->>'outcome'='retryable' then 'preflight_temporary' else 'preflight_failed' end,lease_token=null,lease_until=null where id=p.id;
  end if;
  perform private.log(c,'publication.finished',p.id,jsonb_build_object('outcome',(select status from public.publications where id=p.id))); result:='{}';
 else raise exception 'Ação de motor desconhecida';
 end case;
 return result;
end $$;

update storage.buckets set public=false, file_size_limit=10485760, allowed_mime_types=array['image/png','image/jpeg','image/webp','video/mp4','audio/ogg','audio/mpeg','audio/mp4','application/pdf','application/msword','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] where id='offer-media';

revoke all on function public.app_snapshot(uuid,text,int,int,int,text) from public, anon, authenticated;
grant execute on function public.app_snapshot(uuid,text,int,int,int,text) to authenticated;
