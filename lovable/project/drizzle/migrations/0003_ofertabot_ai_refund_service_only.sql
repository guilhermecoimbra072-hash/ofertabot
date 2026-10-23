-- ai_refund passa a ser chamável apenas pelo servidor (service role).
-- Antes, qualquer usuário autenticado com papel owner/admin/editor podia chamar
-- public.ai_refund diretamente pela API e zerar a própria cota de ai_usage.
REVOKE EXECUTE ON FUNCTION public.ai_refund(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_refund(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ai_refund(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_refund(uuid, uuid) TO service_role;
