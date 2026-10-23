// @vitest-environment node
import { describe, expect, it, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { createEngineHandler } from '@/server/engine-handler.server';
import { createRewriteHandler, cleanRewrite } from '@/server/rewrite-handler.server';
import { createImageEnhanceHandler, extractImage } from '@/server/image-enhance-handler.server';

const context = { company_id: '00000000-0000-4000-8000-000000000001', connection_id: '00000000-0000-4000-8000-000000000002' };
const fixtureToken = `ob_${'a'.repeat(64)}`;
const request = (body: unknown, authorization = `Bearer ${fixtureToken}`) => new Request('http://localhost/api/public/engine-api', { method: 'POST', headers: { authorization }, body: JSON.stringify(body) });
afterEach(() => vi.unstubAllGlobals());

describe('Handlers de servidor OfertaBot', () => {
  it('credencial inválida é rejeitada antes de qualquer acesso administrativo', async () => {
    const rpc = vi.fn();
    const handler = createEngineHandler({ rpc } as unknown as SupabaseClient<Database>);
    expect((await handler(request({}, 'Bearer inválido'))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('token revogado não permite acessar storage', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } });
    const storage = { from: vi.fn() };
    const handler = createEngineHandler({ rpc, storage } as unknown as SupabaseClient<Database>);
    expect((await handler(request({ action: 'upload' }))).status).toBe(403);
    expect(storage.from).not.toHaveBeenCalled();
  });
  it('capture_error é encaminhado à função autorizada', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: context, error: null }).mockResolvedValueOnce({ data: {}, error: null });
    const handler = createEngineHandler({ rpc } as unknown as SupabaseClient<Database>);
    expect((await handler(request({ action: 'capture_error', payload: { message_hash: 'b'.repeat(64) } }))).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith('engine_call', { p_token: fixtureToken, p_action: 'capture_error', p_payload: { message_hash: 'b'.repeat(64) } });
  });
  it('upload com lease inválida não grava arquivo', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: context, error: null }).mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    const storage = { from: vi.fn() };
    const handler = createEngineHandler({ rpc, storage } as unknown as SupabaseClient<Database>);
    const res = await handler(request({ action: 'upload', payload: { mime: 'image/png', key: 'b'.repeat(64), instance_id: context.company_id, data: 'iVBORw==' } }));
    expect(res.status).toBe(409);
    expect(storage.from).not.toHaveBeenCalled();
  });
  const b64 = (bytes: number[] | string) => btoa(typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes));
  const uploadWith = async (mime: string, data: string) => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: context, error: null }).mockResolvedValueOnce({ data: {}, error: null });
    const up = vi.fn().mockResolvedValue({ error: null });
    const handler = createEngineHandler({ rpc, storage: { from: () => ({ upload: up }) } } as unknown as SupabaseClient<Database>);
    const res = await handler(request({ action: 'upload', payload: { mime, key: 'c'.repeat(64), instance_id: context.company_id, data } }));
    return { res, up };
  };
  it.each([
    ['video/mp4', b64('\0\0\0\x18ftypisom'), 'mp4'], ['audio/mp4', b64('\0\0\0\x18ftypM4A '), 'm4a'], ['audio/ogg', b64('OggS\0\x02'), 'ogg'],
    ['audio/mpeg', b64('ID3\x04\0'), 'mp3'], ['audio/mpeg', b64([0xff, 0xfb, 0x90, 0x64]), 'mp3'], ['application/pdf', b64('%PDF-1.7'), 'pdf'],
    ['application/msword', b64([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'doc'], ['application/vnd.ms-excel', b64([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'xls'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', b64([0x50, 0x4b, 3, 4]), 'docx'], ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', b64([0x50, 0x4b, 3, 4]), 'xlsx'],
    ['image/jpeg', b64([0xff, 0xd8, 0xff, 0xe0]), 'jpg'],
  ])('upload aceita %s com extensão curta', async (mime, data, ext) => {
    const { res, up } = await uploadWith(mime, data);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: `${context.company_id}/${context.connection_id}/${'c'.repeat(64)}.${ext}` });
    expect(up).toHaveBeenCalledOnce();
  });
  it('upload recusa conteúdo trocado (PDF declarado como MP4) sem gravar', async () => {
    const { res, up } = await uploadWith('video/mp4', b64('%PDF-1.7'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Conteúdo de mídia inválido' });
    expect(up).not.toHaveBeenCalled();
  });
  it('upload recusa MIME fora da lista', async () => {
    const { res, up } = await uploadWith('application/zip', b64([0x50, 0x4b, 3, 4]));
    expect(res.status).toBe(400);
    expect(up).not.toHaveBeenCalled();
  });
  it('rewrite sem sessão não consulta autenticação ou IA', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const handler = createRewriteHandler({ url: 'https://example.invalid', publishableKey: 'public-test-key' });
    expect((await handler(new Request('http://localhost/api/public/rewrite', { method: 'POST' }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rewrite autenticado sem chave de IA retorna 503 sem chamar provedor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: context.company_id, aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-22T00:00:00Z' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const handler = createRewriteHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test' });
    const res = await handler(new Request('http://localhost/api/public/rewrite', { method: 'POST', headers: { Authorization: 'Bearer fixture-session-token' }, body: '{}' }));
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/auth/v1/user');
  });
});

describe('Rewrite com provedor de IA configurável', () => {
  const userJson = { id: context.company_id, aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-22T00:00:00Z' };
  const rewriteRequest = () => new Request('http://localhost/api/public/rewrite', { method: 'POST', headers: { Authorization: 'Bearer fixture-session-token' }, body: JSON.stringify({ company_id: context.company_id, offer_id: context.connection_id }) });
  const mockBackend = (provider: () => Response) => {
    const urls: string[] = [];
    const providerCalls: { url: string; init: RequestInit | undefined }[] = [];
    const refundCalls: { apikey: string | null; authorization: string | null }[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      urls.push(url);
      if (url.includes('/auth/v1/user')) return new Response(JSON.stringify(userJson), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/rest/v1/rpc/ai_authorize')) return new Response(JSON.stringify({ text: 'Oferta original por R$ 129,90', prompt: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/rest/v1/rpc/ai_refund')) {
        const headers = new Headers(init?.headers);
        refundCalls.push({ apikey: headers.get('apikey'), authorization: headers.get('Authorization') });
        return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      providerCalls.push({ url, init });
      return provider();
    });
    vi.stubGlobal('fetch', fetchMock);
    return { urls, providerCalls, refundCalls };
  };
  const lovableAi = { provider: 'lovable', lovableKey: 'lovable-test-key' };
  const serviceRoleKey = 'service-role-test-key';

  it('provedor lovable retorna texto para revisão e não estorna cota', async () => {
    const { urls, providerCalls } = mockBackend(() => new Response(JSON.stringify({ choices: [{ message: { content: 'Texto reescrito pela IA' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const handler = createRewriteHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', ai: lovableAi });
    const res = await handler(rewriteRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'Texto reescrito pela IA', requires_review: true });
    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0]?.url).toBe('https://ai.gateway.lovable.dev/v1/chat/completions');
    expect(new Headers(providerCalls[0]?.init?.headers).get('Authorization')).toBe('Bearer lovable-test-key');
    const body = JSON.parse(String(providerCalls[0]?.init?.body)) as Record<string, unknown>;
    expect(body['model']).toBe('openai/gpt-6-luna');
    expect(body['max_completion_tokens']).toBe(1600);
    expect(body).not.toHaveProperty('temperature');
    expect(urls.some((u) => u.includes('ai_refund'))).toBe(false);
  });
  it('402 do provedor estorna a cota via service role e informa créditos esgotados', async () => {
    const { urls, refundCalls } = mockBackend(() => new Response(JSON.stringify({ error: { message: 'insufficient credits' } }), { status: 402, headers: { 'Content-Type': 'application/json' } }));
    const handler = createRewriteHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', serviceRoleKey, ai: lovableAi });
    const res = await handler(rewriteRequest());
    expect(res.status).toBe(402);
    expect((await res.json() as { error: string }).error).toBe('Créditos de IA esgotados no workspace.');
    expect(urls.some((u) => u.includes('ai_refund'))).toBe(true);
    expect(refundCalls).toHaveLength(1);
    expect(refundCalls[0]?.apikey).toBe(serviceRoleKey);
    expect(refundCalls[0]?.authorization).toBe(`Bearer ${serviceRoleKey}`);
  });
  it('429 do provedor estorna a cota e pede aguardo', async () => {
    const { urls } = mockBackend(() => new Response('{}', { status: 429, headers: { 'Content-Type': 'application/json' } }));
    const handler = createRewriteHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', serviceRoleKey, ai: lovableAi });
    const res = await handler(rewriteRequest());
    expect(res.status).toBe(429);
    expect((await res.json() as { error: string }).error).toBe('Muitas solicitações de IA, aguarde um minuto.');
    expect(urls.some((u) => u.includes('ai_refund'))).toBe(true);
  });
  it('resposta inválida do provedor estorna a cota', async () => {
    const { urls } = mockBackend(() => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const handler = createRewriteHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', serviceRoleKey, ai: lovableAi });
    const res = await handler(rewriteRequest());
    expect(res.status).toBe(502);
    expect((await res.json() as { error: string }).error).toBe('Resposta inválida');
    expect(urls.some((u) => u.includes('ai_refund'))).toBe(true);
  });
  it('sem chave de service role no servidor, falha do provedor não tenta estorno', async () => {
    const { urls } = mockBackend(() => new Response('{}', { status: 429, headers: { 'Content-Type': 'application/json' } }));
    const handler = createRewriteHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', ai: lovableAi });
    const res = await handler(rewriteRequest());
    expect(res.status).toBe(429);
    expect(urls.some((u) => u.includes('ai_refund'))).toBe(false);
  });
  it('sem chave do provedor ativo retorna 503 sem descontar cota nem chamar provedor', async () => {
    const { urls, providerCalls } = mockBackend(() => new Response('{}'));
    const handler = createRewriteHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test' });
    const res = await handler(rewriteRequest());
    expect(res.status).toBe(503);
    expect((await res.json() as { error: string }).error).toContain('IA não configurada');
    expect(providerCalls).toHaveLength(0);
    expect(urls.some((u) => u.includes('ai_authorize'))).toBe(false);
  });
  it('provedor openai usa AI_BASE_URL, AI_API_KEY e AI_MODEL com temperature 0.2', async () => {
    const { providerCalls } = mockBackend(() => new Response(JSON.stringify({ choices: [{ message: { content: 'Texto reescrito' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const handler = createRewriteHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', ai: { provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'gpt-4.1-mini' } });
    const res = await handler(rewriteRequest());
    expect(res.status).toBe(200);
    expect(providerCalls[0]?.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(new Headers(providerCalls[0]?.init?.headers).get('Authorization')).toBe('Bearer sk-test');
    const body = JSON.parse(String(providerCalls[0]?.init?.body)) as Record<string, unknown>;
    expect(body['model']).toBe('gpt-4.1-mini');
    expect(body['temperature']).toBe(0.2);
    expect(body['max_tokens']).toBe(1600);
  });
  it('prompt exige oferta curta, preço do operador e proíbe invenções', async () => {
    const { providerCalls } = mockBackend(() => new Response(JSON.stringify({ choices: [{ message: { content: 'Texto' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const handler = createRewriteHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', ai: lovableAi });
    await handler(rewriteRequest());
    const body = JSON.parse(String(providerCalls[0]?.init?.body)) as { messages: { role: string; content: string }[] };
    const system = body.messages[0]?.content ?? '';
    expect(system).toContain('4 ou 5 linhas');
    expect(system).toContain('preco_final');
    expect(system).toContain('nunca o preço antigo do fornecedor');
    expect(system).toContain('nunca invente');
    expect(system).toContain('sem markdown');
  });
  it('price_display validado é enviado ao provedor como preco_final', async () => {
    const { providerCalls } = mockBackend(() => new Response(JSON.stringify({ choices: [{ message: { content: 'Sandália\nR$ 77,90' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const handler = createRewriteHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', ai: lovableAi });
    const req = new Request('http://localhost/api/public/rewrite', { method: 'POST', headers: { Authorization: 'Bearer fixture-session-token' }, body: JSON.stringify({ company_id: context.company_id, offer_id: context.connection_id, price_display: 'R$ 77,90' }) });
    expect((await handler(req)).status).toBe(200);
    const body = JSON.parse(String(providerCalls[0]?.init?.body)) as { messages: { role: string; content: string }[] };
    expect(JSON.parse(body.messages[1]?.content ?? '{}')).toMatchObject({ preco_final: 'R$ 77,90' });
  });
  it('price_display acima de 40 caracteres é rejeitado', async () => {
    const { providerCalls } = mockBackend(() => new Response('{}'));
    const handler = createRewriteHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', ai: lovableAi });
    const req = new Request('http://localhost/api/public/rewrite', { method: 'POST', headers: { Authorization: 'Bearer fixture-session-token' }, body: JSON.stringify({ company_id: context.company_id, offer_id: context.connection_id, price_display: 'x'.repeat(41) }) });
    expect((await handler(req)).status).toBe(400);
    expect(providerCalls).toHaveLength(0);
  });
  it('resposta da IA passa pela limpeza e sai com o preço do operador', async () => {
    const suja = 'Aqui está a oferta:\n**Sandália Comfort**\n- Confortável\n- Leve\n"Por R$ 129,90"\n#promo #oferta\nLinha extra 1\nLinha extra 2';
    mockBackend(() => new Response(JSON.stringify({ choices: [{ message: { content: suja } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const handler = createRewriteHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', ai: lovableAi });
    const req = new Request('http://localhost/api/public/rewrite', { method: 'POST', headers: { Authorization: 'Bearer fixture-session-token' }, body: JSON.stringify({ company_id: context.company_id, offer_id: context.connection_id, price_display: 'R$ 77,90' }) });
    const res = await handler(req);
    const { text } = await res.json() as { text: string };
    expect(text).not.toContain('Aqui está');
    expect(text).not.toContain('**');
    expect(text).not.toContain('"');
    expect(text.split('\n').length).toBeLessThanOrEqual(5);
    expect(text).toContain('R$ 77,90');
    expect(text).not.toContain('129,90');
  });
});

describe('Limpeza da reescrita no servidor', () => {
  it('remove markdown, aspas e prefácio', () => {
    expect(cleanRewrite('Aqui está:\n**Produto X**\n- item\n"Por R$ 10,00"')).toBe('Produto X\nitem\nPor R$ 10,00');
  });
  it('limita a 5 linhas preservando a linha do preço', () => {
    const out = cleanRewrite('L1\nL2\nL3\nL4\nL5\nL6\nL7', 'R$ 10,00');
    expect(out.split('\n').length).toBeLessThanOrEqual(5);
    expect(out).toContain('R$ 10,00');
  });
  it('garante o preço do operador mesmo se a IA devolver outro', () => {
    expect(cleanRewrite('Produto\nPor apenas R$ 999,90', 'R$ 77,90')).toBe('Produto\nPor apenas R$ 77,90');
  });
  it('acrescenta a linha de preço quando a IA omite', () => {
    expect(cleanRewrite('Produto\nCaracterística', 'R$ 77,90')).toBe('Produto\nCaracterística\n💰 Por apenas R$ 77,90');
  });
  it('sem price_display apenas limpa', () => {
    expect(cleanRewrite('**Produto**\nPor R$ 10,00')).toBe('Produto\nPor R$ 10,00');
  });
});

describe('Melhoria de imagem com IA', () => {
  const userJson = { id: context.company_id, aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-22T00:00:00Z' };
  const enhanceRequest = () => new Request('http://localhost/api/public/image-enhance', { method: 'POST', headers: { Authorization: 'Bearer fixture-session-token' }, body: JSON.stringify({ company_id: context.company_id, offer_id: context.connection_id }) });
  const mockBackend = (provider: () => Response | Promise<Response>) => {
    const providerCalls: { url: string; init: RequestInit | undefined }[] = [];
    const refundCalls: { apikey: string | null }[] = [];
    const textRefundCalls: { apikey: string | null }[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/auth/v1/user')) return new Response(JSON.stringify(userJson), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/rest/v1/rpc/ai_authorize_image')) return new Response(JSON.stringify({ image: 'company/original.png' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/rest/v1/rpc/ai_refund_image')) { refundCalls.push({ apikey: new Headers(init?.headers).get('apikey') }); return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } }); }
      if (url.includes('/rest/v1/rpc/ai_refund')) { textRefundCalls.push({ apikey: new Headers(init?.headers).get('apikey') }); return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } }); }
      if (url.includes('/storage/v1/object/offer-media/')) return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'Content-Type': 'image/png' } });
      providerCalls.push({ url, init });
      return provider();
    });
    vi.stubGlobal('fetch', fetchMock);
    return { providerCalls, refundCalls, textRefundCalls };
  };
  const ai = { lovableKey: 'lovable-test-key' };
  const serviceRoleKey = 'service-role-test-key';

  it('sem sessão retorna 401 sem chamar nada', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const handler = createImageEnhanceHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', ai });
    expect((await handler(new Request('http://localhost/api/public/image-enhance', { method: 'POST' }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('sucesso retorna a imagem em base64 e não estorna cota', async () => {
    const { providerCalls, refundCalls } = mockBackend(() => new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2Vt' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const handler = createImageEnhanceHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', serviceRoleKey, ai });
    const res = await handler(enhanceRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ image: 'aW1hZ2Vt', mimeType: 'image/png' });
    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0]?.url).toBe('https://ai.gateway.lovable.dev/v1/images/generations');
    const body = JSON.parse(String(providerCalls[0]?.init?.body)) as Record<string, unknown>;
    expect(body['model']).toBe('google/gemini-3.1-flash-lite-image');
    expect(new Headers(providerCalls[0]?.init?.headers).get('Authorization')).toBe('Bearer lovable-test-key');
    expect(refundCalls).toHaveLength(0);
  });
  it('modelo configurável por AI_IMAGE_MODEL', async () => {
    const { providerCalls } = mockBackend(() => new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2Vt' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const handler = createImageEnhanceHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', serviceRoleKey, ai: { lovableKey: 'k', model: 'openai/gpt-image-2.5-sunburst' } });
    await handler(enhanceRequest());
    expect(JSON.parse(String(providerCalls[0]?.init?.body))['model']).toBe('openai/gpt-image-2.5-sunburst');
  });
  it('sem chave de IA retorna 503 sem descontar cota nem chamar provedor', async () => {
    const { providerCalls } = mockBackend(() => new Response('{}'));
    const handler = createImageEnhanceHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', serviceRoleKey });
    const res = await handler(enhanceRequest());
    expect(res.status).toBe(503);
    expect(providerCalls).toHaveLength(0);
  });
  it('402 do provedor estorna a cota via service role e informa créditos esgotados', async () => {
    const { refundCalls } = mockBackend(() => new Response('{}', { status: 402, headers: { 'Content-Type': 'application/json' } }));
    const handler = createImageEnhanceHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', serviceRoleKey, ai });
    const res = await handler(enhanceRequest());
    expect(res.status).toBe(402);
    expect((await res.json() as { error: string }).error).toBe('Créditos de IA esgotados no workspace.');
    expect(refundCalls).toHaveLength(1);
    expect(refundCalls[0]?.apikey).toBe(serviceRoleKey);
  });
  it('429 do provedor estorna a cota e pede aguardo', async () => {
    const { refundCalls } = mockBackend(() => new Response('{}', { status: 429, headers: { 'Content-Type': 'application/json' } }));
    const handler = createImageEnhanceHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', serviceRoleKey, ai });
    const res = await handler(enhanceRequest());
    expect(res.status).toBe(429);
    expect(refundCalls).toHaveLength(1);
  });
  it('timeout do provedor estorna a cota e responde erro genérico', async () => {
    const { refundCalls } = mockBackend(() => Promise.reject(new DOMException('The operation timed out', 'TimeoutError')));
    const handler = createImageEnhanceHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', serviceRoleKey, ai });
    const res = await handler(enhanceRequest());
    expect(res.status).toBe(400);
    expect(refundCalls).toHaveLength(1);
  });
  it('resposta sem imagem estorna a cota e responde 502', async () => {
    const { refundCalls } = mockBackend(() => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const handler = createImageEnhanceHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', serviceRoleKey, ai });
    const res = await handler(enhanceRequest());
    expect(res.status).toBe(502);
    expect((await res.json() as { error: string }).error).toBe('Resposta sem imagem');
    expect(refundCalls).toHaveLength(1);
  });
  it('estorno vai para a cota de imagem (ai_refund_image), nunca para a de texto', async () => {
    const { refundCalls, textRefundCalls } = mockBackend(() => new Response('{}', { status: 429, headers: { 'Content-Type': 'application/json' } }));
    const handler = createImageEnhanceHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', serviceRoleKey, ai });
    expect((await handler(enhanceRequest())).status).toBe(429);
    expect(refundCalls).toHaveLength(1);
    expect(textRefundCalls).toHaveLength(0);
  });
  it('prompt proíbe inventar texto, exige rótulos idênticos e só troca fundo e iluminação', async () => {
    const { providerCalls } = mockBackend(() => new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2Vt' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const handler = createImageEnhanceHandler({ url: 'https://example.invalid', publishableKey: 'sb_publishable_test', serviceRoleKey, ai });
    await handler(enhanceRequest());
    const body = JSON.parse(String(providerCalls[0]?.init?.body)) as { contents: { parts: { text: string }[] }[] };
    const prompt = body.contents[0]?.parts[0]?.text ?? '';
    expect(prompt).toContain('NUNCA adicione, invente, complete ou reescreva textos, números ou logos');
    expect(prompt).toContain('473ml');
    expect(prompt).toContain('idênticos ao original');
    expect(prompt).toContain('troque apenas o fundo');
    expect(prompt).toContain('mantenha-a exatamente como está');
  });
});

describe('Extração da imagem da resposta do gateway', () => {
  it('lê o formato normalizado data[].b64_json', () => {
    expect(extractImage({ data: [{ b64_json: 'abc' }] })).toEqual({ data: 'abc', mimeType: 'image/png' });
  });
  it('lê o formato nativo Gemini candidates[].content.parts[].inlineData', () => {
    expect(extractImage({ candidates: [{ content: { parts: [{ text: 'ok' }, { inlineData: { mimeType: 'image/jpeg', data: 'xyz' } }] } }] })).toEqual({ data: 'xyz', mimeType: 'image/jpeg' });
  });
  it('resposta sem imagem retorna null', () => {
    expect(extractImage({ data: [] })).toBeNull();
    expect(extractImage({})).toBeNull();
  });
});
