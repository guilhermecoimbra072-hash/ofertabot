import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {platformCommandSchema} from '@/ofertabot/platform-model';
export const platformCommand=createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>platformCommandSchema.parse(input))
 .handler(async({data,context})=>{
  const {data:allowed,error}=await context.supabase.rpc('is_platform_admin');
  if(error||!allowed)throw new Error('Acesso restrito aos operadores do OfertaBot');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {action,...payload}=data;
  const {error:failure}=await supabaseAdmin.rpc('platform_action',{p_actor:context.userId,p_action:action,p_payload:payload});
  if(failure)throw new Error(failure.message);
  return {ok:true};
 });
