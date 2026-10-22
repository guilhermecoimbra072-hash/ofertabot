import {supabase} from '@/integrations/supabase/client';
import type {Json} from '@/integrations/supabase/types';
import {z} from 'zod';
import {snapshotSchema,type Snapshot} from './model';
import {resolveEngineUrl} from './schedule';
export const db=supabase;
export const configured=!!import.meta.env['VITE_SUPABASE_URL']&&!!import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'];
export async function snapshot(company?:string,query:{search?:string;offerOffset?:number;publicationOffset?:number;auditOffset?:number;offerStatus?:string}={}):Promise<Snapshot>{const {data,error}=await db.rpc('app_snapshot',{...(company?{p_company:company}:{}),p_search:query.search||null,p_offer_offset:query.offerOffset??0,p_publication_offset:query.publicationOffset??0,p_audit_offset:query.auditOffset??0,p_offer_status:query.offerStatus||null});if(error)throw error;return snapshotSchema.parse(data);}
const jsonValue:z.ZodType<Json>=z.lazy(()=>z.union([z.string(),z.number(),z.boolean(),z.null(),z.array(jsonValue),z.record(jsonValue)]));
export async function action(name:string,payload:Record<string,unknown>):Promise<Json>{const body=z.record(jsonValue).parse(payload);const {data,error}=await db.rpc('app_action',{p_action:name,p_payload:body});if(error)throw error;return data;}
export async function upload(company:string,file:Blob){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10485760)throw new Error('Use PNG, JPEG ou WebP de até 10 MB.');
 const path=`${company}/${crypto.randomUUID()}.${file.type.split('/')[1]}`;
 const {error}=await db.storage.from('offer-media').upload(path,file,{upsert:false,contentType:file.type});if(error)throw error;return path;
}
export async function signed(path:string){const {data,error}=await db.storage.from('offer-media').createSignedUrl(path,120);if(error)throw error;return data.signedUrl;}
export const engineUrl=typeof window==='undefined'?'':resolveEngineUrl(import.meta.env['VITE_ENGINE_URL']||import.meta.env['VITE_PUBLIC_APP_URL'],window.location.origin);
export async function rewrite(company_id:string,offer_id:string){
 const {data:{session},error}=await db.auth.getSession();if(error||!session)throw new Error('Entre novamente para continuar.');
 const r=await fetch('/api/public/rewrite',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({company_id,offer_id})});
 const data:unknown=await r.json();if(!r.ok){const result=z.object({error:z.string()}).safeParse(data);throw new Error(result.success?result.data.error:'IA indisponível. Continue editando manualmente.');}
 return z.object({text:z.string().max(4000),requires_review:z.literal(true)}).parse(data);
}
export async function revisions(company:string,offer:string){const {data,error}=await db.from('offer_revisions').select('version,content,created_at,actor_id').eq('company_id',company).eq('offer_id',offer).order('version',{ascending:false});if(error)throw error;return z.array(z.object({version:z.number(),content:z.object({edited_text:z.string()}),created_at:z.string(),actor_id:z.string().nullable()})).parse(data);}
export function errorMessage(error:unknown):string {const message=error instanceof Error?error.message:typeof error==='object'&&error!==null&&'message' in error?String(error.message):'';const messages:Record<string,string>={'Invalid login credentials':'E-mail ou senha incorretos.','Email not confirmed':'Confirme seu e-mail antes de entrar.','User already registered':'Este e-mail já está cadastrado.','Email rate limit exceeded':'Muitas solicitações de e-mail. Aguarde antes de tentar novamente.','Failed to fetch':'Não foi possível conectar. Confira sua conexão.','Signup is disabled':'Novos cadastros estão indisponíveis no momento.','Email logins are disabled':'O acesso por e-mail está desabilitado no momento.'};return messages[message]??(/invalid input|permission denied|violates|relation .* does not exist|JWT|token .* expired|NetworkError|Auth session missing|schema cache|ZodError/i.test(message)?'Não foi possível concluir a solicitação. Atualize e tente novamente.':message||'Não foi possível concluir. Tente novamente.');}

