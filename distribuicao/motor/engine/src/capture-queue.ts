import {createHash} from 'node:crypto';
import type {Gateway,Incoming} from './types.js';
import {Vault} from './vault.js';
export type Stored=Omit<Incoming,'image'>&{image?:string};
export class CaptureQueue {
 private spool:Stored[]=[];private serial=Promise.resolve();
 constructor(private api:Gateway,private vault:Vault){}
 get pending(){return this.spool.length;}
 async load(){this.spool=await this.vault.read<Stored[]>('inbox.enc')??[];}
 private mutate(fn:()=>Promise<void>){const next=this.serial.then(fn);this.serial=next.catch(()=>{});return next;}
 async add(m:Incoming){await this.mutate(async()=>{if(this.spool.length>=200)throw new Error('Fila local cheia');this.spool.push({...m,image:m.image?.toString('base64')});await this.vault.write('inbox.enc',this.spool);});}
 async flush(){await this.mutate(async()=>{for(let n=0;n<10&&this.spool.length;n++){
  const m=this.spool[0],images:string[]=[];
  const key=createHash('sha256').update(m.group_jid+'\0'+m.message_id).digest('hex');
  try {
  if(m.image){const key=createHash('sha256').update(m.group_jid+'\0'+m.message_id).digest('hex');images.push(await this.api.upload(Buffer.from(m.image,'base64'),m.mime??'image/jpeg',key));}
  const {image,mime,...payload}=m;await this.api.call('capture',{...payload,images});
  } catch(e){
   const status=(e as {status?:number}).status;
   if(!status||![400,409,413,422].includes(status))throw e;
   await this.vault.write(`quarantine-${key}.enc`,m);
   console.error('capture_quarantined: original preservado no cofre; confira o histórico');
   await this.api.call('capture_error',{message_hash:key,code:'permanent_rejection'}).catch(()=>{});
  }
  this.spool.shift();await this.vault.write('inbox.enc',this.spool);
 }});}
 async drain(){await this.serial;}
}
