import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,readFile,rm} from 'node:fs/promises';
import {createEnv} from '../scripts/setup.mjs';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
test('instalação gera chave válida, preenche URLs corretas e preserva .env existente',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ob-setup-'));try{await mkdir(join(dir,'scripts'));await copyFile(new URL('../scripts/setup.mjs',import.meta.url),join(dir,'scripts/setup.mjs'));await copyFile(new URL('../.env.example',import.meta.url),join(dir,'.env.example'));await writeFile(join(dir,'deployment.json'),JSON.stringify({supabase_url:'https://db.example.invalid',engine_url:'https://app.example.invalid/api/public/engine-api',rewrite_url:'https://app.example.invalid/api/public/rewrite',publishable_key:'public-test'}));await createEnv(pathToFileURL(dir+'/')); const env=await readFile(join(dir,'.env'),'utf8');const vars=Object.fromEntries(env.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));assert.equal(Buffer.from(vars.ENGINE_SESSION_KEY,'base64').length,32);assert.equal(vars.ENGINE_URL,'https://app.example.invalid/api/public/engine-api');assert.equal(vars.VITE_ENGINE_URL,vars.ENGINE_URL);assert.equal(vars.ENGINE_TOKEN,'');await createEnv(pathToFileURL(dir+'/')); assert.equal(await readFile(join(dir,'.env'),'utf8'),env);}finally{await rm(dir,{recursive:true,force:true});}
});
