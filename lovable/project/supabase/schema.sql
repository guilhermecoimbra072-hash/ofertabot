-- OfertaBot: única fonte de dados. Aplicar exclusivamente neste projeto.
-- Adaptações aprovadas: members.user_id UUID sem FK gerenciada; limpeza por trigger.
-- Bucket offer-media configurado pela API de storage, não por INSERT no schema.
create schema if not exists private;
revoke all on schema private from public;
create table public.companies (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 120),
 plan text not null default 'basic' check(plan in ('basic','professional','enterprise')),
 group_limit int not null default 10 check(group_limit between 1 and 10000),
 timezone text not null default 'America/Sao_Paulo', brand jsonb not null default '{}',
 settings jsonb not null default '{"send_enabled":false,"min_interval_seconds":30,"late_after_seconds":300,"max_attempts":3,"ai_prompt":"Reescreva sem acrescentar fatos ou condições."}',
 created_at timestamptz not null default now()
);
grant select on public.companies to authenticated;
grant all on public.companies to service_role;
create table public.members (
 company_id uuid references public.companies on delete cascade, user_id uuid,
 role text not null check(role in ('owner','admin','editor','viewer')), primary key(company_id,user_id)
);
grant select on public.members to authenticated;
grant all on public.members to service_role;
create table public.connections (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies,
 label text not null, status text not null default 'disconnected' check(status in ('connected','disconnected','awaiting_qr','revoked')),
 qr text, qr_expires_at timestamptz, last_seen_at timestamptz, instance_id uuid, instance_until timestamptz,
 next_send_at timestamptz, created_at timestamptz not null default now(), unique(company_id,id)
);
grant select on public.connections to authenticated;
grant all on public.connections to service_role;
create table private.engine_credentials (
 connection_id uuid primary key references public.connections, token_hash text unique not null, revoked_at timestamptz
);
create table public.groups (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, connection_id uuid not null, jid text not null check(jid like '%@g.us'),
 name text not null, is_source boolean not null default false, is_destination boolean not null default false,
 check(not(is_source and is_destination)), unique(connection_id,jid), unique(company_id,id),
 foreign key(company_id,connection_id) references public.connections(company_id,id)
);
grant select on public.groups to authenticated;
grant all on public.groups to service_role;
create table public.offers (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, connection_id uuid not null, group_id uuid not null,
 message_id text not null, received_at timestamptz not null, original_text text not null default '', original_images jsonb not null default '[]',
 edited_text text not null default '', edited_image text, price_minor bigint check(price_minor >= 0), currency text not null default 'BRL' check(currency in ('BRL','USD','PYG','EUR')),
 status text not null default 'pending' check(status in ('pending','approved','rejected')), version int not null default 1,
 media_kind text not null default 'text' check(media_kind in ('text','image','video','audio','document','unsupported')),
 media_status text not null default 'ready' check(media_status in ('ready','unsupported','failed')),
 unique(connection_id,group_id,message_id), unique(company_id,id),
 foreign key(company_id,connection_id) references public.connections(company_id,id), foreign key(company_id,group_id) references public.groups(company_id,id)
);
grant select on public.offers to authenticated;
grant all on public.offers to service_role;
create table public.offer_revisions (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, offer_id uuid not null, version int not null,
 content jsonb not null, actor_id uuid, created_at timestamptz not null default now(),
 foreign key(company_id,offer_id) references public.offers(company_id,id), unique(offer_id,version)
);
grant select on public.offer_revisions to authenticated;
grant all on public.offer_revisions to service_role;
create table public.publications (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, connection_id uuid not null, offer_id uuid not null, group_id uuid not null,
 offer_version int not null, text text not null, image text, status text not null default 'queued' check(status in ('queued','scheduled','processing','sent','failed','uncertain','cancelled')),
 scheduled_at timestamptz not null default now(), timezone text not null, on_hold boolean not null default false,
 attempts int not null default 0, lease_token uuid, lease_until timestamptz, send_started_at timestamptz,
 error_code text, transport_id text, idempotency_key uuid not null, created_at timestamptz not null default now(), sent_at timestamptz,
 unique(offer_id,offer_version,group_id), unique(company_id,id),
 foreign key(company_id,connection_id) references public.connections(company_id,id), foreign key(company_id,offer_id) references public.offers(company_id,id), foreign key(company_id,group_id) references public.groups(company_id,id)
);
grant select on public.publications to authenticated;
grant all on public.publications to service_role;
create index publications_due on public.publications(connection_id,scheduled_at) where status in ('queued','scheduled','processing');
create index offers_company_date on public.offers(company_id,received_at desc);
create table public.audit (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies, event text not null,
 entity_id uuid, actor_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);
grant select on public.audit to authenticated;
grant all on public.audit to service_role;
create index audit_company_date on public.audit(company_id,created_at desc);
create table public.templates (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies, name text not null, body text not null);
grant select on public.templates to authenticated;
grant all on public.templates to service_role;
create table private.ai_usage (company_id uuid primary key references public.companies, window_start timestamptz not null default now(), calls int not null default 0);

create function public.ofertabot_cleanup_member() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.members where user_id=old.id;
 return old;
end $$;
revoke all on function public.ofertabot_cleanup_member() from public,anon,authenticated;
create trigger ofertabot_member_cleanup after delete on auth.users for each row execute function public.ofertabot_cleanup_member();

create function private.member_role(c uuid) returns text language sql stable security definer set search_path='' as $$
 select role from public.members where company_id=c and user_id=auth.uid()
$$;
create function private.require_role(c uuid, roles text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(private.member_role(c)=any(roles),false) then raise exception 'Acesso negado' using errcode='42501'; end if;
end $$;
create function private.log(c uuid,e text,i uuid,d jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into public.audit(company_id,event,entity_id,actor_id,details) values(c,e,i,auth.uid(),d)
$$;
create function private.valid_image(c uuid, p text) returns boolean language sql stable security definer set search_path='' as $$
 select p is null or (split_part(p,'/',1)=c::text and p !~ '\.\.' and exists(select 1 from storage.objects where bucket_id='offer-media' and name=p))
$$;
create function private.valid_timezone(z text) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from pg_timezone_names where name=z)
$$;
-- RLS de leitura; mutações somente via API transacional autorizada.
do $$ declare t text; begin
 foreach t in array array['companies','members','connections','groups','offers','offer_revisions','publications','audit','templates'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 if t='companies' then
 execute format('create policy tenant_read on public.%I for select to authenticated using(private.member_role(id) is not null)',t);
 elsif t='connections' then
 execute format('create policy tenant_read on public.%I for select to authenticated using(private.member_role(company_id) in (''owner'',''admin''))',t);
 else
 execute format('create policy tenant_read on public.%I for select to authenticated using(private.member_role(company_id) is not null)',t);
 end if;
 end loop;
end $$;
grant usage on schema private to authenticated;
grant execute on function private.member_role(uuid) to authenticated;
alter table private.engine_credentials enable row level security;
alter table private.ai_usage enable row level security;

create function public.app_snapshot(p_company uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid; r text; result jsonb; begin
 if auth.uid() is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select co.*,m.role from public.companies co join public.members m on co.id=m.company_id where m.user_id=auth.uid() order by co.created_at) x;
 c:=coalesce(p_company,(result->0->>'id')::uuid);
 if c is null then return jsonb_build_object('companies',result); end if;
 perform private.require_role(c,array['owner','admin','editor','viewer']); r:=private.member_role(c);
 return jsonb_build_object('companies',result,'company',(select to_jsonb(co)||jsonb_build_object('role',r) from public.companies co where id=c),
 'connections',(select coalesce(jsonb_agg((to_jsonb(x)-'instance_id'-'instance_until'-'qr')||jsonb_build_object('qr',case when r in ('owner','admin') and x.qr_expires_at>now() then x.qr else null end)),'[]') from public.connections x where company_id=c),
 'stats',jsonb_build_object('received',(select count(*) from public.offers where company_id=c),'pending',(select count(*) from public.offers where company_id=c and status='pending'),'sent',(select count(*) from public.publications where company_id=c and status='sent'),'failed',(select count(*) from public.publications where company_id=c and status='failed')),
 'groups',(select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]') from public.groups x where company_id=c),
 'offers',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('price_minor',x.price_minor::text) order by x.received_at desc),'[]') from (select * from public.offers where company_id=c order by received_at desc limit 500) x),
 'publications',(select coalesce(jsonb_agg(to_jsonb(x)-'lease_token' order by x.created_at desc),'[]') from (select * from public.publications where company_id=c order by created_at desc limit 1000) x),
 'audit',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from (select * from public.audit where company_id=c order by created_at desc limit 200) x),
 'templates',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.templates x where company_id=c),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,'role',m.role)),'[]') from public.members m join auth.users u on u.id=m.user_id where m.company_id=c and r in ('owner','admin')));
end $$;

create function public.app_action(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if o.media_status<>'ready' or o.media_kind not in ('text','image') then raise exception 'Mídia não processada: revisão necessária'; end if;
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

-- API do motor: somente a API de servidor (service_role) pode executar.
create function public.engine_context(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare x public.connections; begin
 select cn.* into x from public.connections cn join private.engine_credentials k on cn.id=k.connection_id where k.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and k.revoked_at is null and cn.status<>'revoked';
 if not found then raise exception 'Credencial inválida ou revogada' using errcode='42501'; end if;
 return jsonb_build_object('company_id',x.company_id,'connection_id',x.id);
end $$;
create function public.engine_call(p_token text,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
  perform private.log(c,'capture.failed',null,jsonb_build_object('message_hash',left(p_payload->>'message_hash',64),'code','permanent_rejection'));result:='{}';
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
  result:=to_jsonb(p)||jsonb_build_object('jid',(select jid from public.groups where id=p.group_id));
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

create function public.ai_authorize(p_company uuid,p_offer uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; begin
 perform private.require_role(p_company,array['owner','admin','editor']);
 insert into private.ai_usage(company_id) values(p_company) on conflict do nothing;
 update private.ai_usage set calls=case when window_start<now()-interval '1 hour' then 1 else calls+1 end,window_start=case when window_start<now()-interval '1 hour' then now() else window_start end where company_id=p_company;
 if (select calls from private.ai_usage where company_id=p_company)>30 then raise exception 'Limite de 30 reescritas por hora'; end if;
 select jsonb_build_object('text',o.edited_text,'prompt',c.settings->>'ai_prompt') into r from public.offers o join public.companies c on c.id=o.company_id where o.id=p_offer and o.company_id=p_company;
 if r is null then raise exception 'Oferta não encontrada'; end if;
 perform private.log(p_company,'ai.requested',p_offer); return r;
end $$;

-- Plano atribuído apenas pelo administrador da implantação via SQL, nunca pelo cliente.
create function public.admin_set_plan(p_company uuid,p_plan text,p_limit int default null) returns void language plpgsql security definer set search_path='' as $$
declare lim int; begin
 lim:=case p_plan when 'basic' then 10 when 'professional' then 50 when 'enterprise' then p_limit else null end;
 if lim is null or lim<1 or lim>10000 then raise exception 'Plano inválido'; end if;
 perform 1 from public.companies where id=p_company for update;
 if (select count(*) from public.groups where company_id=p_company and (is_source or is_destination))>lim then raise exception 'Desative grupos antes de reduzir o plano'; end if;
 update public.companies set plan=p_plan,group_limit=lim where id=p_company;
 perform private.log(p_company,'plan.assigned',p_company,jsonb_build_object('plan',p_plan,'limit',lim));
end $$;

create policy media_read on storage.objects for select to authenticated using(bucket_id='offer-media' and private.member_role((string_to_array(name,'/'))[1]::uuid) is not null);
create policy media_insert on storage.objects for insert to authenticated with check(bucket_id='offer-media' and private.member_role((string_to_array(name,'/'))[1]::uuid) in ('owner','admin','editor'));
-- Sem UPDATE/DELETE: originais e snapshots publicados são imutáveis pelo cliente.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.member_role(uuid) to authenticated;
revoke all on function public.app_snapshot(uuid),public.app_action(text,jsonb),public.ai_authorize(uuid,uuid),public.engine_context(text),public.engine_call(text,text,jsonb),public.admin_set_plan(uuid,text,int) from public,anon,authenticated;
grant execute on function public.app_snapshot(uuid),public.app_action(text,jsonb),public.ai_authorize(uuid,uuid) to authenticated;
grant execute on function public.engine_context(text),public.engine_call(text,text,jsonb),public.admin_set_plan(uuid,text,int) to service_role;
grant select,insert,update,delete on all tables in schema public to service_role;
