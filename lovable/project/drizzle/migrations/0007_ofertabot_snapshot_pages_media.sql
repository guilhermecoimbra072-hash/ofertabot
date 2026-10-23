drop function if exists public.app_snapshot(uuid);
create function public.app_snapshot(p_company uuid default null, p_search text default null, p_offer_offset int default 0, p_publication_offset int default 0, p_audit_offset int default 0, p_offer_status text default null)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare c uuid; r text; result jsonb; q text; st text; oo int; po int; ao int; ot bigint; pt bigint; at bigint; begin
 if auth.uid() is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select co.*,m.role from public.companies co join public.members m on co.id=m.company_id where m.user_id=auth.uid() order by co.created_at) x;
 c:=coalesce(p_company,(result->0->>'id')::uuid);
 if c is null then return jsonb_build_object('companies',result); end if;
 perform private.require_role(c,array['owner','admin','editor','viewer']); r:=private.member_role(c);
 q:=nullif(lower(left(trim(coalesce(p_search,'')),200)),'');
 st:=case when p_offer_status in ('pending','approved','rejected') then p_offer_status else null end;
 oo:=least(greatest(coalesce(p_offer_offset,0),0),1000000); po:=least(greatest(coalesce(p_publication_offset,0),0),1000000); ao:=least(greatest(coalesce(p_audit_offset,0),0),1000000);
 select count(*) into ot from public.offers x where company_id=c and (st is null or x.status=st) and (q is null or strpos(lower(x.original_text||' '||x.edited_text),q)>0);
 select count(*) into pt from public.publications x where company_id=c and (q is null or strpos(lower(x.text),q)>0);
 select count(*) into at from public.audit x where company_id=c and (q is null or strpos(lower(x.event),q)>0);
 return jsonb_build_object('companies',result,'company',(select to_jsonb(co)||jsonb_build_object('role',r) from public.companies co where id=c),
 'connections',(select coalesce(jsonb_agg((to_jsonb(x)-'instance_id'-'instance_until'-'qr')||jsonb_build_object('qr',case when r in ('owner','admin') and x.qr_expires_at>now() then x.qr else null end)),'[]') from public.connections x where company_id=c),
 'stats',jsonb_build_object('received',(select count(*) from public.offers where company_id=c),'pending',(select count(*) from public.offers where company_id=c and status='pending'),'sent',(select count(*) from public.publications where company_id=c and status='sent'),'failed',(select count(*) from public.publications where company_id=c and status='failed')),
 'groups',(select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]') from public.groups x where company_id=c),
 'offers',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('price_minor',x.price_minor::text) order by x.received_at desc,x.id),'[]') from (select * from public.offers y where company_id=c and (st is null or y.status=st) and (q is null or strpos(lower(y.original_text||' '||y.edited_text),q)>0) order by received_at desc,id limit 100 offset oo) x),
 'publications',(select coalesce(jsonb_agg(to_jsonb(x)-'lease_token' order by x.created_at desc,x.id),'[]') from (select * from public.publications y where company_id=c and (q is null or strpos(lower(y.text),q)>0) order by created_at desc,id limit 100 offset po) x),
 'audit',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]') from (select * from public.audit y where company_id=c and (q is null or strpos(lower(y.event),q)>0) order by created_at desc,id limit 100 offset ao) x),
 'templates',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.templates x where company_id=c),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,'role',m.role)),'[]') from public.members m join auth.users u on u.id=m.user_id where m.company_id=c and r in ('owner','admin')),
 'page',jsonb_build_object('offers',jsonb_build_object('offset',oo,'limit',100,'total',ot),'publications',jsonb_build_object('offset',po,'limit',100,'total',pt),'audit',jsonb_build_object('offset',ao,'limit',100,'total',at)));
end $function$;
revoke all on function public.app_snapshot(uuid,text,int,int,int,text) from public, anon, authenticated;
grant execute on function public.app_snapshot(uuid,text,int,int,int,text) to authenticated;

do $do$
declare d text; n text; begin
 select pg_get_functiondef('public.app_action(text,jsonb)'::regprocedure) into d;
 n:=replace(d,$s$o.media_kind not in ('text','image')$s$,$s$o.media_kind not in ('text','image','video','audio','document')$s$);
 if n=d then raise exception 'app_action: trecho approve_offer não encontrado'; end if;
 execute n;
 select pg_get_functiondef('public.engine_call(text,text,jsonb)'::regprocedure) into d;
 n:=replace(d,$s$'code','permanent_rejection')$s$,$s$'code',case when coalesce(p_payload->>'code','') ~ '^[a-z0-9_]{1,40}$' then p_payload->>'code' else 'capture_failed' end)$s$);
 if n=d then raise exception 'engine_call: trecho capture_error não encontrado'; end if;
 d:=n;
 n:=replace(d,$s$jsonb_build_object('jid',(select jid from public.groups where id=p.group_id))$s$,$s$jsonb_build_object('jid',(select jid from public.groups where id=p.group_id),'media_kind',(select media_kind from public.offers where id=p.offer_id))$s$);
 if n=d then raise exception 'engine_call: trecho claim não encontrado'; end if;
 execute n;
end $do$;
