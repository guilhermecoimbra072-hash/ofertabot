import type {Gateway,Job,Transport} from './types.js';
import type {Vault} from './vault.js';
type Receipt={id:string;lease_token:string;outcome:string;transport_id?:string};
export function sendFailureReason(error:unknown){
 const msg=error instanceof Error?error.message:'';
 if(msg==='Confirmação não recebida')return 'ack_timeout';
 if(msg==='Conexão interrompida')return 'connection_interrupted';
 if(msg==='WhatsApp desconectado')return 'disconnected';
 if(msg==='Sem confirmação'||msg==='Sem identificador')return 'no_id';
 return 'transport_error';
}
export function sendOutcomeLine(id:string,outcome:string,reason?:string){
 const safeId=id.replace(/[^a-zA-Z0-9-]/g,'').slice(0,64);
 const safeOutcome=outcome.replace(/[^a-z_]/g,'');
 const safeReason=reason?.replace(/[^a-z_]/g,'');
 return safeReason?`send_outcome id=${safeId} outcome=${safeOutcome} reason=${safeReason}`:`send_outcome id=${safeId} outcome=${safeOutcome}`;
}
/** Nunca repete transporte após begin_send. O recibo é reenviado apenas ao backend. */
export class Worker {
  constructor(private api:Gateway,private transport:Transport,private vault:Vault,private log:(line:string)=>void=line=>console.info(line)){}
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
    try{if(job.image)image=await this.api.image(job.image);}catch{await this.api.call('finish',{id:job.id,lease_token:job.lease_token,outcome:'retryable'});this.log(sendOutcomeLine(job.id,'retryable','preflight'));return;}
    // Falha/timeout nesta chamada é tratada como possivelmente iniciada pelo servidor.
    // Não invocar transporte e não reenfileirar; a lease resolverá para incerto.
    await this.api.call('begin_send',{id:job.id,lease_token:job.lease_token});
    let receipt:Receipt;let failure:unknown;
    try{
      const transport_id=await this.transport.send(job.jid,job.text,image);
      if(!transport_id)throw new Error('Sem confirmação');
      receipt={id:job.id,lease_token:job.lease_token,outcome:'sent',transport_id};
    }catch(error){failure=error;receipt={id:job.id,lease_token:job.lease_token,outcome:'uncertain'};}
    await this.vault.write('receipt.enc',receipt);
    this.log(sendOutcomeLine(receipt.id,receipt.outcome,failure?sendFailureReason(failure):undefined));
    await this.api.call('finish',receipt);
    await this.vault.write('receipt.enc',null);
  }
}
