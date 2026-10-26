// @vitest-environment node
import { describe, expect, it, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { createEngineHandler } from '@/server/engine-handler.server';
import { createRewriteHandler } from '@/server/rewrite-handler.server';

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
  it('upload com lease inválida não grava arquivo e pede nova tentativa', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: context, error: null }).mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Lease de motor inválida' } });
    const storage = { from: vi.fn() };
    const handler = createEngineHandler({ rpc, storage } as unknown as SupabaseClient<Database>);
    const res = await handler(request({ action: 'upload', payload: { mime: 'image/png', key: 'b'.repeat(64), instance_id: context.company_id, data: 'iVBORw==' } }));
    expect(res.status).toBe(503);
    expect(storage.from).not.toHaveBeenCalled();
  });
  it('upload com credencial revogada após lock continua 403', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: context, error: null }).mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Credencial revogada' } });
    const storage = { from: vi.fn() };
    const handler = createEngineHandler({ rpc, storage } as unknown as SupabaseClient<Database>);
    const res = await handler(request({ action: 'upload', payload: { mime: 'image/png', key: 'b'.repeat(64), instance_id: context.company_id, data: 'iVBORw==' } }));
    expect(res.status).toBe(403);
    expect(storage.from).not.toHaveBeenCalled();
  });
  it('falha momentânea do banco não vira credencial recusada nem rejeição permanente', async () => {
    const unavailable = { data: null, error: { code: '', message: 'TypeError: fetch failed' } };
    expect((await createEngineHandler({ rpc: vi.fn().mockResolvedValue(unavailable) } as unknown as SupabaseClient<Database>)(request({ action: 'heartbeat' }))).status).toBe(503);
    const call = (error: { code: string; message: string }) => createEngineHandler({ rpc: vi.fn().mockResolvedValueOnce({ data: context, error: null }).mockResolvedValueOnce({ data: null, error }) } as unknown as SupabaseClient<Database>)(request({ action: 'capture', payload: {} }));
    expect((await call({ code: '57014', message: 'canceling statement due to statement timeout' })).status).toBe(503);
    expect((await call({ code: '40P01', message: 'deadlock detected' })).status).toBe(503);
    expect((await call({ code: '42501', message: 'Lease de motor inválida' })).status).toBe(503);
    expect((await call({ code: '42501', message: 'Credencial revogada' })).status).toBe(403);
    expect((await call({ code: 'P0001', message: 'Captura excede limite' })).status).toBe(409);
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
