// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("migração incremental preserva empresa existente e produz funções do contrato final", async () => {
  const existing = new PGlite();
  const final = new PGlite();
  const setup = `create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create schema storage; create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);`;
  try {
    await existing.exec(setup);
    await final.exec(setup);
    await existing.exec(readFileSync("drizzle/migrations/0000_ofertabot_backend.sql", "utf8"));
    await existing.exec(
      "insert into public.companies(id,name) values('00000000-0000-4000-8000-000000000099','Empresa preservada')",
    );
    await existing.exec(
      readFileSync("drizzle/migrations/0001_ofertabot_final_backend_revision.sql", "utf8"),
    );
    await final.exec(readFileSync("supabase/schema.sql", "utf8"));
    const rows = await existing.query<{ name: string }>("select name from public.companies");
    expect(rows.rows).toEqual([{ name: "Empresa preservada" }]);
    for (const name of ["app_action", "engine_call"]) {
      const sql =
        "select prosrc as body from pg_proc where pronamespace='public'::regnamespace and proname=$1";
      const oldBody = await existing.query<{ body: string }>(sql, [name]);
      const finalBody = await final.query<{ body: string }>(sql, [name]);
      expect(oldBody.rows[0]?.body).toBe(finalBody.rows[0]?.body);
    }
  } finally {
    await existing.close();
    await final.close();
  }
}, 30000);
