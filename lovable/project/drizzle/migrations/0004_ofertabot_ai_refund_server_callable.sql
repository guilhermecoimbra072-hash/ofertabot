-- Correção: ai_refund é chamada apenas pelo servidor (service role), onde auth.uid() é nulo.
-- A versão da 0002 chamava private.require_role, que exige auth.uid() e fazia todo estorno falhar.
-- Esta versão remove a verificação de papel (a função não é mais executável por usuários)
-- e mantém: decremento de 1 sem ficar negativo e log de auditoria com actor nulo (servidor).
CREATE OR REPLACE FUNCTION public.ai_refund(p_company uuid, p_offer uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 update private.ai_usage set calls=greatest(calls-1,0) where company_id=p_company;
 perform private.log(p_company,'ai.refunded',p_offer,jsonb_build_object('actor','server'));
end $function$;

REVOKE EXECUTE ON FUNCTION public.ai_refund(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_refund(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ai_refund(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_refund(uuid, uuid) TO service_role;
