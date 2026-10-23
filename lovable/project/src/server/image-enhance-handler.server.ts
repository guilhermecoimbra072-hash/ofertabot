import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });

export type ImageAiConfig = { model?: string | undefined; lovableKey?: string | undefined };

const LOVABLE_IMAGES_URL = 'https://ai.gateway.lovable.dev/v1/images/generations';
// Modelo mais barato do gateway que edita com imagem de referência (formato generate-content).
const DEFAULT_IMAGE_MODEL = 'google/gemini-3.1-flash-lite-image';

const ENHANCE_PROMPT = 'Melhore esta foto de produto para um anúncio promocional. Regras obrigatórias: o produto deve permanecer EXATAMENTE o mesmo — não mude formato, cor, quantidade nem embalagem; NUNCA adicione, invente, complete ou reescreva textos, números ou logos; mantenha rótulos, marcas e tamanhos (ex.: "473ml") legíveis e idênticos ao original; NÃO adicione preço, etiqueta, selo ou marca d’água; troque apenas o fundo por um fundo de estúdio limpo e promocional e melhore a iluminação; se não tiver certeza sobre alguma região, mantenha-a exatamente como está. Retorne somente a imagem editada.';

/** Extrai a imagem da resposta do gateway: formato normalizado (data[].b64_json) ou nativo Gemini (candidates[].content.parts[].inlineData). */
export const extractImage = (payload: unknown): { data: string; mimeType: string } | null => {
  const normalized = z.object({ data: z.array(z.object({ b64_json: z.string() })) }).safeParse(payload);
  const b64 = normalized.success ? normalized.data.data[0]?.b64_json : undefined;
  if (b64) return { data: b64, mimeType: 'image/png' };
  const native = z.object({ candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ inlineData: z.object({ mimeType: z.string(), data: z.string() }).optional() })) }) })) }).safeParse(payload);
  if (!native.success) return null;
  for (const candidate of native.data.candidates) for (const part of candidate.content.parts) if (part.inlineData?.data) return { data: part.inlineData.data, mimeType: part.inlineData.mimeType };
  return null;
};

export const createImageEnhanceHandler = (config: { url: string; publishableKey: string; serviceRoleKey?: string | undefined; ai?: ImageAiConfig }) => async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply({ error: 'Método inválido' }, 405);
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.replace(/^Bearer /, '');
  if (!token || !authorization.startsWith('Bearer ')) return reply({ error: 'Autenticação necessária' }, 401);
  const url = config.url;
  const publicKey = config.publishableKey;
  if (!url || !publicKey) return reply({ error: 'Autenticação indisponível' }, 503);
  const db = createClient<Database>(url, publicKey, { global: { headers: { Authorization: authorization }, fetch: (input, init) => {
    const headers = new Headers(typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    if (publicKey.startsWith('sb_') && headers.get('Authorization') === `Bearer ${publicKey}`) headers.delete('Authorization');
    headers.set('apikey', publicKey);
    return fetch(input, { ...init, headers });
  } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return reply({ error: 'Autenticação necessária' }, 401);
  const key = config.ai?.lovableKey;
  if (!key) return reply({ error: 'IA não configurada. A arte apenas com código continua disponível.' }, 503);
  const model = config.ai?.model ?? DEFAULT_IMAGE_MODEL;
  let authorized: { company: string; offer: string } | null = null;
  // Estorno da cota de imagem (melhor esforço): só ocorre depois de ai_authorize_image ter descontado.
  // ai_refund_image só aceita EXECUTE da service role; sem a chave administrativa o estorno é impossível e é omitido.
  const refund = async () => {
    if (!authorized || !config.serviceRoleKey) return;
    try {
      const admin = createClient<Database>(url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      await admin.rpc('ai_refund_image', { p_company: authorized.company, p_offer: authorized.offer });
    } catch { /* estorno é melhor esforço */ }
  };
  try {
    const { company_id, offer_id } = z.object({ company_id: z.string().uuid(), offer_id: z.string().uuid() }).parse(await request.json());
    const { data: raw, error: e } = await db.rpc('ai_authorize_image', { p_company: company_id, p_offer: offer_id });
    if (e) return reply({ error: e.message }, 403);
    authorized = { company: company_id, offer: offer_id };
    const { image } = z.object({ image: z.string() }).parse(raw);
    if (!config.serviceRoleKey) { await refund(); return reply({ error: 'Armazenamento indisponível' }, 503); }
    const admin = createClient<Database>(url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: blob, error: downloadError } = await admin.storage.from('offer-media').download(image);
    if (downloadError || !blob) { await refund(); return reply({ error: 'Imagem original indisponível' }, 502); }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const r = await fetch(LOVABLE_IMAGES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'X-Lovable-AIG-SDK': 'fetch' }, signal: AbortSignal.timeout(45000), body: JSON.stringify({ model, contents: [{ role: 'user', parts: [{ text: ENHANCE_PROMPT }, { inlineData: { mimeType: blob.type || 'image/jpeg', data: btoa(binary) } }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }) });
    if (!r.ok) {
      await refund();
      if (r.status === 402) return reply({ error: 'Créditos de IA esgotados no workspace.' }, 402);
      if (r.status === 429) return reply({ error: 'Muitas solicitações de IA, aguarde um minuto.' }, 429);
      return reply({ error: 'Provedor de IA indisponível. Tente novamente em instantes.' }, 502);
    }
    const out = extractImage(await r.json());
    if (!out) { await refund(); return reply({ error: 'Resposta sem imagem' }, 502); }
    return reply({ image: out.data, mimeType: out.mimeType });
  } catch { await refund(); return reply({ error: 'Não foi possível melhorar a imagem. A arte apenas com código continua disponível.' }, 400); }
};
