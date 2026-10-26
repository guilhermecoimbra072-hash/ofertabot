import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,chmod,rm} from 'node:fs/promises';
import {join} from 'node:path';
export class Vault {
  constructor(private dir:string,private key:Buffer){if(key.length!==32)throw new Error('ENGINE_SESSION_KEY deve ter 32 bytes em base64');}
  async read<T>(name:string):Promise<T|null>{
    try {const b=await readFile(join(this.dir,name)); const d=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());}
    catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw new Error('Não foi possível abrir o cofre. Verifique a chave da sessão.');}
  }
  async write(name:string,value:unknown){
    await mkdir(this.dir,{recursive:true,mode:0o700});await chmod(this.dir,0o700);
    const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',this.key,iv);const data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);
    const dest=join(this.dir,name),tmp=dest+'.'+randomBytes(6).toString('hex')+'.tmp';
    await writeFile(tmp,Buffer.concat([iv,c.getAuthTag(),data]),{mode:0o600});await rename(tmp,dest);
  }
  async remove(name:string){await rm(join(this.dir,name),{force:true});}
}
