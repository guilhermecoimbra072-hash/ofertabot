import {readFile,writeFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');const write=(p,s)=>writeFile(new URL('../'+p,import.meta.url),s);
const media=(await read('engine/src/media.ts')).replace(/^export /gm,'');
const engine=(await read('server/engine-handler.ts')).replace("import {bytesMatch,extensionFor,normalizeMime} from '../engine/src/media.ts';\n",'').replace("import type {SupabaseClient} from '@supabase/supabase-js';","import {createClient,type SupabaseClient} from 'npm:@supabase/supabase-js@2.118.0';");
await write('supabase/functions/engine-api/index.ts',media+"\n"+engine+"\nDeno.serve(createEngineHandler(createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})));\n");
const rewrite=(await read('server/rewrite-handler.ts')).replace("from '@supabase/supabase-js'","from 'npm:@supabase/supabase-js@2.118.0'");
await write('supabase/functions/rewrite/index.ts',rewrite+`
const aiKey=Deno.env.get('LOVABLE_API_KEY')??Deno.env.get('OPENAI_API_KEY');
const endpoint=Deno.env.get('LOVABLE_API_KEY')?'https://ai.gateway.lovable.dev/v1/chat/completions':'https://api.openai.com/v1/chat/completions';
const model=Deno.env.get('AI_MODEL')??Deno.env.get('OPENAI_MODEL')??(Deno.env.get('LOVABLE_API_KEY')?'google/gemini-2.5-flash':'gpt-4.1-mini');
Deno.serve(createRewriteHandler({url:Deno.env.get('SUPABASE_URL')!,publishableKey:Deno.env.get('SUPABASE_ANON_KEY')!,aiKey,model,endpoint}));
`);
const sql=(await read('supabase/schema.sql')).replace('user_id uuid references auth.users on delete cascade','user_id uuid');
await write('lovable/backend/schema.sql',sql+`\n-- Compatibilidade Lovable Cloud: limpeza autorizada do ciclo de autenticação.
create function public.ofertabot_cleanup_member() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from public.members where user_id=old.id; return old; end $$;
revoke all on function public.ofertabot_cleanup_member() from public,anon,authenticated;
create trigger ofertabot_member_cleanup after delete on auth.users for each row execute function public.ofertabot_cleanup_member();
`);
console.log('Adaptadores sincronizados a partir do contrato canônico. Nenhuma alteração externa.');
