-- Failure history requires a real failure timestamp, not publication creation time.
alter table public.publications add column failed_at timestamptz;
update public.publications p set failed_at=(select max(a.created_at) from public.audit a where a.company_id=p.company_id and a.entity_id=p.id and ((a.event='publication.finished' and a.details->>'outcome'='failed') or (a.event='publication.reviewed' and a.details->>'resolution'='failed'))) where p.status='failed';
create function public.ofertabot_track_failure() returns trigger language plpgsql set search_path='' as $$begin
 if new.status='failed' and (tg_op='INSERT' or old.status is distinct from 'failed') then new.failed_at:=now(); end if;
 return new;
end$$;
revoke all on function public.ofertabot_track_failure() from public,anon,authenticated;
create trigger ofertabot_failure_time before insert or update of status on public.publications for each row execute function public.ofertabot_track_failure();
do $$declare src text; begin
 select pg_get_functiondef('public.platform_snapshot(uuid)'::regprocedure) into src;
 execute replace(src,'status=''failed'' and created_at>=now()-interval ''7 days''','status=''failed'' and failed_at>=now()-interval ''7 days''');
end$$;
-- Revalidate membership after the shared operator-management lock.
do $$declare src text; old text; begin
 select pg_get_functiondef('public.platform_action(uuid,text,jsonb)'::regprocedure) into src;
 old:='perform pg_advisory_xact_lock(hashtextextended(''ofertabot-platform-admins'',0));';
 execute replace(src,old,old||' if not exists(select 1 from private.platform_admins where user_id=p_actor) then raise exception ''Acesso restrito aos operadores do OfertaBot'' using errcode=''42501''; end if;');
end$$;
