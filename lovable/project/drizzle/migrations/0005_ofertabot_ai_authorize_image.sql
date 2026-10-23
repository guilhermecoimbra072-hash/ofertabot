create function public.ai_authorize_image(p_company uuid,p_offer uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; begin
 perform private.require_role(p_company,array['owner','admin','editor']);
 insert into private.ai_usage(company_id) values(p_company) on conflict do nothing;
 update private.ai_usage set calls=case when window_start<now()-interval '1 hour' then 1 else calls+1 end,window_start=case when window_start<now()-interval '1 hour' then now() else window_start end where company_id=p_company;
 if (select calls from private.ai_usage where company_id=p_company)>30 then raise exception 'Limite de 30 reescritas por hora'; end if;
 select jsonb_build_object('image',o.original_images->>0) into r from public.offers o where o.id=p_offer and o.company_id=p_company;
 if r is null or r->>'image' is null then raise exception 'Oferta sem imagem'; end if;
 perform private.log(p_company,'ai.requested',p_offer,jsonb_build_object('kind','image')); return r;
end $$;
revoke all on function public.ai_authorize_image(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ai_authorize_image(uuid,uuid) to authenticated;
