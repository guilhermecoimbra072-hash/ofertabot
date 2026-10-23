import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {OfferEditor} from '@/ofertabot/OfferEditor';
import type {Company,Offer,Snapshot} from '@/ofertabot/model';

const apiMock=vi.hoisted(()=>({
 rewrite:vi.fn(),
 revisions:vi.fn().mockResolvedValue([]),
 upload:vi.fn().mockResolvedValue('company/final.png'),
 signed:vi.fn().mockResolvedValue('https://example.invalid/img.png'),
 enhancedImage:vi.fn().mockResolvedValue(new Blob(['ia'],{type:'image/png'})),
 errorMessage:(e:unknown)=>e instanceof Error?e.message:String(e),
}));
vi.mock('@/ofertabot/api',()=>apiMock);
vi.mock('@/ofertabot/ocr',()=>({recognizePrices:vi.fn().mockResolvedValue([])}));

const company:Company={id:'1c9b0e9e-0000-4000-8000-000000000001',name:'Loja',role:'owner',plan:'basic',access_status:'active',paused_reason:null,group_limit:3,timezone:'America/Sao_Paulo',brand:{phone:'44999990000'},settings:{send_enabled:false,min_interval_seconds:60,late_after_seconds:600,max_attempts:3,ai_prompt:''}};
const baseOffer:Offer={id:'2c9b0e9e-0000-4000-8000-000000000002',group_id:'g',connection_id:'c',message_id:'m1',received_at:'2026-10-22T00:00:00Z',original_text:'Promoção sandália',original_images:['company/original.png'],edited_text:'Texto já editado pelo operador',edited_image:null,price_minor:'7790',currency:'BRL',status:'pending',version:1,media_kind:'image',media_status:'ready'};
const data:Snapshot={platform_admin:false,access_paused:false,companies:[company],company,connections:[],groups:[],offers:[baseOffer],publications:[],audit:[],templates:[],members:[]};

describe('Salvar com a arte melhorada pela IA',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  apiMock.enhancedImage.mockResolvedValue(new Blob(['ia'],{type:'image/png'}));
  class FakeImage{width=800;height=600;crossOrigin='';onload:null|(()=>void)=null;onerror:null|(()=>void)=null;private _src='';set src(v:string){this._src=v;setTimeout(()=>this.onload?.(),0);}get src(){return this._src;}}
  vi.stubGlobal('Image',FakeImage);
  HTMLCanvasElement.prototype.getContext=vi.fn().mockReturnValue(new Proxy(drawing,{get:(target,key)=>key==='drawImage'?target.drawImage:key==='fillText'?target.fillText:()=>undefined})) as never;
  HTMLCanvasElement.prototype.toBlob=vi.fn(cb=>cb(new Blob(['png'],{type:'image/png'}))) as never;
 });
 afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});

 it('chegada da imagem melhorada habilita Salvar alterações sem mudar preço nem enviar foto',async()=>{
  const mutate=vi.fn().mockResolvedValue({});
  render(<OfferEditor offer={baseOffer} company={company} data={data} mutate={mutate} busy={false} onClose={()=>{}}/>);
  const save=screen.getByRole('button',{name:'Salvar alterações'});
  expect(save).toBeDisabled();
  await waitFor(()=>expect(apiMock.enhancedImage).toHaveBeenCalledWith(company.id,baseOffer.id,'company/original.png'));
  await waitFor(()=>expect(save).toBeEnabled(),{timeout:3000});
 });

 it('salvar após a chegada da melhorada regera e grava edited_image (melhorada + overlay)',async()=>{
  const mutate=vi.fn().mockResolvedValue({});
  render(<OfferEditor offer={baseOffer} company={company} data={data} mutate={mutate} busy={false} onClose={()=>{}}/>);
  const save=screen.getByRole('button',{name:'Salvar alterações'});
  await waitFor(()=>expect(save).toBeEnabled(),{timeout:3000});
  save.click();
  await waitFor(()=>expect(mutate).toHaveBeenCalledTimes(1));
  expect(apiMock.upload).toHaveBeenCalledTimes(1);
  expect(mutate).toHaveBeenCalledWith('save_offer',expect.objectContaining({id:baseOffer.id,version:1,edited_image:'company/final.png',uploaded_original:null}));
 });

 it('sem imagem melhorada (falha silenciosa da IA) e sem mudanças, Salvar permanece desabilitado',async()=>{
  apiMock.enhancedImage.mockRejectedValue(new Error('Limite de 30 imagens com IA por hora atingido'));
  const mutate=vi.fn().mockResolvedValue({});
  render(<OfferEditor offer={baseOffer} company={company} data={data} mutate={mutate} busy={false} onClose={()=>{}}/>);
  await waitFor(()=>expect(apiMock.enhancedImage).toHaveBeenCalled());
  await new Promise(r=>setTimeout(r,100));
  expect(screen.getByRole('button',{name:'Salvar alterações'})).toBeDisabled();
  expect(mutate).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
 });
});

const drawing={drawImage:vi.fn(),fillText:vi.fn()};
const deferred = () => {let resolve:(value:Blob|null)=>void=()=>{};let reject:(reason:Error)=>void=()=>{};const promise=new Promise<Blob|null>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
describe('Um clique aguarda a imagem atual',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  class FakeImage{width=800;height=600;crossOrigin='';onload:null|(()=>void)=null;onerror:null|(()=>void)=null;src='';constructor(){Object.defineProperty(this,'src',{set:(v:string)=>{this.source=v;queueMicrotask(()=>this.onload?.());},get:()=>this.source});}source='';}
  vi.stubGlobal('Image',FakeImage);
  drawing.drawImage.mockClear();drawing.fillText.mockClear();
  vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:enhanced');
  vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  HTMLCanvasElement.prototype.getContext=vi.fn().mockReturnValue(new Proxy(drawing,{get:(target,key)=>key==='drawImage'?target.drawImage:key==='fillText'?target.fillText:()=>undefined})) as never;
  HTMLCanvasElement.prototype.toBlob=vi.fn(cb=>cb(new Blob(['png'],{type:'image/png'}))) as never;
 });
 afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
 const setup=()=>{const job=deferred();apiMock.enhancedImage.mockReturnValue(job.promise);const mutate=vi.fn().mockResolvedValue({});render(<OfferEditor offer={baseOffer} company={company} data={data} mutate={mutate} busy={false} onClose={()=>{}}/>);fireEvent.change(screen.getByLabelText('Preço'),{target:{value:'55,00'}});return {job,mutate};};
 it('não salva antes e salva sozinho com a foto melhorada mais overlay',async()=>{
  const {job,mutate}=setup();await waitFor(()=>expect(apiMock.enhancedImage).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button',{name:'Salvar alterações'}));
  expect(screen.getByRole('button',{name:'Gerando imagem…'})).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Gerando imagem…');
  expect(mutate).not.toHaveBeenCalled();expect(apiMock.upload).not.toHaveBeenCalled();
  await act(async()=>job.resolve(new Blob(['ia'],{type:'image/png'})));
  await waitFor(()=>expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate).toHaveBeenCalledWith('save_offer',expect.objectContaining({price_minor:'5500',currency:'BRL',edited_image:'company/final.png'}));
  expect(drawing.drawImage.mock.calls.at(-1)?.[0].src).toBe('blob:enhanced');
  expect(drawing.fillText).toHaveBeenCalledWith('R$ 55,00',expect.any(Number),expect.any(Number),expect.any(Number));
  expect(apiMock.upload).toHaveBeenCalledTimes(1);expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
 });
 it.each(['Falha da IA','Limite de 30 imagens com IA por hora atingido'])('salva a arte por código após %s',async message=>{
  const {job,mutate}=setup();await waitFor(()=>expect(apiMock.enhancedImage).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button',{name:'Salvar alterações'}));expect(mutate).not.toHaveBeenCalled();
  await act(async()=>job.reject(new Error(message)));
  await waitFor(()=>expect(mutate).toHaveBeenCalledTimes(1));expect(apiMock.upload).toHaveBeenCalledTimes(1);expect(URL.createObjectURL).not.toHaveBeenCalled();expect(drawing.drawImage.mock.calls.at(-1)?.[0].src).toBe('https://example.invalid/img.png');
 });
 it('após 45 segundos salva fallback sem abortar a IA nem aplicar chegada tardia',async()=>{
  const {job,mutate}=setup();await waitFor(()=>expect(apiMock.enhancedImage).toHaveBeenCalled());
  vi.useFakeTimers();fireEvent.click(screen.getByRole('button',{name:'Salvar alterações'}));
  await act(async()=>vi.advanceTimersByTimeAsync(44999));expect(mutate).not.toHaveBeenCalled();
  await act(async()=>vi.advanceTimersByTimeAsync(1));expect(mutate).toHaveBeenCalledTimes(1);expect(apiMock.upload).toHaveBeenCalledTimes(1);
  await act(async()=>job.resolve(new Blob(['ia'],{type:'image/png'})));
  expect(mutate).toHaveBeenCalledTimes(1);expect(apiMock.upload).toHaveBeenCalledTimes(1);
 });
 it('cabeçalho usa R$ e os controles removidos não aparecem',()=>{
  apiMock.enhancedImage.mockResolvedValue(null);
  render(<OfferEditor offer={{...baseOffer,price_minor:'5500'}} company={company} data={data} mutate={vi.fn()} busy={false} onClose={()=>{}}/>);
  expect(screen.getByText(/Versão 1/)).toHaveTextContent('R$ 55,00');
  expect(screen.queryByLabelText('Inserir modelo')).toBeNull();expect(screen.queryByRole('button',{name:'Inserir contatos e CTA'})).toBeNull();
  expect(screen.getByRole('option',{name:'R$ (Real)'})).toHaveValue('BRL');
  expect(screen.getByRole('option',{name:'US$ (Dólar)'})).toHaveValue('USD');
  expect(screen.getByRole('option',{name:'₲ (Guarani)'})).toHaveValue('PYG');
  expect(screen.getByRole('option',{name:'€ (Euro)'})).toHaveValue('EUR');
 });
});
