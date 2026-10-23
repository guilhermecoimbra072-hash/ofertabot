create function public.platform_snapshot(p_company uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb; begin
 if not public.is_platform_admin() then raise exception 'Acesso restrito aos operadores do OfertaBot' using errcode='42501'; end if;
 select jsonb_build_object(
 'stats',jsonb_build_object('active',(select count(*) from public.companies where access_status='active'),'paused',(select count(*) from public.companies where access_status='paused'),'offers24',(select count(*) from public.offers where received_at>=now()-interval '24 hours'),'failed7',(select count(*) from public.publications where status='failed' and created_at>=now()-interval '7 days'),'online',(select count(*) from public.connections where last_seen_at>now()-interval '90 seconds' and status<>'revoked'),'textHour',(select coalesce(sum(calls),0) from private.ai_usage where window_start>=now()-interval '1 hour'),'imageHour',(select coalesce(sum(calls),0) from private.ai_image_usage where window_start>=now()-interval '1 hour')),
 'days',(select jsonb_agg(jsonb_build_object('day',d::date::text,'offers',(select count(*) from public.offers o join public.companies c on c.id=o.company_id where (o.received_at at time zone c.timezone)::date=d::date)) order by d) from generate_series((now() at time zone 'America/Sao_Paulo')::date-13,(now() at time zone 'America/Sao_Paulo')::date,interval '1 day') d),
 'statuses',(select coalesce(jsonb_agg(jsonb_build_object('status',status,'count',n)),'[]') from (select status,count(*) n from public.publications group by status order by status) x),
 'companies',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]') from (select c.id,c.name,c.plan,c.group_limit,c.access_status,c.paused_reason,c.ai_hourly_limit,c.image_hourly_limit,c.spend_limit_minor::text,c.ai_cost_minor,c.image_cost_minor,c.timezone,c.created_at,
 (select string_agg(u.email,', ' order by u.email) from public.members m join auth.users u on u.id=m.user_id where m.company_id=c.id and m.role='owner') owner,
 (select count(*) from public.groups where company_id=c.id and (is_source or is_destination)) active_groups,
 coalesce((select spent_minor::text from private.spend_meter where company_id=c.id and window_start=date_trunc('month',now() at time zone c.timezone) at time zone c.timezone),'0') spent_minor,
 coalesce((select calls from private.ai_usage where company_id=c.id and window_start>=now()-interval '1 hour'),0) text_hour,
 coalesce((select calls from private.ai_image_usage where company_id=c.id and window_start>=now()-interval '1 hour'),0) image_hour,
 (select count(*) from public.offers where company_id=c.id) offers,(select count(*) from public.offers where company_id=c.id and status='pending') pending,
 (select count(*) from public.publications where company_id=c.id and status='sent') sent,(select count(*) from public.publications where company_id=c.id and status='failed') failed,
 (select count(*) from public.connections where company_id=c.id and last_seen_at>now()-interval '90 seconds' and status<>'revoked') online from public.companies c) x),
 'operators',(select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'email',u.email,'created_at',a.created_at) order by a.created_at),'[]') from private.platform_admins a left join auth.users u on u.id=a.user_id),
 'detail',case when p_company is null then null else jsonb_build_object('company_id',p_company,
 'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,'role',m.role)),'[]') from public.members m left join auth.users u on u.id=m.user_id where m.company_id=p_company),
 'connections',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'status',status,'last_seen_at',last_seen_at)),'[]') from public.connections where company_id=p_company),
 'audit',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select id,event,actor_id,created_at from public.audit where company_id=p_company order by created_at desc,id limit 100) x)) end
 ) into result; return result;
end$$;
revoke all on function public.platform_snapshot(uuid) from public,anon;
grant execute on function public.platform_snapshot(uuid) to authenticated;
create function public.platform_action(p_actor uuid,p_action text,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$declare c uuid; target uuid; begin
 if not exists(select 1 from private.platform_admins where user_id=p_actor) then raise exception 'Acesso restrito aos operadores do OfertaBot' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ofertabot-platform-admins',0));
 if p_action='add_operator' then
 select id into target from auth.users where lower(email)=lower(trim(p_payload->>'email'));
 if target is null then raise exception 'Usuário deve cadastrar-se primeiro'; end if;
 insert into private.platform_admins(user_id) values(target) on conflict do nothing;
 elsif p_action='remove_operator' then
 target:=(p_payload->>'user_id')::uuid;
 if exists(select 1 from private.platform_admins where user_id=target) and (select count(*) from private.platform_admins)<=1 then raise exception 'Não é permitido remover o último operador'; end if;
 delete from private.platform_admins where user_id=target;
 else
 c:=(p_payload->>'company_id')::uuid;
 perform 1 from public.companies where id=c for update;
 if not found then raise exception 'Empresa não encontrada'; end if;
 case p_action
 when 'set_plan' then perform public.admin_set_plan(c,p_payload->>'plan',(p_payload->>'group_limit')::int);
 when 'set_limits' then update public.companies set spend_limit_minor=nullif(p_payload->>'spend_limit_minor','')::bigint,ai_cost_minor=(p_payload->>'ai_cost_minor')::int,image_cost_minor=(p_payload->>'image_cost_minor')::int,ai_hourly_limit=(p_payload->>'ai_hourly_limit')::int,image_hourly_limit=(p_payload->>'image_hourly_limit')::int where id=c;
 when 'set_access' then
 if p_payload->>'access_status' not in ('active','paused') or length(trim(coalesce(p_payload->>'reason','')))=0 then raise exception 'Informe o acesso e o motivo'; end if;
 update public.companies set access_status=p_payload->>'access_status',paused_reason=left(trim(p_payload->>'reason'),500) where id=c;
 else raise exception 'Ação desconhecida'; end case;
 insert into public.audit(company_id,event,entity_id,actor_id,details) values(c,'platform.'||p_action,c,p_actor,p_payload-'company_id');
 end if;
end$$;
revoke all on function public.platform_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.platform_action(uuid,text,jsonb) to service_role;
