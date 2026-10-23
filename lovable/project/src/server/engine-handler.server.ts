import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
const jsonValue: z.ZodType<Json> = z.lazy(() => z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)]));

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const envelope = z.object({ action: z.string(), payload: z.record(z.unknown()).default({}) });
/** MIME aceito → extensão curta usada no caminho do arquivo. */
export const MEDIA_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'application/pdf': 'pdf', 'application/msword': 'doc', 'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
} as const;
export type MediaMime = keyof typeof MEDIA_EXT;
const mimes = Object.keys(MEDIA_EXT) as [MediaMime, ...MediaMime[]];
const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.subarray(start, end));
/** Confere a assinatura de bytes do conteúdo contra o MIME declarado. */
export const validMedia = (mime: MediaMime, b: Uint8Array): boolean => {
  switch (mime) {
    case 'image/jpeg': return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/png': return b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71;
    case 'image/webp': return ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP';
    case 'video/mp4': case 'audio/mp4': return ascii(b, 4, 8) === 'ftyp';
    case 'audio/ogg': return ascii(b, 0, 4) === 'OggS';
    case 'audio/mpeg': return ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0);
    case 'application/pdf': return ascii(b, 0, 4) === '%PDF';
    case 'application/msword': case 'application/vnd.ms-excel': return [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((v, i) => b[i] === v);
    default: return b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
  }
};
const uploadSchema = z.object({ mime: z.enum(mimes), key: z.string().regex(/^[a-f0-9]{64}$/), instance_id: z.string().uuid(), data: z.string().max(15000000) });
const downloadSchema = z.object({ path: z.string().min(1).max(1024) });

export const createEngineHandler = (db: SupabaseClient<Database>) => async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return response({ error: 'Método inválido' }, 405);
  if (Number(request.headers.get('content-length') ?? 0) > 15000000) return response({ error: 'Arquivo grande' }, 413);
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!/^ob_[a-f0-9]{64}$/.test(token)) return response({ error: 'Credencial inválida' }, 401);
  // The only privileged read before authorization validates the hashed engine credential.
  const { data: rawContext, error: authError } = await db.rpc('engine_context', { p_token: token });
  const context = z.object({ company_id: z.string().uuid(), connection_id: z.string().uuid() }).safeParse(rawContext);
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
      if (leaseError) return response({ error: 'Motor sem lease' }, 409);
      const bytes = Uint8Array.from(atob(media.data), c => c.charCodeAt(0));
      if (bytes.length > 10485760) return response({ error: 'Máximo 10 MB' }, 413);
      if (!validMedia(media.mime, bytes)) return response({ error: 'Conteúdo de mídia inválido' }, 400);
      const path = `${ctx.company_id}/${ctx.connection_id}/${media.key}.${MEDIA_EXT[media.mime]}`;
      const { error } = await db.storage.from('offer-media').upload(path, bytes, { contentType: media.mime, upsert: false });
      if (error && !['409', 'Duplicate'].includes(String(error.statusCode ?? ('error' in error ? error.error : ''))) && !error.message?.includes('already exists')) return response({ error: 'Falha ao preservar mídia' }, 502);
      return response({ path });
    }
    if (action === 'download') {
      const { path } = downloadSchema.parse(payload);
      const { data: rows } = await db.from('publications').select('id').eq('connection_id', ctx.connection_id).eq('image', path).eq('status', 'processing').limit(1);
      if (!rows?.length || !path.startsWith(ctx.company_id + '/')) return response({ error: 'Arquivo não autorizado' }, 403);
      const { data, error } = await db.storage.from('offer-media').download(path);
      if (error || !data) return response({ error: 'Mídia indisponível' }, 502);
      const b = new Uint8Array(await data.arrayBuffer());
      let s = '';
      for (let k = 0; k < b.length; k += 8192) s += String.fromCharCode(...b.subarray(k, k + 8192));
      return response({ data: btoa(s) });
    }
    if (!['heartbeat', 'groups', 'capture', 'capture_error', 'claim', 'begin_send', 'finish'].includes(action)) return response({ error: 'Ação desconhecida' }, 400);
    const jsonPayload = z.record(jsonValue).parse(payload);
    const { data, error } = await db.rpc('engine_call', { p_token: token, p_action: action, p_payload: jsonPayload });
    if (error) return response({ error: error.message }, error.code === '42501' ? 403 : 409);
    return response(data);
  } catch {
    return response({ error: 'Solicitação inválida' }, 400);
  }
};
