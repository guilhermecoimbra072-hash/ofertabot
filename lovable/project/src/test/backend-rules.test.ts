// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';

const uid = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const instance = '00000000-0000-4000-8000-000000000003';
let db: PGlite;
let company: string;
let connection: string;
let token: string;
let source: string;
let destination: string;
let offer: string;
async function scalar<T>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<{ result: T }>(sql, params);
  const row = result.rows[0];
  if (!row) throw new Error('Resultado esperado');
  return row.result;
}
const action = (name: string, payload: Record<string, unknown> = {}) => scalar<Record<string, unknown>>('select public.app_action($1,$2::jsonb) as result', [name, JSON.stringify({ company_id: company, ...payload })]);
const engine = (name: string, payload: Record<string, unknown> = {}) => scalar<Record<string, unknown> | null>('select public.engine_call($1,$2,$3::jsonb) as result', [token, name, JSON.stringify({ instance_id: instance, ...payload })]);
const enqueue = () => action('enqueue', { offer_id: offer, version: 1, group_ids: [destination], timezone: 'America/Sao_Paulo', idempotency_key: '00000000-0000-4000-8000-000000000004' });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated;
    create schema storage; create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;`);
  await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0006_ofertabot_ai_image_quota.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0007_ofertabot_snapshot_pages_media.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0004_ofertabot_ai_refund_server_callable.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0008_ofertabot_snapshot_authenticated_only.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0009_ofertabot_platform_access_and_spend.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0010_ofertabot_platform_management.sql', 'utf8'));
  await db.exec(readFileSync('drizzle/migrations/0011_ofertabot_platform_failure_dates.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`reset role; delete from private.platform_admins; truncate public.companies cascade; delete from auth.users; insert into auth.users values('${uid}','owner@example.invalid'),('${other}','viewer@example.invalid');`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const created = await action('create_company', { name: 'Teste local' });
  company = String(created['id']);
  const issued = await action('issue_engine');
  connection = String(issued['connection_id']); token = String(issued['token']);
  await engine('heartbeat', { status: 'connected' });
  await engine('groups', { groups: [{ jid: 'source@g.us', name: 'Origem' }, { jid: 'destination@g.us', name: 'Destino' }] });
  source = await scalar<string>("select id as result from public.groups where jid='source@g.us'");
  destination = await scalar<string>("select id as result from public.groups where jid='destination@g.us'");
  await action('set_groups', { groups: [{ id: source, is_source: true, is_destination: false }, { id: destination, is_source: false, is_destination: true }] });
  const captured = await engine('capture', { group_jid: 'source@g.us', message_id: 'message-1', received_at: new Date().toISOString(), text: 'Produto R$ 12,34' });
  offer = String(captured?.['id']);
  await action('approve_offer', { id: offer, version: 1 });
  await db.query("update public.companies set settings=jsonb_set(settings,'{send_enabled}','true') where id=$1", [company]);
});

describe('Contrato OfertaBot — PostgreSQL isolado', () => {
  it('RLS isola empresas e impede mutações diretas', async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    await db.exec('set role authenticated');
    expect(await scalar<number>('select count(*)::int as result from public.companies')).toBe(0);
    await expect(db.exec("insert into public.companies(name) values('Intrusão')")).rejects.toThrow();
  });
  it('viewer não pode executar ações de editor', async () => {
    await db.query("insert into public.members values($1,$2,'viewer')", [company, other]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    await db.exec('set role authenticated');
    await expect(action('reject_offer', { id: offer, version: 1 })).rejects.toThrow('Acesso negado');
  });
  it('dinheiro bigint mantém precisão e rejeita negativos', async () => {
    await action('save_offer', { id: offer, version: 1, edited_text: 'Produto', price_minor: '9007199254740993', currency: 'BRL' });
    const snapshot = await scalar<{ offers: { price_minor: string }[] }>('select public.app_snapshot($1) as result', [company]);
    expect(snapshot.offers[0]?.price_minor).toBe('9007199254740993');
    await expect(action('save_offer', { id: offer, version: 2, price_minor: '-1' })).rejects.toThrow();
  });
  it('dedup de captura mantém uma oferta e uma revisão inicial', async () => {
    expect(await engine('capture', { group_jid: 'source@g.us', message_id: 'message-1', received_at: new Date().toISOString(), text: 'Produto' })).toEqual({ id: null, duplicate: true });
    expect(await scalar<number>('select count(*)::int as result from public.offers')).toBe(1);
    expect(await scalar<number>('select count(*)::int as result from public.offer_revisions')).toBe(1);
  });
  it('fila deduplica oferta/versão/destino e entrega um job por vez', async () => {
    await enqueue(); await enqueue();
    expect(await scalar<number>('select count(*)::int as result from public.publications')).toBe(1);
    expect((await engine('claim'))?.['status']).toBe('processing');
    expect(await engine('claim')).toBeNull();
  });
  it('lease exclusiva tem 90 segundos e job 120 segundos', async () => {
    await expect(engine('heartbeat', { instance_id: other, status: 'connected' })).rejects.toThrow('Outro motor está ativo');
    expect(await scalar<number>("select round(extract(epoch from (instance_until-last_seen_at)))::int as result from public.connections")).toBe(90);
    await enqueue(); const job = await engine('claim');
    expect(job?.['attempts']).toBe(1);
    expect(await scalar<number>('select round(extract(epoch from (lease_until-now())))::int as result from public.publications')).toBe(120);
  });
  it('envio iniciado sem confirmação vira uncertain, nunca reenvio automático', async () => {
    await enqueue(); const job = await engine('claim');
    await engine('begin_send', { id: job?.['id'], lease_token: job?.['lease_token'] });
    await db.exec("update public.publications set lease_until=now()-interval '1 second'");
    await engine('heartbeat', { status: 'connected' });
    expect(await scalar<string>('select status as result from public.publications')).toBe('uncertain');
    expect(await engine('claim')).toBeNull();
  });
  it('plano basic 10 e professional 50; cliente não atribui plano', async () => {
    expect(await scalar<number>('select group_limit as result from public.companies')).toBe(10);
    await db.query("select public.admin_set_plan($1,'professional')", [company]);
    expect(await scalar<number>('select group_limit as result from public.companies')).toBe(50);
    await db.exec('set role authenticated');
    await expect(db.query("select public.admin_set_plan($1,'enterprise',100)", [company])).rejects.toThrow();
  });
  it('revogação cancela fila e invalida credencial', async () => {
    await enqueue(); await action('revoke_engine', { connection_id: connection });
    expect(await scalar<string>('select status as result from public.publications')).toBe('cancelled');
    await expect(engine('heartbeat', { status: 'connected' })).rejects.toThrow('Credencial inválida ou revogada');
  });
  it('excluir conta limpa vínculos sem afetar outras contas', async () => {
    await db.query("insert into public.members values($1,$2,'viewer')", [company, other]);
    await db.query('delete from auth.users where id=$1', [other]);
    expect(await scalar<number>('select count(*)::int as result from public.members')).toBe(1);
    expect(await scalar<string>('select user_id::text as result from public.members')).toBe(uid);
  });
  it('limite de IA rejeita a 31ª reescrita da hora', async () => {
    for (let i = 0; i < 30; i++) await db.query('select public.ai_authorize($1,$2)', [company, offer]);
    await expect(db.query('select public.ai_authorize($1,$2)', [company, offer])).rejects.toThrow('Limite de 30 reescritas por hora');
    expect(await scalar<number>('select calls as result from private.ai_usage')).toBe(30);
  });
  it('cota de imagem é separada da de texto: 30 de cada na mesma hora', async () => {
    await db.query("update public.offers set original_images='[\"company/original.png\"]'::jsonb where id=$1", [offer]);
    for (let i = 0; i < 30; i++) await db.query('select public.ai_authorize($1,$2)', [company, offer]);
    for (let i = 0; i < 30; i++) await db.query('select public.ai_authorize_image($1,$2)', [company, offer]);
    expect(await scalar<number>('select calls as result from private.ai_usage')).toBe(30);
    expect(await scalar<number>('select calls as result from private.ai_image_usage')).toBe(30);
    await expect(db.query('select public.ai_authorize_image($1,$2)', [company, offer])).rejects.toThrow('Limite de 30 imagens com IA por hora atingido');
  });
  it('estorno de imagem devolve só a cota de imagem', async () => {
    await db.query("update public.offers set original_images='[\"company/original.png\"]'::jsonb where id=$1", [offer]);
    await db.query('select public.ai_authorize($1,$2)', [company, offer]);
    await db.query('select public.ai_authorize_image($1,$2)', [company, offer]);
    await db.query('select public.ai_refund_image($1,$2)', [company, offer]);
    expect(await scalar<number>('select calls as result from private.ai_image_usage')).toBe(0);
    expect(await scalar<number>('select calls as result from private.ai_usage')).toBe(1);
    expect(await scalar<string>("select details->>'kind' as result from public.audit where event='ai.refunded'")).toBe('image');
  });
  it('save_offer rejeita versão desatualizada', async () => {
    await expect(action('save_offer', { id: offer, version: 0 })).rejects.toThrow('Oferta mudou');
    expect(await scalar<number>('select version as result from public.offers')).toBe(1);
  });
  it('revogar motor desativa origens e destinos e bloqueia reativação', async () => {
    await action('revoke_engine', { connection_id: connection });
    expect(await scalar<number>('select count(*)::int as result from public.groups where is_source or is_destination')).toBe(0);
    await expect(action('set_groups', { groups: [{ id: source, is_source: true, is_destination: false }] })).rejects.toThrow('Conexão revogada');
    await expect(action('set_groups', { groups: [{ id: destination, is_source: false, is_destination: true }] })).rejects.toThrow('Conexão revogada');
  });
  it('enqueue bloqueia destino revogado mesmo com flag ativa legada', async () => {
    await action('revoke_engine', { connection_id: connection });
    await db.query('update public.groups set is_destination=true where id=$1', [destination]);
    await expect(enqueue()).rejects.toThrow('Destino inválido');
    expect(await scalar<number>('select count(*)::int as result from public.publications')).toBe(0);
  });
  it('revogação após claim impede begin_send', async () => {
    await enqueue(); const job = await engine('claim');
    await action('revoke_engine', { connection_id: connection });
    await expect(engine('begin_send', { id: job?.['id'], lease_token: job?.['lease_token'] })).rejects.toThrow('Credencial inválida ou revogada');
    expect(await scalar<string>('select status as result from public.publications')).toBe('cancelled');
  });
  it('capture_error audita somente identificador e código, sem conteúdo', async () => {
    await engine('capture_error', { message_hash: 'a'.repeat(80), text: 'CONTEÚDO PRIVADO', images: ['segredo'], message_id: 'identificador privado' });
    expect(await scalar<Record<string, unknown>>("select details as result from public.audit where event='capture.failed'")).toEqual({ message_hash: 'a'.repeat(64), code: 'capture_failed' });
    expect(await scalar<number>('select count(*)::int as result from public.offers')).toBe(1);
  });
  it('capture_error exige lease válida com código de autorização', async () => {
    await db.exec("update public.connections set instance_until=now()-interval '1 second'");
    await expect(engine('capture_error', { message_hash: 'b'.repeat(64) })).rejects.toMatchObject({ code: '42501' });
    expect(await scalar<number>("select count(*)::int as result from public.audit where event='capture.failed'")).toBe(0);
  });
  it('revalida token após locks e não executa heartbeat se segunda validação falhar', async () => {
    // Isolated failure injection models a credential revoked while locks were awaited.
    await db.exec(`alter function public.engine_context(text) rename to test_original_context;
      create sequence public.test_context_calls;
      create function public.engine_context(p_token text) returns jsonb language plpgsql as $$
      begin
        if nextval('public.test_context_calls')>1 then raise exception 'Credencial revogada após lock' using errcode='42501'; end if;
        return public.test_original_context(p_token);
      end $$;`);
    try {
      await expect(engine('heartbeat', { status: 'disconnected' })).rejects.toThrow('Credencial revogada após lock');
      expect(await scalar<string>('select status as result from public.connections')).toBe('connected');
      expect(await scalar<number>('select last_value::int as result from public.test_context_calls')).toBe(2);
    } finally {
      await db.exec('drop function public.engine_context(text); alter function public.test_original_context(text) rename to engine_context; drop sequence public.test_context_calls;');
    }
  });
  it('snapshot de viewer oculta QR, instância e lease de publicação', async () => {
    await enqueue(); await engine('claim');
    await db.query("update public.connections set qr='QR PRIVADO',qr_expires_at=now()+interval '30 seconds' where id=$1", [connection]);
    await db.query("insert into public.members values($1,$2,'viewer')", [company, other]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    const snapshot = await scalar<{ connections: Record<string, unknown>[]; publications: Record<string, unknown>[]; members: unknown[] }>('select public.app_snapshot($1) as result', [company]);
    expect(snapshot.connections[0]?.['qr']).toBeNull();
    expect(snapshot.connections[0]).not.toHaveProperty('instance_id');
    expect(snapshot.publications[0]).not.toHaveProperty('lease_token');
    expect(snapshot.members).toEqual([]);
  });
});

describe('Paginação, mídias e capturas (0007)', () => {
  type Snap = { offers: { id: string; status: string }[]; stats: Record<string, number>; page: Record<string, { offset: number; limit: number; total: number }> };
  const snap = (args: string, params: unknown[]) => scalar<Snap>(`select public.app_snapshot(${args}) as result`, params);
  it('lista no máximo 100 ofertas por página, com total e stats da tabela inteira', async () => {
    for (let i = 2; i <= 105; i++) await engine('capture', { group_jid: 'source@g.us', message_id: 'm-' + i, received_at: new Date().toISOString(), text: i % 2 ? 'Tênis azul' : 'Camisa' });
    const first = await snap('$1', [company]);
    expect(first.offers).toHaveLength(100);
    expect(first.page['offers']).toEqual({ offset: 0, limit: 100, total: 105 });
    expect(first.stats['received']).toBe(105);
    const second = await snap('$1,null,100', [company]);
    expect(second.offers).toHaveLength(5);
    const huge = await snap('$1,null,-50', [company]);
    expect(huge.page['offers']?.offset).toBe(0);
  });
  it('busca no servidor e filtro pending só nas aprovações', async () => {
    await engine('capture', { group_jid: 'source@g.us', message_id: 'm-x', received_at: new Date().toISOString(), text: 'Tênis AZUL 100% algodão' });
    const found = await snap("$1,'azul 100%'", [company]);
    expect(found.page['offers']?.total).toBe(1);
    const pending = await snap("$1,null,0,0,0,'pending'", [company]);
    expect(pending.offers.every(o => o.status === 'pending')).toBe(true);
    expect(pending.page['offers']?.total).toBe(1);
    const ignored = await snap("$1,null,0,0,0,'qualquer'", [company]);
    expect(ignored.page['offers']?.total).toBe(2);
  });
  it('aprova vídeo, áudio e documento prontos; failed continua bloqueado', async () => {
    for (const kind of ['video', 'audio', 'document']) {
      const r = await engine('capture', { group_jid: 'source@g.us', message_id: 'k-' + kind, received_at: new Date().toISOString(), text: 'Oferta ' + kind, media_kind: kind, media_status: 'ready' });
      await expect(action('approve_offer', { id: r?.['id'], version: 1 })).resolves.toBeDefined();
    }
    const bad = await engine('capture', { group_jid: 'source@g.us', message_id: 'k-bad', received_at: new Date().toISOString(), text: 'x', media_kind: 'video', media_status: 'failed' });
    await expect(action('approve_offer', { id: bad?.['id'], version: 1 })).rejects.toThrow('Mídia não processada');
    const un = await engine('capture', { group_jid: 'source@g.us', message_id: 'k-un', received_at: new Date().toISOString(), text: 'x', media_kind: 'unsupported', media_status: 'ready' });
    await expect(action('approve_offer', { id: un?.['id'], version: 1 })).rejects.toThrow('Mídia não processada');
  });
  it('capture_error grava code válido ou capture_failed, sem texto', async () => {
    await engine('capture_error', { message_hash: 'a'.repeat(64), code: 'too_large' });
    await engine('capture_error', { message_hash: 'b'.repeat(64), code: 'Texto da mensagem com espaço' });
    const codes = await scalar<string[]>("select array_agg(details->>'code' order by created_at,id) as result from public.audit where event='capture.failed'");
    expect(codes?.slice().sort()).toEqual(['capture_failed', 'too_large']);
  });
  it('claim devolve media_kind e jid ao motor', async () => {
    await enqueue();
    const claimed = await engine('claim');
    expect(claimed?.['jid']).toBe('destination@g.us');
    expect(claimed?.['media_kind']).toBe('text');
  });
});

describe('Plataforma, acesso e gastos — isolado, sem dados reais',()=>{
 const platform=(a:string,p:Record<string,unknown>={})=>db.query('select public.platform_action($1,$2,$3::jsonb)',[uid,a,JSON.stringify({company_id:company,...p})]);
 const platformSnap=()=>scalar<Record<string,unknown>>('select public.platform_snapshot($1) as result',[company]);
 it('defaults preservam basic, 10 grupos, acesso ativo, 30/30, custos zero e teto nulo',async()=>{
  expect((await db.query('select plan,group_limit,access_status,ai_hourly_limit,image_hourly_limit,spend_limit_minor,ai_cost_minor,image_cost_minor from public.companies')).rows[0]).toEqual({plan:'basic',group_limit:10,access_status:'active',ai_hourly_limit:30,image_hourly_limit:30,spend_limit_minor:null,ai_cost_minor:0,image_cost_minor:0});
 });
 it('owner e admin de empresa não entram na plataforma e não alteram plano',async()=>{
  await expect(platformSnap()).rejects.toThrow('Acesso restrito');
  await db.query('insert into public.members values($1,$2,\'admin\')',[company,other]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
  await expect(platformSnap()).rejects.toThrow('Acesso restrito');
  await db.exec('set role authenticated');
  await expect(platform('set_plan',{plan:'professional',group_limit:50})).rejects.toThrow();
  await expect(db.query('select public.admin_set_plan($1,\'professional\')',[company])).rejects.toThrow();
 });
 it('snapshot indica operador sem expor empresas não vinculadas',async()=>{
  await db.query('insert into private.platform_admins(user_id) values($1)',[uid]);
  await db.exec("insert into public.companies(name) values('Outra empresa isolada')");
  const s=await scalar<{platform_admin:boolean;companies:unknown[]}>('select public.app_snapshot($1) as result',[company]);
  expect(s.platform_admin).toBe(true);expect(s.companies).toHaveLength(1);
  expect((await platformSnap())['companies']).toHaveLength(2);
 });
 for(const fn of ['app_action','engine_call','engine_context','ai_authorize','ai_authorize_image'])it(`pausa bloqueia ${fn} com mensagem exata`,async()=>{
  await db.query("update public.companies set access_status='paused',paused_reason='Teste isolado' where id=$1",[company]);
  const call=fn==='app_action'?action('reject_offer',{id:offer,version:1}):fn==='engine_call'?engine('heartbeat',{status:'connected'}):fn==='engine_context'?db.query('select public.engine_context($1)',[token]):db.query(`select public.${fn}($1,$2)`,[company,offer]);
  await expect(call).rejects.toThrow('Acesso pausado pelo OfertaBot');
  expect(await scalar<number>('select count(*)::int as result from public.offers')).toBe(1);
 });
 it('snapshot pausado só retorna contexto de acesso, sem operação',async()=>{
  await db.query("update public.companies set access_status='paused' where id=$1",[company]);
  const s=await scalar<Record<string,unknown>>('select public.app_snapshot($1) as result',[company]);
  expect(s['access_paused']).toBe(true);for(const key of ['offers','groups','publications','connections'])expect(s).not.toHaveProperty(key);
 });
 it('pausa bloqueia begin_send de trabalho já reservado sem apagar publicações',async()=>{
  await enqueue();const job=await engine('claim');
  await db.query("update public.companies set access_status='paused' where id=$1",[company]);
  await expect(engine('begin_send',{id:job?.['id'],lease_token:job?.['lease_token']})).rejects.toThrow('Acesso pausado pelo OfertaBot');
  expect(await scalar<string>('select status as result from public.publications')).toBe('processing');
 });
 it('limites configuráveis de texto e imagem são independentes',async()=>{
  await db.query("update public.companies set ai_hourly_limit=1,image_hourly_limit=2 where id=$1",[company]);
  await db.query("update public.offers set original_images='[\"company/original.png\"]' where id=$1",[offer]);
  await db.query('select public.ai_authorize($1,$2)',[company,offer]);await expect(db.query('select public.ai_authorize($1,$2)',[company,offer])).rejects.toThrow('Limite de 1 reescritas');
  for(let i=0;i<2;i++)await db.query('select public.ai_authorize_image($1,$2)',[company,offer]);
  await expect(db.query('select public.ai_authorize_image($1,$2)',[company,offer])).rejects.toThrow('Limite de 2 imagens');
 });
 it('custos texto e imagem somam centavos no mês e recusam somente acima do teto',async()=>{
  await db.query('update public.companies set spend_limit_minor=100,ai_cost_minor=25,image_cost_minor=75 where id=$1',[company]);
  await db.query("update public.offers set original_images='[\"company/original.png\"]' where id=$1",[offer]);
  await db.query('select public.ai_authorize($1,$2)',[company,offer]);await db.query('select public.ai_authorize_image($1,$2)',[company,offer]);
  expect(await scalar<number>('select spent_minor::int as result from private.spend_meter')).toBe(100);
  await expect(db.query('select public.ai_authorize($1,$2)',[company,offer])).rejects.toThrow('Limite de gasto mensal atingido');
  expect(await scalar<number>('select calls as result from private.ai_usage')).toBe(1);
 });
 it('custo zero não bloqueia mesmo com teto zero',async()=>{
  await db.query('update public.companies set spend_limit_minor=0 where id=$1',[company]);
  await expect(db.query('select public.ai_authorize($1,$2)',[company,offer])).resolves.toBeDefined();
  expect(await scalar<number>('select spent_minor::int as result from private.spend_meter')).toBe(0);
 });
 it('estorno devolve o custo original após mudança de preço, inclusive pausada',async()=>{
  await db.query('update public.companies set ai_cost_minor=129 where id=$1',[company]);await db.query('select public.ai_authorize($1,$2)',[company,offer]);
  await db.query("update public.companies set ai_cost_minor=999,access_status='paused' where id=$1",[company]);
  await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role service_role');
  await db.query('select public.ai_refund($1,$2)',[company,offer]);await db.exec('reset role');
  expect(await scalar<number>('select spent_minor::int as result from private.spend_meter')).toBe(0);
  expect(await scalar<number>('select text_calls as result from private.spend_meter')).toBe(0);
 });
 it('estorno de imagem preserva gasto de texto e devolve custo original da imagem',async()=>{
  await db.query('update public.companies set ai_cost_minor=10,image_cost_minor=50 where id=$1',[company]);await db.query("update public.offers set original_images='[\"company/original.png\"]' where id=$1",[offer]);
  await db.query('select public.ai_authorize($1,$2)',[company,offer]);await db.query('select public.ai_authorize_image($1,$2)',[company,offer]);
  await db.query('update public.companies set image_cost_minor=1000 where id=$1',[company]);await db.query('select public.ai_refund_image($1,$2)',[company,offer]);
  expect(await scalar<number>('select spent_minor::int as result from private.spend_meter')).toBe(10);
 });
 it('mês segue fuso da empresa e não inclui gasto de mês anterior',async()=>{
  await db.query('update public.companies set ai_cost_minor=5,spend_limit_minor=5 where id=$1',[company]);
  await db.query("insert into private.spend_meter(company_id,window_start,spent_minor) values($1,(date_trunc('month',now() at time zone 'America/Sao_Paulo')-interval '1 month') at time zone 'America/Sao_Paulo',100)",[company]);
  await db.query('select public.ai_authorize($1,$2)',[company,offer]);
  expect(await scalar<number>("select spent_minor::int as result from private.spend_meter where window_start=date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'")).toBe(5);
 });
 it('admin_set_plan e estornos permanecem exclusivos de service_role',async()=>{
  await db.exec('set role authenticated');for(const fn of ['ai_refund','ai_refund_image'])await expect(db.query(`select public.${fn}($1,$2)`,[company,offer])).rejects.toThrow('permission denied');
 });
 it('operadores são usuários cadastrados e o último não pode ser removido',async()=>{
  await db.query('insert into private.platform_admins(user_id) values($1)',[uid]);
  await expect(platform('remove_operator',{user_id:uid})).rejects.toThrow('último operador');
  await expect(platform('add_operator',{email:'missing@example.invalid'})).rejects.toThrow('cadastrar-se primeiro');
  await platform('add_operator',{email:'viewer@example.invalid'});expect(await scalar<number>('select count(*)::int as result from private.platform_admins')).toBe(2);
  await platform('remove_operator',{user_id:other});expect(await scalar<number>('select count(*)::int as result from private.platform_admins')).toBe(1);
 });
 it('planos basic 10, professional 50, enterprise 1–10000 e recusa abaixo dos ativos',async()=>{
  await db.query('insert into private.platform_admins(user_id) values($1)',[uid]);
  await platform('set_plan',{plan:'professional',group_limit:1});expect(await scalar<number>('select group_limit as result from public.companies')).toBe(50);
  await platform('set_plan',{plan:'basic',group_limit:999});expect(await scalar<number>('select group_limit as result from public.companies')).toBe(10);
  await expect(platform('set_plan',{plan:'enterprise',group_limit:1})).rejects.toThrow('Desative grupos antes');
  for(const group_limit of [0,10001])await expect(platform('set_plan',{plan:'enterprise',group_limit})).rejects.toThrow('Plano inválido');
  await platform('set_plan',{plan:'enterprise',group_limit:10000});expect(await scalar<number>('select group_limit as result from public.companies')).toBe(10000);
 });
 it('detalhe da plataforma nunca contém QR ou credenciais',async()=>{
  await db.query('insert into private.platform_admins(user_id) values($1)',[uid]);
  await db.query("update public.connections set qr='segredo' where id=$1",[connection]);
  const detail=(await platformSnap())['detail'] as {connections:Record<string,unknown>[]};
  expect(detail.connections[0]).toEqual({id:connection,label:'Notebook',status:'connected',last_seen_at:expect.any(String)});
 });
 it('gráfico fornece 14 dias completos com zero e contagens reais',async()=>{
  await db.query('insert into private.platform_admins(user_id) values($1)',[uid]);
  const s=await platformSnap();const days=s['days'] as {offers:number}[];
  expect(days).toHaveLength(14);expect(days.reduce((n,d)=>n+d.offers,0)).toBe(1);expect(days.filter(d=>d.offers===0)).toHaveLength(13);
 });
 it('falhas recentes usam timestamp real de falha, nunca criação',async()=>{
  await db.query('insert into private.platform_admins(user_id) values($1)',[uid]);await enqueue();
  await db.exec("update public.publications set created_at=now()-interval '30 days',status='failed'");
  const stats=(await platformSnap())['stats'] as Record<string,number>;expect(stats['failed7']).toBe(1);
  await db.exec("update public.publications set failed_at=null");expect(((await platformSnap())['stats'] as Record<string,number>)['failed7']).toBe(0);
 });
});
