import type {SupabaseClient} from '@supabase/supabase-js';
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
// 503 = tente de novo (lease vencida, banco momentaneamente indisponível); 403 = credencial recusada; 409 = regra de negócio.
const transient=(code?:string)=>!code||/^(08|40|53|57|58)/.test(code)||/^PGRST00[0-3]$/.test(code);
const rpcStatus=(error:{code?:string;message?:string})=>error.message==='Lease de motor inválida'?503:error.code==='42501'?403:transient(error.code)?503:409;
export const createEngineHandler=(db:SupabaseClient<any>)=>async(req:Request)=>{
 if(req.method!=='POST')return response({error:'Método inválido'},405);
 if(Number(req.headers.get('content-length')??0)>15000000)return response({error:'Arquivo grande'},413);
 const token=req.headers.get('authorization')?.replace(/^Bearer /,'')??'';
 if(!/^ob_[a-f0-9]{64}$/.test(token))return response({error:'Credencial inválida'},401);
 const {data:ctx,error:authError}=await db.rpc('engine_context',{p_token:token});
 if(authError)return authError.code==='42501'?response({error:'Credencial inválida ou revogada'},403):response({error:'Backend indisponível'},503);
 try{
  const raw=await req.text();if(raw.length>15000000)return response({error:'Arquivo grande'},413);
  const {action,payload={}}=JSON.parse(raw);
  if(action==='upload'){
   if(!['image/jpeg','image/png','image/webp'].includes(payload.mime)|| !/^[a-f0-9]{64}$/.test(payload.key))return response({error:'Mídia inválida'},400);
   // Valida lease do motor também para operações de arquivo.
   const {error:leaseError}=await db.rpc('engine_call',{p_token:token,p_action:'groups',p_payload:{instance_id:payload.instance_id,groups:[]}});if(leaseError)return response({error:'Motor sem lease'},rpcStatus(leaseError)===403?403:503);
   const bytes=Uint8Array.from(atob(payload.data),c=>c.charCodeAt(0));if(bytes.length>10485760)return response({error:'Máximo 10 MB'},413);
   const valid=payload.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:payload.mime==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
   if(!valid)return response({error:'Conteúdo de imagem inválido'},400);
   const path=`${ctx.company_id}/${ctx.connection_id}/${payload.key}.${payload.mime.split('/')[1]}`;
   const {error}=await db.storage.from('offer-media').upload(path,bytes,{contentType:payload.mime,upsert:false});
   if(error && !['409','Duplicate'].includes(String((error as any).statusCode??(error as any).error)) && !error.message?.includes('already exists'))return response({error:'Falha ao preservar imagem'},502);
   return response({path});
  }
  if(action==='download'){
   // Motor só pode baixar imagens dos seus próprios jobs ativos.
   const {data:rows}=await db.from('publications').select('id').eq('connection_id',ctx.connection_id).eq('image',payload.path).eq('status','processing').limit(1);
   if(!rows?.length||!String(payload.path).startsWith(ctx.company_id+'/'))return response({error:'Arquivo não autorizado'},403);
   const {data,error}=await db.storage.from('offer-media').download(payload.path);if(error)return response({error:'Imagem indisponível'},502);
   const b=new Uint8Array(await data.arrayBuffer());let s='';for(let k=0;k<b.length;k+=8192)s+=String.fromCharCode(...b.subarray(k,k+8192));return response({data:btoa(s)});
  }
  if(!['heartbeat','groups','capture','capture_error','claim','begin_send','finish'].includes(action))return response({error:'Ação desconhecida'},400);
  const {data,error}=await db.rpc('engine_call',{p_token:token,p_action:action,p_payload:payload});
  if(error)return response({error:error.message},rpcStatus(error));
  return response(data);
 }catch{return response({error:'Solicitação inválida'},400);}
};
