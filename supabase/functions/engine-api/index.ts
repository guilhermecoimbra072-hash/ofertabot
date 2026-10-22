/** Tipos aceitos pelo cofre e pelo armazenamento (até 10 MB). Sem rede. */
const MEDIA_MIMES = [
 'image/jpeg','image/png','image/webp',
 'video/mp4',
 'audio/ogg','audio/mpeg','audio/mp4',
 'application/pdf',
 'application/msword',
 'application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

const EXTENSIONS: Record<string,string> = {
 'image/jpeg':'jpeg','image/png':'png','image/webp':'webp',
 'video/mp4':'mp4',
 'audio/ogg':'ogg','audio/mpeg':'mp3','audio/mp4':'m4a',
 'application/pdf':'pdf','application/msword':'doc','application/vnd.ms-excel':'xls',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
};

function normalizeMime(mime:string){return mime.split(';')[0].trim().toLowerCase();}
function extensionFor(mime:string){return EXTENSIONS[normalizeMime(mime)]??null;}
function mimeForPath(path:string){
 const ext=path.split('.').pop()?.toLowerCase()??'';
 return Object.entries(EXTENSIONS).find(([,value])=>value===ext)?.[0];
}
function text(bytes:Uint8Array,start:number,end:number){return new TextDecoder().decode(bytes.slice(start,end));}
function bytesMatch(mime:string,bytes:Uint8Array){
 const kind=normalizeMime(mime);
 if(bytes.length<12)return false;
 if(kind==='image/jpeg')return bytes[0]===255&&bytes[1]===216;
 if(kind==='image/png')return bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
 if(kind==='image/webp')return text(bytes,0,4)==='RIFF'&&text(bytes,8,12)==='WEBP';
 if(kind==='video/mp4'||kind==='audio/mp4')return text(bytes,4,8)==='ftyp';
 if(kind==='audio/ogg')return text(bytes,0,4)==='OggS';
 if(kind==='audio/mpeg')return text(bytes,0,3)==='ID3'||(bytes[0]===255&&(bytes[1]&0xe0)===224);
 if(kind==='application/pdf')return text(bytes,0,4)==='%PDF';
 if(kind==='application/msword'||kind==='application/vnd.ms-excel')return bytes[0]===0xd0&&bytes[1]===0xcf&&bytes[2]===0x11&&bytes[3]===0xe0;
 if(kind.endsWith('wordprocessingml.document')||kind.endsWith('spreadsheetml.sheet'))return bytes[0]===0x50&&bytes[1]===0x4b;
 return false;
}

import {createClient,type SupabaseClient} from 'npm:@supabase/supabase-js@2.118.0';
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
export const createEngineHandler=(db:SupabaseClient<any>)=>async(req:Request)=>{
 if(req.method!=='POST')return response({error:'Método inválido'},405);
 if(Number(req.headers.get('content-length')??0)>15000000)return response({error:'Arquivo grande'},413);
 const token=req.headers.get('authorization')?.replace(/^Bearer /,'')??'';
 if(!/^ob_[a-f0-9]{64}$/.test(token))return response({error:'Credencial inválida'},401);
 const {data:ctx,error:authError}=await db.rpc('engine_context',{p_token:token});
 if(authError)return response({error:'Credencial inválida ou revogada'},403);
 try{
  const raw=await req.text();if(raw.length>15000000)return response({error:'Arquivo grande'},413);
  const {action,payload={}}=JSON.parse(raw);
  if(action==='upload'){
   const mime=normalizeMime(String(payload.mime??''));
   const ext=extensionFor(mime);
   if(!ext|| !/^[a-f0-9]{64}$/.test(payload.key))return response({error:'Mídia inválida'},400);
   // Valida lease do motor também para operações de arquivo.
   const {error:leaseError}=await db.rpc('engine_call',{p_token:token,p_action:'groups',p_payload:{instance_id:payload.instance_id,groups:[]}});if(leaseError)return response({error:'Motor sem lease'},409);
   const bytes=Uint8Array.from(atob(payload.data),c=>c.charCodeAt(0));if(bytes.length>10485760)return response({error:'Máximo 10 MB'},413);
   if(!bytesMatch(mime,bytes))return response({error:'Conteúdo de mídia inválido'},400);
   const path=`${ctx.company_id}/${ctx.connection_id}/${payload.key}.${ext}`;
   const {error}=await db.storage.from('offer-media').upload(path,bytes,{contentType:mime,upsert:false});
   if(error && !['409','Duplicate'].includes(String((error as any).statusCode??(error as any).error)) && !error.message?.includes('already exists'))return response({error:'Falha ao preservar mídia'},502);
   return response({path});
  }
  if(action==='download'){
   // Motor só pode baixar imagens dos seus próprios jobs ativos.
   const {data:rows}=await db.from('publications').select('id').eq('connection_id',ctx.connection_id).eq('image',payload.path).eq('status','processing').limit(1);
   if(!rows?.length||!String(payload.path).startsWith(ctx.company_id+'/'))return response({error:'Arquivo não autorizado'},403);
   const {data,error}=await db.storage.from('offer-media').download(payload.path);if(error)return response({error:'Mídia indisponível'},502);
   const b=new Uint8Array(await data.arrayBuffer());let s='';for(let k=0;k<b.length;k+=8192)s+=String.fromCharCode(...b.subarray(k,k+8192));return response({data:btoa(s)});
  }
  if(!['heartbeat','groups','capture','capture_error','claim','begin_send','finish'].includes(action))return response({error:'Ação desconhecida'},400);
  const {data,error}=await db.rpc('engine_call',{p_token:token,p_action:action,p_payload:payload});
  if(error)return response({error:error.message},error.code==='42501'?403:409);
  return response(data);
 }catch{return response({error:'Solicitação inválida'},400);}
};

Deno.serve(createEngineHandler(createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})));
