import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260930163503_add_account_scoped_video_submission_appeals.sql",
);

function migrationSql() {
  assert.equal(existsSync(migrationPath), true, "必须新增账号维度补交申请的 migration");
  return readFileSync(migrationPath, "utf8");
}

function functionRegion(sql: string) {
  const start = sql.toLowerCase().indexOf("create or replace function public.handle_fulfillment_appeal");
  assert.notEqual(start, -1, "migration 必须重写 handle_fulfillment_appeal");
  const end = sql.indexOf("$$;", start);
  return sql.slice(start, end === -1 ? undefined : end);
}

test("补交申请 migration 增加 account_id 并按成员+账号+业务日期去重", () => {
  const sql = migrationSql();

  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+account_id\s+uuid/i);
  assert.match(sql, /drop\s+index\s+if\s+exists\s+public\.idx_fulfillment_appeals_pending_unique/i);
  assert.match(
    sql,
    /create\s+unique\s+index\s+if\s+not\s+exists\s+idx_fulfillment_appeals_pending_unique[\s\S]*\(\s*user_id,\s*account_id,\s*record_date\s*\)[\s\S]*where\s+status\s*=\s*'pending'/i,
  );
  assert.match(sql, /create\s+index\s+if\s+not\s+exists\s+idx_fulfillment_appeals_account_date/i);
});

test("审批通过只授权补交，绝不直接写履约记录", () => {
  const fn = functionRegion(migrationSql());

  assert.match(fn, /update\s+public\.fulfillment_appeals[\s\S]*status\s*=\s*resolved_status/i);
  assert.match(fn, /insert\s+into\s+public\.audit_logs/i);
  // 审批即已发布 的旧行为必须被禁止：函数体内不得插入视频或日报。
  assert.doesNotMatch(fn, /insert\s+into\s+public\.(videos|daily_reports)/i);
  assert.doesNotMatch(fn, /update\s+public\.(videos|daily_reports)/i);
});

test("全员规则公告按固定来源键幂等且只发在职成员", () => {
  const sql = migrationSql();
  const announce = sql.slice(sql.toLowerCase().indexOf("insert into public.notifications"));

  assert.notEqual(announce.length, 0, "migration 必须包含全员公告插入");
  assert.match(announce, /'system\.announcement'/i);
  assert.match(announce, /source_id[\s\S]*'2026-09-30-v1'/i);
  assert.match(announce, /where\s+p\.membership_status\s*=\s*'active'/i);
  assert.match(
    announce,
    /on\s+conflict\s*\(\s*user_id,\s*type,\s*source_type,\s*source_id\s*\)\s*do\s+nothing/i,
  );
});

test("handle_fulfillment_appeal 权限收口到管理员并显式授权", () => {
  const fn = functionRegion(migrationSql());
  const sql = migrationSql();

  assert.match(fn, /if\s+not\s+public\.is_admin_or_owner\(\)\s+then/i);
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.handle_fulfillment_appeal/i);
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.handle_fulfillment_appeal\(uuid,\s*text,\s*uuid\)\s+to\s+authenticated,\s*service_role/i,
  );
});
