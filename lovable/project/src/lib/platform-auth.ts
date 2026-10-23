import {createMiddleware} from '@tanstack/react-start';
export const platformBearer=createMiddleware({type:'function'}).client(async({next})=>{
 const {supabase}=await import('@/integrations/supabase/client');
 const {data:{session}}=await supabase.auth.getSession();
 return next({headers:session?{Authorization:`Bearer ${session.access_token}`}:{}});
});
