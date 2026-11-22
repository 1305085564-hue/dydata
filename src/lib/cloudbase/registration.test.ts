import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

import { createCloudBaseBrowserAuth } from "./auth-client";
import {
  registerCloudBaseEmployee,
  rollbackCloudBaseEmployee,
  type CloudBaseRegistrationRpcClient,
} from "./registration";

const MIGRATION_PATH = join(
  process.cwd(),
  "supabase/migrations/20261123010000_cloudbase_employee_registration.sql",
);
const MIGRATION_SQL = readFileSync(MIGRATION_PATH, "utf8");
const PROJECT_ID = "dydata-d6g0gd1v37fcddf21";
const TEAM_ID = "11111111-1111-4111-8111-111111111111";

async function createRegistrationDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;

    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('test.auth_role', true), ''), 'service_role');
    $$;

    -- PGlite 默认不内置 pgcrypto；用与 CloudBase 实测一致的 60 字节 $2a$10$ 格式校验编码链路。
    CREATE FUNCTION public.gen_salt(kind text, rounds integer) RETURNS text LANGUAGE plpgsql AS $$
    BEGIN
      IF kind <> 'bf' OR rounds <> 10 THEN
        RAISE EXCEPTION 'unexpected salt parameters';
      END IF;
      RETURN '$2a$10$0123456789012345678901';
    END;
    $$;

    CREATE FUNCTION public.crypt(plain text, salt text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT salt || left(md5(plain || salt), 31);
    $$;

    CREATE TABLE auth.users (
      id bigserial PRIMARY KEY,
      project varchar(64) NOT NULL,
      sub varchar(255),
      name varchar(255),
      username varchar(64),
      email varchar(512),
      email_verified boolean,
      password varchar(255),
      status smallint,
      providers jsonb,
      type varchar(64),
      created_at timestamptz,
      updated_at timestamptz
    );
    CREATE UNIQUE INDEX idx_users_project_sub ON auth.users (project, sub);
    CREATE UNIQUE INDEX idx_users_project_username ON auth.users (project, username);
    CREATE INDEX idx_users_project_email ON auth.users (project, email);

    CREATE TABLE public.teams (
      id uuid PRIMARY KEY,
      name text NOT NULL
    );

    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      role text NOT NULL DEFAULT 'member',
      team_id uuid REFERENCES public.teams(id),
      permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL DEFAULT 'active',
      membership_status text NOT NULL DEFAULT 'active',
      company_role text NOT NULL DEFAULT 'member',
      data_scope text NOT NULL DEFAULT 'self',
      created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
    );

    CREATE TABLE public.accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id uuid NOT NULL REFERENCES public.profiles(id),
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
    );

    CREATE TABLE public.team_join_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      applicant_user_id uuid NOT NULL REFERENCES public.profiles(id),
      target_team_id uuid NOT NULL REFERENCES public.teams(id),
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
    );

    INSERT INTO public.teams (id, name) VALUES ('${TEAM_ID}', '测试一队');
  `);

  await db.exec(MIGRATION_SQL);
  return db;
}

test("迁移 SQL 包含密码格式降级提示与最小权限收口", () => {
  assert.match(MIGRATION_SQL, /依赖腾讯云内部密码存储格式；如果自检开始失败，改用官方 CreateUser（方案 B）/);
  assert.match(
    MIGRATION_SQL,
    /REVOKE ALL PRIVILEGES ON FUNCTION public\.cloudbase_register_employee\(text, text, text, text, uuid\)\s+FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    MIGRATION_SQL,
    /GRANT EXECUTE ON FUNCTION public\.cloudbase_register_employee\(text, text, text, text, uuid\)\s+TO service_role/i,
  );
  assert.match(
    MIGRATION_SQL,
    /REVOKE ALL PRIVILEGES ON FUNCTION public\.cloudbase_rollback_registered_employee\(text, uuid, text\)\s+FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    MIGRATION_SQL,
    /GRANT EXECUTE ON FUNCTION public\.cloudbase_rollback_registered_employee\(text, uuid, text\)\s+TO service_role/i,
  );
});

test("SQL 实测：正常注册单事务写入账号、员工资料、默认看板账号和待批入团申请", async () => {
  const db = await createRegistrationDb();
  try {
    const result = await db.query<{ payload: { ok: boolean; user_id: string; email: string } }>(
      `SELECT public.cloudbase_register_employee($1, $2, $3, $4, $5::uuid) AS payload`,
      [PROJECT_ID, "  NewUser@Example.COM ", "pass123456", "小陈", TEAM_ID],
    );
    const payload = result.rows[0]?.payload;
    assert.equal(payload?.ok, true);
    assert.equal(payload?.email, "newuser@example.com");
    assert.match(payload?.user_id ?? "", /^[0-9a-f-]{36}$/i);

    const authRows = await db.query<{
      project: string;
      sub: string;
      username: string;
      email: string;
      status: number;
      email_verified: boolean;
      type: string;
      password_len: number;
      decoded_prefix: string;
    }>(
      `SELECT project, sub, username, email, status, email_verified, type,
              length(password) AS password_len,
              left(convert_from(decode(password, 'base64'), 'UTF8'), 7) AS decoded_prefix
       FROM auth.users`,
    );
    assert.equal(authRows.rows.length, 1);
    assert.deepEqual(authRows.rows[0], {
      project: PROJECT_ID,
      sub: payload.user_id,
      username: "newuser@example.com",
      email: "newuser@example.com",
      status: 1,
      email_verified: true,
      type: "external",
      password_len: 80,
      decoded_prefix: "$2a$10$",
    });

    const profileRows = await db.query<{
      id: string;
      name: string;
      role: string;
      team_id: string | null;
      membership_status: string;
      company_role: string;
      permissions: Record<string, unknown>;
    }>(`SELECT id, name, role, team_id, membership_status, company_role, permissions FROM public.profiles`);
    assert.equal(profileRows.rows.length, 1);
    assert.deepEqual(profileRows.rows[0], {
      id: payload.user_id,
      name: "小陈",
      role: "member",
      team_id: null,
      membership_status: "active",
      company_role: "member",
      permissions: {},
    });

    const accountRows = await db.query<{ profile_id: string; name: string }>(
      `SELECT profile_id, name FROM public.accounts`,
    );
    assert.deepEqual(accountRows.rows, [{ profile_id: payload.user_id, name: "小陈" }]);

    const joinRows = await db.query<{ applicant_user_id: string; target_team_id: string; status: string }>(
      `SELECT applicant_user_id, target_team_id, status FROM public.team_join_requests`,
    );
    assert.deepEqual(joinRows.rows, [{
      applicant_user_id: payload.user_id,
      target_team_id: TEAM_ID,
      status: "pending",
    }]);
  } finally {
    await db.close();
  }
});

test("SQL 实测：同邮箱重复注册（含大小写差异）拒绝且绝不建出两个账号", async () => {
  const db = await createRegistrationDb();
  try {
    const first = await db.query<{ payload: { ok: boolean } }>(
      `SELECT public.cloudbase_register_employee($1, $2, $3, $4, $5::uuid) AS payload`,
      [PROJECT_ID, "dup@example.com", "pass123456", "小陈", TEAM_ID],
    );
    assert.equal(first.rows[0]?.payload.ok, true);

    const second = await db.query<{ payload: { ok: boolean; code: string } }>(
      `SELECT public.cloudbase_register_employee($1, $2, $3, $4, $5::uuid) AS payload`,
      [PROJECT_ID, "DUP@example.com", "another123", "小陈", TEAM_ID],
    );
    assert.equal(second.rows[0]?.payload.ok, false);
    assert.equal(second.rows[0]?.payload.code, "email_already_exists");

    const counts = await db.query<{ auth_cnt: number; profile_cnt: number; account_cnt: number; join_cnt: number }>(`
      SELECT
        (SELECT count(*)::int FROM auth.users) AS auth_cnt,
        (SELECT count(*)::int FROM public.profiles) AS profile_cnt,
        (SELECT count(*)::int FROM public.accounts) AS account_cnt,
        (SELECT count(*)::int FROM public.team_join_requests) AS join_cnt
    `);
    assert.deepEqual(counts.rows[0], { auth_cnt: 1, profile_cnt: 1, account_cnt: 1, join_cnt: 1 });
  } finally {
    await db.close();
  }
});

test("SQL 实测：建号成功但写员工资料失败时整笔回滚，不留半截账号", async () => {
  const db = await createRegistrationDb();
  try {
    await db.exec(`
      CREATE FUNCTION public.fail_profile_insert_for_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'simulated profile insert failure';
      END;
      $$;
      CREATE TRIGGER fail_profile_insert_for_test
        BEFORE INSERT ON public.profiles
        FOR EACH ROW
        EXECUTE FUNCTION public.fail_profile_insert_for_test();
    `);

    await assert.rejects(
      () => db.query(
        `SELECT public.cloudbase_register_employee($1, $2, $3, $4, $5::uuid)`,
        [PROJECT_ID, "atomic@example.com", "pass123456", "小陈", TEAM_ID],
      ),
      /simulated profile insert failure/,
    );

    const counts = await db.query<{ auth_cnt: number; profile_cnt: number; account_cnt: number; join_cnt: number }>(`
      SELECT
        (SELECT count(*)::int FROM auth.users) AS auth_cnt,
        (SELECT count(*)::int FROM public.profiles) AS profile_cnt,
        (SELECT count(*)::int FROM public.accounts) AS account_cnt,
        (SELECT count(*)::int FROM public.team_join_requests) AS join_cnt
    `);
    assert.deepEqual(counts.rows[0], { auth_cnt: 0, profile_cnt: 0, account_cnt: 0, join_cnt: 0 });
  } finally {
    await db.close();
  }
});

test("SQL 实测：自检失败回滚删除刚建账号和资料，且拒绝误删已入团老员工", async () => {
  const db = await createRegistrationDb();
  try {
    const created = await db.query<{ payload: { ok: boolean; user_id: string; email: string } }>(
      `SELECT public.cloudbase_register_employee($1, $2, $3, $4, $5::uuid) AS payload`,
      [PROJECT_ID, "rollback@example.com", "pass123456", "小陈", TEAM_ID],
    );
    const { user_id: userId, email } = created.rows[0].payload;

    const rolledBack = await db.query<{ payload: { ok: boolean; deleted_auth: number; deleted_profile: number } }>(
      `SELECT public.cloudbase_rollback_registered_employee($1, $2::uuid, $3) AS payload`,
      [PROJECT_ID, userId, email],
    );
    assert.deepEqual(rolledBack.rows[0]?.payload, { ok: true, deleted_auth: 1, deleted_profile: 1 });

    const counts = await db.query<{ auth_cnt: number; profile_cnt: number; account_cnt: number; join_cnt: number }>(`
      SELECT
        (SELECT count(*)::int FROM auth.users) AS auth_cnt,
        (SELECT count(*)::int FROM public.profiles) AS profile_cnt,
        (SELECT count(*)::int FROM public.accounts) AS account_cnt,
        (SELECT count(*)::int FROM public.team_join_requests) AS join_cnt
    `);
    assert.deepEqual(counts.rows[0], { auth_cnt: 0, profile_cnt: 0, account_cnt: 0, join_cnt: 0 });

    // 已有团队归属的员工绝不能被回滚函数删除
    const assigned = await db.query<{ payload: { ok: boolean; user_id: string; email: string } }>(
      `SELECT public.cloudbase_register_employee($1, $2, $3, $4, $5::uuid) AS payload`,
      [PROJECT_ID, "assigned@example.com", "pass123456", "老陈", TEAM_ID],
    );
    const assignedId = assigned.rows[0].payload.user_id;
    await db.query(`UPDATE public.profiles SET team_id = $1::uuid WHERE id = $2::uuid`, [TEAM_ID, assignedId]);

    const denied = await db.query<{ payload: { ok: boolean; code: string } }>(
      `SELECT public.cloudbase_rollback_registered_employee($1, $2::uuid, $3) AS payload`,
      [PROJECT_ID, assignedId, "assigned@example.com"],
    );
    assert.equal(denied.rows[0]?.payload.ok, false);
    assert.equal(denied.rows[0]?.payload.code, "not_rollback_eligible");

    const remaining = await db.query<{ cnt: number }>(`SELECT count(*)::int AS cnt FROM auth.users WHERE sub = $1`, [assignedId]);
    assert.equal(remaining.rows[0]?.cnt, 1);
  } finally {
    await db.close();
  }
});

test("SQL 实测：非 service_role 调用注册或回滚函数直接拒绝", async () => {
  const db = await createRegistrationDb();
  try {
    await db.exec(`SELECT set_config('test.auth_role', 'authenticated', false);`);
    await assert.rejects(
      () => db.query(
        `SELECT public.cloudbase_register_employee($1, $2, $3, $4, $5::uuid)`,
        [PROJECT_ID, "user@example.com", "pass123456", "小陈", TEAM_ID],
      ),
      /service role required/,
    );
    await assert.rejects(
      () => db.query(
        `SELECT public.cloudbase_rollback_registered_employee($1, $2::uuid, $3)`,
        [PROJECT_ID, TEAM_ID, "user@example.com"],
      ),
      /service role required/,
    );
  } finally {
    await db.close();
  }
});

test("registerCloudBaseEmployee 与 rollbackCloudBaseEmployee 正确映射成功与错误码", async () => {
  const successClient: CloudBaseRegistrationRpcClient = {
    rpc: async () => ({
      data: { ok: true, user_id: "22222222-2222-4222-8222-222222222222", email: "a@example.com" },
      error: null,
    }),
  };
  assert.deepEqual(
    await registerCloudBaseEmployee(successClient, {
      project: PROJECT_ID,
      email: "a@example.com",
      password: "secret",
      name: "小陈",
      teamId: TEAM_ID,
    }),
    { ok: true, userId: "22222222-2222-4222-8222-222222222222", email: "a@example.com" },
  );

  const duplicateClient: CloudBaseRegistrationRpcClient = {
    rpc: async () => ({ data: { ok: false, code: "email_already_exists", detail: "duplicate_email" }, error: null }),
  };
  assert.deepEqual(
    await registerCloudBaseEmployee(duplicateClient, {
      project: PROJECT_ID,
      email: "a@example.com",
      password: "secret",
      name: "小陈",
      teamId: TEAM_ID,
    }),
    { ok: false, code: "email_already_exists", detail: "duplicate_email" },
  );

  const errorClient: CloudBaseRegistrationRpcClient = {
    rpc: async () => ({ data: null, error: { code: "PGRST202", message: "function not found" } }),
  };
  assert.deepEqual(
    await registerCloudBaseEmployee(errorClient, {
      project: PROJECT_ID,
      email: "a@example.com",
      password: "secret",
      name: "小陈",
      teamId: TEAM_ID,
    }),
    { ok: false, code: "account_create_failed", detail: "PGRST202:function not found" },
  );

  const rollbackOk: CloudBaseRegistrationRpcClient = {
    rpc: async () => ({ data: { ok: true, deleted_auth: 1, deleted_profile: 1 }, error: null }),
  };
  assert.deepEqual(
    await rollbackCloudBaseEmployee(rollbackOk, {
      project: PROJECT_ID,
      userId: "22222222-2222-4222-8222-222222222222",
      email: "a@example.com",
    }),
    { ok: true },
  );

  const rollbackFail: CloudBaseRegistrationRpcClient = {
    rpc: async () => ({ data: { ok: false, code: "not_rollback_eligible", detail: "auth_user_not_matched" }, error: null }),
  };
  assert.deepEqual(
    await rollbackCloudBaseEmployee(rollbackFail, {
      project: PROJECT_ID,
      userId: "22222222-2222-4222-8222-222222222222",
      email: "a@example.com",
    }),
    { ok: false, detail: "auth_user_not_matched" },
  );
});

test("浏览器端 CloudBase Auth 保持禁止直接注册，建号唯一出口在服务端", async () => {
  const result = await createCloudBaseBrowserAuth().signUp();
  assert.equal(result.data, null);
  assert.equal(result.error?.code, "unsupported_operation");
});

test("SQL 真实字段长度边界：64 字符邮箱通过，65 字符邮箱/项目与 101 字符姓名拦截且无残留", async () => {
  const db = await createRegistrationDb();
  try {
    const email64 = `${"a".repeat(52)}@example.com`;
    assert.equal(email64.length, 64);

    const okRes = await db.query<{ res: Record<string, unknown> }>(
      "SELECT public.cloudbase_register_employee($1, $2, $3, $4, $5) AS res",
      [PROJECT_ID, email64, "secret123", "陈".repeat(100), TEAM_ID],
    );
    assert.equal(okRes.rows[0].res.ok, true);
    assert.equal(okRes.rows[0].res.email, email64);

    const email65 = `${"a".repeat(53)}@example.com`;
    assert.equal(email65.length, 65);
    const badEmailRes = await db.query<{ res: Record<string, unknown> }>(
      "SELECT public.cloudbase_register_employee($1, $2, $3, $4, $5) AS res",
      [PROJECT_ID, email65, "secret123", "小陈", TEAM_ID],
    );
    assert.deepEqual(badEmailRes.rows[0].res, {
      ok: false,
      code: "invalid_input",
      detail: "invalid_email",
    });

    const badProjectRes = await db.query<{ res: Record<string, unknown> }>(
      "SELECT public.cloudbase_register_employee($1, $2, $3, $4, $5) AS res",
      ["p".repeat(65), "other@example.com", "secret123", "小陈", TEAM_ID],
    );
    assert.deepEqual(badProjectRes.rows[0].res, {
      ok: false,
      code: "invalid_input",
      detail: "invalid_project",
    });

    const badNameRes = await db.query<{ res: Record<string, unknown> }>(
      "SELECT public.cloudbase_register_employee($1, $2, $3, $4, $5) AS res",
      [PROJECT_ID, "other2@example.com", "secret123", "陈".repeat(101), TEAM_ID],
    );
    assert.deepEqual(badNameRes.rows[0].res, {
      ok: false,
      code: "invalid_input",
      detail: "invalid_name",
    });

    const counts = await db.query<{ users: string; profiles: string }>(
      "SELECT (SELECT count(*)::text FROM auth.users) AS users, (SELECT count(*)::text FROM public.profiles) AS profiles",
    );
    assert.deepEqual(counts.rows[0], { users: "1", profiles: "1" });
  } finally {
    await db.close();
  }
});
