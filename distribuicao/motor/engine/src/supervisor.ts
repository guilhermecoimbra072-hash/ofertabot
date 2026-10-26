/** Ciclo do motor sem WhatsApp: lease, credencial, heartbeat e grupos. */
export const GROUPS_REFRESH_MS=15*60*1000;
export const CYCLE_PAUSE_MS=5000;
/** 403 pode vir de falha momentânea do backend ao validar o token; só encerra se a recusa persistir. */
export const CREDENTIAL_GRACE_MS=2*60*1000;
export const CREDENTIAL_CONFIRMATIONS=3;
export const CREDENTIAL_UNCONFIRMED_LINE='credential_unconfirmed: backend recusou a credencial; nova verificação antes de encerrar';
export type CycleErrorKind='credential_rejected'|'lease_expired'|'lease_held'|'cycle_failed';
function errorStatus(error:unknown){return typeof error==='object'&&error&&'status' in error&&typeof (error as {status?:unknown}).status==='number'?(error as {status:number}).status:undefined;}
export function classifyCycleError(error:unknown):CycleErrorKind{
 const status=errorStatus(error);
 const message=error instanceof Error?error.message:'';
 // Lease vencida (notebook suspenso, rede lenta) não é revogação: o próximo heartbeat a renova.
 if(message.includes('Lease de motor inválida')||message.includes('Motor sem lease'))return 'lease_expired';
 if(status===401||status===403||/^Backend 401\b/.test(message)||/^Backend 403\b/.test(message))return 'credential_rejected';
 if((status===409||status===undefined)&&message.includes('Outro motor está ativo'))return 'lease_held';
 return 'cycle_failed';
}
/** 401 é token malformado; não há o que esperar. */
export function credentialDefinitelyRejected(error:unknown){return errorStatus(error)===401||/^Backend 401\b/.test(error instanceof Error?error.message:'');}
export function cycleErrorLine(kind:CycleErrorKind){
 if(kind==='credential_rejected')return 'credential_rejected: motor encerrado';
 if(kind==='lease_expired')return 'lease_expired: lease renovada no próximo heartbeat; nova tentativa em seguida';
 if(kind==='lease_held')return 'lease_held: outro motor ainda detém a lease; nova tentativa em seguida';
 return 'cycle_failed: verifique rede e histórico no painel';
}
export function heartbeatPayload(status:string,qr:string|undefined,qrAt:number|undefined,now:number):Record<string,unknown>{
 const fresh=!!qrAt&&now-qrAt<25000;
 return {status,qr:status==='awaiting_qr'&&fresh?qr??null:null};
}
export function shouldSyncGroups(status:string,previouslyConnected:boolean,elapsedMs:number,epochChanged=false){
 if(status!=='connected')return false;
 if(!previouslyConnected||epochChanged)return true;
 return elapsedMs>=GROUPS_REFRESH_MS;
}
export async function supervise(deps:{
 heartbeat:()=>Promise<void>;
 startTransport:()=>Promise<void>;
 syncGroups:()=>Promise<void>;
 flushCaptures:()=>Promise<void>;
 work:()=>Promise<void>;
 shutdown:()=>Promise<void>;
 sleep:(ms:number)=>Promise<void>;
 log:(line:string)=>void;
 isStopped:()=>boolean;
 transportStatus:()=>string;
 connectionEpoch?:()=>number;
 now:()=>number;
}):Promise<'credential_rejected'|'stopped'>{
 let transportStarted=false;let previouslyConnected=false;let lastGroupsAt:number|undefined;let lastEpoch:number|undefined;
 let rejectedSince:number|undefined;let rejections=0;
 while(!deps.isStopped()){
  try{
   await deps.heartbeat();
   rejectedSince=undefined;rejections=0;
   if(!transportStarted){await deps.startTransport();transportStarted=true;}
   const status=deps.transportStatus();const now=deps.now();const epoch=deps.connectionEpoch?.();
   const elapsed=lastGroupsAt===undefined?Number.POSITIVE_INFINITY:now-lastGroupsAt;
   const epochChanged=epoch!==undefined&&lastEpoch!==undefined&&epoch!==lastEpoch;
   if(shouldSyncGroups(status,previouslyConnected,elapsed,epochChanged)){await deps.syncGroups();lastGroupsAt=now;if(epoch!==undefined)lastEpoch=epoch;}
   previouslyConnected=status==='connected';
   try{await deps.flushCaptures();}catch(error){if(classifyCycleError(error)==='credential_rejected')throw error;deps.log('capture_sync_delayed: capturas preservadas; publicação continua independente');}
   await deps.work();
  }catch(error){
   const kind=classifyCycleError(error);
   if(kind==='credential_rejected'){
    const now=deps.now();rejectedSince??=now;rejections++;
    if(credentialDefinitelyRejected(error)||(rejections>=CREDENTIAL_CONFIRMATIONS&&now-rejectedSince>=CREDENTIAL_GRACE_MS)){deps.log(cycleErrorLine(kind));await deps.shutdown();return 'credential_rejected';}
    deps.log(CREDENTIAL_UNCONFIRMED_LINE);
   }else deps.log(cycleErrorLine(kind));
  }
  if(!deps.isStopped())await deps.sleep(CYCLE_PAUSE_MS);
 }
 return 'stopped';
}
