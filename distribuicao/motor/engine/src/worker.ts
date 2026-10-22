import type {Gateway,Job,Transport} from './types.js';
import type {Vault} from './vault.js';
type Receipt={id:string;lease_token:string;outcome:string;transport_id?:string};
/** Nunca repete transporte após begin_send. O recibo é reenviado apenas ao backend. */
export class Worker {
  constructor(private api:Gateway,private transport:Transport,private vault:Vault){}
  async recover(){
    const pending=await this.vault.read<Receipt>('receipt.enc');if(!pending)return;
    try{await this.api.call('finish',pending);}catch(e){
      if(!(e instanceof Error)||!e.message.startsWith('Backend 409:'))throw e;
      // A lease já terminou. Preserva evidência local para revisão, sem reenviar.
      const safeId=pending.id.replace(/[^a-zA-Z0-9-]/g,'');
      await this.vault.write(`unresolved-${safeId}.enc`,pending);
      console.error('receipt_requires_review: confira o resultado incerto no histórico');
    }
    await this.vault.write('receipt.enc',null);
  }
  async once(){
    await this.recover();if(this.transport.status!=='connected')return;
    const job=await this.api.call<Job|null>('claim');if(!job)return;
    let image:Buffer|undefined;
    try{if(job.image)image=await this.api.image(job.image);}catch{await this.api.call('finish',{id:job.id,lease_token:job.lease_token,outcome:'retryable'});return;}
    // Falha/timeout nesta chamada é tratada como possivelmente iniciada pelo servidor.
    // Não invocar transporte e não reenfileirar; a lease resolverá para incerto.
    await this.api.call('begin_send',{id:job.id,lease_token:job.lease_token});
    let receipt:Receipt;
    try{
      const transport_id=await this.transport.send(job.jid,job.text,image);
      if(!transport_id)throw new Error('Sem confirmação');
      receipt={id:job.id,lease_token:job.lease_token,outcome:'sent',transport_id};
    }catch{receipt={id:job.id,lease_token:job.lease_token,outcome:'uncertain'};}
    await this.vault.write('receipt.enc',receipt);
    await this.api.call('finish',receipt);
    await this.vault.write('receipt.enc',null);
  }
}
