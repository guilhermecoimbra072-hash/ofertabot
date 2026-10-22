/** Smoke test da publicação: somente leitura e tentativa inválida de login; sem cadastro ou WhatsApp. */
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const config=JSON.parse(await readFile(new URL('../deployment.json',import.meta.url),'utf8'));
const base=new URL(config.panel_url);
if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw Error('Publicação deve usar HTTPS');
const results=[];
for(const [path,method,authorization,expected] of [
 ['/api/public/engine-api','GET','',405],
 ['/api/public/engine-api','POST','',401],
 ['/api/public/engine-api','POST','Bearer ob_'+ '0'.repeat(64),403],
 ['/api/public/rewrite','POST','',401],
]){
 const response=await fetch(new URL(path,base),{method,headers:{...(authorization?{Authorization:authorization}:{}),'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
 if(response.status!==expected)throw Error(`${method} ${path}: esperado ${expected}, recebido ${response.status}`);
 results.push({path,method,status:response.status});
}
await mkdir(new URL('../docs/evidence/',import.meta.url),{recursive:true});
const browser=await chromium.launch();
try{
 for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},locale:'pt-BR'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base.href,{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Bem-vindo ao OfertaBot'}).waitFor({timeout:30000});
  if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw Error('Overflow horizontal '+name);
  await page.screenshot({path:new URL(`../docs/evidence/publicado-${name}.png`,import.meta.url).pathname,fullPage:true});
  if(name==='desktop'){
   await page.getByLabel('E-mail',{exact:true}).fill('ofertabot-smoke-'+randomUUID()+'@example.invalid');
   await page.getByLabel('Senha',{exact:true}).fill(randomUUID());
   const response=page.waitForResponse(r=>r.url().includes('/auth/v1/token')&&r.request().method()==='POST',{timeout:30000});
   await page.getByRole('button',{name:'Entrar',exact:true}).click();
   const auth=await response;if(![400,401,422].includes(auth.status()))throw Error('Auth não rejeitou login inexistente: '+auth.status());
   await page.getByRole('alert').waitFor();results.push({check:'Auth publicado rejeita login inexistente',status:auth.status()});
  }
  if(errors.length)throw Error('Erro JavaScript em '+name+': '+errors.join('; '));
  results.push({check:name,width,height,overflow:false,javascriptErrors:errors.length});await context.close();
 }
}finally{await browser.close();}
await writeFile(new URL('../docs/evidence/publicacao-smoke.json',import.meta.url),JSON.stringify({url:base.href,checked_at:new Date().toISOString(),results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
