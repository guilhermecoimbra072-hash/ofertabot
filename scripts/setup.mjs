import {readFile,writeFile,chmod,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export async function createEnv(root=new URL('../',import.meta.url)){
 const target=new URL('.env',root);
 try{await access(target);return false;}catch{}
 let text=await readFile(new URL('.env.example',root),'utf8');
 const set=(key,value)=>{text=text.replace(new RegExp('^'+key+'=.*$','m'),key+'='+value);};
 set('ENGINE_SESSION_KEY',randomBytes(32).toString('base64'));
 try{const d=JSON.parse(await readFile(new URL('deployment.json',root),'utf8'));
  if(d.supabase_url){set('VITE_SUPABASE_URL',d.supabase_url);set('ENGINE_URL',d.supabase_url+'/functions/v1/engine-api');}
  if(d.publishable_key)set('VITE_SUPABASE_PUBLISHABLE_KEY',d.publishable_key);
  if(d.engine_url){set('ENGINE_URL',d.engine_url);set('VITE_ENGINE_URL',d.engine_url);}
  if(d.rewrite_url)set('VITE_REWRITE_URL',d.rewrite_url);
 }catch{}
 await writeFile(target,text,{mode:0o600,flag:'wx'});if(process.platform!=='win32')await chmod(target,0o600);return true;
}
if(resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)){
 console.log(await createEnv()?'Criado .env com chave local de criptografia. Preencha ENGINE_TOKEN e confira URLs no editor. Nenhum segredo foi exibido. Leia PRIMEIRO-TESTE.md.':'O arquivo .env já existe e foi preservado. Edite apenas os campos que faltam.');
}
