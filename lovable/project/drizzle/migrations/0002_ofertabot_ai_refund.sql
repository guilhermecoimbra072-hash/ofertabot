create or replace function public.ai_refund(p_company uuid,p_offer uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_role(p_company,array['owner','admin','editor']);
 update private.ai_usage set calls=greatest(calls-1,0) where company_id=p_company;
 perform private.log(p_company,'ai.refunded',p_offer);
end $$;
revoke all on function public.ai_refund(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ai_refund(uuid,uuid) to authenticated;
