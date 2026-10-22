import {test,expect} from '@playwright/test';
import {empty} from '../../src/model';
const company={id:'11111111-1111-4111-8111-111111111111',name:'Empresa de teste automatizado',role:'owner',plan:'basic',group_limit:10,timezone:'America/Sao_Paulo',brand:{},settings:{send_enabled:false,min_interval_seconds:30,late_after_seconds:300,max_attempts:3,ai_prompt:'Preserve fatos'}};
// Fixture exclusivamente de teste. Nenhum dado simulado é incluído na aplicação.
const data={...empty,companies:[company],company,stats:{received:0,pending:0,sent:0,failed:0}};
async function authenticate(page:any){
 await page.addInitScript(()=>{localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'test.jwt.token',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:'22222222-2222-4222-8222-222222222222',email:'ui@example.invalid',aud:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}}));});
 await page.route('**/rest/v1/rpc/app_snapshot',async(route:any)=>route.fulfill({json:data}));
 await page.route('**/auth/v1/user',async(route:any)=>route.fulfill({json:{id:'22222222-2222-4222-8222-222222222222',email:'ui@example.invalid'}}));
}
test('login tem cadastro, recuperação, validação e erro real da autenticação',async({page})=>{
 await page.route('**/auth/v1/token**',route=>route.fulfill({status:400,json:{error:'invalid_grant',error_description:'Credenciais inválidas'}}));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Bem-vindo ao OfertaBot'})).toBeVisible();
 await page.getByLabel('E-mail',{exact:true}).fill('teste@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('senha-invalida');await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Credenciais inválidas');
 await page.getByRole('button',{name:'Criar minha conta'}).click();await expect(page.getByRole('heading',{name:'Comece sua operação'})).toBeVisible();await page.getByRole('button',{name:'Esqueci a senha'}).click();await expect(page.getByRole('heading',{name:'Recupere seu acesso'})).toBeVisible();
 await page.screenshot({path:'test-results/login-desktop.png',fullPage:true});
});
for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]] as const){
 test(`painel vazio real e navegação ${name}`,async({page})=>{
  await page.setViewportSize({width,height});await authenticate(page);await page.goto('/');await expect(page.getByRole('heading',{name:'Tudo pronto para boas ofertas.'})).toBeVisible();
  await expect(page.getByText('Sua primeira oferta vem aí')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:`test-results/dashboard-${name}.png`,fullPage:true});
  for(const label of ['Grupos','Caixa de entrada','Aprovações','Agendamentos','Histórico','Minha marca','Motor e IA','Equipe','WhatsApp']){
   if(width<760)await page.getByRole('button',{name:'Abrir menu'}).click();
   await page.getByRole('navigation').getByRole('button',{name:label,exact:true}).click();
   await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  }
 });
}
test('editor permite texto, preço, aprovação e snapshot de publicação',async({page})=>{
 await authenticate(page);
 const offer={id:'offer-test',company_id:company.id,connection_id:'cn',group_id:'src',message_id:'msg',received_at:new Date().toISOString(),original_text:'Produto R$ 10,00',original_images:[],edited_text:'Produto R$ 10,00',edited_image:null,price_minor:'1000',currency:'BRL',status:'pending',version:1,media_kind:'text',media_status:'ready'};
 const fixture={...data,offers:[offer],groups:[{id:'src',name:'Fornecedor de teste',is_source:true,is_destination:false},{id:'dst',name:'Destino de teste',is_source:false,is_destination:true}]};const calls:any[]=[];
 await page.route('**/rest/v1/rpc/app_snapshot',route=>route.fulfill({json:fixture}));
 await page.route('**/rest/v1/rpc/app_action',route=>{const body=route.request().postDataJSON();calls.push(body);if(body.p_action==='save_offer'){Object.assign(offer,body.p_payload,{version:offer.version+1,status:'pending'});}if(body.p_action==='approve_offer')offer.status='approved';return route.fulfill({json:{}});});
 await page.goto('/');await page.getByRole('navigation').getByRole('button',{name:'Caixa de entrada'}).click();await page.getByRole('button',{name:'Abrir oferta'}).click();
 await page.getByRole('textbox',{name:'Mensagem',exact:true}).fill('Produto revisado');await page.getByLabel('Preço',{exact:true}).fill('12,90');await page.getByRole('button',{name:'Salvar alterações'}).click();await expect(page.getByRole('button',{name:'Aprovar versão 2'})).toBeEnabled();await page.getByRole('button',{name:'Aprovar versão 2'}).click();await page.getByLabel('Destino de teste').check();await page.getByRole('button',{name:'Publicar agora'}).click();
 expect(calls.find(c=>c.p_action==='save_offer').p_payload.price_minor).toBe('1290');expect(calls.find(c=>c.p_action==='enqueue').p_payload.version).toBe(2);
});
test('editor preserva upload original e salva nova imagem com preço selecionado',async({page})=>{
 await authenticate(page);
 const offer={id:'image-test',company_id:company.id,connection_id:'cn',group_id:'src',message_id:'msg-image',received_at:new Date().toISOString(),original_text:'Produto',original_images:[],edited_text:'Produto',edited_image:null,price_minor:null,currency:'BRL',status:'pending',version:1,media_kind:'text',media_status:'ready'};
 await page.route('**/rest/v1/rpc/app_snapshot',route=>route.fulfill({json:{...data,offers:[offer]}}));let saved:any;const uploads:string[]=[];let png:Buffer;
 await page.route('**/rest/v1/rpc/app_action',route=>{saved=route.request().postDataJSON();return route.fulfill({json:{}});});
 await page.route('**/storage/v1/**',route=>{const req=route.request(),url=new URL(req.url());if(url.pathname.includes('/object/sign/')&&req.method()==='POST')return route.fulfill({json:{signedURL:'/object/sign/test-image.png?token=test'}});if(req.method()==='GET')return route.fulfill({body:png,contentType:'image/png'});uploads.push(url.pathname.split('/offer-media/')[1]);return route.fulfill({json:{Key:uploads.at(-1),Id:'test'}});});
 await page.goto('/');png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d')!;x.fillStyle='#eeeeee';x.fillRect(0,0,600,400);x.fillStyle='#111';x.font='bold 50px sans-serif';x.fillText('R$ 10,00',100,150);return c.toDataURL('image/png').split(',')[1];}),'base64');
 await page.getByRole('navigation').getByRole('button',{name:'Caixa de entrada'}).click();await page.getByRole('button',{name:'Abrir oferta'}).click();await page.getByLabel('Enviar imagem original',{exact:true}).setInputFiles({name:'original.png',mimeType:'image/png',buffer:png});
 const canvas=page.locator('canvas');await expect(canvas).toBeVisible();await expect.poll(()=>canvas.evaluate(c=>(c as HTMLCanvasElement).width)).toBe(600);await canvas.scrollIntoViewIfNeeded();const box=(await canvas.boundingBox())!;await page.mouse.move(box.x+box.width*.12,box.y+box.height*.2);await page.mouse.down();await page.mouse.move(box.x+box.width*.75,box.y+box.height*.48);await page.mouse.up();await page.getByLabel('Texto da etiqueta').fill('R$ 19,90');await page.getByRole('button',{name:'Salvar imagem final',exact:true}).click();await expect.poll(()=>uploads.length).toBe(2);await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();expect(saved.p_payload.uploaded_original).toBe(uploads[0]);expect(saved.p_payload.edited_image).toBe(uploads[1]);expect(uploads[0]).not.toBe(uploads[1]);await page.screenshot({path:'test-results/editor-image-desktop.png',fullPage:true});
});

test('OCR real sugere preço de imagem sintética',async({page})=>{
 test.skip(process.env.OFERTABOT_TEST_OCR!=='1','Download externo dos modelos: teste opcional explícito');test.setTimeout(120000);
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {recognizePrices}=await import('/src/ocr.ts');
  const cv=document.createElement('canvas');cv.width=800;cv.height=300;const cx=cv.getContext('2d')!;cx.fillStyle='#fff';cx.fillRect(0,0,800,300);cx.fillStyle='#000';cx.font='bold 90px Arial';cx.fillText('R$ 129,90',50,180);
  return await recognizePrices(cv.toDataURL());
 });expect(result.some((r:{text:string})=>r.text.includes('129,90'))).toBeTruthy();expect(result[0].box.x1).toBeGreaterThan(result[0].box.x0);
});
