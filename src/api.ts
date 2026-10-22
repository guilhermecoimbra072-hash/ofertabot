import {createClient} from '@supabase/supabase-js';
import type {Snapshot} from './model';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured=!!url&&!!key;
export const db=configured?createClient(url,key):null;
export async function snapshot(company?:string,query:{search?:string;offerOffset?:number;publicationOffset?:number;auditOffset?:number;offerStatus?:string}={}):Promise<Snapshot>{const {data,error}=await db!.rpc('app_snapshot',{p_company:company??null,p_search:query.search||null,p_offer_offset:query.offerOffset??0,p_publication_offset:query.publicationOffset??0,p_audit_offset:query.auditOffset??0,p_offer_status:query.offerStatus||null});if(error)throw error;return data;}
export async function action(name:string,payload:Record<string,unknown>){if(!db)throw new Error('Backend não configurado');const {data,error}=await db.rpc('app_action',{p_action:name,p_payload:payload});if(error)throw error;return data;}
export async function upload(company:string,file:Blob){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Use PNG, JPEG ou WebP de até 10 MB.');
 const path=`${company}/${crypto.randomUUID()}.${file.type.split('/')[1]}`;
 const {error}=await db!.storage.from('offer-media').upload(path,file,{upsert:false,contentType:file.type});if(error)throw error;return path;
}
export async function signed(path:string){const {data,error}=await db!.storage.from('offer-media').createSignedUrl(path,120);if(error)throw error;return data.signedUrl;}

export const engineUrl=import.meta.env.VITE_ENGINE_URL||(url?url+'/functions/v1/engine-api':'');
export async function rewrite(company_id:string,offer_id:string){
 if(import.meta.env.VITE_REWRITE_URL){
  const {data:{session}}=await db!.auth.getSession();
  if(!session)throw new Error('Entre novamente');
  const r=await fetch(import.meta.env.VITE_REWRITE_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({company_id,offer_id})});
  const data=await r.json();if(!r.ok)throw new Error(data.error??'IA indisponível');return data;
 }
 const {data,error}=await db!.functions.invoke('rewrite',{body:{company_id,offer_id}});if(error)throw new Error('IA não configurada ou indisponível. Continue editando manualmente.');return data;
}
