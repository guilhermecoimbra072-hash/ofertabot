/** Política pura de reconexão. Não abre socket nem registra segredo. */
export const RECONNECT_BASE_MS=1000;
export const RECONNECT_CAP_MS=5000;
export const RECONNECT_JITTER_MS=1000;
const LOGGED_OUT_LINE='logged_out: o WhatsApp encerrou a sessão. Pare o motor, renomeie .engine-data/session.enc para um backup protegido e reinicie para ler um novo QR no painel. A sessão não foi apagada.';
export type ReconnectPlan={action:'stop';line:string}|{action:'retry';delayMs:number;nextAttempt:number;line:string};
export function formatDisconnectCode(code:number|undefined){return typeof code==='number'&&Number.isInteger(code)?String(code):'unknown';}
export function disconnectCode(error:unknown){
 if(!error||typeof error!=='object')return undefined;
 const output=(error as {output?:{statusCode?:unknown}}).output?.statusCode;
 const direct=(error as {statusCode?:unknown}).statusCode;
 const code=typeof output==='number'?output:direct;
 return typeof code==='number'&&Number.isInteger(code)?code:undefined;
}
export function planReconnect(input:{code:number|undefined;attempt:number;randomUnit:number;loggedOutCode:number;restartRequiredCode:number}):ReconnectPlan{
 if(input.code===input.loggedOutCode)return {action:'stop',line:LOGGED_OUT_LINE};
 const nextAttempt=input.attempt+1;
 const label=formatDisconnectCode(input.code);
 if(input.code===input.restartRequiredCode)return {action:'retry',delayMs:0,nextAttempt,line:`whatsapp_reconnect attempt=${nextAttempt} delay_ms=0 code=${label}`};
 const unit=Number.isFinite(input.randomUnit)?Math.min(1,Math.max(0,input.randomUnit)):0;
 const backoff=Math.min(RECONNECT_CAP_MS,RECONNECT_BASE_MS*2**Math.max(0,input.attempt));
 const delayMs=backoff+Math.floor(unit*RECONNECT_JITTER_MS);
 return {action:'retry',delayMs,nextAttempt,line:`whatsapp_reconnect attempt=${nextAttempt} delay_ms=${delayMs} code=${label}`};
}
