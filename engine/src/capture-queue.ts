import {createHash} from 'node:crypto';
import type {Gateway,Incoming} from './types.js';
import {Vault} from './vault.js';
/** inbox.enc guarda só o índice; cada imagem fica em media-<hash>.enc. `image` inline existe apenas em filas gravadas por versões anteriores. */
export type Stored=Omit<Incoming,'image'>&{image?:string;media?:string;failing_since?:string};
export const MAX_PENDING_CAPTURES=1000;
/** 409 sem motivo conhecido pode ser falha momentânea do banco; só vai à quarentena se persistir. */
export const AMBIGUOUS_REJECTION_MS=10*60*1000;
const PERMANENT_MESSAGE=/Captura excede limite|Imagem inválida|Conteúdo de imagem inválido|Mídia inválida|Máximo 10 MB|Arquivo grande|invalid input syntax|violates check constraint/i;
const LEASE_MESSAGE=/lease|Outro motor/i;
export function captureRejection(error:unknown,failingSince:number|undefined,now:number):'permanent'|'ambiguous'|'transient'{
 const status=(error as {status?:number}|undefined)?.status;
 const message=error instanceof Error?error.message:'';
 if(!status||status>=500||status===401||status===403||LEASE_MESSAGE.test(message))return 'transient';
 if([400,413,422].includes(status)||PERMANENT_MESSAGE.test(message))return 'permanent';
 if(status!==409)return 'transient';
 return failingSince!==undefined&&now-failingSince>=AMBIGUOUS_REJECTION_MS?'permanent':'ambiguous';
}
const captureKey=(m:{group_jid:string;message_id:string})=>createHash('sha256').update(m.group_jid+'\0'+m.message_id).digest('hex');
export class CaptureQueue {
 private spool:Stored[]=[];private serial=Promise.resolve();
 constructor(private api:Gateway,private vault:Vault,private now:()=>number=Date.now){}
 get pending(){return this.spool.length;}
 async load(){this.spool=await this.vault.read<Stored[]>('inbox.enc')??[];}
 private mutate(fn:()=>Promise<void>){const next=this.serial.then(fn);this.serial=next.catch(()=>{});return next;}
 async add(m:Incoming){await this.mutate(async()=>{
  if(this.spool.some(s=>s.group_jid===m.group_jid&&s.message_id===m.message_id))return;
  if(this.spool.length>=MAX_PENDING_CAPTURES)throw new Error('Fila local cheia');
  const {image,...rest}=m;const item:Stored=rest;
  if(image){item.media=`media-${captureKey(m)}.enc`;await this.vault.write(item.media,image.toString('base64'));}
  this.spool.push(item);await this.vault.write('inbox.enc',this.spool);
 });}
 async flush(){await this.mutate(async()=>{for(let n=0;n<10&&this.spool.length;n++){
  const m=this.spool[0],images:string[]=[];
  const key=captureKey(m);
  const image=m.media?(await this.vault.read<string>(m.media))??undefined:m.image;
  const {image:_inline,mime,media,failing_since,...payload}=m;
  if(media&&!image)payload.media_status='failed';
  try {
   if(image)images.push(await this.api.upload(Buffer.from(image,'base64'),mime??'image/jpeg',key));
   await this.api.call('capture',{...payload,images});
  } catch(e){
   const rejection=captureRejection(e,failing_since?Date.parse(failing_since):undefined,this.now());
   if(rejection==='ambiguous'&&!failing_since){m.failing_since=new Date(this.now()).toISOString();await this.vault.write('inbox.enc',this.spool);}
   if(rejection!=='permanent')throw e;
   await this.vault.write(`quarantine-${key}.enc`,{...payload,mime,image});
   console.error('capture_quarantined: original preservado no cofre; confira o histórico');
   await this.api.call('capture_error',{message_hash:key,code:'permanent_rejection'}).catch(()=>{});
  }
  this.spool.shift();await this.vault.write('inbox.enc',this.spool);
  if(media)await this.vault.remove(media);
 }});}
 async drain(){await this.serial;}
}
