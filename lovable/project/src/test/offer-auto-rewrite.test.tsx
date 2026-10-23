import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor,fireEvent} from '@testing-library/react';
import {OfferEditor} from '@/ofertabot/OfferEditor';
import type {Company,Offer,Snapshot} from '@/ofertabot/model';

const apiMock=vi.hoisted(()=>({
 rewrite:vi.fn().mockResolvedValue({text:'Sandália Comfort\nConfortável e leve\nR$ 77,90',requires_review:true}),
 revisions:vi.fn().mockResolvedValue([]),
 upload:vi.fn(),
 signed:vi.fn().mockResolvedValue('https://example.invalid/img.png'),
 errorMessage:(e:unknown)=>e instanceof Error?e.message:String(e),
}));
vi.mock('@/ofertabot/api',()=>apiMock);

const company:Company={id:'1c9b0e9e-0000-4000-8000-000000000001',name:'Loja',role:'owner',plan:'basic',access_status:'active',paused_reason:null,group_limit:3,timezone:'America/Sao_Paulo',brand:{},settings:{send_enabled:false,min_interval_seconds:60,late_after_seconds:600,max_attempts:3,ai_prompt:''}};
const baseOffer:Offer={id:'2c9b0e9e-0000-4000-8000-000000000002',group_id:'g',connection_id:'c',message_id:'m1',received_at:'2026-10-22T00:00:00Z',original_text:'Promoção sandália 80 reais por apenas 69,90 chama no pv',original_images:[],edited_text:'Promoção sandália 80 reais por apenas 69,90 chama no pv',edited_image:null,price_minor:'7790',currency:'BRL',status:'pending',version:1,media_kind:'text',media_status:'ready'};
const data:Snapshot={platform_admin:false,access_paused:false,companies:[company],company,connections:[],groups:[],offers:[baseOffer],publications:[],audit:[],templates:[],members:[]};
const renderEditor=(offer:Offer)=>({...render(<OfferEditor offer={offer} company={company} data={data} mutate={vi.fn().mockResolvedValue({})} busy={false} onClose={()=>{}}/>)});

describe('Reescrita automática na revisão da oferta',()=>{
 beforeEach(()=>{vi.clearAllMocks();});
 afterEach(()=>cleanup());

 it('não exibe botão de IA nem quadro de sugestão',()=>{
  renderEditor({...baseOffer,edited_text:'Texto já editado pelo operador'});
  expect(screen.queryByText('Sugerir com IA')).toBeNull();
  expect(screen.queryByText('Usar sugestão no rascunho')).toBeNull();
 });

 it('ao abrir oferta com preço e texto não editado, chama a IA uma vez com o preço e preenche o texto',async()=>{
  renderEditor(baseOffer);
  await waitFor(()=>expect(apiMock.rewrite).toHaveBeenCalledTimes(1),{timeout:3000});
  expect(apiMock.rewrite).toHaveBeenCalledWith(company.id,baseOffer.id,'R$ 77,90');
  await waitFor(()=>expect(screen.getByLabelText(/Mensagem/i)).toHaveValue('Sandália Comfort\nConfortável e leve\nR$ 77,90'));
  expect(screen.getByText(/Texto gerado automaticamente/)).toBeInTheDocument();
 });

 it('mudança de preço depois da reescrita não chama a IA de novo e atualiza o preço no texto',async()=>{
  renderEditor(baseOffer);
  await waitFor(()=>expect(screen.getByLabelText(/Mensagem/i)).toHaveValue('Sandália Comfort\nConfortável e leve\nR$ 77,90'),{timeout:3000});
  fireEvent.change(screen.getByPlaceholderText('129,90'),{target:{value:'89,90'}});
  await waitFor(()=>expect(screen.getByLabelText(/Mensagem/i)).toHaveValue('Sandália Comfort\nConfortável e leve\nR$ 89,90'),{timeout:3000});
  expect(apiMock.rewrite).toHaveBeenCalledTimes(1);
 });

 it('oferta sem preço não chama a IA ao abrir; chama uma vez ao digitar o primeiro preço',async()=>{
  renderEditor({...baseOffer,price_minor:null});
  await new Promise(r=>setTimeout(r,1200));
  expect(apiMock.rewrite).not.toHaveBeenCalled();
  fireEvent.change(screen.getByPlaceholderText('129,90'),{target:{value:'77,90'}});
  await waitFor(()=>expect(apiMock.rewrite).toHaveBeenCalledTimes(1),{timeout:3000});
  expect(apiMock.rewrite).toHaveBeenCalledWith(company.id,baseOffer.id,'R$ 77,90');
 });

 it('texto já editado pelo operador nunca é reescrito',async()=>{
  renderEditor({...baseOffer,edited_text:'Texto já editado pelo operador'});
  await new Promise(r=>setTimeout(r,1200));
  expect(apiMock.rewrite).not.toHaveBeenCalled();
 });

 it('falha da IA mostra aviso discreto e mantém o texto atual sem bloquear',async()=>{
  apiMock.rewrite.mockRejectedValueOnce(new Error('Créditos de IA esgotados no workspace.'));
  renderEditor(baseOffer);
  await waitFor(()=>expect(screen.getByText(/Reescrita automática indisponível/)).toBeInTheDocument(),{timeout:3000});
  expect(screen.getByLabelText(/Mensagem/i)).toHaveValue(baseOffer.original_text);
  expect(screen.getByText(/Créditos de IA esgotados/)).toBeInTheDocument();
 });
});
