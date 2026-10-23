import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {createRef} from 'react';
import {applyPriceToText,pickOcrRegion,priceLabelRegion} from '@/ofertabot/imagegen';
import {displayMoney} from '@/ofertabot/money';
import {ImageEditor,type ImageGenerator} from '@/ofertabot/ImageEditor';
import type {Company} from '@/ofertabot/model';

const ocrMock=vi.hoisted(()=>({recognizePrices:vi.fn().mockResolvedValue([{text:'R$ 129,90',confidence:94,box:{x0:100,y0:200,x1:300,y1:260}}])}));
vi.mock('@/ofertabot/ocr',()=>ocrMock);
const apiMock=vi.hoisted(()=>({signed:vi.fn().mockResolvedValue('https://example.invalid/img.png'),upload:vi.fn().mockResolvedValue('company/nova.png'),enhancedImage:vi.fn().mockRejectedValue(new Error('IA de imagem indisponível.')),errorMessage:(e:unknown)=>String(e)}));
vi.mock('@/ofertabot/api',()=>apiMock);

const company:Company={id:'1c9b0e9e-0000-4000-8000-000000000001',name:'Loja',role:'owner',plan:'basic',access_status:'active',paused_reason:null,group_limit:3,timezone:'America/Sao_Paulo',brand:{phone:'44999990000',instagram:'@loja',watermark:'Loja'},settings:{send_enabled:false,min_interval_seconds:60,late_after_seconds:600,max_attempts:3,ai_prompt:''}};

describe('Símbolo da moeda na exibição',()=>{
 it('BRL usa R$ com vírgula decimal e ponto de milhar',()=>{expect(displayMoney('7790','BRL')).toBe('R$ 77,90');expect(displayMoney('249900','BRL')).toBe('R$ 2.499,00');});
 it('USD usa US$ com ponto decimal e vírgula de milhar',()=>{expect(displayMoney('7790','USD')).toBe('US$ 77.90');expect(displayMoney('99990','USD')).toBe('US$ 999.90');});
 it('PYG usa ₲ sem casas decimais e ponto de milhar',()=>expect(displayMoney('150000','PYG')).toBe('₲ 150.000'));
 it('EUR usa € com vírgula decimal',()=>expect(displayMoney('7790','EUR')).toBe('€ 77,90'));
 it('sem preço retorna vazio',()=>expect(displayMoney(null,'BRL')).toBe(''));
});

describe('Preço automático no texto da publicação',()=>{
 it('substitui o valor antigo detectado no texto',()=>expect(applyPriceToText('Oferta por R$ 99,90 aproveite','R$ 99,90','R$ 129,90')).toBe('Oferta por R$ 129,90 aproveite'));
 it('substitui o preço do fornecedor "R$ 2.499"',()=>expect(applyPriceToText('Notebook por R$ 2.499 no atacado','','R$ 1.999,00')).toBe('Notebook por R$ 1.999,00 no atacado'));
 it('substitui "R$2.499,00" sem espaço',()=>expect(applyPriceToText('Smart TV R$2.499,00 à vista','','R$ 2.099,90')).toBe('Smart TV R$ 2.099,90 à vista'));
 it('substitui "R$ 2499,90" sem milhar',()=>expect(applyPriceToText('Geladeira R$ 2499,90 hoje','','R$ 2.199,00')).toBe('Geladeira R$ 2.199,00 hoje'));
 it('substitui preço sem símbolo perto de "por"',()=>expect(applyPriceToText('Fone bluetooth por 2.499,90 no atacado','','R$ 1.899,90')).toBe('Fone bluetooth por R$ 1.899,90 no atacado'));
 it('substitui "US$ 99.90"',()=>expect(applyPriceToText('Importado por US$ 99.90','','US$ 79.90')).toBe('Importado por US$ 79.90'));
 it('substitui "₲ 150.000"',()=>expect(applyPriceToText('Perfume por ₲ 150.000','','₲ 120.000')).toBe('Perfume por ₲ 120.000'));
 it('substitui "Gs. 150.000"',()=>expect(applyPriceToText('Perfume por Gs. 150.000','','₲ 120.000')).toBe('Perfume por ₲ 120.000'));
 it('substitui o formato legado com código da moeda',()=>expect(applyPriceToText('💰 Por apenas BRL 77,90','R$ 77,90','R$ 89,90')).toBe('💰 Por apenas R$ 89,90'));
 it('prefere o preço perto de "por apenas" quando há mais de um',()=>expect(applyPriceToText('Sandália de 80,00 por apenas 69,90','','R$ 77,90')).toBe('Sandália de 80,00 por apenas R$ 77,90'));
 it('sem palavra de preço, substitui o maior valor',()=>expect(applyPriceToText('Kit 129,90 e 249,90 no atacado','','R$ 199,90')).toBe('Kit 129,90 e R$ 199,90 no atacado'));
 it('não toca em 50", 128GB ou 12x',()=>{const t='TV 50" 128GB em 12x sem juros';expect(applyPriceToText(t,'','R$ 1.999,00')).toBe('TV 50" 128GB em 12x sem juros\n💰 Por apenas R$ 1.999,00');});
 it('acrescenta a linha de preço quando o texto não tem valor',()=>expect(applyPriceToText('Oferta imperdível','','R$ 129,90')).toBe('Oferta imperdível\n💰 Por apenas R$ 129,90'));
 it('texto vazio recebe apenas a linha de preço',()=>expect(applyPriceToText('','','R$ 10,00')).toBe('💰 Por apenas R$ 10,00'));
 it('não duplica quando o novo preço já está no texto',()=>{const t='💰 Por apenas R$ 129,90';expect(applyPriceToText(t,'R$ 99,90','R$ 129,90')).toBe(t);});
 it('preço vazio não altera o texto',()=>expect(applyPriceToText('Oferta','R$ 1,00','')).toBe('Oferta'));
});

describe('Região automática da etiqueta',()=>{
 it('OCR com confiança alta define a região escalada',()=>expect(pickOcrRegion([{text:'R$ 129,90',confidence:94,box:{x0:100,y0:200,x1:300,y1:260}}],0.5)).toEqual({x:50,y:100,w:100,h:30}));
 it('confiança baixa é ignorada',()=>expect(pickOcrRegion([{text:'x',confidence:40,box:{x0:0,y0:0,x1:10,y1:10}}],1)).toBeNull());
 it('sem OCR usa o canto inferior esquerdo acima da faixa de contatos',()=>{const r=priceLabelRegion(null,1000,800,60);expect(r.x).toBe(40);expect(r.y).toBeGreaterThan(0);expect(r.y+r.h).toBeLessThanOrEqual(800-60);});
 it('região do OCR é ampliada e limitada ao canvas',()=>{const r=priceLabelRegion({x:0,y:0,w:100,h:40},500,500,60);expect(r.x).toBe(0);expect(r.y).toBe(0);expect(r.w).toBeLessThanOrEqual(500);expect(r.h).toBeLessThanOrEqual(500);});
});

describe('Prévia automática da imagem',()=>{
 beforeEach(()=>{
  class FakeImage{width=800;height=600;crossOrigin='';onload:null|(()=>void)=null;onerror:null|(()=>void)=null;private _src='';set src(v:string){this._src=v;setTimeout(()=>this.onload?.(),0);}get src(){return this._src;}}
  vi.stubGlobal('Image',FakeImage);
  HTMLCanvasElement.prototype.getContext=vi.fn().mockReturnValue(new Proxy({},{get:()=>()=>undefined})) as never;
  HTMLCanvasElement.prototype.toBlob=vi.fn(cb=>cb(new Blob(['png'],{type:'image/png'}))) as never;
 });
 afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
 it('não exibe nenhum controle manual de edição',async()=>{
  render(<ImageEditor company={company} offerId="4b96184d-8792-452f-8c05-ee28cfe08750" path="company/original.png" priceText="R$ 129,90" onOriginal={()=>{}}/>);
  expect(screen.getByLabelText('Prévia da imagem final')).toBeInTheDocument();
  expect(screen.getByLabelText('Enviar imagem original')).toBeInTheDocument();
  for(const gone of['Texto da etiqueta','Cor da etiqueta','Marca d’água','Limpar seleção','Sugerir regiões com OCR','Salvar imagem final'])expect(screen.queryByText(gone)).toBeNull();
 });
 it('roda o OCR automaticamente em segundo plano e gera a imagem final',async()=>{
  const ref=createRef<ImageGenerator>();
  render(<ImageEditor ref={ref} company={company} offerId="4b96184d-8792-452f-8c05-ee28cfe08750" path="company/original.png" priceText="R$ 129,90" onOriginal={()=>{}}/>);
  await waitFor(()=>expect(ocrMock.recognizePrices).toHaveBeenCalledWith('https://example.invalid/img.png'));
  await waitFor(()=>expect(screen.queryByText(/Procurando o preço/)).toBeNull());
  const blob=await ref.current!.generate();
  expect(blob).toBeInstanceOf(Blob);
  expect(blob!.type).toBe('image/png');
 });
 it('funciona sem OCR: região padrão e geração mesmo assim',async()=>{
  ocrMock.recognizePrices.mockResolvedValueOnce([]);
  const ref=createRef<ImageGenerator>();
  render(<ImageEditor ref={ref} company={company} offerId="4b96184d-8792-452f-8c05-ee28cfe08750" path="company/original.png" priceText="R$ 129,90" onOriginal={()=>{}}/>);
  await waitFor(()=>expect(screen.queryByText(/Procurando o preço/)).toBeNull());
  expect(await ref.current!.generate()).toBeInstanceOf(Blob);
 });
});

describe('Melhoria da foto por IA',()=>{
 beforeEach(()=>{
  class FakeImage{width=800;height=600;crossOrigin='';onload:null|(()=>void)=null;onerror:null|(()=>void)=null;private _src='';set src(v:string){this._src=v;setTimeout(()=>this.onload?.(),0);}get src(){return this._src;}}
  vi.stubGlobal('Image',FakeImage);
  HTMLCanvasElement.prototype.getContext=vi.fn().mockReturnValue(new Proxy({},{get:()=>()=>undefined})) as never;
  HTMLCanvasElement.prototype.toBlob=vi.fn(cb=>cb(new Blob(['png'],{type:'image/png'}))) as never;
 });
 afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
 it('falha da IA cai silenciosamente na arte apenas com código',async()=>{
  apiMock.enhancedImage.mockRejectedValueOnce(new Error('Créditos de IA esgotados no workspace.'));
  const ref=createRef<ImageGenerator>();
  render(<ImageEditor ref={ref} company={company} offerId="4b96184d-8792-452f-8c05-ee28cfe08750" path="company/original.png" priceText="R$ 129,90" onOriginal={()=>{}}/>);
  await waitFor(()=>expect(apiMock.enhancedImage).toHaveBeenCalledWith(company.id,'4b96184d-8792-452f-8c05-ee28cfe08750','company/original.png'));
  await waitFor(()=>expect(screen.queryByText(/Procurando o preço/)).toBeNull());
  expect(screen.queryByRole('alert')).toBeNull();
  expect(await ref.current!.generate()).toBeInstanceOf(Blob);
 });
 it('sucesso da IA mantém a geração da arte com overlay',async()=>{
  apiMock.enhancedImage.mockResolvedValueOnce(new Blob(['ia'],{type:'image/png'}));
  const ref=createRef<ImageGenerator>();
  render(<ImageEditor ref={ref} company={company} offerId="4b96184d-8792-452f-8c05-ee28cfe08750" path="company/original.png" priceText="R$ 129,90" onOriginal={()=>{}}/>);
  await waitFor(()=>expect(apiMock.enhancedImage).toHaveBeenCalled());
  const blob=await ref.current!.generate();
  expect(blob).toBeInstanceOf(Blob);
  expect(blob!.type).toBe('image/png');
 });
 it('chegada da imagem melhorada avisa o editor (onEnhanced)',async()=>{
  apiMock.enhancedImage.mockResolvedValueOnce(new Blob(['ia'],{type:'image/png'}));
  const onEnhanced=vi.fn();
  render(<ImageEditor company={company} offerId="4b96184d-8792-452f-8c05-ee28cfe08750" path="company/original.png" priceText="R$ 129,90" onOriginal={()=>{}} onEnhanced={onEnhanced}/>);
  await waitFor(()=>expect(onEnhanced).toHaveBeenCalledTimes(1));
 });
 it('falha da IA não avisa o editor e não mostra erro',async()=>{
  apiMock.enhancedImage.mockRejectedValueOnce(new Error('Limite de 30 imagens com IA por hora atingido'));
  const onEnhanced=vi.fn();
  render(<ImageEditor company={company} offerId="4b96184d-8792-452f-8c05-ee28cfe08750" path="company/original.png" priceText="R$ 129,90" onOriginal={()=>{}} onEnhanced={onEnhanced}/>);
  await waitFor(()=>expect(apiMock.enhancedImage).toHaveBeenCalled());
  await new Promise(r=>setTimeout(r,50));
  expect(onEnhanced).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
 });
 it('mudança de preço não chama a IA de novo',async()=>{
  apiMock.enhancedImage.mockResolvedValue(new Blob(['ia'],{type:'image/png'}));
  const {rerender}=render(<ImageEditor company={company} offerId="4b96184d-8792-452f-8c05-ee28cfe08750" path="company/original.png" priceText="R$ 129,90" onOriginal={()=>{}}/>);
  await waitFor(()=>expect(apiMock.enhancedImage).toHaveBeenCalledTimes(1));
  rerender(<ImageEditor company={company} offerId="4b96184d-8792-452f-8c05-ee28cfe08750" path="company/original.png" priceText="R$ 99,90" onOriginal={()=>{}}/>);
  rerender(<ImageEditor company={company} offerId="4b96184d-8792-452f-8c05-ee28cfe08750" path="company/original.png" priceText="R$ 89,90" onOriginal={()=>{}}/>);
  await new Promise(r=>setTimeout(r,50));
  expect(apiMock.enhancedImage).toHaveBeenCalledTimes(1);
 });
});
