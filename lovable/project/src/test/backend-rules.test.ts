// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";

const uid = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const instance = "00000000-0000-4000-8000-000000000003";
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
  if (!row) throw new Error("Resultado esperado");
  return row.result;
}
const action = (name: string, payload: Record<string, unknown> = {}) =>
  scalar<Record<string, unknown>>("select public.app_action($1,$2::jsonb) as result", [
    name,
    JSON.stringify({ company_id: company, ...payload }),
  ]);
const engine = (name: string, payload: Record<string, unknown> = {}) =>
  scalar<Record<string, unknown> | null>("select public.engine_call($1,$2,$3::jsonb) as result", [
    token,
    name,
    JSON.stringify({ instance_id: instance, ...payload }),
  ]);
const enqueue = () =>
  action("enqueue", {
    offer_id: offer,
    version: 1,
    group_ids: [destination],
    timezone: "America/Sao_Paulo",
    idempotency_key: "00000000-0000-4000-8000-000000000004",
  });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated;
    create schema storage; create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;`);
  await db.exec(readFileSync("supabase/schema.sql", "utf8"));
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec(
    `reset role; truncate public.companies cascade; delete from auth.users; insert into auth.users values('${uid}','owner@example.invalid'),('${other}','viewer@example.invalid');`,
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const created = await action("create_company", { name: "Teste local" });
  company = String(created["id"]);
  const issued = await action("issue_engine");
  connection = String(issued["connection_id"]);
  token = String(issued["token"]);
  await engine("heartbeat", { status: "connected" });
  await engine("groups", {
    groups: [
      { jid: "source@g.us", name: "Origem" },
      { jid: "destination@g.us", name: "Destino" },
    ],
  });
  source = await scalar<string>("select id as result from public.groups where jid='source@g.us'");
  destination = await scalar<string>(
    "select id as result from public.groups where jid='destination@g.us'",
  );
  await action("set_groups", {
    groups: [
      { id: source, is_source: true, is_destination: false },
      { id: destination, is_source: false, is_destination: true },
    ],
  });
  const captured = await engine("capture", {
    group_jid: "source@g.us",
    message_id: "message-1",
    received_at: new Date().toISOString(),
    text: "Produto R$ 12,34",
  });
  offer = String(captured?.["id"]);
  await action("approve_offer", { id: offer, version: 1 });
  await db.query(
    "update public.companies set settings=jsonb_set(settings,'{send_enabled}','true') where id=$1",
    [company],
  );
});

describe("Contrato OfertaBot — PostgreSQL isolado", () => {
  it("RLS isola empresas e impede mutações diretas", async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    await db.exec("set role authenticated");
    expect(await scalar<number>("select count(*)::int as result from public.companies")).toBe(0);
    await expect(
      db.exec("insert into public.companies(name) values('Intrusão')"),
    ).rejects.toThrow();
  });
  it("viewer não pode executar ações de editor", async () => {
    await db.query("insert into public.members values($1,$2,'viewer')", [company, other]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    await db.exec("set role authenticated");
    await expect(action("reject_offer", { id: offer, version: 1 })).rejects.toThrow(
      "Acesso negado",
    );
  });
  it("dinheiro bigint mantém precisão e rejeita negativos", async () => {
    await action("save_offer", {
      id: offer,
      version: 1,
      edited_text: "Produto",
      price_minor: "9007199254740993",
      currency: "BRL",
    });
    const snapshot = await scalar<{ offers: { price_minor: string }[] }>(
      "select public.app_snapshot($1) as result",
      [company],
    );
    expect(snapshot.offers[0]?.price_minor).toBe("9007199254740993");
    await expect(
      action("save_offer", { id: offer, version: 2, price_minor: "-1" }),
    ).rejects.toThrow();
  });
  it("dedup de captura mantém uma oferta e uma revisão inicial", async () => {
    expect(
      await engine("capture", {
        group_jid: "source@g.us",
        message_id: "message-1",
        received_at: new Date().toISOString(),
        text: "Produto",
      }),
    ).toEqual({ id: null, duplicate: true });
    expect(await scalar<number>("select count(*)::int as result from public.offers")).toBe(1);
    expect(await scalar<number>("select count(*)::int as result from public.offer_revisions")).toBe(
      1,
    );
  });
  it("fila deduplica oferta/versão/destino e entrega um job por vez", async () => {
    await enqueue();
    await enqueue();
    expect(await scalar<number>("select count(*)::int as result from public.publications")).toBe(1);
    expect((await engine("claim"))?.["status"]).toBe("processing");
    expect(await engine("claim")).toBeNull();
  });
  it("lease exclusiva tem 90 segundos e job 120 segundos", async () => {
    await expect(engine("heartbeat", { instance_id: other, status: "connected" })).rejects.toThrow(
      "Outro motor está ativo",
    );
    expect(
      await scalar<number>(
        "select round(extract(epoch from (instance_until-last_seen_at)))::int as result from public.connections",
      ),
    ).toBe(90);
    await enqueue();
    const job = await engine("claim");
    expect(job?.["attempts"]).toBe(1);
    expect(
      await scalar<number>(
        "select round(extract(epoch from (lease_until-now())))::int as result from public.publications",
      ),
    ).toBe(120);
  });
  it("envio iniciado sem confirmação vira uncertain, nunca reenvio automático", async () => {
    await enqueue();
    const job = await engine("claim");
    await engine("begin_send", { id: job?.["id"], lease_token: job?.["lease_token"] });
    await db.exec("update public.publications set lease_until=now()-interval '1 second'");
    await engine("heartbeat", { status: "connected" });
    expect(await scalar<string>("select status as result from public.publications")).toBe(
      "uncertain",
    );
    expect(await engine("claim")).toBeNull();
  });
  it("plano basic 10 e professional 50; cliente não atribui plano", async () => {
    expect(await scalar<number>("select group_limit as result from public.companies")).toBe(10);
    await db.query("select public.admin_set_plan($1,'professional')", [company]);
    expect(await scalar<number>("select group_limit as result from public.companies")).toBe(50);
    await db.exec("set role authenticated");
    await expect(
      db.query("select public.admin_set_plan($1,'enterprise',100)", [company]),
    ).rejects.toThrow();
  });
  it("revogação cancela fila e invalida credencial", async () => {
    await enqueue();
    await action("revoke_engine", { connection_id: connection });
    expect(await scalar<string>("select status as result from public.publications")).toBe(
      "cancelled",
    );
    await expect(engine("heartbeat", { status: "connected" })).rejects.toThrow(
      "Credencial inválida ou revogada",
    );
  });
  it("excluir conta limpa vínculos sem afetar outras contas", async () => {
    await db.query("insert into public.members values($1,$2,'viewer')", [company, other]);
    await db.query("delete from auth.users where id=$1", [other]);
    expect(await scalar<number>("select count(*)::int as result from public.members")).toBe(1);
    expect(await scalar<string>("select user_id::text as result from public.members")).toBe(uid);
  });
  it("limite de IA rejeita a 31ª reescrita da hora", async () => {
    for (let i = 0; i < 30; i++)
      await db.query("select public.ai_authorize($1,$2)", [company, offer]);
    await expect(db.query("select public.ai_authorize($1,$2)", [company, offer])).rejects.toThrow(
      "Limite de 30 reescritas por hora",
    );
    expect(await scalar<number>("select calls as result from private.ai_usage")).toBe(30);
  });
  it("save_offer rejeita versão desatualizada", async () => {
    await expect(action("save_offer", { id: offer, version: 0 })).rejects.toThrow("Oferta mudou");
    expect(await scalar<number>("select version as result from public.offers")).toBe(1);
  });
  it("revogar motor desativa origens e destinos e bloqueia reativação", async () => {
    await action("revoke_engine", { connection_id: connection });
    expect(
      await scalar<number>(
        "select count(*)::int as result from public.groups where is_source or is_destination",
      ),
    ).toBe(0);
    await expect(
      action("set_groups", { groups: [{ id: source, is_source: true, is_destination: false }] }),
    ).rejects.toThrow("Conexão revogada");
    await expect(
      action("set_groups", {
        groups: [{ id: destination, is_source: false, is_destination: true }],
      }),
    ).rejects.toThrow("Conexão revogada");
  });
  it("enqueue bloqueia destino revogado mesmo com flag ativa legada", async () => {
    await action("revoke_engine", { connection_id: connection });
    await db.query("update public.groups set is_destination=true where id=$1", [destination]);
    await expect(enqueue()).rejects.toThrow("Destino inválido");
    expect(await scalar<number>("select count(*)::int as result from public.publications")).toBe(0);
  });
  it("revogação após claim impede begin_send", async () => {
    await enqueue();
    const job = await engine("claim");
    await action("revoke_engine", { connection_id: connection });
    await expect(
      engine("begin_send", { id: job?.["id"], lease_token: job?.["lease_token"] }),
    ).rejects.toThrow("Credencial inválida ou revogada");
    expect(await scalar<string>("select status as result from public.publications")).toBe(
      "cancelled",
    );
  });
  it("capture_error audita somente identificador e código, sem conteúdo", async () => {
    await engine("capture_error", {
      message_hash: "a".repeat(80),
      text: "CONTEÚDO PRIVADO",
      images: ["segredo"],
      message_id: "identificador privado",
    });
    expect(
      await scalar<Record<string, unknown>>(
        "select details as result from public.audit where event='capture.failed'",
      ),
    ).toEqual({ message_hash: "a".repeat(64), code: "permanent_rejection" });
    expect(await scalar<number>("select count(*)::int as result from public.offers")).toBe(1);
  });
  it("capture_error exige lease válida com código de autorização", async () => {
    await db.exec("update public.connections set instance_until=now()-interval '1 second'");
    await expect(engine("capture_error", { message_hash: "b".repeat(64) })).rejects.toMatchObject({
      code: "42501",
    });
    expect(
      await scalar<number>(
        "select count(*)::int as result from public.audit where event='capture.failed'",
      ),
    ).toBe(0);
  });
  it("revalida token após locks e não executa heartbeat se segunda validação falhar", async () => {
    // Isolated failure injection models a credential revoked while locks were awaited.
    await db.exec(`alter function public.engine_context(text) rename to test_original_context;
      create sequence public.test_context_calls;
      create function public.engine_context(p_token text) returns jsonb language plpgsql as $$
      begin
        if nextval('public.test_context_calls')>1 then raise exception 'Credencial revogada após lock' using errcode='42501'; end if;
        return public.test_original_context(p_token);
      end $$;`);
    try {
      await expect(engine("heartbeat", { status: "disconnected" })).rejects.toThrow(
        "Credencial revogada após lock",
      );
      expect(await scalar<string>("select status as result from public.connections")).toBe(
        "connected",
      );
      expect(
        await scalar<number>("select last_value::int as result from public.test_context_calls"),
      ).toBe(2);
    } finally {
      await db.exec(
        "drop function public.engine_context(text); alter function public.test_original_context(text) rename to engine_context; drop sequence public.test_context_calls;",
      );
    }
  });
  it("snapshot de viewer oculta QR, instância e lease de publicação", async () => {
    await enqueue();
    await engine("claim");
    await db.query(
      "update public.connections set qr='QR PRIVADO',qr_expires_at=now()+interval '30 seconds' where id=$1",
      [connection],
    );
    await db.query("insert into public.members values($1,$2,'viewer')", [company, other]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    const snapshot = await scalar<{
      connections: Record<string, unknown>[];
      publications: Record<string, unknown>[];
      members: unknown[];
    }>("select public.app_snapshot($1) as result", [company]);
    expect(snapshot.connections[0]?.["qr"]).toBeNull();
    expect(snapshot.connections[0]).not.toHaveProperty("instance_id");
    expect(snapshot.publications[0]).not.toHaveProperty("lease_token");
    expect(snapshot.members).toEqual([]);
  });
});
