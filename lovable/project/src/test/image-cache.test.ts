// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';

const client=vi.hoisted(()=>({
 download:vi.fn(),
 upload:vi.fn().mockResolvedValue({error:null}),
 storage:{from:vi.fn()},
 auth:{getSession:vi.fn().mockResolvedValue({data:{session:{access_token:'token'}},error:null})},
}));
vi.mock('@/integrations/supabase/client',()=>({supabase:client}));
import {enhancedCachePath,enhancedImage} from '@/ofertabot/api';

const company='1c9b0e9e-0000-4000-8000-000000000001';
const offer='2c9b0e9e-0000-4000-8000-000000000002';

describe('Cache da imagem melhorada por IA',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  client.storage.from.mockReturnValue({download:client.download,upload:client.upload});
 });
 it('caminho do cache é determinístico por imagem original',()=>{
  expect(enhancedCachePath(company,`${company}/foto.jpg`)).toBe(`${company}/enhanced/foto.png`);
  expect(enhancedCachePath(company,`${company}/foto.jpg`)).toBe(enhancedCachePath(company,`${company}/foto.jpg`));
 });
 it('cache existente é reutilizado sem chamar a IA',async()=>{
  const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
  client.download.mockResolvedValue({data:new Blob(['cache'],{type:'image/png'}),error:null});
  const blob=await enhancedImage(company,offer,`${company}/foto.jpg`);
  expect(blob).toBeInstanceOf(Blob);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(client.upload).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
 });
 it('sem cache chama a IA uma vez, grava o cache e reabrir não chama de novo',async()=>{
  const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({image:Buffer.from('ia').toString('base64'),mimeType:'image/png'}),{status:200,headers:{'Content-Type':'application/json'}}));
  vi.stubGlobal('fetch',fetchMock);
  client.download.mockResolvedValueOnce({data:null,error:{message:'not found'}}).mockResolvedValue({data:new Blob(['ia'],{type:'image/png'}),error:null});
  const first=await enhancedImage(company,offer,`${company}/foto.jpg`);
  expect(first).toBeInstanceOf(Blob);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/public/image-enhance');
  expect(client.upload).toHaveBeenCalledWith(`${company}/enhanced/foto.png`,expect.any(Blob),expect.objectContaining({upsert:false}));
  const second=await enhancedImage(company,offer,`${company}/foto.jpg`);
  expect(second).toBeInstanceOf(Blob);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
 });
});
