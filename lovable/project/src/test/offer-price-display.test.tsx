import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import App from '@/ofertabot/App';
import type {Company,Offer,Snapshot} from '@/ofertabot/model';
import {formatMoney} from '@/ofertabot/money';

const api=vi.hoisted(()=>({snapshot:vi.fn(),action:vi.fn(),getSession:vi.fn()}));
vi.mock('@/ofertabot/api',()=>({configured:true,snapshot:api.snapshot,action:api.action,engineUrl:'',errorMessage:String,db:{auth:{getSession:api.getSession,onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}})}}}));
vi.mock('@/ofertabot/ActivityChart',()=>({ActivityChart:()=>null,useDailyActivity:()=>({data:[]})}));
vi.mock('@/ofertabot/StatusDonut',()=>({StatusDonut:()=>null}));
vi.mock('@/ofertabot/PlatformPanel',()=>({PlatformPanel:()=>null}));

const company:Company={id:'company',name:'Loja de teste isolado',role:'owner',plan:'basic',access_status:'active',paused_reason:null,group_limit:10,timezone:'America/Sao_Paulo',brand:{},settings:{send_enabled:false,min_interval_seconds:60,late_after_seconds:600,max_attempts:3,ai_prompt:''}};
const offer:Offer={id:'offer',group_id:'group',connection_id:'connection',message_id:'message',received_at:'2026-10-23T12:00:00Z',original_text:'Produto',original_images:[],edited_text:'Produto',edited_image:null,price_minor:'5500',currency:'BRL',status:'pending',version:1,media_kind:'text',media_status:'ready'};
const data:Snapshot={platform_admin:false,access_paused:false,companies:[company],company,connections:[],groups:[],offers:[offer],publications:[],audit:[],templates:[],members:[]};

describe('Preços apresentados no painel',()=>{
 beforeEach(()=>{api.snapshot.mockResolvedValue(data);api.getSession.mockResolvedValue({data:{session:{user:{id:'user',email:'conta@example.invalid'}}},error:null});});
 afterEach(()=>{cleanup();window.history.replaceState({},'','/');});
 it.each(['dashboard','offers','approvals'])('%s apresenta R$ 55,00 na lista',async page=>{
  window.history.replaceState({},'',`/?page=${page}`);
  const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={queryClient}><App/></QueryClientProvider>);
  expect(await screen.findByText('R$ 55,00')).toBeInTheDocument();
  expect(screen.queryByText('BRL 55,00')).toBeNull();
  queryClient.clear();
 });
 it('preserva vazio e símbolos das outras moedas',()=>{
  expect(formatMoney(null,'BRL')).toBe('Sem preço definido');
  expect(formatMoney('5500','BRL')).toBe('R$ 55,00');
  expect(formatMoney('5500','USD')).toBe('US$ 55.00');
  expect(formatMoney('5500','PYG')).toBe('₲ 5.500');
  expect(formatMoney('5500','EUR')).toBe('€ 55,00');
 });
});
