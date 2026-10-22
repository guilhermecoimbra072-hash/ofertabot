import {createHash} from 'node:crypto';
import type {Gateway,Incoming} from './types.js';
import {Vault} from './vault.js';
export type Stored=Omit<Incoming,'image'>&{image?:string};
const INBOX_LIMIT=200;
/** Acima da caixa quente, a captura continua no cofre. Não é descartada no log. */
const OVERFLOW_LIMIT=5000;
export class CaptureQueue {
 private spool:Stored[]=[];private overflow:Stored[]=[];private serial=Promise.resolve();
 constructor(private api:Gateway,private vault:Vault){}
 get pending(){return this.spool.length+this.overflow.length;}
 async load(){this.spool=await this.vault.read<Stored[]>('inbox.enc')??[];this.overflow=await this.vault.read<Stored[]>('overflow.enc')??[];}
 private mutate(fn:()=>Promise<void>){const next=this.serial.then(fn);this.serial=next.catch(()=>{});return next;}
 private store(m:Incoming):Stored{return {...m,image:m.image?.toString('base64')};}
 private hash(m:Pick<Incoming,'group_jid'|'message_id'>,code:string){return createHash('sha256').update(`${m.group_jid}\0${m.message_id}\0${code}`).digest('hex');}
 async add(m:Incoming){await this.mutate(async()=>{
  const stored=this.store(m);
  if(this.spool.length<INBOX_LIMIT){this.spool.push(stored);await this.vault.write('inbox.enc',this.spool);return;}
  if(this.overflow.length>=OVERFLOW_LIMIT){await this.quarantine(stored,'queue_overflow');return;}
  this.overflow.push(stored);await this.vault.write('overflow.enc',this.overflow);
 });}
 /** Falha de captura que antes só ia para o console. O original fica cifrado e o histórico recebe o código, sem o conteúdo. */
 async preserveFailure(m:Incoming,code:string){await this.mutate(async()=>{await this.quarantine(this.store({...m,image:undefined,media_status:'failed'}),code);});}
 private async quarantine(stored:Stored,code:string){
  const key=this.hash(stored,code);
  await this.vault.write(`quarantine-${key}.enc`,stored);
  await this.api.call('capture_error',{message_hash:key,code}).catch(()=>{});
 }
 async flush(){await this.mutate(async()=>{
  while(this.spool.length<INBOX_LIMIT&&this.overflow.length)this.spool.push(this.overflow.shift()!);
  if(this.overflow.length)await this.vault.write('overflow.enc',this.overflow);else await this.vault.write('overflow.enc',null);
  for(let n=0;n<10&&this.spool.length;n++){
   const m=this.spool[0],images:string[]=[];
   const key=createHash('sha256').update(m.group_jid+'\0'+m.message_id).digest('hex');
   try {
    if(m.image){images.push(await this.api.upload(Buffer.from(m.image,'base64'),m.mime??'image/jpeg',key));}
    const {image,mime,...payload}=m;await this.api.call('capture',{...payload,images});
   } catch(e){
    const status=(e as {status?:number}).status;
    if(!status||![400,409,413,422].includes(status))throw e;
    await this.vault.write(`quarantine-${key}.enc`,m);
    console.error('capture_quarantined: original preservado no cofre; confira o histórico');
    await this.api.call('capture_error',{message_hash:key,code:'permanent_rejection'}).catch(()=>{});
   }
   this.spool.shift();await this.vault.write('inbox.enc',this.spool);
  }
 });}
 async drain(){await this.serial;}
}
