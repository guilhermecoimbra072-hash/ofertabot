/** Ciclo do motor sem WhatsApp: lease, credencial, heartbeat e grupos. */
export const GROUPS_REFRESH_MS=15*60*1000;
export const CYCLE_PAUSE_MS=5000;
export type CycleErrorKind='credential_rejected'|'lease_held'|'cycle_failed';
export function classifyCycleError(error:unknown):CycleErrorKind{
 const status=typeof error==='object'&&error&&'status' in error&&typeof (error as {status?:unknown}).status==='number'?(error as {status:number}).status:undefined;
 const message=error instanceof Error?error.message:'';
 if(status===401||status===403||/^Backend 401\b/.test(message)||/^Backend 403\b/.test(message))return 'credential_rejected';
 if((status===409||status===undefined)&&message.includes('Outro motor está ativo'))return 'lease_held';
 return 'cycle_failed';
}
export function cycleErrorLine(kind:CycleErrorKind){
 if(kind==='credential_rejected')return 'credential_rejected: motor encerrado';
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
 while(!deps.isStopped()){
  try{
   await deps.heartbeat();
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
   deps.log(cycleErrorLine(kind));
   if(kind==='credential_rejected'){await deps.shutdown();return 'credential_rejected';}
  }
  if(!deps.isStopped())await deps.sleep(CYCLE_PAUSE_MS);
 }
 return 'stopped';
}
