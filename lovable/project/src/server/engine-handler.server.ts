import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
const jsonValue: z.ZodType<Json> = z.lazy(() => z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)]));

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
// 503 = retry (expired lease, database momentarily unavailable); 403 = credential refused; 409 = business rule.
const transient = (code?: string) => !code || /^(08|40|53|57|58)/.test(code) || /^PGRST00[0-3]$/.test(code);
const rpcStatus = (error: { code?: string; message?: string }) => error.message === 'Lease de motor inválida' ? 503 : error.code === '42501' ? 403 : transient(error.code) ? 503 : 409;
const envelope = z.object({ action: z.string(), payload: z.record(z.unknown()).default({}) });
const uploadSchema = z.object({ mime: z.enum(['image/jpeg', 'image/png', 'image/webp']), key: z.string().regex(/^[a-f0-9]{64}$/), instance_id: z.string().uuid(), data: z.string().max(15000000) });
const downloadSchema = z.object({ path: z.string().min(1).max(1024) });

export const createEngineHandler = (db: SupabaseClient<Database>) => async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return response({ error: 'Método inválido' }, 405);
  if (Number(request.headers.get('content-length') ?? 0) > 15000000) return response({ error: 'Arquivo grande' }, 413);
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!/^ob_[a-f0-9]{64}$/.test(token)) return response({ error: 'Credencial inválida' }, 401);
  // The only privileged read before authorization validates the hashed engine credential.
  const { data: rawContext, error: authError } = await db.rpc('engine_context', { p_token: token });
  const context = z.object({ company_id: z.string().uuid(), connection_id: z.string().uuid() }).safeParse(rawContext);
  if (authError && authError.code !== '42501') return response({ error: 'Backend indisponível' }, 503);
  if (authError || !context.success) return response({ error: 'Credencial inválida ou revogada' }, 403);
  const ctx = context.data;
  try {
    const raw = await request.text();
    if (raw.length > 15000000) return response({ error: 'Arquivo grande' }, 413);
    const { action, payload } = envelope.parse(JSON.parse(raw));
    if (action === 'upload') {
      const parsed = uploadSchema.safeParse(payload);
      if (!parsed.success) return response({ error: 'Mídia inválida' }, 400);
      const media = parsed.data;
      const { error: leaseError } = await db.rpc('engine_call', { p_token: token, p_action: 'groups', p_payload: { instance_id: media.instance_id, groups: [] } });
      if (leaseError) return response({ error: 'Motor sem lease' }, rpcStatus(leaseError) === 403 ? 403 : 503);
      const bytes = Uint8Array.from(atob(media.data), c => c.charCodeAt(0));
      if (bytes.length > 10485760) return response({ error: 'Máximo 10 MB' }, 413);
      const valid = media.mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 : media.mime === 'image/png' ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 : new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
      if (!valid) return response({ error: 'Conteúdo de imagem inválido' }, 400);
      const path = `${ctx.company_id}/${ctx.connection_id}/${media.key}.${media.mime.split('/')[1]}`;
      const { error } = await db.storage.from('offer-media').upload(path, bytes, { contentType: media.mime, upsert: false });
      if (error && !['409', 'Duplicate'].includes(String(error.statusCode ?? ('error' in error ? error.error : ''))) && !error.message?.includes('already exists')) return response({ error: 'Falha ao preservar imagem' }, 502);
      return response({ path });
    }
    if (action === 'download') {
      const { path } = downloadSchema.parse(payload);
      const { data: rows } = await db.from('publications').select('id').eq('connection_id', ctx.connection_id).eq('image', path).eq('status', 'processing').limit(1);
      if (!rows?.length || !path.startsWith(ctx.company_id + '/')) return response({ error: 'Arquivo não autorizado' }, 403);
      const { data, error } = await db.storage.from('offer-media').download(path);
      if (error || !data) return response({ error: 'Imagem indisponível' }, 502);
      const b = new Uint8Array(await data.arrayBuffer());
      let s = '';
      for (let k = 0; k < b.length; k += 8192) s += String.fromCharCode(...b.subarray(k, k + 8192));
      return response({ data: btoa(s) });
    }
    if (!['heartbeat', 'groups', 'capture', 'capture_error', 'claim', 'begin_send', 'finish'].includes(action)) return response({ error: 'Ação desconhecida' }, 400);
    const jsonPayload = z.record(jsonValue).parse(payload);
    const { data, error } = await db.rpc('engine_call', { p_token: token, p_action: action, p_payload: jsonPayload });
    if (error) return response({ error: error.message }, rpcStatus(error));
    return response(data);
  } catch {
    return response({ error: 'Solicitação inválida' }, 400);
  }
};

