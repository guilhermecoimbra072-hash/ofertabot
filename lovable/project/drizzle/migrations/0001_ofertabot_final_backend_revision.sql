-- Revisão incremental OfertaBot: mantém todas as tabelas, dados, RLS e grants.
do $migration$
declare definition text; revised text;
begin
 definition:=pg_get_functiondef('public.app_action(text,jsonb)'::regprocedure);
 revised:=replace(definition, 'and is_destination and not is_source;'||chr(10)||'   if not found', 'and is_destination and not is_source and exists(select 1 from public.connections cn where cn.id=public.groups.connection_id and cn.status<>''revoked'');'||chr(10)||'   if not found');
 revised:=replace(revised, 'for item in select jsonb_array_elements(p_payload->''groups'') loop'||chr(10)||'   update public.groups', 'for item in select jsonb_array_elements(p_payload->''groups'') loop'||chr(10)||'   if ((item->>''is_source'')::boolean or (item->>''is_destination'')::boolean) and not exists(select 1 from public.groups g join public.connections cn on cn.id=g.connection_id where g.id=(item->>''id'')::uuid and g.company_id=c and cn.status<>''revoked'') then raise exception ''Conexão revogada ou grupo inválido''; end if;'||chr(10)||'   update public.groups');
 if revised=definition or position('Conexão revogada ou grupo inválido' in revised)=0 or position('cn.id=public.groups.connection_id' in revised)=0 then raise exception 'Contrato app_action inesperado'; end if;
 execute revised;
 definition:=pg_get_functiondef('public.engine_call(text,text,jsonb)'::regprocedure);
 revised:=replace(definition, 'select * into con from public.connections where id=cn for update;'||chr(10), 'select * into con from public.connections where id=cn for update;'||chr(10)||' -- Revalidar depois dos locks: revogação pode ter confirmado enquanto aguardávamos.'||chr(10)||' perform public.engine_context(p_token);'||chr(10)||' if con.status=''revoked'' then raise exception ''Credencial revogada'' using errcode=''42501''; end if;'||chr(10));
 revised:=replace(revised, 'then raise exception ''Lease de motor inválida''; end if;', 'then raise exception ''Lease de motor inválida'' using errcode=''42501''; end if;');
 revised:=replace(revised, ' when ''capture'' then'||chr(10), ' when ''capture_error'' then'||chr(10)||'  perform private.log(c,''capture.failed'',null,jsonb_build_object(''message_hash'',left(p_payload->>''message_hash'',64),''code'',''permanent_rejection''));result:=''{}'';'||chr(10)||' when ''capture'' then'||chr(10));
 if revised=definition or position('when ''capture_error''' in revised)=0 or position('perform public.engine_context(p_token)' in revised)=0 then raise exception 'Contrato engine_call inesperado'; end if;
 execute revised;
end $migration$;
create or replace function public.ofertabot_cleanup_member() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from public.members where user_id=old.id; return old; end $$;
revoke all on function public.ofertabot_cleanup_member() from public,anon,authenticated;
drop trigger if exists ofertabot_cleanup_deleted_member on auth.users;
create trigger ofertabot_member_cleanup after delete on auth.users for each row execute function public.ofertabot_cleanup_member();
comment on function public.cleanup_deleted_member() is 'DEPRECATED: replaced by public.ofertabot_cleanup_member; retained for zero-downtime compatibility.';
revoke all on function public.app_snapshot(uuid),public.app_action(text,jsonb),public.ai_authorize(uuid,uuid),public.engine_context(text),public.engine_call(text,text,jsonb),public.admin_set_plan(uuid,text,int) from public,anon,authenticated;
grant execute on function public.app_snapshot(uuid),public.app_action(text,jsonb),public.ai_authorize(uuid,uuid) to authenticated;
grant execute on function public.engine_context(text),public.engine_call(text,text,jsonb),public.admin_set_plan(uuid,text,int) to service_role;
grant select,insert,update,delete on all tables in schema public to service_role;
