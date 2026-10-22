import type {Incoming,Transport} from './types.js';
/** Somente testes. Não é selecionável pelo executável de produção. */
export class MockTransport implements Transport {
  status:Transport['status']='connected';sent:{jid:string;text:string;image?:Buffer}[]=[]; fail=false;
  async start(_onMessage:(m:Incoming)=>Promise<void>){}
  async groups(){return [{jid:'test@g.us',name:'Grupo SIMULADO'}];}
  async send(jid:string,text:string,image?:Buffer){this.sent.push({jid,text,image});if(this.fail)throw new Error('Falha simulada após início');return `mock-${this.sent.length}`;}
  async stop(){this.status='disconnected';}
}
