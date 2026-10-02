import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../../supabase/migrations/20261002160807_permanent_exemption_state_machine_hardening.sql", import.meta.url),
  "utf8",
);

test("永久状态机：通用 permanent 授予和永久撤销都强制 Owner", () => {
  assert.match(sql, /p_grant_type = 'permanent'[\s\S]*company_role_for_user\(auth\.uid\(\)\) <> 'company_owner'/i);
  assert.match(sql, /v_has_permanent[\s\S]*company_role_for_user\(auth\.uid\(\)\) <> 'company_owner'/i);
});

test("永久优先：临时写入不会停用 permanent，也不会覆盖 profile 投影", () => {
  assert.match(sql, /grant_type <> 'permanent'/i);
  assert.match(sql, /new\.exempt_type = 'temporary'[\s\S]*grant_type = 'permanent'[\s\S]*new\.exempt_type := 'permanent'/i);
});

test("通用撤销保持原临时流程可用", () => {
  assert.match(sql, /create or replace function public\.clear_exemption_grant_atomically_v2/i);
  assert.match(sql, /grant_type <> 'permanent'/i);
  assert.match(sql, /grant execute on function public\.clear_exemption_grant_atomically_v2/i);
});
