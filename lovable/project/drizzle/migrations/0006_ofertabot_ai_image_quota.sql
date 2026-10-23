-- Cota separada para melhoria de imagens por IA: 30 imagens/hora por empresa,
-- independente das 30 reescritas de texto (private.ai_usage).
create table private.ai_image_usage (company_id uuid primary key references public.companies, window_start timestamptz not null default now(), calls int not null default 0);
alter table private.ai_image_usage enable row level security;

-- ai_authorize_image passa a descontar da cota de imagem, com mensagem própria.
create or replace function public.ai_authorize_image(p_company uuid,p_offer uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; begin
 perform private.require_role(p_company,array['owner','admin','editor']);
 insert into private.ai_image_usage(company_id) values(p_company) on conflict do nothing;
 update private.ai_image_usage set calls=case when window_start<now()-interval '1 hour' then 1 else calls+1 end,window_start=case when window_start<now()-interval '1 hour' then now() else window_start end where company_id=p_company;
 if (select calls from private.ai_image_usage where company_id=p_company)>30 then raise exception 'Limite de 30 imagens com IA por hora atingido'; end if;
 select jsonb_build_object('image',o.original_images->>0) into r from public.offers o where o.id=p_offer and o.company_id=p_company;
 if r is null or r->>'image' is null then raise exception 'Oferta sem imagem'; end if;
 perform private.log(p_company,'ai.requested',p_offer,jsonb_build_object('kind','image')); return r;
end $$;
revoke all on function public.ai_authorize_image(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ai_authorize_image(uuid,uuid) to authenticated;

-- Estorno da cota de imagem: chamável apenas pelo servidor (service role).
create function public.ai_refund_image(p_company uuid, p_offer uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.ai_image_usage set calls=greatest(calls-1,0) where company_id=p_company;
 perform private.log(p_company,'ai.refunded',p_offer,jsonb_build_object('actor','server','kind','image'));
end $$;
revoke execute on function public.ai_refund_image(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ai_refund_image(uuid,uuid) to service_role;
