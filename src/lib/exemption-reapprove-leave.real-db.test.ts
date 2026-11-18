import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { parse } from "dotenv";

const { Client } = createRequire(import.meta.url)("pg");

// 豁免审批真实库验收（20261118120000）：
// 1. 批准 → 打回 → 再批准，必须重新产生生效授权，履约不能回到"未确认"；
// 2. 已批准的请假在发布履约里返回 leave，免交返回 exempted。
// 全部在一个事务里跑完回滚，不留数据。

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const env = parse(readFileSync(".env.ai-test.local"));

async function inTransaction(body: (db: Db) => Promise<void>) {
  const url = new URL(env.SUPABASE_DB_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "只允许本机测试库");
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    await db.query("begin");
    await body(db);
  } finally {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  }
}

async function seed(db: Db, category: "leave" | "waive") {
  const adminId = randomUUID();
  const memberId = randomUUID();
  const teamId = randomUUID();
  const requestId = randomUUID();
  await db.query("insert into auth.users(id) values ($1), ($2)", [adminId, memberId]);
  await db.query("insert into public.teams(id, name) values ($1, $2)", [teamId, `t-${teamId.slice(0, 8)}`]);
  await db.query(
    `insert into public.profiles(id, name, role, company_role, team_id, created_at) values
       ($1, '审批人', 'owner', 'company_owner', $3, current_date - 30),
       ($2, '申请人', 'member', 'member', $3, current_date - 30)
     on conflict (id) do update set role = excluded.role, company_role = excluded.company_role,
       team_id = excluded.team_id, created_at = excluded.created_at`,
    [adminId, memberId, teamId],
  );
  await db.query(
    `insert into public.exemption_request(id, applicant_user_id, profile_id, team_id, exemption_type, exemption_category, start_date, end_date, reason)
     values ($1, $2, $2, $3, 'single', $4, current_date - 2, current_date - 2, '真实库验收')`,
    [requestId, memberId, teamId, category],
  );
  await db.query(
    "insert into public.exemption_request_date(request_id, request_date, reason, status) values ($1, current_date - 2, '真实库验收', 'pending')",
    [requestId],
  );
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [adminId]);
  return { memberId, requestId };
}

async function approve(db: Db, requestId: string) {
  await db.query("select public.review_exemption_request_dates_atomically($1::uuid, 'approved', null::date[], null::text)", [requestId]);
}

async function dayStatus(db: Db, memberId: string) {
  const { rows } = await db.query(
    "select status from public.get_fulfillment_range(current_date - 2, current_date - 2, array[$1::uuid], null, null)",
    [memberId],
  );
  return rows[0]?.status as string | undefined;
}

async function activeGrants(db: Db, requestId: string) {
  const { rows } = await db.query(
    "select count(*)::int as n from public.exemption_grant where request_id = $1 and status = 'active'",
    [requestId],
  );
  return rows[0].n as number;
}

test("打回后重新批准：重新产生生效授权，履约仍按请假扣除", async () => {
  await inTransaction(async (db) => {
    const { memberId, requestId } = await seed(db, "leave");
    await approve(db, requestId);
    assert.equal(await activeGrants(db, requestId), 1);
    assert.equal(await dayStatus(db, memberId), "leave");

    await db.query("select public.reopen_exemption_request_atomically($1::uuid, null::text)", [requestId]);
    assert.equal(await activeGrants(db, requestId), 0, "打回后授权失效");
    assert.equal(await dayStatus(db, memberId), "unconfirmed", "打回后该日回到未确认");

    await approve(db, requestId);
    assert.equal(await activeGrants(db, requestId), 1, "再次批准必须重新生效，不能被失效旧行挡住");
    assert.equal(await dayStatus(db, memberId), "leave");
  });
});

test("已批准的免交在发布履约里仍返回 exempted", async () => {
  await inTransaction(async (db) => {
    const { memberId, requestId } = await seed(db, "waive");
    await approve(db, requestId);
    assert.equal(await dayStatus(db, memberId), "exempted");
  });
});
