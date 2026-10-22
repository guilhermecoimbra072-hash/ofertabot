import makeWASocket, {BufferJSON,DisconnectReason,downloadMediaMessage,initAuthCreds,normalizeMessageContent,proto, type AuthenticationCreds, type AuthenticationState, type WASocket} from '@whiskeysockets/baileys';
import {pino} from 'pino';
import type {Incoming,Transport} from './types.js';
import {Vault} from './vault.js';
import {matchesExpectedAccount} from './account.js';
import {disconnectCode,formatDisconnectCode,planReconnect} from './reconnect.js';
import {bytesMatch,extensionFor,normalizeMime} from './media.js';
const logger=pino({level:'silent'});
type Scheduler=(fn:()=>void,ms:number)=>{cancel:()=>void};
const defaultSchedule:Scheduler=(fn,ms)=>{const timer=setTimeout(fn,ms);return {cancel:()=>clearTimeout(timer)};};
const defaultLog=(line:string)=>{if(line.startsWith('whatsapp_connected')||line.startsWith('whatsapp_reconnect'))console.info(line);else console.error(line);};
export type BaileysDeps={createSocket?:typeof makeWASocket;schedule?:Scheduler;random?:()=>number;log?:(line:string)=>void};
export class BaileysTransport implements Transport {
 status:Transport['status']='disconnected';qr?:string;qrAt?:number;connectionEpoch=0;
 private socket?:WASocket;private stopping=false;private attempts=0;private generation=0;private cancelReconnect?:()=>void;
 private acknowledgements=new Set<string>();private listeners=new Map<string,{ok:()=>void;fail:()=>void}>();
 private state?:AuthenticationState;private save?:()=>Promise<void>;
 constructor(private vault:Vault,private expectedPhone?:string,private deps:BaileysDeps={}){}
 private write(line:string){(this.deps.log??defaultLog)(line);}
 private arm(fn:()=>void,ms:number){this.cancelReconnect?.();this.cancelReconnect=(this.deps.schedule??defaultSchedule)(fn,ms).cancel;}
 async start(onMessage:(m:Incoming)=>Promise<void>){
  const saved=await this.vault.read<string>('session.enc');
  const data=saved?JSON.parse(saved,BufferJSON.reviver):{creds:initAuthCreds(),keys:{}};
  let serial=Promise.resolve();
  const save=()=>{const snapshot=JSON.stringify(data,BufferJSON.replacer);serial=serial.then(()=>this.vault.write('session.enc',snapshot));return serial;};
  this.save=save;
  this.state={creds:data.creds as AuthenticationCreds,keys:{get:async(type,ids)=>{const out:Record<string,any>={};for(const id of ids){const value=data.keys[`${type}:${id}`];if(value)out[id]=type==='app-state-sync-key'?proto.Message.AppStateSyncKeyData.fromObject(value):value;}return out;},set:async(update)=>{for(const [type,values] of Object.entries(update))for(const [id,value] of Object.entries(values??{})){if(value)data.keys[`${type}:${id}`]=value;else delete data.keys[`${type}:${id}`];}await save();}}};
  const connect=()=>{
   if(this.stopping)return;
   const current=++this.generation;
   const create=this.deps.createSocket??makeWASocket;
   const sock=create({auth:this.state!,logger,markOnlineOnConnect:false,syncFullHistory:false,generateHighQualityLinkPreview:false,browser:['OfertaBot','Chrome','1.0.0'],connectTimeoutMs:30000});
   this.socket=sock;
   sock.ev.on('creds.update',()=>{if(current!==this.generation||this.stopping)return;void save().catch(()=>{this.stopping=true;sock.end(new Error('Falha ao persistir sessão'));});});
   sock.ev.on('connection.update',({connection,qr,lastDisconnect})=>{
    if(current!==this.generation||this.stopping)return;
    if(qr){this.qr=qr;this.qrAt=Date.now();this.status='awaiting_qr';}
    if(connection==='open'){
     this.qr=undefined;
     if(!matchesExpectedAccount(this.expectedPhone,sock.user?.id)){
      this.status='disconnected';this.stopping=true;
      this.write('account_mismatch: conta vinculada não corresponde ao número configurado em ENGINE_EXPECTED_PHONE; pare o motor e revise a sessão.');
      sock.end(new Error('Conta diferente da configurada'));return;
     }
     this.status='connected';this.attempts=0;this.connectionEpoch++;this.write('whatsapp_connected');
    }
    if(connection==='close'){
     if(this.stopping)return;
     this.status='disconnected';this.qr=undefined;for(const l of this.listeners.values())l.fail();this.listeners.clear();
     const code=disconnectCode(lastDisconnect?.error);
     this.write(`whatsapp_disconnected code=${formatDisconnectCode(code)}`);
     const plan=planReconnect({code,attempt:this.attempts,randomUnit:this.deps.random?.()??Math.random(),loggedOutCode:DisconnectReason.loggedOut,restartRequiredCode:DisconnectReason.restartRequired});
     if(plan.action==='stop'){this.stopping=true;this.write(plan.line);return;}
     this.attempts=plan.nextAttempt;this.write(plan.line);this.arm(connect,plan.delayMs);
    }
   });
   sock.ev.on('messages.update',updates=>{if(current!==this.generation)return;for(const u of updates){const id=u.key.id;if(id && (u.update.status??0)>=proto.WebMessageInfo.Status.SERVER_ACK){this.acknowledgements.add(id);this.listeners.get(id)?.ok();if(this.acknowledgements.size>1000)this.acknowledgements.delete(this.acknowledgements.values().next().value!);}}});
   sock.ev.on('messages.upsert',({messages,type})=>{
    if(current!==this.generation||type!=='notify'||this.status!=='connected')return;
    for(const m of messages){
     if(m.key.fromMe || !m.key.remoteJid?.endsWith('@g.us') || !m.key.id)continue;
     const base:Incoming={message_id:m.key.id,group_jid:m.key.remoteJid,received_at:new Date(Number(m.messageTimestamp??Math.floor(Date.now()/1000))*1000).toISOString(),from_me:false,text:'',media_kind:'unsupported',media_status:'failed'};
     void (async()=>{
      const body=normalizeMessageContent(m.message);
      if(!body){await onMessage(base);return;}
      const im=body.imageMessage,vm=body.videoMessage,am=body.audioMessage,dm=body.documentMessage;
      const kind=im?'image':vm?'video':am?'audio':dm?'document':body.conversation||body.extendedTextMessage?'text':'unsupported';
      const media=im??vm??am??dm;
      const declared=normalizeMime(media?.mimetype??(kind==='image'?'image/jpeg':kind==='video'?'video/mp4':kind==='audio'?'audio/ogg':kind==='document'?'application/pdf':''));
      const known=kind==='text'||!!extensionFor(declared);
      const incoming:Incoming={...base,text:body.conversation??body.extendedTextMessage?.text??im?.caption??vm?.caption??dm?.caption??'',media_kind:kind,media_status:kind==='text'?'ready':known?'ready':'unsupported',mime:media?declared:undefined};
      if(media&&known){
       if(Number(media.fileLength??0)>10*1024*1024)incoming.media_status='failed';
       else try{const buf=await downloadMediaMessage(m,'buffer',{},{logger,reuploadRequest:sock.updateMediaMessage});if(buf.length>10*1024*1024||!bytesMatch(declared,buf))incoming.media_status='failed';else{incoming.image=buf;incoming.media_status='ready';}}catch{incoming.media_status='failed';}
      }
      await onMessage(incoming);
     })().catch(async()=>{
      console.error('capture_failed: captura preservada como falha; confira o histórico');
      try{await onMessage(base);}catch{console.error('capture_unpreserved: o cofre recusou a falha');}
     });
    }
   });
  };connect();
 }
 async groups(){if(!this.socket||this.status!=='connected')return [];const gs=await this.socket.groupFetchAllParticipating();return Object.values(gs).map(g=>({jid:g.id,name:g.subject}));}
 async send(jid:string,text:string,file?:Buffer,kind?:string,mime?:string){
  if(!this.socket||this.status!=='connected')throw new Error('WhatsApp desconectado');
  const ext=mime?extensionFor(mime)??'bin':'bin';
  const content=!file?{text}:kind==='video'?{video:file,caption:text,mimetype:mime??'video/mp4'}:kind==='audio'&&text.trim()?{document:file,mimetype:mime??'audio/ogg',fileName:`audio.${ext}`,caption:text}:kind==='audio'?{audio:file,mimetype:mime??'audio/ogg',ptt:false as const}:kind==='document'?{document:file,mimetype:mime??'application/pdf',fileName:`oferta.${ext}`,caption:text}:{image:file,caption:text};
  const message=await this.socket.sendMessage(jid,content);const id=message?.key.id;if(!id)throw new Error('Sem identificador');
  if((message.status??0)>=proto.WebMessageInfo.Status.SERVER_ACK || this.acknowledgements.has(id))return id;
  await new Promise<void>((resolve,reject)=>{
   const timer=setTimeout(()=>{this.listeners.delete(id);reject(new Error('Confirmação não recebida'));},45000);
   this.listeners.set(id,{ok:()=>{clearTimeout(timer);this.listeners.delete(id);resolve();},fail:()=>{clearTimeout(timer);this.listeners.delete(id);reject(new Error('Conexão interrompida'));}});
   if(this.acknowledgements.has(id))this.listeners.get(id)?.ok();
  });return id;
 }
 async stop(){this.stopping=true;this.cancelReconnect?.();this.cancelReconnect=undefined;this.status='disconnected';this.qr=undefined;for(const l of this.listeners.values())l.fail();this.listeners.clear();this.socket?.end(new Error('Encerramento solicitado'));await this.save?.();}
}
