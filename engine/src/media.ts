/** Tipos aceitos pelo cofre e pelo armazenamento (até 10 MB). Sem rede. */
export const MEDIA_MIMES = [
 'image/jpeg','image/png','image/webp',
 'video/mp4',
 'audio/ogg','audio/mpeg','audio/mp4',
 'application/pdf',
 'application/msword',
 'application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

const EXTENSIONS: Record<string,string> = {
 'image/jpeg':'jpeg','image/png':'png','image/webp':'webp',
 'video/mp4':'mp4',
 'audio/ogg':'ogg','audio/mpeg':'mp3','audio/mp4':'m4a',
 'application/pdf':'pdf','application/msword':'doc','application/vnd.ms-excel':'xls',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
};

export function normalizeMime(mime:string){return mime.split(';')[0].trim().toLowerCase();}
export function extensionFor(mime:string){return EXTENSIONS[normalizeMime(mime)]??null;}
export function mimeForPath(path:string){
 const ext=path.split('.').pop()?.toLowerCase()??'';
 return Object.entries(EXTENSIONS).find(([,value])=>value===ext)?.[0];
}
function text(bytes:Uint8Array,start:number,end:number){return new TextDecoder().decode(bytes.slice(start,end));}
export function bytesMatch(mime:string,bytes:Uint8Array){
 const kind=normalizeMime(mime);
 if(bytes.length<12)return false;
 if(kind==='image/jpeg')return bytes[0]===255&&bytes[1]===216;
 if(kind==='image/png')return bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
 if(kind==='image/webp')return text(bytes,0,4)==='RIFF'&&text(bytes,8,12)==='WEBP';
 if(kind==='video/mp4'||kind==='audio/mp4')return text(bytes,4,8)==='ftyp';
 if(kind==='audio/ogg')return text(bytes,0,4)==='OggS';
 if(kind==='audio/mpeg')return text(bytes,0,3)==='ID3'||(bytes[0]===255&&(bytes[1]&0xe0)===224);
 if(kind==='application/pdf')return text(bytes,0,4)==='%PDF';
 if(kind==='application/msword'||kind==='application/vnd.ms-excel')return bytes[0]===0xd0&&bytes[1]===0xcf&&bytes[2]===0x11&&bytes[3]===0xe0;
 if(kind.endsWith('wordprocessingml.document')||kind.endsWith('spreadsheetml.sheet'))return bytes[0]===0x50&&bytes[1]===0x4b;
 return false;
}
