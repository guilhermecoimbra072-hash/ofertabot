import type {Gateway} from './types.js';
export class HttpGateway implements Gateway {
  constructor(private url:string,private token:string,private instanceId:string){
    const u=new URL(url);if(u.protocol!=='https:' && !['localhost','127.0.0.1'].includes(u.hostname))throw new Error('ENGINE_URL exige HTTPS');
  }
  async request(action:string,payload:Record<string,unknown>={}){
    const r=await fetch(this.url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${this.token}`},body:JSON.stringify({action,payload:{...payload,instance_id:this.instanceId}}),signal:AbortSignal.timeout(25000)});
    if(!r.ok)throw Object.assign(new Error(`Backend ${r.status}: ${(await r.json().catch(()=>({error:'indisponível'}))).error??'erro'}`),{status:r.status});
    return r.json();
  }
  async call<T=unknown>(action:string,payload:Record<string,unknown>={}):Promise<T>{return this.request(action,payload);}
  async image(path:string):Promise<Buffer>{const r=await this.request('download',{path});return Buffer.from(r.data,'base64');}
  async upload(data:Buffer,mime:string,key:string):Promise<string>{const r=await this.request('upload',{data:data.toString('base64'),mime,key});return r.path;}
}
