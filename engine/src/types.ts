export type Job = { id:string; lease_token:string; jid:string; text:string; image:string|null; };
export type Incoming = {message_id:string;group_jid:string;received_at:string;text:string;from_me:boolean;media_kind:'text'|'image'|'video'|'audio'|'document'|'unsupported';media_status:'ready'|'unsupported'|'failed';image?:Buffer;mime?:string};
export interface Transport {
  status: 'connected'|'disconnected'|'awaiting_qr';
  qr?: string; qrAt?: number;
  start(onMessage:(m:Incoming)=>Promise<void>):Promise<void>;
  groups():Promise<{jid:string;name:string}[]>;
  send(jid:string,text:string,image?:Buffer):Promise<string>;
  stop():Promise<void>;
}
export interface Gateway { call<T=unknown>(action:string,payload?:Record<string,unknown>):Promise<T>; image(path:string):Promise<Buffer>; upload(data:Buffer,mime:string,key:string):Promise<string>; }
