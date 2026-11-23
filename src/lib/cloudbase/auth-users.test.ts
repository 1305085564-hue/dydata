import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION_SQL = readFileSync(join(process.cwd(), "supabase/migrations/20261123210000_cloudbase_auth_users_last_login.sql"), "utf8");
const SUBJECT_ONE = "11111111-1111-4111-8111-111111111111";
const SUBJECT_TWO = "22222222-2222-4222-8222-222222222222";
const SUBJECT_THREE = "33333333-3333-4333-8333-333333333333";

async function createDb() {
  const db = new PGlite("memory://");
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('test.auth_role', true), ''), 'service_role');
    $$;
    CREATE TABLE auth.users (
      id bigint PRIMARY KEY,
      sub text,
      email text,
      phone_number text,
      status smallint,
      raw_app_meta_data jsonb,
      name text,
      last_login timestamptz,
      created_at timestamptz,
      updated_at timestamptz
    );
    INSERT INTO auth.users (
      id, sub, email, phone_number, status, raw_app_meta_data, name, last_login, created_at, updated_at
    ) VALUES
      (2, '${SUBJECT_TWO}', 'two@example.com', '+2', 3, '{"source":"test"}', '二号', NULL, '2026-01-02T00:00:00Z', '2026-11-02T00:00:00Z'),
      (1, '${SUBJECT_ONE}', 'one@example.com', NULL, 1, NULL, '一号', '2026-11-23T12:34:56Z', '2026-01-01T00:00:00Z', '2026-11-01T00:00:00Z'),
      (3, '${SUBJECT_THREE}', 'three@example.com', NULL, 1, NULL, NULL, NULL, '2026-01-03T00:00:00Z', '2026-11-03T00:00:00Z');
  `);
  await db.exec(MIGRATION_SQL);
  return db;
}

function userById(payload: Record<string, unknown>, id: string) {
  const users = payload.users as Array<Record<string, unknown>>;
  return users.find((user) => user.id === id);
}

test("Auth 用户分页返回 last_sign_in_at 并保持字段、排序与分页边界", async () => {
  const db = await createDb();
  try {
    const result = await db.query<{ payload: Record<string, unknown> }>(
      "SELECT public.cloudbase_auth_users_page($1, $2) AS payload",
      [1, 2],
    );
    const payload = result.rows[0]?.payload;
    assert.equal(payload?.total, 3);
    assert.equal(payload?.page, 1);
    assert.equal(payload?.per_page, 2);
    const pageUsers = payload?.users as Array<Record<string, unknown>>;
    assert.deepEqual(pageUsers.map((user) => user.id), [SUBJECT_ONE, SUBJECT_TWO]);

    const first = userById(payload!, SUBJECT_ONE);
    const second = userById(payload!, SUBJECT_TWO);
    assert.ok(first);
    assert.ok(second);
    assert.equal(new Date(String(first.last_sign_in_at)).toISOString(), "2026-11-23T12:34:56.000Z");
    assert.equal(second.last_sign_in_at, null);
    assert.equal(first.banned_until, null);
    assert.equal(second.banned_until, "infinity");
    assert.deepEqual(first.user_metadata, { full_name: "一号" });
    assert.deepEqual(second.user_metadata, { full_name: "二号" });
    assert.deepEqual(first.app_metadata, {});
    assert.deepEqual(second.app_metadata, { source: "test" });
    assert.equal(first.email, "one@example.com");
    assert.equal(first.phone, null);
    assert.equal(second.email, "two@example.com");
    assert.equal(second.phone, "+2");
    assert.equal(new Date(String(first.created_at)).toISOString(), "2026-01-01T00:00:00.000Z");
    assert.equal(new Date(String(first.updated_at)).toISOString(), "2026-11-01T00:00:00.000Z");

    const clamped = await db.query<{ payload: Record<string, unknown> }>(
      "SELECT public.cloudbase_auth_users_page($1, $2) AS payload",
      [0, 500],
    );
    assert.equal(clamped.rows[0]?.payload.page, 1);
    assert.equal(clamped.rows[0]?.payload.per_page, 200);
    const defaults = await db.query<{ payload: Record<string, unknown> }>("SELECT public.cloudbase_auth_users_page() AS payload");
    assert.equal(defaults.rows[0]?.payload.page, 1);
    assert.equal(defaults.rows[0]?.payload.per_page, 50);

    const secondPage = await db.query<{ payload: Record<string, unknown> }>(
      "SELECT public.cloudbase_auth_users_page($1, $2) AS payload",
      [2, 2],
    );
    const pageTwo = secondPage.rows[0]?.payload;
    assert.deepEqual((pageTwo?.users as Array<Record<string, unknown>>).map((user) => user.id), [SUBJECT_THREE]);
    assert.equal(pageTwo?.page, 2);
    assert.equal(pageTwo?.per_page, 2);
  } finally {
    await db.close();
  }
});

test("Auth 用户按 subject 命中返回最近登录时间，未命中返回 null", async () => {
  const db = await createDb();
  try {
    const hit = await db.query<{ payload: Record<string, unknown> }>(
      "SELECT public.cloudbase_auth_user_by_subject($1) AS payload",
      [SUBJECT_ONE],
    );
    assert.equal(hit.rows[0]?.payload.id, SUBJECT_ONE);
    assert.equal(new Date(String(hit.rows[0]?.payload.last_sign_in_at)).toISOString(), "2026-11-23T12:34:56.000Z");

    const miss = await db.query<{ payload: Record<string, unknown> | null }>(
      "SELECT public.cloudbase_auth_user_by_subject($1) AS payload",
      ["99999999-9999-4999-8999-999999999999"],
    );
    assert.equal(miss.rows[0]?.payload, null);
  } finally {
    await db.close();
  }
});

test("Auth 用户读取 RPC 仅允许 service_role，匿名与登录用户均被拒绝", async () => {
  const db = await createDb();
  try {
    const grants = await db.query<{ page_service: boolean; user_service: boolean; page_anon: boolean; page_authenticated: boolean; user_anon: boolean; user_authenticated: boolean }>(
      `SELECT
        has_function_privilege('service_role', 'public.cloudbase_auth_users_page(integer,integer)', 'EXECUTE') AS page_service,
        has_function_privilege('service_role', 'public.cloudbase_auth_user_by_subject(text)', 'EXECUTE') AS user_service,
        has_function_privilege('anon', 'public.cloudbase_auth_users_page(integer,integer)', 'EXECUTE') AS page_anon,
        has_function_privilege('authenticated', 'public.cloudbase_auth_users_page(integer,integer)', 'EXECUTE') AS page_authenticated,
        has_function_privilege('anon', 'public.cloudbase_auth_user_by_subject(text)', 'EXECUTE') AS user_anon,
        has_function_privilege('authenticated', 'public.cloudbase_auth_user_by_subject(text)', 'EXECUTE') AS user_authenticated`,
    );
    assert.deepEqual(grants.rows[0], {
      page_service: true,
      user_service: true,
      page_anon: false,
      page_authenticated: false,
      user_anon: false,
      user_authenticated: false,
    });

    for (const role of ["authenticated", "anon"]) {
      await db.exec(`SELECT set_config('test.auth_role', '${role}', false);`);
      await assert.rejects(
        () => db.query("SELECT public.cloudbase_auth_users_page($1, $2)", [1, 2]),
        (error: unknown) => (error as { code?: string }).code === "42501" && /service role required/.test(String(error)),
      );
      await assert.rejects(
        () => db.query("SELECT public.cloudbase_auth_user_by_subject($1)", [SUBJECT_ONE]),
        (error: unknown) => (error as { code?: string }).code === "42501" && /service role required/.test(String(error)),
      );
    }
  } finally {
    await db.close();
  }
});
