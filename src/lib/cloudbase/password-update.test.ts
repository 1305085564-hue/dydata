import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION_SQL = readFileSync(join(process.cwd(), "supabase/migrations/20261123160000_cloudbase_password_update.sql"), "utf8");
const PROJECT = "dydata-test";
const SUBJECT = "11111111-1111-4111-8111-111111111111";

async function createDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('test.auth_role', true), ''), 'service_role');
    $$;
    CREATE FUNCTION public.gen_salt(kind text, rounds integer) RETURNS text LANGUAGE plpgsql AS $$
    BEGIN
      IF kind <> 'bf' OR rounds <> 10 THEN RAISE EXCEPTION 'unexpected salt'; END IF;
      RETURN '$2a$10$0123456789012345678901';
    END;
    $$;
    CREATE FUNCTION public.crypt(plain text, salt text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT left(salt, 29) || left(md5(plain || left(salt, 29)), 31);
    $$;
    CREATE TABLE auth.users (
      id bigserial PRIMARY KEY, project text NOT NULL, sub text, password text,
      status smallint, updated_at timestamptz
    );
    CREATE TABLE public.profiles (id uuid PRIMARY KEY);
    CREATE TABLE public.audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
      action text NOT NULL, target text NOT NULL, detail text, created_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public.profiles (id) VALUES ('${SUBJECT}');
    INSERT INTO auth.users (project, sub, password, status, updated_at)
    VALUES ('${PROJECT}', '${SUBJECT}', replace(encode(convert_to(public.crypt('old-pass', public.gen_salt('bf', 10)), 'UTF8'), 'base64'), chr(10), ''), 1, '2000-01-01T00:00:00Z');
  `);
  await db.exec(MIGRATION_SQL);
  return db;
}

async function password(db: PGlite, subject = SUBJECT) {
  const row = await db.query<{ password: string }>("SELECT password FROM auth.users WHERE sub = $1", [subject]);
  return row.rows[0]?.password;
}

test("管理员改密成功且新密码哈希可校验", async () => {
  const db = await createDb();
  try {
    const result = await db.query<{ payload: { ok: boolean; subject: string } }>(
      "SELECT public.cloudbase_set_auth_user_password($1, $2, $3) AS payload", [SUBJECT, "new-pass", PROJECT],
    );
    assert.deepEqual(result.rows[0]?.payload, { ok: true, subject: SUBJECT });
    const stored = await password(db);
    assert.equal((await db.query<{ ok: boolean }>("SELECT public.crypt($1, convert_from(decode($2, 'base64'), 'UTF8')) = convert_from(decode($2, 'base64'), 'UTF8') AS ok", ["new-pass", stored])).rows[0]?.ok, true);
    const updatedAt = await db.query<{ updated_at: string }>("SELECT updated_at::text FROM auth.users WHERE sub = $1", [SUBJECT]);
    assert.notEqual(updatedAt.rows[0]?.updated_at, "2000-01-01 00:00:00+00");
  } finally { await db.close(); }
});

test("本人旧密码正确改密成功并写入审计，旧密码错误不改原值", async () => {
  const db = await createDb();
  try {
    const ok = await db.query<{ payload: { ok: boolean } }>("SELECT public.cloudbase_change_own_password($1, $2, $3, $4) AS payload", [SUBJECT, "old-pass", "next-pass", PROJECT]);
    assert.equal(ok.rows[0]?.payload.ok, true);
    assert.equal((await db.query<{ ok: boolean }>("SELECT public.crypt('next-pass', convert_from(decode(password, 'base64'), 'UTF8')) = convert_from(decode(password, 'base64'), 'UTF8') AS ok FROM auth.users WHERE sub = $1", [SUBJECT])).rows[0]?.ok, true);
    const before = await password(db);
    const bad = await db.query<{ payload: { ok: boolean; code: string } }>("SELECT public.cloudbase_change_own_password($1, $2, $3, $4) AS payload", [SUBJECT, "wrong-pass", "third-pass", PROJECT]);
    assert.deepEqual(bad.rows[0]?.payload, { ok: false, code: "invalid_old_password" });
    assert.equal(await password(db), before);
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.audit_logs WHERE action = 'change_own_password'")).rows[0]?.count, 1);
  } finally { await db.close(); }
});

test("禁用或不存在用户拒绝，非 service_role 不可调用", async () => {
  const db = await createDb();
  try {
    await db.query("UPDATE auth.users SET status = 3 WHERE sub = $1", [SUBJECT]);
    assert.deepEqual((await db.query<{ payload: { code: string } }>("SELECT public.cloudbase_set_auth_user_password($1, $2, $3) AS payload", [SUBJECT, "new-pass", PROJECT])).rows[0]?.payload, { code: "account_disabled", ok: false });
    assert.deepEqual((await db.query<{ payload: { code: string } }>("SELECT public.cloudbase_set_auth_user_password($1, $2, $3) AS payload", ["22222222-2222-4222-8222-222222222222", "new-pass", PROJECT])).rows[0]?.payload, { code: "user_not_found", ok: false });
    assert.deepEqual((await db.query<{ payload: { code: string } }>("SELECT public.cloudbase_change_own_password($1, $2, $3, $4) AS payload", [SUBJECT, "old-pass", "next-pass", PROJECT])).rows[0]?.payload, { ok: false, code: "account_disabled" });
    assert.deepEqual((await db.query<{ payload: { code: string } }>("SELECT public.cloudbase_change_own_password($1, $2, $3, $4) AS payload", ["22222222-2222-4222-8222-222222222222", "old-pass", "next-pass", PROJECT])).rows[0]?.payload, { ok: false, code: "user_not_found" });
    await db.exec("SELECT set_config('test.auth_role', 'authenticated', false);");
    await assert.rejects(() => db.query("SELECT public.cloudbase_set_auth_user_password($1, $2, $3)", [SUBJECT, "new-pass", PROJECT]), /service role required/);
    await assert.rejects(() => db.query("SELECT public.cloudbase_change_own_password($1, $2, $3, $4)", [SUBJECT, "old-pass", "next-pass", PROJECT]), /service role required/);
    const grants = await db.query<{ setter: boolean; changer: boolean }>("SELECT has_function_privilege('anon', 'public.cloudbase_set_auth_user_password(text,text,text)', 'EXECUTE') AS setter, has_function_privilege('authenticated', 'public.cloudbase_change_own_password(text,text,text,text)', 'EXECUTE') AS changer");
    assert.deepEqual(grants.rows[0], { setter: false, changer: false });
  } finally { await db.close(); }
});
